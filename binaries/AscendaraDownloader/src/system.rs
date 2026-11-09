//! App settings and the operating system around a download: sleep, notifications,
//! the crash reporter and what happens after a download finishes.

use serde_json::Value;
use std::path::PathBuf;
use std::process::{Command, Stdio};

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Debug, Clone)]
pub struct Settings {
    raw: Value,
}

impl Settings {
    pub fn load() -> Self {
        for path in settings_candidates() {
            if let Ok(text) = std::fs::read_to_string(&path) {
                match serde_json::from_str::<Value>(&text) {
                    Ok(raw) => {
                    log::info!("Using settings from {}", path.display());
                    return Settings { raw };
                }
                    Err(error) => log::warn!("Could not read settings {}: {error}", path.display()),
                }
            }
        }
        Settings { raw: Value::Null }
    }

    /// Bytes per second, 0 for no limit. The app stores KB/s.
    pub fn download_limit(&self) -> u64 {
        self.raw.get("downloadLimit").and_then(Value::as_u64).unwrap_or(0) * 1024
    }

    /// Connections per file. Single Stream only applies once the person turned it on
    /// themselves: it used to be on by default, which made every host one connection.
    pub fn connections(&self) -> usize {
        let single = self.raw.get("singleStream").and_then(Value::as_bool).unwrap_or(false);
        let chosen = self.raw.get("singleStreamChosen").and_then(Value::as_bool).unwrap_or(false);
        if single && chosen {
            return 1;
        }
        let threads = self.raw.get("threadCount").and_then(Value::as_u64).unwrap_or(8);
        threads.clamp(1, 32) as usize
    }

    pub fn behavior_after_download(&self) -> String {
        self.raw
            .get("behaviorAfterDownload")
            .and_then(Value::as_str)
            .unwrap_or("none")
            .to_string()
    }
}

fn settings_candidates() -> Vec<PathBuf> {
    let mut found = Vec::new();
    // The app passes the file it uses; development builds keep theirs elsewhere.
    if let Some(path) = std::env::var_os("ASCENDARA_SETTINGS") {
        found.push(PathBuf::from(path));
    }
    if cfg!(windows) {
        if let Some(appdata) = std::env::var_os("APPDATA") {
            let appdata = PathBuf::from(appdata);
            found.push(appdata.join("Ascendara").join("ascendarasettings.json"));
            // Development builds of the app keep their data under Electron.
            found.push(appdata.join("Electron").join("ascendarasettings.json"));
        }
    } else if let Some(home) = std::env::var_os("HOME") {
        let home = PathBuf::from(home);
        if cfg!(target_os = "macos") {
            found.push(home.join("Library/Application Support/ascendara/ascendarasettings.json"));
            found.push(home.join("Library/Application Support/Electron/ascendarasettings.json"));
        } else {
            found.push(home.join(".config/ascendara/ascendarasettings.json"));
            found.push(home.join(".config/Electron/ascendarasettings.json"));
        }
    }
    found
}

/// Bytes this process has read and written so far, from the operating system's
/// counters, or None where they are unavailable.
pub fn process_io() -> Option<(u64, u64)> {
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::System::Threading::{GetCurrentProcess, GetProcessIoCounters, IO_COUNTERS};
        let mut counters: IO_COUNTERS = std::mem::zeroed();
        if GetProcessIoCounters(GetCurrentProcess(), &mut counters) != 0 {
            return Some((counters.ReadTransferCount, counters.WriteTransferCount));
        }
        None
    }
    #[cfg(target_os = "linux")]
    {
        let text = std::fs::read_to_string("/proc/self/io").ok()?;
        let field = |name: &str| {
            text.lines()
                .find_map(|line| line.strip_prefix(name).and_then(|v| v.trim().parse::<u64>().ok()))
        };
        Some((field("rchar:")?, field("wchar:")?))
    }
    #[cfg(target_os = "macos")]
    unsafe {
        let mut info: libc::rusage_info_v2 = std::mem::zeroed();
        let result = libc::proc_pid_rusage(
            libc::getpid(),
            libc::RUSAGE_INFO_V2,
            &mut info as *mut libc::rusage_info_v2 as *mut libc::rusage_info_t,
        );
        (result == 0).then_some((info.ri_diskio_bytesread, info.ri_diskio_byteswritten))
    }
    #[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
    None
}

