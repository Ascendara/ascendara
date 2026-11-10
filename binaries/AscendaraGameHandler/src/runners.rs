// Launching Windows executables through Proton, umu-run, Wine or Highball.

use anyhow::{bail, Result};
use std::collections::BTreeMap;
use std::io::{BufRead, BufReader, Read};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::time::{Duration, Instant};

use crate::procs::GameProcess;
use crate::{error, info, pypath, warn};

/// Runner settings passed by Electron as --linux-* / --highball-* arguments.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct RunnerConfig {
    pub runner_type: Option<String>,
    pub runner_path: Option<String>,
    pub compat_data: Option<String>,
    pub steam_path: Option<String>,
    pub umu_id: Option<String>,
    pub proton_path: Option<String>,
    pub highball_bottle: Option<String>,
    pub highball_home: Option<String>,
    pub highball_renderer: Option<String>,
    pub winedlloverrides: Option<String>,
    pub steamappid: Option<String>,
    pub umu_use_steam: bool,
}

impl RunnerConfig {
    pub fn runner_type(&self) -> &str {
        self.runner_type.as_deref().unwrap_or("")
    }

    fn runner_path(&self) -> &str {
        self.runner_path.as_deref().unwrap_or("")
    }

    fn compat_data(&self) -> &str {
        self.compat_data.as_deref().unwrap_or("")
    }
}

/// Values that are empty strings count as unset, like Python's `if config.get(...)`.
fn set(value: &Option<String>) -> Option<&str> {
    value.as_deref().filter(|v| !v.is_empty())
}

pub fn parse_runner_args(args: &[String]) -> Option<RunnerConfig> {
    let mut config = RunnerConfig::default();
    let mut i = 0;
    while i < args.len() {
        let value = args.get(i + 1).cloned();
        let slot = match (args[i].as_str(), &value) {
            (_, None) => None,
            ("--linux-runner-type", _) => Some(&mut config.runner_type),
            ("--linux-runner-path", _) => Some(&mut config.runner_path),
            ("--linux-compat-data", _) => Some(&mut config.compat_data),
            ("--linux-steam-path", _) => Some(&mut config.steam_path),
            ("--linux-umu-id", _) => Some(&mut config.umu_id),
            ("--linux-proton-path", _) => Some(&mut config.proton_path),
            ("--highball-bottle", _) => Some(&mut config.highball_bottle),
            ("--highball-home", _) => Some(&mut config.highball_home),
            ("--highball-renderer", _) => Some(&mut config.highball_renderer),
            ("--linux-winedlloverrides", _) => Some(&mut config.winedlloverrides),
            ("--linux-steamappid", _) => Some(&mut config.steamappid),
            ("--linux-umu-use-steam", Some(v)) => {
                config.umu_use_steam = v == "1";
                i += 2;
                continue;
            }
            _ => None,
        };
        match slot {
            Some(slot) => {
                *slot = value;
                i += 2;
            }
            None => i += 1,
        }
    }
    set(&config.runner_type).is_some().then_some(config)
}

/// Sanitize game name for use as a folder name.
pub fn sanitize_game_slug(name: &str) -> String {
    name.chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace() || "_-().".contains(*c))
        .map(|c| if c == ' ' { '_' } else { c })
        .take(100)
        .collect()
}

fn is_env_assignment(token: &str) -> Option<(String, String)> {
    let (name, value) = token.split_once('=')?;
    let mut chars = name.chars();
    let first = chars.next()?;
    let valid = (first.is_ascii_uppercase() || first == '_')
        && chars.all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_');
    valid.then(|| (name.to_string(), value.to_string()))
}

pub fn shell_split(s: &str) -> Result<Vec<String>> {
    match shlex::split(s) {
        Some(tokens) => Ok(tokens),
        None => bail!("No closing quotation"),
    }
}

/// A launch command split Steam-style into env vars, a wrapper and game args.
#[derive(Debug, Default)]
pub struct LaunchCmd {
    pub env: BTreeMap<String, String>,
    pub wrapper: Vec<String>,
    pub args: Vec<String>,
}

