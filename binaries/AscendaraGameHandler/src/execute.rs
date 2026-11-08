// Launch a game, track it until it closes and record the session.

use anyhow::{anyhow, bail, Result};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::process::{Command, Stdio};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::time::{Duration, Instant};

use crate::procs::{GameProcess, Processes};
use crate::runners::{self, RunnerConfig};
use crate::{discord, error, info, jsonfile, ludusavi, paths, pypath, warn};

#[cfg(windows)]
use crate::win;

pub struct Options {
    pub game_path: String,
    pub is_custom_game: bool,
    pub admin: bool,
    pub is_shortcut: bool,
    pub use_ludusavi: bool,
    pub game_launch_cmd: Option<String>,
    pub launch_trainer: bool,
    /// Every argument, scanned for the --linux-* / --highball-* runner options
    pub argv: Vec<String>,
}

// How long nothing may be running before the game counts as closed. The longer
// grace bridges launcher -> game handoffs, where the launcher exits a few
// seconds before the real game process appears. Only an exe that quit quickly
// looks like a launcher; one that ran longer was the game itself, so its exit
// is treated as the game closing.
const LAUNCHER_MAX_SECONDS: f64 = 15.0;
const STARTUP_GRACE_SECONDS: f64 = 60.0;
const EXIT_GRACE_SECONDS: f64 = 5.0;
const PLAY_TIME_INTERVAL: i64 = 180;

pub fn py_bool(b: bool) -> &'static str {
    if b {
        "True"
    } else {
        "False"
    }
}

fn py_opt(s: &Option<String>) -> &str {
    s.as_deref().unwrap_or("None")
}

/// Set a key on a JSON object, failing like Python would on a non-object.
fn set_key(data: &mut Value, key: &str, value: Value) -> Result<()> {
    let map = data.as_object_mut().ok_or_else(|| anyhow!("JSON root is not an object"))?;
    map.insert(key.to_string(), value);
    Ok(())
}

fn games_mut(data: &mut Value) -> Result<&mut Vec<Value>> {
    data.get_mut("games").and_then(Value::as_array_mut).ok_or_else(|| anyhow!("'games'"))
}

fn is_live_entry_for(game: &Value, exe_path: &str) -> bool {
    !jsonfile::truthy(game.get("_isDeleted")) && game.get("executable").and_then(Value::as_str) == Some(exe_path)
}

/// Python's `a or b or ...` over JSON values, as display text.
fn first_truthy(values: &[Option<&Value>], fallback: &str) -> String {
    values
        .iter()
        .find(|v| jsonfile::truthy(**v))
        .map_or(fallback.to_string(), |v| jsonfile::as_arg(v.unwrap()))
}

fn write_run_error(json_file_path: &str, message: &str) -> Result<()> {
    let mut data = jsonfile::read(json_file_path)?;
    set_key(&mut data, "runError", json!(message))?;
    jsonfile::atomic_write(json_file_path, &data)
}

fn update_launch_count(file_path: &str, increment: bool) {
    let result = (|| -> Result<()> {
        let mut data = jsonfile::read(file_path)?;
        jsonfile::add_number(&mut data, "launchCount", if increment { 1 } else { -1 }, true)?;
        jsonfile::atomic_write(file_path, &data)
    })();
    if let Err(e) = result {
        error!("Error updating launch count for {file_path}: {e}");
    }
}

/// Update playTime in the game's JSON file, or its entry in games.json for custom games.
fn update_play_time(file_path: &str, custom_entry: Option<&Value>, seconds: i64) {
    info!(
        "[ENTRY] update_play_time(file_path={file_path}, is_custom_game={}, add={seconds})",
        py_bool(custom_entry.is_some())
    );
    let result = (|| -> Result<()> {
        let mut data = jsonfile::read(file_path)?;
        match custom_entry {
            Some(entry) => {
                for game in games_mut(&mut data)? {
                    if !jsonfile::truthy(game.get("_isDeleted")) && game.get("executable") == entry.get("executable") {
                        jsonfile::add_number(game, "playTime", seconds, false)?;
                        let name = first_truthy(&[game.get("game"), game.get("name"), entry.get("name")], "Unknown");
                        info!("Updated play time for custom game {name}: {} seconds", game["playTime"]);
                        break;
                    }
                }
            }
            None => {
                jsonfile::add_number(&mut data, "playTime", seconds, false)?;
                let name = first_truthy(&[data.get("game"), data.get("name")], "Regular Game");
                info!("Updated play time for game {name}: {} seconds", data["playTime"]);
            }
        }
        jsonfile::atomic_write(file_path, &data)
    })();
    match result {
        Ok(()) => info!("[EXIT] update_play_time() - Success (+{seconds} seconds)"),
        Err(e) => {
            error!("Failed to update play time: {e}");
            info!("[EXIT] update_play_time() - Exception");
        }
    }
}

