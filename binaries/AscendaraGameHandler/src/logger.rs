// Mirrors the Python handler's logging setup: every record goes to
// gamehandler.log and stdout as "<asctime> <LEVEL> <message>".

use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::sync::{Mutex, OnceLock};

static LOG_FILE: OnceLock<Mutex<Option<File>>> = OnceLock::new();
// Electron parses stdout line by line, so whole lines must never interleave
static STDOUT: Mutex<()> = Mutex::new(());

pub fn init(path: &Path) {
    let file = OpenOptions::new().create(true).append(true).open(path).ok();
    let _ = LOG_FILE.set(Mutex::new(file));
}

/// Write one line to stdout and flush it, ignoring a closed or missing stdout.
pub fn stdout_line(line: &str) {
    let _guard = STDOUT.lock();
    let mut out = std::io::stdout().lock();
    let _ = out.write_all(line.as_bytes());
    let _ = out.write_all(b"\n");
    let _ = out.flush();
}

pub fn write(level: &str, message: &str) {
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S,%3f");
    let line = format!("{now} {level} {message}");
    if let Some(file) = LOG_FILE.get() {
        if let Ok(mut file) = file.lock() {
            if let Some(file) = file.as_mut() {
                let _ = writeln!(file, "{line}");
            }
        }
    }
    stdout_line(&line);
}

#[macro_export]
macro_rules! info {
    ($($arg:tt)*) => { $crate::logger::write("INFO", &format!($($arg)*)) };
}

#[macro_export]
macro_rules! warn {
    ($($arg:tt)*) => { $crate::logger::write("WARNING", &format!($($arg)*)) };
}

#[macro_export]
macro_rules! error {
    ($($arg:tt)*) => { $crate::logger::write("ERROR", &format!($($arg)*)) };
}