impl LaunchCmd {
    /// The wrapper followed by the runner command it should run.
    pub fn wrap(&self, cmd: Vec<String>) -> Vec<String> {
        self.wrapper.iter().cloned().chain(cmd).collect()
    }
}

/// Parses launch options like Steam does. With '%command%', leading VAR=VALUE
/// tokens become env vars, the rest before it is a wrapper (lsfg, gamemoderun,
/// mangohud...) and tokens after it are game arguments. Without '%command%',
/// VAR=VALUE tokens become env vars and the rest are game arguments.
pub fn split_env_and_args(launch_cmd: Option<&str>) -> Result<LaunchCmd> {
    let mut parsed = LaunchCmd::default();
    let Some(cmd) = launch_cmd.filter(|c| !c.is_empty()) else { return Ok(parsed) };
    let tokens = shell_split(cmd)?;
    let Some(marker) = tokens.iter().position(|t| t == "%command%") else {
        for token in tokens {
            match is_env_assignment(&token) {
                Some((k, v)) => {
                    parsed.env.insert(k, v);
                }
                None => parsed.args.push(token),
            }
        }
        return Ok(parsed);
    };
    let mut tokens = tokens.into_iter();
    for token in tokens.by_ref().take(marker) {
        match is_env_assignment(&token).filter(|_| parsed.wrapper.is_empty()) {
            Some((k, v)) => {
                parsed.env.insert(k, v);
            }
            None if parsed.wrapper.is_empty() => parsed.wrapper.push(pypath::expand_home(&token)),
            None => parsed.wrapper.push(token),
        }
    }
    parsed.args.extend(tokens.skip(1).filter(|t| t != "%command%"));
    Ok(parsed)
}

/// The environment handed to runners. Variables a PyInstaller parent saved as
/// VAR_ORIG are restored, matching what the frozen Python handler passed on.
pub fn base_env() -> BTreeMap<String, String> {
    let mut env: BTreeMap<String, String> = std::env::vars().collect();
    for var in ["LD_LIBRARY_PATH", "LD_PRELOAD", "PYTHONPATH", "PYTHONHOME"] {
        if let Some(orig) = env.remove(&format!("{var}_ORIG")) {
            env.insert(var.to_string(), orig);
        }
    }
    env
}

fn sdl_video_driver(env: &mut BTreeMap<String, String>, tag: &str) {
    let has_driver = env.get("SDL_VIDEODRIVER").is_some_and(|v| !v.is_empty());
    if env.contains_key("WAYLAND_DISPLAY") && !has_driver {
        env.insert("SDL_VIDEODRIVER".into(), "wayland".into());
        info!("[{tag}] Setting SDL_VIDEODRIVER=wayland for controller support");
    } else if env.contains_key("DISPLAY") && !has_driver {
        env.insert("SDL_VIDEODRIVER".into(), "x11".into());
        info!("[{tag}] Setting SDL_VIDEODRIVER=x11 for controller support");
    }
}

fn apply_online_fix(env: &mut BTreeMap<String, String>, config: &RunnerConfig) {
    if let Some(appid) = set(&config.steamappid) {
        env.insert("SteamAppId".into(), appid.into());
        env.insert("SteamGameId".into(), appid.into());
    }
    if let Some(overrides) = set(&config.winedlloverrides) {
        let existing = env.get("WINEDLLOVERRIDES").cloned().unwrap_or_default();
        let merged: Vec<&str> = [existing.as_str(), overrides].into_iter().filter(|s| !s.is_empty()).collect();
        env.insert("WINEDLLOVERRIDES".into(), merged.join(";"));
    }
}

fn env_or_none(env: &BTreeMap<String, String>, key: &str) -> String {
    env.get(key).cloned().unwrap_or_else(|| "None".into())
}