/// True when the exit code means the game crashed rather than quit normally.
pub fn is_abnormal_exit(return_code: Option<i64>) -> bool {
    let Some(code) = return_code else { return false };
    if cfg!(windows) {
        // Unhandled exceptions surface as NTSTATUS error codes (0xC0000005 etc.)
        !(0..0xC000_0000).contains(&code)
    } else {
        // Killed by a signal; the user closing it (SIGTERM/SIGINT/SIGHUP) is not a crash
        code < 0 && ![15, 2, 1].contains(&-code)
    }
}

#[cfg(target_os = "macos")]
fn bundle_executable(app: &str) -> Result<String> {
    let manifest = plist::Value::from_file(pypath::join_all(&[app, "Contents", "Info.plist"]))?;
    let name = manifest
        .as_dictionary()
        .and_then(|d| d.get("CFBundleExecutable"))
        .and_then(plist::Value::as_string);
    match name {
        Some(name) if pypath::basename(name) == name => Ok(name.to_string()),
        _ => bail!("Invalid macOS application executable"),
    }
}

#[cfg(not(target_os = "macos"))]
fn bundle_executable(_app: &str) -> Result<String> {
    bail!("Invalid macOS application executable")
}

#[cfg(windows)]
fn spawn_windows(exe_path: &str, launch_cmd: Option<&str>) -> std::io::Result<GameProcess> {
    use std::os::windows::process::CommandExt;
    let lower = exe_path.to_lowercase();
    let is_script = lower.ends_with(".bat") || lower.ends_with(".cmd");
    let child = if launch_cmd.is_some() || is_script {
        // Same command line Python's subprocess builds for shell=True
        let line = launch_cmd.unwrap_or(exe_path);
        let comspec = std::env::var("ComSpec").unwrap_or_else(|_| {
            pypath::join_all(&[&std::env::var("SystemRoot").unwrap_or_default(), "System32", "cmd.exe"])
        });
        Command::new(comspec)
            .raw_arg(format!("/c \"{line}\""))
            .creation_flags(win::CREATE_NO_WINDOW)
            .stdin(Stdio::null())
            .spawn()?
    } else {
        Command::new(exe_path).stdin(Stdio::null()).spawn()?
    };
    Ok(GameProcess::Child(child))
}

/// Regular launch, retrying through UAC when Windows says elevation is required.
#[cfg(windows)]
fn launch_windows_regular(exe_path: &str, game_launch_cmd: Option<&str>, launch_cmd: Option<&str>) -> Result<GameProcess> {
    match spawn_windows(exe_path, launch_cmd) {
        Ok(process) => Ok(process),
        Err(e) if e.raw_os_error() == Some(win::ERROR_ELEVATION_REQUIRED) => {
            warn!("Elevation required to launch {exe_path}. Attempting to relaunch with UAC prompt.");
            match win::ElevatedProcess::new(exe_path, game_launch_cmd, Some(&pypath::dirname(exe_path))) {
                Ok(p) => {
                    info!("Game launched with elevation via UAC (pid {})", p.pid);
                    Ok(GameProcess::Elevated(p))
                }
                Err(elev_err) => {
                    error!("Failed to launch with elevation: {elev_err}");
                    Err(elev_err.into())
                }
            }
        }
        Err(e) => Err(e.into()),
    }
}

#[cfg(windows)]
fn launch_windows(exe_path: &str, admin: bool, game_launch_cmd: Option<&str>) -> Result<GameProcess> {
    info!("Launching executable directly: {exe_path}");
    let launch_cmd = game_launch_cmd.map(|cmd| {
        info!("Game launch command provided: {cmd}");
        let line = format!("\"{exe_path}\" {cmd}");
        info!("Resolved launch command: {line}");
        line
    });
    if !admin {
        return launch_windows_regular(exe_path, game_launch_cmd, launch_cmd.as_deref());
    }
    info!("Launching with admin privileges: {exe_path}");
    match win::ElevatedProcess::new(exe_path, game_launch_cmd, Some(&pypath::dirname(exe_path))) {
        Ok(p) => {
            info!("Admin process launched with pid {}", p.pid);
            Ok(GameProcess::Elevated(p))
        }
        Err(e) if e.raw_os_error() == Some(win::ERROR_CANCELLED) => {
            info!("Admin launch cancelled at the UAC prompt");
            Err(e.into())
        }
        Err(e) => {
            error!("Failed to launch with admin privileges: {e}");
            info!("Falling back to regular launch");
            launch_windows_regular(exe_path, game_launch_cmd, launch_cmd.as_deref())
        }
    }
}