/// CPU time this process has used, across all threads.
pub fn process_cpu() -> Option<std::time::Duration> {
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::Foundation::FILETIME;
        use windows_sys::Win32::System::Threading::{GetCurrentProcess, GetProcessTimes};
        let mut times: [FILETIME; 4] = std::mem::zeroed();
        let [created, exited, kernel, user] = &mut times;
        if GetProcessTimes(GetCurrentProcess(), created, exited, kernel, user) == 0 {
            return None;
        }
        let ticks = |t: &FILETIME| ((t.dwHighDateTime as u64) << 32) | t.dwLowDateTime as u64;
        // FILETIME counts 100-nanosecond intervals.
        Some(std::time::Duration::from_nanos((ticks(&times[2]) + ticks(&times[3])) * 100))
    }
    #[cfg(unix)]
    unsafe {
        let mut usage: libc::rusage = std::mem::zeroed();
        if libc::getrusage(libc::RUSAGE_SELF, &mut usage) != 0 {
            return None;
        }
        let micros = |t: libc::timeval| t.tv_sec as u64 * 1_000_000 + t.tv_usec as u64;
        Some(std::time::Duration::from_micros(micros(usage.ru_utime) + micros(usage.ru_stime)))
    }
    #[cfg(not(any(windows, unix)))]
    None
}

fn sibling(name: &str) -> Option<PathBuf> {
    let file = if cfg!(windows) { format!("{name}.exe") } else { name.to_string() };
    let path = std::env::current_exe().ok()?.parent()?.join(file);
    path.exists().then_some(path)
}

fn spawn_hidden(command: &mut Command) {
    command.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    if let Err(error) = command.spawn() {
        log::warn!("Could not start helper: {error}");
    }
}

pub fn notify(theme: Option<&str>, title: &str, message: &str) {
    let Some(theme) = theme else { return };
    match sibling("AscendaraNotificationHelper") {
        Some(helper) => spawn_hidden(
            Command::new(helper).args(["--theme", theme, "--title", title, "--message", message]),
        ),
        None => log::warn!("Notification helper not found"),
    }
}

pub fn launch_crash_reporter(code: i32, message: &str) {
    match sibling("AscendaraCrashReporter") {
        Some(reporter) => {
            spawn_hidden(Command::new(reporter).args(["maindownloader", &code.to_string(), message]))
        }
        None => log::error!("Crash reporter not found"),
    }
}

/// Keeps the computer awake for as long as the guard lives.
pub struct AwakeGuard {
    #[cfg(target_os = "macos")]
    child: Option<std::process::Child>,
}

impl AwakeGuard {
    pub fn new() -> Self {
        #[cfg(windows)]
        unsafe {
            use windows_sys::Win32::System::Power::{SetThreadExecutionState, ES_CONTINUOUS, ES_SYSTEM_REQUIRED};
            SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED);
        }
        #[cfg(target_os = "macos")]
        let child = Command::new("caffeinate")
            .arg("-s")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .ok();
        AwakeGuard {
            #[cfg(target_os = "macos")]
            child,
        }
    }
}

impl Drop for AwakeGuard {
    fn drop(&mut self) {
        #[cfg(windows)]
        unsafe {
            use windows_sys::Win32::System::Power::{SetThreadExecutionState, ES_CONTINUOUS};
            SetThreadExecutionState(ES_CONTINUOUS);
        }
        #[cfg(target_os = "macos")]
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

pub fn run_post_download_behavior(settings: &Settings) {
    let behavior = settings.behavior_after_download();
    log::info!("Post-download behavior: {behavior}");
    let command: Option<(&str, Vec<&str>)> = match (behavior.as_str(), cfg!(windows), cfg!(target_os = "macos")) {
        ("lock", true, _) => Some(("rundll32.exe", vec!["user32.dll,LockWorkStation"])),
        ("sleep", true, _) => Some(("rundll32.exe", vec!["powrprof.dll,SetSuspendState", "0,1,0"])),
        ("shutdown", true, _) => Some((
            "shutdown",
            vec!["/s", "/t", "60", "/c", "Ascendara download complete - shutting down in 60 seconds"],
        )),
        ("lock", _, true) => Some(("pmset", vec!["displaysleepnow"])),
        ("sleep", _, true) => Some(("pmset", vec!["sleepnow"])),
        ("shutdown", _, true) => Some(("osascript", vec!["-e", "tell app \"System Events\" to shut down"])),
        _ => None,
    };
    if let Some((program, args)) = command {
        spawn_hidden(Command::new(program).args(args));
    }
}