fn steam_install_candidates() -> Vec<String> {
    let mut candidates = Vec::new();
    // Handles custom/non-standard installs
    if let Some(steam_bin) = pypath::which("steam") {
        let mut p = steam_bin;
        for _ in 0..4 {
            p = pypath::dirname(&p);
            if pypath::is_dir(&pypath::join(&p, "ubuntu12_32")) {
                candidates.push(p);
                break;
            }
        }
    }
    // Well-known locations (native, Debian package, Flatpak, Snap, immutable)
    let home = pypath::home();
    for rel in [
        ".local/share/Steam",
        ".steam/steam",
        ".steam/debian-installation",
        ".var/app/com.valvesoftware.Steam/.local/share/Steam",
        "snap/steam/common/.local/share/Steam",
    ] {
        candidates.push(pypath::join(&home, rel));
    }
    candidates.push(pypath::join_all(&["/var/home", &pypath::basename(&home), ".steam"]));

    let mut out: Vec<String> = Vec::new();
    for c in candidates {
        let c = pypath::normpath(&c);
        if !out.contains(&c) && pypath::is_dir(&c) {
            out.push(c);
        }
    }
    out
}

/// An LD_PRELOAD value with gameoverlayrenderer.so, or None.
fn resolve_steam_overlay() -> Option<String> {
    for root in steam_install_candidates() {
        let so32 = pypath::join_all(&[&root, "ubuntu12_32", "gameoverlayrenderer.so"]);
        let so64 = pypath::join_all(&[&root, "ubuntu12_64", "gameoverlayrenderer.so"]);
        match (pypath::is_file(&so32), pypath::is_file(&so64)) {
            (true, true) => return Some(format!("{so32}:{so64}")),
            (true, false) => return Some(so32),
            (false, true) => return Some(so64),
            _ => {}
        }
    }
    None
}

#[cfg(unix)]
pub fn make_executable(path: &str) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755))?;
    Ok(())
}

#[cfg(not(unix))]
pub fn make_executable(_path: &str) -> Result<()> {
    Ok(())
}

fn makedirs(path: &str) -> Result<()> {
    std::fs::create_dir_all(path)?;
    Ok(())
}

/// Log stdout/stderr of a runner in background threads.
fn pipe_process_logs(child: &mut Child, prefix: &str) {
    fn log_pipe<R: Read + Send + 'static>(pipe: R, tag: String) {
        std::thread::spawn(move || {
            let mut reader = BufReader::new(pipe);
            let mut line = Vec::new();
            while reader.read_until(b'\n', &mut line).is_ok_and(|n| n > 0) {
                info!("{tag} {}", String::from_utf8_lossy(&line).trim());
                line.clear();
            }
        });
    }
    if let Some(out) = child.stdout.take() {
        log_pipe(out, format!("[{prefix}-OUT]"));
    }
    if let Some(err) = child.stderr.take() {
        log_pipe(err, format!("[{prefix}-ERR]"));
    }
}

fn spawn_logged(cmd: &[String], env: &BTreeMap<String, String>, cwd: &str, prefix: &str, tag: &str) -> Option<GameProcess> {
    let mut command = Command::new(&cmd[0]);
    command.args(&cmd[1..]).env_clear().envs(env).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    if !cwd.is_empty() {
        command.current_dir(cwd);
    }
    match command.spawn() {
        Ok(mut child) => {
            info!("[{tag}] Process started, PID: {}", child.id());
            pipe_process_logs(&mut child, prefix);
            Some(GameProcess::Child(child))
        }
        Err(e) => {
            error!("[{tag}] Failed to launch: {e}");
            None
        }
    }
}

pub struct Output {
    pub status: ExitStatus,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
}

/// subprocess.run(capture_output=True, timeout=...): kills the child on timeout.
pub fn run_with_timeout(command: &mut Command, timeout: Option<Duration>) -> std::io::Result<Output> {
    let mut child = command.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn()?;
    let read = |pipe: Option<Box<dyn Read + Send>>| {
        std::thread::spawn(move || {
            let mut buf = Vec::new();
            if let Some(mut pipe) = pipe {
                let _ = pipe.read_to_end(&mut buf);
            }
            buf
        })
    };
    let out = read(child.stdout.take().map(|p| Box::new(p) as Box<dyn Read + Send>));
    let err = read(child.stderr.take().map(|p| Box::new(p) as Box<dyn Read + Send>));
    let status = match timeout {
        None => child.wait()?,
        Some(timeout) => {
            let deadline = Instant::now() + timeout;
            loop {
                if let Some(status) = child.try_wait()? {
                    break status;
                }
                if Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(std::io::Error::new(
                        std::io::ErrorKind::TimedOut,
                        format!("Command timed out after {} seconds", timeout.as_secs()),
                    ));
                }
                std::thread::sleep(Duration::from_millis(50));
            }
        }
    };
    Ok(Output { status, stdout: out.join().unwrap_or_default(), stderr: err.join().unwrap_or_default() })
}