fn wine_config(wine_bin: String, compat_data: String) -> RunnerConfig {
    RunnerConfig {
        runner_type: Some("wine".into()),
        runner_path: Some(wine_bin),
        compat_data: Some(compat_data),
        ..Default::default()
    }
}

fn system_wine() -> Option<String> {
    pypath::which("wine").or_else(|| pypath::which("wine64"))
}

/// Launch the Fling trainer that sits next to the game, through the same runner.
#[cfg_attr(not(windows), allow(unused_variables))]
fn launch_trainer(trainer_path: &str, trainer_dir: &str, runner: Option<&RunnerConfig>) -> Result<Option<GameProcess>> {
    info!("Launching trainer: {trainer_path}");
    let use_wine = cfg!(any(target_os = "linux", target_os = "macos"));
    let runner_type = runner.map_or("", |r| r.runner_type());
    let trainer = if use_wine {
        if runner_type == "umu" {
            info!("Launching trainer with UMU");
            runners::launch_with_umu(trainer_path, runner.unwrap(), None)?
        } else if runner_type == "highball" {
            info!("Launching trainer with Highball");
            runners::launch_with_highball(trainer_path, runner.unwrap(), None)?
        } else if runner_type == "proton" && cfg!(target_os = "linux") {
            info!("Launching trainer with Proton");
            let proton = runner.unwrap();
            match runners::launch_with_proton(trainer_path, proton, None) {
                Ok(p) => p,
                Err(e) => {
                    error!("Proton trainer launch failed, falling back to Wine: {e}");
                    match system_wine() {
                        Some(wine) => {
                            let compat = proton.compat_data.clone().unwrap_or_else(|| pypath::expand_home("~/.wine"));
                            runners::launch_with_wine_isolated(trainer_path, &wine_config(wine, compat), None)?
                        }
                        None => {
                            error!("No Wine fallback available for trainer");
                            None
                        }
                    }
                }
            }
        } else {
            info!("Launching trainer with Wine");
            match system_wine() {
                Some(wine) => runners::launch_with_wine_isolated(trainer_path, &wine_config(wine, pypath::expand_home("~/.wine")), None)?,
                None => {
                    error!("No Wine found for trainer launch");
                    None
                }
            }
        }
    } else {
        match Command::new(trainer_path).stdin(Stdio::null()).spawn() {
            Ok(child) => Some(GameProcess::Child(child)),
            #[cfg(windows)]
            Err(e) if e.raw_os_error() == Some(win::ERROR_ELEVATION_REQUIRED) => {
                info!("Trainer requires elevation, launching with admin privileges");
                // No process handle comes back from ShellExecuteW
                match win::shell_execute_runas(trainer_path, trainer_dir) {
                    Ok(()) => info!("Trainer launched with admin privileges"),
                    Err(elev_err) => error!("Failed to launch trainer with elevation: {elev_err}"),
                }
                return Ok(None);
            }
            Err(e) => return Err(e.into()),
        }
    };
    info!("Trainer launched successfully");
    Ok(trainer)
}

struct Game {
    exe_path: String,
    game_name: String,
    settings_file: String,
    json_file_path: Option<String>,
    games_json_path: Option<String>,
    game_entry: Option<Value>,
    is_mac_app: bool,
}

impl Game {
    fn custom_entry(&self) -> Option<&Value> {
        self.game_entry.as_ref().filter(|_| self.games_json_path.is_some())
    }

    /// The file playTime is written to: games.json for custom games.
    fn play_time_file(&self) -> Option<&str> {
        self.games_json_path.as_deref().or(self.json_file_path.as_deref())
    }

    fn add_play_time(&self, seconds: i64) {
        if let Some(file) = self.play_time_file() {
            update_play_time(file, self.custom_entry(), seconds);
        }
    }
}

