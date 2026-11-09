//! Small shared helpers: sizes, names, safe paths, disk space, file moves, logging.

use anyhow::{anyhow, bail, Context, Result};
use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

// ---------------------------------------------------------------- formatting

pub fn read_size(size: f64) -> String {
    if size <= 0.0 {
        return "0 B".into();
    }
    let units = ["B", "KB", "MB", "GB", "TB", "PB"];
    let mut value = size;
    let mut unit = 0;
    while value >= 1024.0 && unit < units.len() - 1 {
        value /= 1024.0;
        unit += 1;
    }
    format!("{value:.2} {}", units[unit])
}

pub fn format_eta(seconds: u64) -> String {
    if seconds >= 3600 {
        format!("{}h {}m", seconds / 3600, (seconds % 3600) / 60)
    } else if seconds >= 60 {
        format!("{}m {}s", seconds / 60, seconds % 60)
    } else {
        format!("{seconds}s")
    }
}

/// Same character set the app uses for game folders.
pub fn sanitize_folder_name(name: &str) -> String {
    name.chars()
        .filter(|c| c.is_ascii_alphanumeric() || "-_.() ".contains(*c))
        .collect()
}

/// Lowercase letters and digits only, so "It Takes Two" matches "ItTakesTwo".
pub fn compact_name(name: &str) -> String {
    name.chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .map(|c| c.to_ascii_lowercase())
        .collect()
}

