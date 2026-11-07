// Ascendara's per-platform data locations.

use crate::pypath;

/// Where gamehandler.log lives.
pub fn log_dir() -> String {
    if cfg!(target_os = "macos") {
        pypath::join(&pypath::expand_home("~/Library/Application Support"), "ascendara")
    } else if cfg!(target_os = "linux") {
        pypath::expand_home("~/.ascendara")
    } else {
        pypath::join(&std::env::var("APPDATA").unwrap_or_default(), "Ascendara by tagoWorks")
    }
}

/// Electron's userData directory, which holds ascendarasettings.json.
pub fn user_data_dir() -> String {
    if cfg!(target_os = "macos") {
        pypath::join(&pypath::expand_home("~/Library/Application Support"), "ascendara")
    } else if cfg!(target_os = "linux") {
        pypath::expand_home("~/.config/ascendara")
    } else {
        pypath::join(&std::env::var("APPDATA").unwrap_or_default(), "ascendara")
    }
}

pub fn settings_file() -> String {
    pypath::join(&user_data_dir(), "ascendarasettings.json")
}

/// Directory holding this executable, where the bundled helpers sit.
pub fn exe_dir() -> String {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_string_lossy().into_owned()))
        .unwrap_or_default()
}

pub fn crash_reporter() -> String {
    let name = if cfg!(windows) { "AscendaraCrashReporter.exe" } else { "AscendaraCrashReporter" };
    let bundled = pypath::join(&exe_dir(), name);
    if pypath::exists(&bundled) {
        return bundled;
    }
    // Source checkout: binaries/AscendaraGameHandler/target/release -> AscendaraCrashReporter
    let dev = pypath::join_all(&[&exe_dir(), "..", "..", "..", "AscendaraCrashReporter", "target", "release", name]);
    pypath::normpath(&dev)
}