fn locate_regular_game(game_path: &str) -> (String, String, String) {
    let (game_dir, exe_name) = pypath::split(game_path);
    let exe_path = pypath::join(&game_dir, &exe_name);

    // Find the game's root directory by walking up from the executable until
    // a <folder>/<folder>.ascendara.json file turns up
    let mut current = game_dir.clone();
    while !current.is_empty() && pypath::dirname(&current) != current {
        let dir_name = pypath::basename(&current);
        let candidate = pypath::join(&current, &format!("{dir_name}.ascendara.json"));
        if pypath::exists(&candidate) {
            return (exe_path, candidate, dir_name);
        }
        let parent = pypath::dirname(&current);
        let parent_name = pypath::basename(&parent);
        let candidate = pypath::join(&parent, &format!("{parent_name}.ascendara.json"));
        if pypath::exists(&candidate) {
            return (exe_path, candidate, parent_name);
        }
        current = parent;
    }

    let game_name = pypath::basename(&game_dir);
    let mut json_file_path = pypath::join(&game_dir, &format!("{game_name}.ascendara.json"));
    if !pypath::exists(&json_file_path) {
        let parent = pypath::dirname(&game_dir);
        let parent_name = pypath::basename(&parent);
        json_file_path = pypath::join(&parent, &format!("{parent_name}.ascendara.json"));
    }
    (exe_path, json_file_path, game_name)
}

pub fn execute(opts: &Options) -> Result<()> {
    info!(
        "[ENTRY] execute(game_path={}, is_custom_game={}, admin={}, is_shortcut={}, use_ludusavi={}, game_launch_cmd={}, launch_trainer={})",
        opts.game_path,
        py_bool(opts.is_custom_game),
        py_bool(opts.admin),
        py_bool(opts.is_shortcut),
        py_bool(opts.use_ludusavi),
        py_opt(&opts.game_launch_cmd),
        py_bool(opts.launch_trainer)
    );
    let rpc = if opts.is_shortcut {
        info!("Shortcut mode enabled, setting up Discord RPC");
        discord::setup()
    } else {
        None
    };

    let settings_file = paths::settings_file();
    let mut game = if !opts.is_custom_game {
        let (exe_path, json_file_path, game_name) = locate_regular_game(&opts.game_path);
        Game {
            exe_path,
            game_name,
            settings_file,
            json_file_path: Some(json_file_path),
            games_json_path: None,
            game_entry: None,
            is_mac_app: false,
        }
    } else {
        let exe_path = opts.game_path.clone();
        let settings = jsonfile::read(&settings_file)?;
        let download_dir = settings.get("downloadDirectory").and_then(Value::as_str).unwrap_or("");
        if download_dir.is_empty() {
            error!("Download directory not found in ascendarasettings.json");
            info!("[EXIT] execute due to missing download_dir for custom game");
            return Ok(());
        }
        let games_json_path = pypath::join(download_dir, "games.json");
        let mut games_data = jsonfile::read(&games_json_path)?;
        let entry = games_mut(&mut games_data)?.iter().find(|g| is_live_entry_for(g, &exe_path)).cloned();
        let Some(entry) = entry else {
            error!("Game not found in games.json for executable path: {exe_path}");
            info!("[EXIT] execute due to missing game_entry for custom game");
            return Ok(());
        };
        let fallback = pypath::basename(&pypath::dirname(&exe_path));
        let game_name = first_truthy(&[entry.get("game"), entry.get("name")], &fallback);
        Game {
            exe_path,
            game_name,
            settings_file,
            json_file_path: None,
            games_json_path: Some(games_json_path),
            game_entry: Some(entry),
            is_mac_app: false,
        }
    };
    let exe_path = game.exe_path.clone();
    info!("Resolved game_dir: {}, exe_path: {exe_path}", pypath::dirname(&exe_path));

    game.is_mac_app = cfg!(target_os = "macos")
        && exe_path.to_lowercase().ends_with(".app")
        && pypath::is_file(&pypath::join_all(&[&exe_path, "Contents", "Info.plist"]));
    if !pypath::is_file(&exe_path) && !game.is_mac_app {
        error!("Executable file does not exist: {exe_path}");
        let message = "The exe file does not exist";
        match &game.json_file_path {
            Some(json_file_path) => write_run_error(json_file_path, message)?,
            None => error!("{message}"),
        }
        return Ok(());
    }

    if let Some(json_file_path) = &game.json_file_path {
        update_launch_count(json_file_path, true);
        info!("Incremented launch count and set isRunning for {json_file_path}");
        let mut data = jsonfile::read(json_file_path)?;
        set_key(&mut data, "isRunning", json!(true))?;
        jsonfile::atomic_write(json_file_path, &data)?;
    } else if let Some(games_json_path) = &game.games_json_path {
        let mut data = jsonfile::read(games_json_path)?;
        for entry in games_mut(&mut data)? {
            if is_live_entry_for(entry, &exe_path) {
                jsonfile::add_number(entry, "launchCount", 1, false)?;
                set_key(entry, "isRunning", json!(true))?;
                info!("Incremented launch count and set isRunning for custom game: {exe_path}");
                break;
            }
        }
        jsonfile::atomic_write(games_json_path, &data)?;
    }

    let result = (|| -> Result<()> {
        let mut settings = jsonfile::read(&game.settings_file)?;
        let map = settings.as_object_mut().ok_or_else(|| anyhow!("settings root is not an object"))?;
        let running = map.entry("runningGames").or_insert_with(|| json!({}));
        set_key(running, &game.game_name, json!(exe_path))?;
        jsonfile::atomic_write(&game.settings_file, &settings)?;
        info!("Updated runningGames in {} for {}", game.settings_file, game.game_name);
        Ok(())
    })();
    if let Err(e) = result {
        error!("Error updating settings.json: {e}");
    }

    if let Err(e) = run_session(opts, &game, rpc) {
        error!("Exception occurred during game execution: {e}");
        if let Some(games_json_path) = &game.games_json_path {
            let mut data = jsonfile::read(games_json_path)?;
            for entry in games_mut(&mut data)? {
                if is_live_entry_for(entry, &exe_path) {
                    jsonfile::add_number(entry, "launchCount", -1, true)?;
                    set_key(entry, "isRunning", json!(false))?;
                    info!("Set isRunning=False for custom game {exe_path} due to exception");
                    break;
                }
            }
            jsonfile::atomic_write(games_json_path, &data)?;
        } else if let Some(json_file_path) = &game.json_file_path {
            update_launch_count(json_file_path, false);
            let mut data = jsonfile::read(json_file_path)?;
            set_key(&mut data, "isRunning", json!(false))?;
            info!("Set isRunning=False for game {exe_path} due to exception");
            jsonfile::atomic_write(json_file_path, &data)?;
        }
        let cancelled = e
            .downcast_ref::<std::io::Error>()
            .is_some_and(|e| cfg!(windows) && e.raw_os_error() == Some(1223));
        if !cancelled {
            crate::register_crash_reporter(1, &e.to_string());
        }
        info!("[EXIT] execute due to exception for game: {exe_path}");
    }
    Ok(())
}