/// Launch a Windows executable using Proton: `proton run game.exe`.
pub fn launch_with_proton(exe_path: &str, config: &RunnerConfig, launch_cmd: Option<&str>) -> Result<Option<GameProcess>> {
    let proton_script = pypath::join(config.runner_path(), "proton");
    if !pypath::exists(&proton_script) {
        error!("Proton script not found at: {proton_script}");
        return Ok(None);
    }
    make_executable(&proton_script)?;

    let mut env = base_env();
    env.insert("STEAM_COMPAT_DATA_PATH".into(), config.compat_data().into());
    if let Some(steam) = set(&config.steam_path) {
        env.insert("STEAM_COMPAT_CLIENT_INSTALL_PATH".into(), steam.into());
    }
    env.entry("SteamAppId".into()).or_insert_with(|| "0".into());
    env.entry("SteamGameId".into()).or_insert_with(|| "0".into());
    sdl_video_driver(&mut env, "Proton");

    let launch = split_env_and_args(launch_cmd)?;
    env.extend(launch.env.clone());

    apply_online_fix(&mut env, config);
    if set(&config.winedlloverrides).is_some() || set(&config.steamappid).is_some() {
        info!(
            "[Proton] Online-Fix: SteamAppId={}, WINEDLLOVERRIDES={}",
            env_or_none(&env, "SteamAppId"),
            env_or_none(&env, "WINEDLLOVERRIDES")
        );
    }

    // Proton standalone (outside Steam) crashes with FileNotFoundError on
    // tracked_files when it tries to upgrade a fresh prefix. Create an empty
    // placeholder so setup_prefix() can read it.
    let tracked_files = pypath::join(config.compat_data(), "tracked_files");
    if !pypath::exists(&tracked_files) {
        match std::fs::File::create(&tracked_files) {
            Ok(_) => info!("[Proton] Created tracked_files placeholder: {tracked_files}"),
            Err(e) => warn!("[Proton] Could not create tracked_files: {e}"),
        }
    }

    let prefix_path = pypath::join(config.compat_data(), "pfx");
    makedirs(&prefix_path)?;
    install_vcredist(&prefix_path, &env, None, Some(&proton_script))?;

    // Steam overlay injection (only for OnlineFix games with a SteamAppId).
    // Best-effort: preloads both gameoverlayrenderer.so (32 + 64 bit) and the
    // dynamic loader picks the matching one.
    if let Some(appid) = set(&config.steamappid) {
        match resolve_steam_overlay() {
            Some(overlay) => {
                env.insert("LD_PRELOAD".into(), overlay.clone());
                env.insert("ENABLE_VK_LAYER_VALVE_steam_overlay_1".into(), "1".into());
                env.insert("SteamOverlayGameId".into(), appid.into());
                info!("[Proton] Steam overlay injected: LD_PRELOAD={overlay}, SteamOverlayGameId={appid}");
            }
            None => warn!("[Proton] gameoverlayrenderer.so not found; overlay disabled"),
        }
    }

    let mut cmd = vec![proton_script, "run".into(), exe_path.into()];
    cmd.extend(launch.args.iter().cloned());
    let cmd = launch.wrap(cmd);
    let game_dir = pypath::dirname(exe_path);

    info!("[Proton] Command: {}", cmd.join(" "));
    info!("[Proton] STEAM_COMPAT_DATA_PATH={}", config.compat_data());
    info!("[Proton] Working dir: {game_dir}");
    Ok(spawn_logged(&cmd, &env, &game_dir, "PROTON", "Proton"))
}

