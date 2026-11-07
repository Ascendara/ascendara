// ==============================================================================
// Ascendara Game Handler
// ==============================================================================
// Game process manager for the Ascendara Game Launcher. Handles game execution,
// process monitoring, and Discord Rich Presence integration.
// Read more about the Game Handler here:
// https://ascendara.app/docs/binary-tool/game-handler

// The app starts the handler in the background; as a console program Windows
// would open a terminal window for it
#![windows_subsystem = "windows"]

mod discord;
mod execute;
mod jsonfile;
mod logger;
mod ludusavi;
mod paths;
mod procs;
mod pypath;
mod runners;
#[cfg(windows)]
mod win;

use std::process::{Command, Stdio};
use std::sync::Mutex;

const USAGE: &str = "Error: Not enough arguments\nUsage: AscendaraGameHandler.exe [game_path] [is_custom_game] [admin] [--shortcut] [--ludusavi] [--trainer] [--gameLaunchCmd \"command\"]";

static CRASH_REPORT: Mutex<Option<(i32, String)>> = Mutex::new(None);

/// Queue the crash reporter to open when the handler exits; the first error wins.
pub fn register_crash_reporter(error_code: i32, error_message: &str) {
    info!("[ENTRY] launch_crash_reporter(error_code={error_code}, error_message={error_message})");
    let mut slot = CRASH_REPORT.lock().unwrap_or_else(|e| e.into_inner());
    if slot.is_some() {
        info!("[EXIT] launch_crash_reporter() - AlreadyRegistered");
        return;
    }
    info!("Registering crash reporter with error code {error_code}: {error_message}");
    *slot = Some((error_code, error_message.to_string()));
    info!("[EXIT] launch_crash_reporter() - Registered");
}

fn launch_registered_crash_reporter() {
    let Some((error_code, error_message)) = CRASH_REPORT.lock().unwrap_or_else(|e| e.into_inner()).take() else {
        return;
    };
    info!("[ENTRY] _launch_crash_reporter_on_exit(error_code={error_code}, error_message={error_message})");
    let path = paths::crash_reporter();
    info!("Attempting to launch crash reporter with error code {error_code}");
    if !pypath::exists(&path) {
        error!("Crash reporter not found at: {path}");
        info!("[EXIT] _launch_crash_reporter_on_exit() - NotFound");
        return;
    }
    let mut command = Command::new(&path);
    command
        .args(["gamehandler", &error_code.to_string(), &error_message])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(win::CREATE_NO_WINDOW);
    }
    match command.spawn() {
        Ok(_) => {
            info!("Crash reporter launched successfully");
            info!("[EXIT] _launch_crash_reporter_on_exit() - Success");
        }
        Err(e) => {
            error!("Failed to launch crash reporter: {e}");
            info!("[EXIT] _launch_crash_reporter_on_exit() - Exception");
        }
    }
}

/// Python list repr, matching what the handler has always logged.
fn py_list(items: &[String]) -> String {
    let quoted: Vec<String> = items.iter().map(|s| format!("'{}'", s.replace('\\', "\\\\").replace('\'', "\\'"))).collect();
    format!("[{}]", quoted.join(", "))
}

fn flag(value: Option<&String>) -> bool {
    value.is_some_and(|v| v == "1" || v.to_lowercase() == "true")
}

fn main() {
    logger::stdout_line("[DEBUG] Script started.");
    // Called with: [game_path] [is_custom_game] [admin] [--shortcut] [--ludusavi] [--trainer] [--gameLaunchCmd "command"]
    let args: Vec<String> = std::env::args_os().skip(1).map(|a| a.to_string_lossy().into_owned()).collect();
    logger::stdout_line(&format!("[DEBUG] Arguments received: {}", py_list(&args)));

    let log_dir = paths::log_dir();
    let _ = std::fs::create_dir_all(&log_dir);
    let log_file = pypath::join(&log_dir, "gamehandler.log");
    logger::stdout_line(&format!("[DEBUG] Logging to: {log_file}"));
    logger::init(std::path::Path::new(&log_file));
    logger::stdout_line("[DEBUG] Logging configured.");

    info!("=== Ascendara Game Handler Started ===");
    info!("Arguments received: {}", py_list(&args));

    if args.len() < 2 {
        error!("{USAGE}");
        logger::stdout_line(USAGE);
        std::process::exit(1);
    }

    let has = |name: &str| args.iter().any(|a| a == name);
    let game_launch_cmd = args
        .iter()
        .position(|a| a == "--gameLaunchCmd")
        .and_then(|i| args.get(i + 1))
        .cloned();
    if let Some(cmd) = &game_launch_cmd {
        info!("Custom game launch command: {cmd}");
    }
    let opts = execute::Options {
        game_path: args[0].clone(),
        is_custom_game: flag(args.get(1)),
        admin: flag(args.get(2)),
        is_shortcut: has("--shortcut"),
        use_ludusavi: has("--ludusavi"),
        launch_trainer: has("--trainer"),
        game_launch_cmd,
        argv: std::iter::once(String::new()).chain(args.iter().cloned()).collect(),
    };

    let summary = format!(
        "game_path={}, is_custom_game={}, is_shortcut={}, use_ludusavi={}, admin={}, launch_trainer={}, game_launch_cmd={}",
        opts.game_path,
        execute::py_bool(opts.is_custom_game),
        execute::py_bool(opts.is_shortcut),
        execute::py_bool(opts.use_ludusavi),
        execute::py_bool(opts.admin),
        execute::py_bool(opts.launch_trainer),
        opts.game_launch_cmd.as_deref().unwrap_or("None")
    );
    info!("Initializing with: {summary}");
    logger::stdout_line(&format!("[DEBUG] Initializing with: {summary}"));

    match execute::execute(&opts) {
        Ok(()) => logger::stdout_line("[DEBUG] execute() finished."),
        Err(e) => {
            error!("Failed to execute game: {e}");
            logger::stdout_line(&format!("[ERROR] Exception occurred: {e}"));
            register_crash_reporter(1, &e.to_string());
        }
    }
    launch_registered_crash_reporter();
}