/// A file name that is safe to create on every platform.
pub fn safe_file_name(name: &str, fallback: &str) -> String {
    let cleaned: String = name
        .chars()
        .filter(|c| !matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') && (*c as u32) >= 32)
        .collect();
    let cleaned = cleaned.trim().trim_end_matches('.').trim().to_string();
    if cleaned.is_empty() || cleaned.eq_ignore_ascii_case("download") || cleaned.eq_ignore_ascii_case("dl") {
        fallback.to_string()
    } else {
        cleaned
    }
}

// ---------------------------------------------------------------- paths

const RESERVED: [&str; 6] = ["CON", "PRN", "AUX", "NUL", "CONIN$", "CONOUT$"];

/// Normalize an archive member name to forward slashes and reject anything that
/// could escape the destination or that Windows cannot create.
pub fn clean_member_name(name: &str) -> Result<String> {
    let normalized = name.replace('\\', "/");
    let trimmed = normalized.trim_end_matches('/');
    if trimmed.is_empty() || trimmed.starts_with('/') || trimmed.as_bytes().get(1) == Some(&b':') {
        bail!("Unsafe archive member name: {name:?}");
    }
    for part in trimmed.split('/') {
        let base = part.split('.').next().unwrap_or("").to_ascii_uppercase();
        let device = RESERVED.contains(&base.as_str())
            || ((base.starts_with("COM") || base.starts_with("LPT"))
                && base.len() == 4
                && base.as_bytes()[3].is_ascii_digit()
                && base.as_bytes()[3] != b'0');
        if part.is_empty()
            || part == "."
            || part == ".."
            || part.ends_with(' ')
            || part.ends_with('.')
            || part.chars().any(|c| (c as u32) < 32 || ":<>\"|?*".contains(c))
            || device
        {
            bail!("Unsafe archive member name: {name:?}");
        }
    }
    Ok(trimmed.to_string())
}

/// Join a validated member name onto a root.
pub fn member_path(root: &Path, name: &str) -> Result<PathBuf> {
    let clean = clean_member_name(name)?;
    let mut target = root.to_path_buf();
    for part in clean.split('/') {
        target.push(part);
    }
    // Refuse to write through links planted inside the destination.
    let mut current = target.clone();
    while current != root && current.starts_with(root) {
        if let Ok(meta) = fs::symlink_metadata(&current) {
            if meta.file_type().is_symlink() || is_reparse_point(&meta) {
                bail!("Refusing symlink or reparse-point path: {}", current.display());
            }
        }
        if !current.pop() {
            break;
        }
    }
    Ok(target)
}

#[cfg(windows)]
fn is_reparse_point(meta: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    meta.file_attributes() & 0x400 != 0
}
#[cfg(not(windows))]
fn is_reparse_point(_meta: &fs::Metadata) -> bool {
    false
}

/// Relative path with forward slashes, the format filemaps use.
pub fn relative_name(root: &Path, path: &Path) -> Option<String> {
    let relative = path.strip_prefix(root).ok()?;
    let parts: Vec<String> = relative
        .components()
        .filter_map(|component| match component {
            Component::Normal(part) => Some(part.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect();
    (!parts.is_empty()).then(|| parts.join("/"))
}

/// Ascendara's own files beside the game. They change outside any download,
/// so they are never part of the game's verified file list.
pub fn is_ascendara_owned(name: &str) -> bool {
    let name = name.replace('\\', "/");
    let lower = name.to_lowercase();
    if lower.ends_with(".ascendara.json") || lower.starts_with(".ascendara") {
        return true;
    }
    !name.contains('/') && lower.contains(".ascendara.")
}

/// Files the installer leaves out of every game: web shortcuts and the shared redistributables folder.
pub fn wanted_member(name: &str) -> bool {
    let lower = name.to_lowercase();
    !lower.ends_with(".url") && !lower.contains("_commonredist")
}

// ---------------------------------------------------------------- disk

pub fn free_space(path: &Path) -> Result<u64> {
    let mut probe = path.to_path_buf();
    while !probe.exists() {
        if !probe.pop() {
            bail!("No existing folder for {}", path.display());
        }
    }
    platform_free_space(&probe)
}

#[cfg(windows)]
fn platform_free_space(path: &Path) -> Result<u64> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    let mut available = 0u64;
    let ok = unsafe { GetDiskFreeSpaceExW(wide.as_ptr(), &mut available, std::ptr::null_mut(), std::ptr::null_mut()) };
    if ok == 0 {
        return Err(std::io::Error::last_os_error()).context("Could not read free disk space");
    }
    Ok(available)
}

#[cfg(unix)]
fn platform_free_space(path: &Path) -> Result<u64> {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;
    let text = CString::new(path.as_os_str().as_bytes())?;
    let mut stat: libc::statvfs = unsafe { std::mem::zeroed() };
    if unsafe { libc::statvfs(text.as_ptr(), &mut stat) } != 0 {
        return Err(std::io::Error::last_os_error()).context("Could not read free disk space");
    }
    Ok(stat.f_bavail as u64 * stat.f_frsize as u64)
}

/// True for errors that Windows raises while security software or the indexer
/// briefly holds a file open.
pub fn is_transient_lock(error: &std::io::Error) -> bool {
    matches!(error.kind(), std::io::ErrorKind::PermissionDenied)
        || matches!(error.raw_os_error(), Some(5) | Some(32) | Some(33))
}

/// Rename with retries, clearing read-only targets. Same-volume only.
pub fn replace_file(source: &Path, target: &Path, deadline: Duration) -> Result<()> {
    let started = Instant::now();
    let mut attempt = 0u32;
    loop {
        match fs::rename(source, target) {
            Ok(()) => return Ok(()),
            Err(error) if is_transient_lock(&error) && started.elapsed() < deadline => {
                if let Ok(meta) = fs::metadata(target) {
                    let mut permissions = meta.permissions();
                    if permissions.readonly() {
                        #[allow(clippy::permissions_set_readonly_false)]
                        permissions.set_readonly(false);
                        let _ = fs::set_permissions(target, permissions);
                    }
                }
                std::thread::sleep(Duration::from_millis((100u64 << attempt.min(4)).min(2000)));
                attempt += 1;
            }
            Err(error) => {
                return Err(error).with_context(|| {
                    format!("Could not move {} to {}", source.display(), target.display())
                })
            }
        }
    }
}

/// Remove a file or folder with retries, clearing read-only attributes.
pub fn remove_path(path: &Path) -> bool {
    for attempt in 0..5 {
        let meta = match fs::symlink_metadata(path) {
            Ok(meta) => meta,
            Err(_) => return true,
        };
        let result = if meta.is_dir() {
            clear_readonly_tree(path);
            fs::remove_dir_all(path)
        } else {
            let mut permissions = meta.permissions();
            if permissions.readonly() {
                #[allow(clippy::permissions_set_readonly_false)]
                permissions.set_readonly(false);
                let _ = fs::set_permissions(path, permissions);
            }
            fs::remove_file(path)
        };
        match result {
            Ok(()) => return true,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return true,
            Err(error) => {
                if attempt == 4 {
                    log::warn!("Could not remove {}: {error}", path.display());
                    return false;
                }
                std::thread::sleep(Duration::from_millis(250 * (attempt + 1)));
            }
        }
    }
    false
}

fn clear_readonly_tree(path: &Path) {
    let Ok(entries) = fs::read_dir(path) else { return };
    for entry in entries.flatten() {
        let child = entry.path();
        if let Ok(meta) = fs::symlink_metadata(&child) {
            if meta.is_dir() {
                clear_readonly_tree(&child);
            } else if meta.permissions().readonly() {
                let mut permissions = meta.permissions();
                #[allow(clippy::permissions_set_readonly_false)]
                permissions.set_readonly(false);
                let _ = fs::set_permissions(&child, permissions);
            }
        }
    }
}

/// Write bytes to a temporary sibling and rename it over the target.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    let folder = path.parent().ok_or_else(|| anyhow!("No parent folder for {}", path.display()))?;
    let temporary = folder.join(format!(
        ".{}.{}.tmp",
        path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
        std::process::id()
    ));
    {
        let mut file = fs::File::create(&temporary)
            .with_context(|| format!("Could not create {}", temporary.display()))?;
        file.write_all(bytes)?;
        file.flush()?;
    }
    let result = replace_file(&temporary, path, Duration::from_secs(5));
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

/// Total size of the regular files under a folder.
pub fn tree_size(path: &Path) -> u64 {
    let mut total = 0;
    let Ok(entries) = fs::read_dir(path) else { return 0 };
    for entry in entries.flatten() {
        let Ok(meta) = fs::symlink_metadata(entry.path()) else { continue };
        if meta.is_dir() {
            total += tree_size(&entry.path());
        } else if meta.is_file() {
            total += meta.len();
        }
    }
    total
}

/// All regular files under `root`, as relative forward-slash names.
pub fn walk_files(root: &Path, skip_dir: &dyn Fn(&str) -> bool) -> Vec<(String, PathBuf, u64)> {
    let mut found = Vec::new();
    let mut pending = vec![root.to_path_buf()];
    while let Some(folder) = pending.pop() {
        let Ok(entries) = fs::read_dir(&folder) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(meta) = fs::symlink_metadata(&path) else { continue };
            let name = entry.file_name().to_string_lossy().into_owned();
            if meta.is_dir() {
                if !skip_dir(&name) {
                    pending.push(path);
                }
            } else if meta.is_file() {
                if let Some(relative) = relative_name(root, &path) {
                    found.push((relative, path, meta.len()));
                }
            }
        }
    }
    found
}

// ---------------------------------------------------------------- logging

struct FileLogger {
    file: Mutex<Option<fs::File>>,
    echo: bool,
}

impl log::Log for FileLogger {
    fn enabled(&self, metadata: &log::Metadata) -> bool {
        metadata.level() <= log::Level::Info
            || metadata.target().starts_with(env!("CARGO_CRATE_NAME"))
    }

    fn log(&self, record: &log::Record) {
        if !self.enabled(record.metadata()) {
            return;
        }
        // Only our own messages and warnings from libraries.
        if !record.target().starts_with(env!("CARGO_CRATE_NAME")) && record.level() > log::Level::Warn {
            return;
        }
        let line = format!(
            "{} {} [Downloader] {}\n",
            chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f"),
            record.level(),
            record.args()
        );
        if let Ok(mut guard) = self.file.lock() {
            if let Some(file) = guard.as_mut() {
                let _ = file.write_all(line.as_bytes());
            }
        }
        if self.echo {
            print!("{line}");
        }
    }

    fn flush(&self) {
        if let Ok(mut guard) = self.file.lock() {
            if let Some(file) = guard.as_mut() {
                let _ = file.flush();
            }
        }
    }
}

pub fn log_path() -> PathBuf {
    let base = if cfg!(windows) {
        std::env::var_os("APPDATA").map(PathBuf::from).unwrap_or_else(std::env::temp_dir)
    } else {
        std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".config")).unwrap_or_else(std::env::temp_dir)
    };
    let folder = base.join("Ascendara by tagoWorks");
    let _ = fs::create_dir_all(&folder);
    folder.join("downloadmanager.log")
}