/// Launch through the right runner. None means the failure was already logged
/// (and recorded as runError where the Python handler did so).
fn launch(opts: &Options, game: &Game, runner: Option<&RunnerConfig>) -> Result<Option<GameProcess>> {
    let exe_path = game.exe_path.as_str();
    let is_windows_exe = exe_path.to_lowercase().ends_with(".exe");
    let launch_cmd = opts.game_launch_cmd.as_deref().filter(|c| !c.is_empty());
    let unix = cfg!(any(target_os = "linux", target_os = "macos"));
    let record_failure = |message: String| -> Result<Option<GameProcess>> {
        error!("{message}");
        if let Some(json_file_path) = &game.json_file_path {
            write_run_error(json_file_path, &message)?;
        }
        Ok(None)
    };

    if let Some(runner) = runner.filter(|_| cfg!(target_os = "linux") && is_windows_exe) {
        // Linux with Proton or Wine (from Electron config)
        let runner_path = runner.runner_path.as_deref().unwrap_or("None");
        let process = match runner.runner_type() {
            "umu" => {
                info!("[Launch] Using UMU: {runner_path}");
                runners::launch_with_umu(exe_path, runner, launch_cmd)?
            }
            "proton" => {
                info!("[Launch] Using Proton: {runner_path}");
                runners::launch_with_proton(exe_path, runner, launch_cmd)?
            }
            "wine" => {
                info!("[Launch] Using Wine (isolated): {runner_path}");
                runners::launch_with_wine_isolated(exe_path, runner, launch_cmd)?
            }
            other => {
                error!("[Launch] Unknown runner type: {other}");
                None
            }
        };
        return match process {
            Some(p) => Ok(Some(p)),
            None => record_failure(format!("Failed to launch with {}", runner.runner_type())),
        };
    }

    if cfg!(target_os = "macos") && is_windows_exe && runner.is_some_and(|r| r.runner_type() == "highball") {
        let runner = runner.unwrap();
        info!("[Launch] Using Highball bottle: {}", runner.highball_bottle.as_deref().unwrap_or("None"));
        return match runners::launch_with_highball(exe_path, runner, launch_cmd)? {
            Some(p) => Ok(Some(p)),
            None => record_failure("Failed to launch with Highball".into()),
        };
    }

    if unix && is_windows_exe && runner.is_none() {
        // Fallback: basic Wine (no runner config from Electron)
        warn!("[Launch] No runner config from Electron, falling back to system Wine");
        let Some(wine) = system_wine() else {
            error!("[Launch] No Wine found on system!");
            return Ok(None);
        };
        let slug = runners::sanitize_game_slug(if game.game_name.is_empty() { "unknown" } else { &game.game_name });
        let compat = pypath::join(&pypath::expand_home("~/.ascendara/compatdata"), &slug);
        std::fs::create_dir_all(&compat)?;
        return match runners::launch_with_wine_isolated(exe_path, &wine_config(wine, compat), launch_cmd)? {
            Some(p) => Ok(Some(p)),
            None => bail!("Failed to launch with system Wine"),
        };
    }

    if cfg!(target_os = "macos") && exe_path.to_lowercase().ends_with(".app") {
        let binary = pypath::join_all(&[exe_path, "Contents", "MacOS", &bundle_executable(exe_path)?]);
        let args = runners::shell_split(launch_cmd.unwrap_or(""))?;
        let child = Command::new(&binary)
            .args(args)
            .current_dir(pypath::dirname(&binary))
            .stdin(Stdio::null())
            .spawn()?;
        return Ok(Some(GameProcess::Child(child)));
    }

    if unix && !is_windows_exe {
        info!("[Launch] Native executable: {exe_path}");
        runners::make_executable(exe_path)?;
        let mut command = match launch_cmd {
            Some(cmd) => {
                let mut c = Command::new("/bin/sh");
                c.args(["-c", &format!("\"{exe_path}\" {cmd}")]);
                c
            }
            None => Command::new(exe_path),
        };
        let child = command.current_dir(pypath::dirname(exe_path)).stdin(Stdio::null()).spawn()?;
        return Ok(Some(GameProcess::Child(child)));
    }

    #[cfg(windows)]
    {
        Ok(Some(launch_windows(exe_path, opts.admin, launch_cmd)?))
    }
    #[cfg(not(windows))]
    {
        error!("Unsupported platform: {}", std::env::consts::OS);
        Ok(None)
    }
}

