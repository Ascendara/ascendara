// String path helpers that behave like Python's os.path (posixpath/ntpath).
// Paths are written back to JSON files the app compares against, so they must
// come out byte-for-byte the same as the Python handler produced them.

use std::path::Path;

#[cfg(windows)]
pub const SEP: char = '\\';
#[cfg(not(windows))]
pub const SEP: char = '/';
#[cfg(windows)]
const SEPS: &[char] = &['\\', '/'];
#[cfg(not(windows))]
const SEPS: &[char] = &['/'];

#[cfg(windows)]
fn split_drive(p: &str) -> (&str, &str) {
    let b = p.as_bytes();
    if b.len() >= 2 && SEPS.contains(&(b[0] as char)) && SEPS.contains(&(b[1] as char)) {
        // UNC root: \\server\share
        let rest = &p[2..];
        return match rest.find(SEPS) {
            Some(i) => {
                let after = &rest[i + 1..];
                let end = 2 + i + 1 + after.find(SEPS).unwrap_or(after.len());
                (&p[..end], &p[end..])
            }
            None => (p, ""),
        };
    }
    if b.len() >= 2 && b[1] == b':' {
        return (&p[..2], &p[2..]);
    }
    ("", p)
}

#[cfg(not(windows))]
fn split_drive(p: &str) -> (&str, &str) {
    ("", p)
}

pub fn split(p: &str) -> (String, String) {
    let (drive, rest) = split_drive(p);
    let i = rest.rfind(SEPS).map_or(0, |i| i + 1);
    let (head, tail) = rest.split_at(i);
    let trimmed = head.trim_end_matches(SEPS);
    let head = if trimmed.is_empty() { head } else { trimmed };
    (format!("{drive}{head}"), tail.to_string())
}

pub fn dirname(p: &str) -> String {
    split(p).0
}

pub fn basename(p: &str) -> String {
    split(p).1
}

pub fn join(a: &str, b: &str) -> String {
    let (b_drive, b_rest) = split_drive(b);
    if !b_drive.is_empty() {
        return b.to_string();
    }
    if b_rest.starts_with(SEPS) {
        return format!("{}{b}", split_drive(a).0);
    }
    let a_drive_only = cfg!(windows) && split_drive(a).1.is_empty();
    if a.is_empty() || a.ends_with(SEPS) || a_drive_only {
        format!("{a}{b}")
    } else {
        format!("{a}{SEP}{b}")
    }
}

pub fn join_all(parts: &[&str]) -> String {
    parts.iter().skip(1).fold(parts[0].to_string(), |acc, p| join(&acc, p))
}

pub fn normpath(p: &str) -> String {
    if p.is_empty() {
        return ".".into();
    }
    let (drive, rest) = split_drive(p);
    let rooted = rest.starts_with(SEPS);
    let mut parts: Vec<&str> = Vec::new();
    for comp in rest.split(SEPS) {
        match comp {
            "" | "." => {}
            ".." => {
                if parts.last().is_some_and(|last| *last != "..") {
                    parts.pop();
                } else if !rooted {
                    parts.push("..");
                }
            }
            comp => parts.push(comp),
        }
    }
    let mut out = drive.replace('/', &SEP.to_string());
    if rooted {
        out.push(SEP);
    }
    out.push_str(&parts.join(&SEP.to_string()));
    if out.is_empty() {
        ".".into()
    } else {
        out
    }
}

pub fn normcase(p: &str) -> String {
    if cfg!(windows) {
        p.to_lowercase().replace('/', "\\")
    } else {
        p.to_string()
    }
}

pub fn exists(p: &str) -> bool {
    Path::new(p).exists()
}

pub fn is_file(p: &str) -> bool {
    Path::new(p).is_file()
}

pub fn is_dir(p: &str) -> bool {
    Path::new(p).is_dir()
}

pub fn home() -> String {
    let var = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
    std::env::var(var).unwrap_or_default()
}

/// Python's os.path.expanduser for paths starting with "~/".
pub fn expand_home(p: &str) -> String {
    match p.strip_prefix("~/") {
        Some(rest) => join(&home(), rest),
        None => p.to_string(),
    }
}

/// shutil.which for a bare command name.
pub fn which(name: &str) -> Option<String> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        let candidate = dir.join(name);
        if is_executable(&candidate) {
            return Some(candidate.to_string_lossy().into_owned());
        }
        #[cfg(windows)]
        for ext in [".exe", ".bat", ".cmd", ".com"] {
            let candidate = dir.join(format!("{name}{ext}"));
            if candidate.is_file() {
                return Some(candidate.to_string_lossy().into_owned());
            }
        }
    }
    None
}

#[cfg(unix)]
fn is_executable(p: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    p.metadata().is_ok_and(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
}

#[cfg(windows)]
fn is_executable(p: &Path) -> bool {
    p.is_file()
}

#[cfg(all(test, not(windows)))]
mod tests {
    use super::*;

    #[test]
    fn posix_behaviour() {
        assert_eq!(split("/a/b/c.exe"), ("/a/b".into(), "c.exe".into()));
        assert_eq!(split("/c.exe"), ("/".into(), "c.exe".into()));
        assert_eq!(split("c.exe"), ("".into(), "c.exe".into()));
        assert_eq!(split("/a/b/"), ("/a/b".into(), "".into()));
        assert_eq!(dirname("/"), "/");
        assert_eq!(join("/a", "b"), "/a/b");
        assert_eq!(join("/a/", "b"), "/a/b");
        assert_eq!(join("", "b"), "b");
        assert_eq!(join("/a", "/b"), "/b");
        assert_eq!(normpath("/a//b/./c/../d/"), "/a/b/d");
        assert_eq!(normpath("a/../../b"), "../b");
        assert_eq!(normpath("/../a"), "/a");
    }
}