pub fn init_logging(echo: bool) {
    let file = fs::OpenOptions::new().create(true).append(true).open(log_path()).ok();
    let logger = Box::new(FileLogger { file: Mutex::new(file), echo });
    if log::set_boxed_logger(logger).is_ok() {
        log::set_max_level(log::LevelFilter::Info);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn member_names() {
        assert!(clean_member_name("Game/bin/game.exe").is_ok());
        assert_eq!(clean_member_name("Game\\data\\a.pak").unwrap(), "Game/data/a.pak");
        assert!(clean_member_name("../evil.exe").is_err());
        assert!(clean_member_name("/abs").is_err());
        assert!(clean_member_name("C:/x").is_err());
        assert!(clean_member_name("dir/CON.txt").is_err());
        assert!(clean_member_name("dir/COM1").is_err());
        assert!(clean_member_name("dir/COM0").is_ok());
        assert!(clean_member_name("trailing./a").is_err());
    }

    #[test]
    fn sizes() {
        assert_eq!(read_size(0.0), "0 B");
        assert_eq!(read_size(1536.0), "1.50 KB");
        assert_eq!(format_eta(59), "59s");
        assert_eq!(format_eta(61), "1m 1s");
        assert_eq!(format_eta(3720), "1h 2m");
    }

    #[test]
    fn owned() {
        assert!(is_ascendara_owned("Game.ascendara.json"));
        assert!(is_ascendara_owned("header.ascendara.jpg"));
        assert!(!is_ascendara_owned("sub/header.ascendara.jpg"));
        assert!(is_ascendara_owned(".ascendara_backup/x"));
    }
}