/// Launch a Windows executable using system Wine with an isolated prefix.
pub fn launch_with_wine_isolated(exe_path: &str, config: &RunnerConfig, launch_cmd: Option<&str>) -> Result<Option<GameProcess>> {
    let wine_path = config.runner_path();
    if !pypath::exists(wine_path) && pypath::which(wine_path).is_none() {
        error!("Wine not found at: {wine_path}");
        return Ok(None);
    }

    let prefix_path = pypath::join(config.compat_data(), "pfx");
    makedirs(&prefix_path)?;

    let mut env = base_env();
    env.insert("WINEPREFIX".into(), prefix_path.clone());
    env.insert("WINEDLLOVERRIDES".into(), "winemenubuilder.exe=d".into());
    if cfg!(target_os = "linux") && !env.contains_key("DISPLAY") && !env.contains_key("WAYLAND_DISPLAY") {
        env.insert("DISPLAY".into(), ":0".into());
    }
    sdl_video_driver(&mut env, "Wine");

    let launch = split_env_and_args(launch_cmd)?;
    env.extend(launch.env.clone());

    let mut cmd = vec![wine_path.to_string(), exe_path.to_string()];
    cmd.extend(launch.args.iter().cloned());
    let cmd = launch.wrap(cmd);
    let game_dir = pypath::dirname(exe_path);

    info!("[Wine] Command: {}", cmd.join(" "));
    info!("[Wine] WINEPREFIX={prefix_path}");
    Ok(spawn_logged(&cmd, &env, &game_dir, "WINE", "Wine"))
}

fn highball_env(config: &RunnerConfig) -> BTreeMap<String, String> {
    let mut env = base_env();
    if let Some(home) = set(&config.highball_home) {
        env.insert("HIGHBALL_HOME".into(), home.into());
    }
    env
}

/// Launch a Windows executable on Apple Silicon through the bundled Highball CLI:
/// highball run [--renderer R] <bottle> <exe> -- <args>
/// The CLI stays running until the game exits and returns the game's exit code.
pub fn launch_with_highball(exe_path: &str, config: &RunnerConfig, launch_cmd: Option<&str>) -> Result<Option<GameProcess>> {
    let highball_bin = config.runner_path();
    if highball_bin.is_empty() || !pypath::is_file(highball_bin) {
        error!("[Highball] CLI not found at: {}", config.runner_path.as_deref().unwrap_or("None"));
        return Ok(None);
    }

    let mut env = highball_env(config);
    let launch = split_env_and_args(launch_cmd)?;
    env.extend(launch.env.clone());

    let mut cmd = vec![highball_bin.to_string(), "run".into()];
    if let Some(renderer) = set(&config.highball_renderer) {
        cmd.extend(["--renderer".into(), renderer.into()]);
    }
    cmd.push(config.highball_bottle.clone().unwrap_or_default());
    cmd.push(exe_path.into());
    if !launch.args.is_empty() {
        cmd.push("--".into());
        cmd.extend(launch.args.iter().cloned());
    }
    let cmd = launch.wrap(cmd);

    info!("[Highball] Command: {}", cmd.join(" "));
    info!("[Highball] HIGHBALL_HOME={}", env_or_none(&env, "HIGHBALL_HOME"));
    Ok(spawn_logged(&cmd, &env, &pypath::dirname(exe_path), "HIGHBALL", "Highball"))
}

/// Stop every Wine process in the game's bottle.
pub fn stop_highball_bottle(config: &RunnerConfig) {
    let bottle = config.highball_bottle.clone().unwrap_or_default();
    let mut command = Command::new(config.runner_path());
    command.args(["bottle", "kill", &bottle]).env_clear().envs(highball_env(config));
    match run_with_timeout(&mut command, Some(Duration::from_secs(30))) {
        Ok(_) => info!("[Highball] Stopped bottle {bottle}"),
        Err(e) => error!("[Highball] Failed to stop bottle: {e}"),
    }
}