/// Ordered, de-duplicated list of pids to kill.
fn push_unique(list: &mut Vec<u32>, pid: u32) {
    if !list.contains(&pid) {
        list.push(pid);
    }
}

fn run_session(opts: &Options, game: &Game, rpc: Option<discord_rich_presence::DiscordIpcClient>) -> Result<()> {
    let exe_path = game.exe_path.as_str();
    let game_name = game.game_name.as_str();
    let exe_dir = pypath::dirname(exe_path);
    if !exe_dir.is_empty() {
        std::env::set_current_dir(&exe_dir)?;
    }

    let runner = runners::parse_runner_args(&opts.argv);
    // Native Linux games are followed through every process they start. Wine
    // launches are not, since wineserver can outlive the game, and neither are
    // sessions with a trainer, which runs under Wine
    let adopt_orphans = cfg!(target_os = "linux") && !exe_path.to_lowercase().ends_with(".exe") && !opts.launch_trainer;
    #[cfg(target_os = "linux")]
    if adopt_orphans {
        crate::procs::become_subreaper();
    }
    let Some(mut process) = launch(opts, game, runner.as_ref())? else { return Ok(()) };

    let start = Instant::now();
    let now = || start.elapsed().as_secs_f64();
    let mut last_update = 0.0;

    // Root directory to watch for related/child game processes. Some games
    // launch a stub/bootstrapper (anti-cheat setup, launcher, etc.) that spawns
    // the real game executable and exits almost immediately; if that happens
    // play time keeps being tracked through the real game.
    let game_root_dir = if game.is_mac_app {
        exe_path.to_string()
    } else {
        game.json_file_path.as_deref().map_or(exe_dir.clone(), pypath::dirname)
    };
    let handler_pid = std::process::id();

    let mut trainer = None;
    if opts.launch_trainer {
        // Regular games keep the trainer in the game root (where .ascendara.json is)
        let trainer_dir = game.json_file_path.as_deref().map_or(exe_dir.clone(), pypath::dirname);
        let trainer_path = pypath::join(&trainer_dir, "ascendaraFlingTrainer.exe");
        if pypath::exists(&trainer_path) {
            match launch_trainer(&trainer_path, &trainer_dir, runner.as_ref()) {
                Ok(p) => trainer = p,
                Err(e) => error!("Failed to launch trainer: {e}"),
            }
        } else {
            warn!("Trainer not found at: {trainer_path}");
        }
    }

    info!("Entering game process monitoring loop (180s intervals)");
    crate::logger::stdout_line("ASCENDARA_STOP_READY");
    let (stop_tx, stop_rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut line = String::new();
        while std::io::stdin().read_line(&mut line).is_ok_and(|n| n > 0) {
            if line.trim() == "ASCENDARA_STOP" && stop_tx.send(()).is_err() {
                break;
            }
            line.clear();
        }
    });

    let mut stop_pending = false;
    let mut stdin_open = true;
    let mut was_stopped = false;
    let mut stub_exited_logged = false;
    let mut tracked_related_process = false;
    let session_end_time;
    let mut last_alive_time = 0.0;
    let mut launched_exit_time: Option<f64> = None;
    // Processes spawned by what we launched (e.g. a .bat starting the game).
    // Tracked on Windows and for native Linux games: under Wine/Proton the tree
    // includes wineserver, which can outlive the game.
    let track_tree = cfg!(windows) || adopt_orphans;
    // Orphans are adopted by the handler rather than kept under the launched process
    let tree_root = if adopt_orphans { handler_pid } else { process.pid() };
    let mut tree_seen = HashMap::new();
    let mut procs = Processes::new();

    loop {
        // The process table is only read when something needs it, so a running
        // game costs one non-blocking wait per second on macOS and Linux
        #[cfg(target_os = "linux")]
        if adopt_orphans {
            crate::procs::reap_adopted(process.pid());
        }
        let launched_exited = process.poll().is_some();
        let mut fresh = false;
        if track_tree || stop_pending || launched_exited {
            fresh = stop_pending || launched_exited;
            procs.refresh(fresh);
        }
        let tree_alive = if track_tree { procs.refresh_tree(&mut tree_seen, tree_root) } else { Vec::new() };

        if stop_pending {
            stop_pending = false;
            was_stopped = true;
            let mut targets = Vec::new();
            for pid in procs.in_dir(&game_root_dir, handler_pid) {
                push_unique(&mut targets, pid);
            }
            for &pid in &tree_alive {
                push_unique(&mut targets, pid);
            }
            if process.poll().is_none() {
                push_unique(&mut targets, process.pid());
                for pid in procs.descendants(process.pid()) {
                    push_unique(&mut targets, pid);
                }
            }
            for parent in targets.clone() {
                for pid in procs.descendants(parent) {
                    push_unique(&mut targets, pid);
                }
            }
            for &pid in targets.iter().rev() {
                procs.kill(pid);
            }
            if runner.as_ref().is_some_and(|r| r.runner_type() == "highball") {
                runners::stop_highball_bottle(runner.as_ref().unwrap());
            }
            fresh = false;
        }

        let game_alive = match process.poll() {
            None => true,
            Some(code) => {
                // The launched process has exited. Before assuming the game is
                // closed, check whether a related process (the real game, started
                // by a bootstrapper/stub/anti-cheat wrapper) is still running
                // inside the game's install directory.
                if !stub_exited_logged {
                    info!(
                        "Launched process for {game_name} exited (code={code}); checking for related processes still running under {game_root_dir}"
                    );
                    stub_exited_logged = true;
                    launched_exit_time = Some(now());
                }
                if !fresh {
                    procs.refresh(true);
                }
                let alive = !procs.in_dir(&game_root_dir, handler_pid).is_empty() || !tree_alive.is_empty();
                if alive {
                    tracked_related_process = true;
                }
                alive
            }
        };

        let current_time = now();
        if game_alive {
            last_alive_time = current_time;
        } else {
            let grace = if was_stopped {
                0.0
            } else if tracked_related_process {
                // A launcher handoff already happened and that game has now
                // closed, so there is nothing left to wait for.
                EXIT_GRACE_SECONDS
            } else if launched_exit_time.is_some_and(|t| t < LAUNCHER_MAX_SECONDS) {
                STARTUP_GRACE_SECONDS
            } else {
                EXIT_GRACE_SECONDS
            };
            if current_time - last_alive_time >= grace {
                session_end_time = last_alive_time;
                break;
            }
        }

        let elapsed = (current_time - last_update) as i64;
        if game_alive && elapsed >= PLAY_TIME_INTERVAL {
            game.add_play_time(PLAY_TIME_INTERVAL);
            last_update = current_time;
            info!("Interval reached: Added 180 seconds to {game_name}");
        }

        if stdin_open {
            match stop_rx.recv_timeout(Duration::from_secs(1)) {
                Ok(()) => stop_pending = true,
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => stdin_open = false,
            }
        } else {
            std::thread::sleep(Duration::from_secs(1));
        }
    }

    // Report before cleanup/backups so their duration is not counted as play
    let session_duration_ms = ((session_end_time * 1000.0) as i64).max(0);
    crate::logger::stdout_line(&format!("ASCENDARA_SESSION_DURATION_MS:{session_duration_ms}"));
    info!("Game process ended");

    // Record whatever was played since the last full 180s tick, so short
    // sessions and the final partial interval still count
    let leftover_seconds = (session_end_time - last_update) as i64;
    if leftover_seconds > 0 {
        game.add_play_time(leftover_seconds);
        info!("Final playtime update: added {leftover_seconds} leftover second(s) for {game_name}");
    }

    let return_code = process.wait();
    if stub_exited_logged {
        info!("Related game process(es) under {game_root_dir} have exited; treating game as closed");
    }
    let code_text = return_code.map_or("None".to_string(), |c| c.to_string());
    info!("Game process exited with return code: {code_text}");

    // The return code only describes the game when no separate process spawned
    // by a launcher/stub ended up being tracked
    let last_session = json!({
        "seconds": (session_end_time as i64).max(0),
        "crashed": !was_stopped && !tracked_related_process && is_abnormal_exit(return_code),
        "endedAt": chrono::Local::now().format("%Y-%m-%dT%H:%M:%S%.6f").to_string(),
    });
    info!("Session summary for {game_name}: {last_session}");

    if let Some(trainer) = trainer.as_mut() {
        if trainer.poll().is_none() {
            info!("Terminating trainer process");
            trainer.terminate();
            if trainer.wait_timeout(Duration::from_secs(5)) {
                info!("Trainer process terminated");
            } else {
                error!("Error terminating trainer: timed out after 5 seconds");
            }
        }
    }

    let result = (|| -> Result<()> {
        let mut settings = jsonfile::read(&game.settings_file)?;
        if let Some(running) = settings.get_mut("runningGames").and_then(Value::as_object_mut) {
            if running.shift_remove(game_name).is_some() {
                info!("Removed {game_name} from runningGames in {}", game.settings_file);
            }
        }
        jsonfile::atomic_write(&game.settings_file, &settings)
    })();
    if let Err(e) = result {
        error!("Error updating settings.json on exit: {e}");
    }

    if opts.use_ludusavi && !game_name.is_empty() {
        info!("Game closed, running Ludusavi backup for {game_name}");
        let highball_prefix = runner.as_ref().and_then(|r| r.compat_data.as_deref()).filter(|_| cfg!(target_os = "macos"));
        if ludusavi::run_backup(game_name, highball_prefix) {
            info!("Ludusavi backup succeeded for {game_name}");
        } else {
            error!("Ludusavi backup failed for {game_name}");
        }
    }

    if let Some(games_json_path) = &game.games_json_path {
        let mut data = jsonfile::read(games_json_path)?;
        for entry in games_mut(&mut data)? {
            if is_live_entry_for(entry, exe_path) {
                set_key(entry, "isRunning", json!(false))?;
                set_key(entry, "lastSession", last_session.clone())?;
                info!("Set isRunning=False for custom game {game_name}");
                break;
            }
        }
        jsonfile::atomic_write(games_json_path, &data)?;
    } else if let Some(json_file_path) = &game.json_file_path {
        let mut data = jsonfile::read(json_file_path)?;
        set_key(&mut data, "isRunning", json!(false))?;
        set_key(&mut data, "lastSession", last_session)?;
        info!("Set isRunning=False for game {game_name}");
        jsonfile::atomic_write(json_file_path, &data)?;
    }

    if opts.is_shortcut && rpc.is_some() {
        info!("Clearing Discord Rich Presence after game exit");
        discord::clear(rpc);
    }
    info!("[EXIT] execute for game: {game_name}");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn abnormal_exit() {
        assert!(!is_abnormal_exit(None));
        assert!(!is_abnormal_exit(Some(0)));
        assert!(!is_abnormal_exit(Some(1)));
        if cfg!(windows) {
            assert!(is_abnormal_exit(Some(0xC000_0005)));
        } else {
            assert!(is_abnormal_exit(Some(-11)));
            assert!(!is_abnormal_exit(Some(-15)));
            assert!(!is_abnormal_exit(Some(-2)));
            assert!(!is_abnormal_exit(Some(-1)));
        }
    }

    #[test]
    fn locate_walks_up_to_game_root() {
        let root = std::env::temp_dir().join(format!("agh-locate-{}", std::process::id()));
        let game = root.join("My Game");
        let bin = game.join("bin").join("x64");
        std::fs::create_dir_all(&bin).unwrap();
        std::fs::write(game.join("My Game.ascendara.json"), "{}").unwrap();
        let exe = bin.join("game.exe").to_string_lossy().into_owned();
        let (exe_path, json_path, name) = locate_regular_game(&exe);
        assert_eq!(exe_path, exe);
        assert_eq!(json_path, game.join("My Game.ascendara.json").to_string_lossy());
        assert_eq!(name, "My Game");
        std::fs::remove_dir_all(root).unwrap();
    }
}