/// Launch a Windows executable using umu-run:
/// GAMEID=umu-xxxx PROTONPATH=/path/to/proton WINEPREFIX=/path umu-run game.exe
pub fn launch_with_umu(exe_path: &str, config: &RunnerConfig, launch_cmd: Option<&str>) -> Result<Option<GameProcess>> {
    let umu_bin = config.runner_path();
    if !pypath::exists(umu_bin) {
        error!("[UMU] umu-run not found at: {umu_bin}");
        return Ok(None);
    }
    make_executable(umu_bin)?;

    let prefix_path = pypath::join(config.compat_data(), "pfx");
    makedirs(&prefix_path)?;

    let mut env = base_env();
    env.insert("GAMEID".into(), set(&config.umu_id).unwrap_or("umu-default").into());
    env.insert("WINEPREFIX".into(), prefix_path.clone());
    env.insert("STEAM_COMPAT_DATA_PATH".into(), config.compat_data().into());
    // Optional PROTONPATH: if empty, umu-run uses UMU-Proton
    if let Some(proton) = set(&config.proton_path) {
        env.insert("PROTONPATH".into(), proton.into());
    }
    if let Some(steam) = set(&config.steam_path) {
        env.insert("STEAM_COMPAT_CLIENT_INSTALL_PATH".into(), steam.into());
    }

    let launch = split_env_and_args(launch_cmd)?;
    env.extend(launch.env.clone());

    if config.umu_use_steam {
        env.insert("UMU_USE_STEAM".into(), "1".into());
    }
    apply_online_fix(&mut env, config);
    if config.umu_use_steam || set(&config.steamappid).is_some() {
        info!(
            "[UMU] Online-Fix: UMU_USE_STEAM={}, SteamAppId={}, WINEDLLOVERRIDES={}",
            env_or_none(&env, "UMU_USE_STEAM"),
            env_or_none(&env, "SteamAppId"),
            env_or_none(&env, "WINEDLLOVERRIDES")
        );
    }

    let mut cmd = vec![umu_bin.to_string(), exe_path.to_string()];
    cmd.extend(launch.args.iter().cloned());
    let cmd = launch.wrap(cmd);

    install_vcredist(&prefix_path, &env, Some(umu_bin), None)?;

    let game_dir = pypath::dirname(exe_path);
    info!("[UMU] Command: {}", cmd.join(" "));
    info!("[UMU] GAMEID={}, WINEPREFIX={prefix_path}", env["GAMEID"]);
    info!("[UMU] PROTONPATH={}", env.get("PROTONPATH").map_or("(auto)", |p| p.as_str()));
    info!("[UMU] Extra env applied: {:?}", launch.env);
    Ok(spawn_logged(&cmd, &env, &game_dir, "UMU", "UMU"))
}

#[cfg(target_os = "linux")]
fn download(url: &str, dest: &str) -> Result<()> {
    // rustls with bundled Mozilla roots, so installers are always authenticated
    let response = ureq::get(url).timeout(Duration::from_secs(60)).call()?;
    let mut file = std::fs::File::create(dest)?;
    std::io::copy(&mut response.into_reader(), &mut file)?;
    Ok(())
}

#[cfg(not(target_os = "linux"))]
fn download(_url: &str, _dest: &str) -> Result<()> {
    bail!("vcredist downloads are only supported on Linux")
}

/// Install Visual C++ redistributables (x86 + x64) using umu-run or Proton.
fn install_vcredist(prefix_path: &str, env: &BTreeMap<String, String>, umu_bin: Option<&str>, proton_script: Option<&str>) -> Result<()> {
    let marker = pypath::join(prefix_path, ".vcredist_installed");
    if pypath::exists(&marker) {
        info!("[VCREDIST] Already installed, skipping");
        return Ok(());
    }
    if umu_bin.is_none() && proton_script.is_none() {
        warn!("[VCREDIST] No umu-run or Proton binary, skipping vcredist install");
        return Ok(());
    }

    let installers = [
        ("vc_redist.x64.exe", "https://aka.ms/vc14/vc_redist.x64.exe"),
        ("vc_redist.x86.exe", "https://aka.ms/vc14/vc_redist.x86.exe"),
    ];
    let mut all_success = true;
    for (filename, url) in installers {
        let dest = pypath::join(prefix_path, filename);
        info!("[VCREDIST] Downloading {filename}...");
        if let Err(e) = download(url, &dest) {
            error!("[VCREDIST] Download failed for {filename}: {e}");
            all_success = false;
            continue;
        }
        info!("[VCREDIST] Download complete: {filename}");

        let via = if proton_script.is_some() { "Proton" } else { "umu-run" };
        info!("[VCREDIST] Installing {filename} via {via}...");
        let mut command = match proton_script {
            Some(proton) => {
                let mut c = Command::new(proton);
                c.args(["run", &dest]);
                c
            }
            None => {
                let mut c = Command::new(umu_bin.unwrap_or_default());
                c.arg(&dest);
                c
            }
        };
        command.args(["/install", "/quiet", "/norestart"]).env_clear().envs(env);
        match run_with_timeout(&mut command, Some(Duration::from_secs(120))) {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                if !stdout.is_empty() {
                    info!("[VCREDIST] stdout: {stdout}");
                }
                if !stderr.is_empty() {
                    info!("[VCREDIST] stderr: {stderr}");
                }
                let code = crate::procs::return_code(output.status);
                if code == 0 || code == 3010 {
                    info!("[VCREDIST] {filename} installed successfully");
                } else {
                    error!("[VCREDIST] {filename} failed with code: {code}");
                    all_success = false;
                }
            }
            Err(e) => {
                error!("[VCREDIST] Install error for {filename}: {e}");
                all_success = false;
            }
        }
        if pypath::exists(&dest) {
            std::fs::remove_file(&dest)?;
        }
    }

    // Only create the marker if both succeeded
    if all_success {
        std::fs::File::create(&marker)?;
        info!("[VCREDIST] All redistributables installed successfully");
    } else {
        warn!("[VCREDIST] Some redistributables failed to install, will retry next launch");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn env_and_args_split() {
        let parsed = split_env_and_args(Some("DXVK_HUD=1 PROTON_LOG=1 %command% -windowed 'two words' lower=1")).unwrap();
        assert_eq!(parsed.env.get("DXVK_HUD").map(String::as_str), Some("1"));
        assert_eq!(parsed.env.get("PROTON_LOG").map(String::as_str), Some("1"));
        assert!(parsed.wrapper.is_empty());
        assert_eq!(parsed.args, vec!["-windowed", "two words", "lower=1"]);
        assert!(split_env_and_args(Some("'unterminated")).is_err());
        assert_eq!(split_env_and_args(None).unwrap().args.len(), 0);

        let parsed = split_env_and_args(Some("-dx11 MANGOHUD=1")).unwrap();
        assert!(parsed.wrapper.is_empty());
        assert_eq!(parsed.env.get("MANGOHUD").map(String::as_str), Some("1"));
        assert_eq!(parsed.args, vec!["-dx11"]);
    }

    #[test]
    fn wrapper_before_command() {
        let parsed = split_env_and_args(Some("LSFG_PROCESS=game gamemoderun mangohud FOO=1 %command% -windowed")).unwrap();
        assert_eq!(parsed.env.len(), 1);
        assert_eq!(parsed.env.get("LSFG_PROCESS").map(String::as_str), Some("game"));
        assert_eq!(parsed.wrapper, vec!["gamemoderun", "mangohud", "FOO=1"]);
        assert_eq!(parsed.args, vec!["-windowed"]);
        assert_eq!(parsed.wrap(args(&["umu-run", "g.exe"])), vec!["gamemoderun", "mangohud", "FOO=1", "umu-run", "g.exe"]);

        let parsed = split_env_and_args(Some("~/lsfg %command%")).unwrap();
        assert_eq!(parsed.wrapper, vec![pypath::expand_home("~/lsfg")]);
        assert!(!parsed.wrapper[0].starts_with('~'));
    }

    #[test]
    fn runner_args() {
        assert_eq!(parse_runner_args(&args(&["game.exe", "true", "false"])), None);
        let config = parse_runner_args(&args(&[
            "g.exe", "false", "false", "--linux-runner-type", "umu", "--linux-runner-path", "/u",
            "--linux-umu-use-steam", "1", "--linux-steamappid", "480", "--linux-compat-data",
        ]))
        .unwrap();
        assert_eq!(config.runner_type(), "umu");
        assert_eq!(config.runner_path(), "/u");
        assert!(config.umu_use_steam);
        assert_eq!(config.steamappid.as_deref(), Some("480"));
        assert_eq!(config.compat_data, None);
    }

    #[test]
    fn slug() {
        assert_eq!(sanitize_game_slug("Half-Life: Alyx (2020) v1.2!"), "Half-Life_Alyx_(2020)_v1.2");
        assert_eq!(sanitize_game_slug(&"a".repeat(150)).len(), 100);
    }
}
