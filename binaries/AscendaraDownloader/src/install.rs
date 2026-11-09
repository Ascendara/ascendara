//! From an extracted payload to an installed game: unwrap wrapper folders,
//! move files into the game folder with a rollback journal, verify, and find
//! the game's executable.

use crate::archive::Manifest;
use crate::state::StopFlag;
use crate::util::{compact_name, is_ascendara_owned, member_path, remove_path, replace_file, sanitize_folder_name, walk_files};
use anyhow::{anyhow, bail, Context, Result};
use regex::Regex;
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

const ASSET_FOLDERS: [&str; 11] =
    ["bin", "bin32", "bin64", "binaries", "data", "engine", "content", "assets", "plugins", "redist", "_commonredist"];
const SIDECAR_EXTENSIONS: [&str; 11] = ["txt", "nfo", "pdf", "html", "htm", "url", "jpg", "jpeg", "png", "webp", "ico"];

fn extension(name: &str) -> String {
    name.rsplit_once('.').map(|(_, e)| e.to_lowercase()).unwrap_or_default()
}

fn is_archive_like(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.ends_with(".zip") || lower.ends_with(".rar") || lower.ends_with(".7z")
        || Regex::new(r"(?i)\.[r-z]\d{2}$").unwrap().is_match(name)
}

/// Remove wrapper folders ("Game/", "Game v1.2/") so the game sits at the root,
/// keeping any folder the game itself needs by name.
pub fn flatten_payload(root: &Path, mut manifest: Manifest, game: &str) -> Result<Manifest> {
    loop {
        if manifest.is_empty() {
            return Ok(manifest);
        }
        let directories: HashSet<&str> =
            manifest.keys().filter_map(|n| n.split_once('/').map(|(d, _)| d)).collect();
        let loose: Vec<&String> = manifest.keys().filter(|n| !n.contains('/')).collect();
        // A launcher or other runtime file at this level means this is the game root.
        if directories.len() != 1 || loose.iter().any(|n| !SIDECAR_EXTENSIONS.contains(&extension(n).as_str())) {
            return Ok(manifest);
        }
        let wrapper = directories.into_iter().next().unwrap().to_string();
        let lower = wrapper.to_lowercase();
        if ASSET_FOLDERS.contains(&lower.as_str()) || lower.ends_with("_data") {
            return Ok(manifest);
        }
        let prefix = format!("{wrapper}/");
        let wrapped: Vec<String> = manifest.keys().filter(|n| n.starts_with(&prefix)).cloned().collect();
        let matches_game = compact_name(&wrapper) == compact_name(game);
        let archive_wrapper = wrapped.iter().any(|n| is_archive_like(n))
            && wrapped
                .iter()
                .all(|n| is_archive_like(n) || SIDECAR_EXTENSIONS.contains(&extension(n).as_str()));
        if !matches_game && !archive_wrapper && !wrapped.iter().any(|n| n.to_lowercase().ends_with(".exe")) {
            return Ok(manifest);
        }
        let mut folded: Vec<String> = loose.iter().map(|n| n.to_lowercase()).collect();
        folded.extend(wrapped.iter().map(|n| n[prefix.len()..].to_lowercase()));
        let names: HashSet<&String> = folded.iter().collect();
        let conflict = names.len() != folded.len()
            || names.iter().any(|name| {
                let parts: Vec<&str> = name.split('/').collect();
                (1..parts.len()).any(|i| names.contains(&parts[..i].join("/")))
            });
        if conflict {
            if archive_wrapper {
                bail!("Archive wrapper has conflicting files: {wrapper}; continuation archives cannot be flattened safely");
            }
            log::info!("Keeping archive wrapper {wrapper} to preserve conflicting files");
            return Ok(manifest);
        }
        // Move the wrapper aside first, so a nested same-name wrapper cannot collide.
        let aside = root
            .parent()
            .ok_or_else(|| anyhow!("Payload has no parent folder"))?
            .join(format!(".flatten-{}", std::process::id()));
        remove_path(&aside);
        replace_file(&member_path(root, &wrapper)?, &aside, Duration::from_secs(10))?;
        let mut mapped: Manifest = loose.iter().map(|n| ((*n).clone(), manifest[*n])).collect();
        for name in &wrapped {
            let relative = &name[prefix.len()..];
            let target = member_path(root, relative)?;
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)?;
            }
            replace_file(&member_path(&aside, relative)?, &target, Duration::from_secs(10))?;
            mapped.insert(relative.to_string(), manifest[name]);
        }
        remove_path(&aside);
        manifest = mapped;
    }
}

#[derive(Debug, Clone)]
pub struct VerifyError {
    pub file: String,
    pub error: String,
}

pub fn verify_errors_json(errors: &[VerifyError]) -> Value {
    Value::Array(errors.iter().map(|e| json!({"file": e.file, "error": e.error})).collect())
}

pub fn verify_manifest(root: &Path, manifest: &Manifest, stop: &StopFlag) -> Result<Vec<VerifyError>> {
    let mut errors = Vec::new();
    for (index, (name, size)) in manifest.iter().enumerate() {
        if index % 256 == 0 {
            stop.check()?;
        }
        let path = member_path(root, name)?;
        let mut outcome = fs::metadata(&path);
        for attempt in 0..3 {
            match &outcome {
                Err(error) if crate::util::is_transient_lock(error) || error.kind() == std::io::ErrorKind::NotFound => {
                    std::thread::sleep(Duration::from_millis(200 << attempt));
                    outcome = fs::metadata(&path);
                }
                _ => break,
            }
        }
        match outcome {
            Ok(meta) if !meta.is_file() => errors.push(VerifyError { file: name.clone(), error: "Expected a regular file".into() }),
            Ok(meta) if meta.len() != *size => errors.push(VerifyError {
                file: name.clone(),
                error: format!("Size mismatch: expected {size}, got {}", meta.len()),
            }),
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                errors.push(VerifyError { file: name.clone(), error: "File not found".into() })
            }
            Err(error) => errors.push(VerifyError { file: name.clone(), error: error.to_string() }),
        }
    }
    Ok(errors)
}

/// Install failed verification; the details are already in the game file.
#[derive(Debug)]
pub struct VerificationFailed {
    pub repairable_dlls: bool,
}

impl std::fmt::Display for VerificationFailed {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        if self.repairable_dlls {
            f.write_str("Missing listed DLLs; installed files retained for repair")
        } else {
            f.write_str("Installed files failed size verification")
        }
    }
}

impl std::error::Error for VerificationFailed {}

/// Online-fix packages list the DLLs security software tends to remove. When
/// only those are missing from a fresh install, keep it for targeted repair.
pub fn can_keep_for_dll_repair(game_dir: &Path, errors: &[VerifyError]) -> bool {
    let Ok(text) = fs::read_to_string(game_dir.join("dlllist.txt")) else { return false };
    if text.len() > 65536 {
        return false;
    }
    let listed: Vec<String> = text
        .lines()
        .map(|l| l.trim().replace('\\', "/").to_lowercase())
        .filter(|l| l.ends_with(".dll"))
        .collect();
    if listed.is_empty() || listed.len() > 128 || errors.is_empty() {
        return false;
    }
    errors.iter().all(|error| {
        let name = error.file.replace('\\', "/").to_lowercase();
        let base = name.rsplit('/').next().unwrap_or(&name).to_string();
        error.error == "File not found"
            && name.ends_with(".dll")
            && listed.iter().any(|item| *item == name || (!item.contains('/') && *item == base))
    })
}

pub struct InstallOutcome {
    pub errors: Vec<VerifyError>,
}

/// Move the payload into the game folder. Overwritten files go to a rollback
/// folder first; any failure before verification restores them.
pub fn install_payload(
    payload: &Path,
    manifest: &Manifest,
    stage: &Path,
    game_dir: &Path,
    update_flow: bool,
    stop: &StopFlag,
    mut on_installed: impl FnMut() -> Result<()>,
) -> Result<InstallOutcome> {
    let rollback = stage.join("rollback");
    fs::create_dir_all(&rollback)?;
    let filemap = game_dir.join("filemap.ascendara.json");
    let old_map = fs::read(&filemap).ok();
    let mut installed: Manifest = BTreeMap::new();
    if update_flow {
        if let Some(bytes) = &old_map {
            if let Ok(Value::Object(old)) = serde_json::from_slice::<Value>(bytes) {
                for (name, info) in old {
                    if let Some(size) = info.get("size").and_then(Value::as_u64) {
                        if !is_ascendara_owned(&name) {
                            installed.insert(name, size);
                        }
                    }
                }
            }
        }
    }
    installed.extend(manifest.iter().map(|(k, v)| (k.clone(), *v)));
    let paths: BTreeMap<String, &String> = manifest.keys().enumerate().map(|(i, n)| (i.to_string(), n)).collect();
    crate::util::write_atomic(&rollback.join("paths.json"), &serde_json::to_vec(&paths)?)?;
    if let Some(bytes) = &old_map {
        fs::write(rollback.join("previous-filemap.json"), bytes)?;
    }
    let mut journal: Vec<(PathBuf, Option<PathBuf>)> = Vec::new();
    let result: Result<()> = (|| {
        for name in manifest.keys() {
            stop.check()?;
            if name.split('/').any(|part| {
                let lower = part.to_lowercase();
                lower.ends_with(".ascendara.json") || lower.starts_with(".ascendara-") || lower.starts_with(".ascendara_")
            }) {
                bail!("Archive conflicts with Ascendara metadata: {name}");
            }
            let target = member_path(game_dir, name)?;
            let source = member_path(payload, name)?;
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).with_context(|| format!("Cannot create folder for {name}"))?;
            }
            let mut backup = None;
            if let Ok(meta) = fs::symlink_metadata(&target) {
                if !meta.is_file() {
                    bail!("Archive file conflicts with existing directory: {name}");
                }
                let path = rollback.join(journal.len().to_string());
                replace_file(&target, &path, Duration::from_secs(20))?;
                backup = Some(path);
            }
            journal.push((target.clone(), backup));
            install_file(&source, &target)?;
        }
        let map: serde_json::Map<String, Value> =
            installed.iter().map(|(name, size)| (name.clone(), json!({"size": size}))).collect();
        crate::util::write_atomic(&filemap, &serde_json::to_vec_pretty(&Value::Object(map))?)?;
        on_installed()
    })();
    if let Err(error) = result {
        undo(&journal, &filemap, old_map.as_deref());
        return Err(error);
    }
    let errors = verify_manifest(game_dir, &installed, stop)?;
    if !errors.is_empty() {
        let repairable = !update_flow && old_map.is_none() && can_keep_for_dll_repair(game_dir, &errors);
        if !repairable {
            undo(&journal, &filemap, old_map.as_deref());
        }
    }
    Ok(InstallOutcome { errors })
}

fn install_file(source: &Path, target: &Path) -> Result<()> {
    match replace_file(source, target, Duration::from_secs(10)) {
        Ok(()) => Ok(()),
        Err(error) => {
            // A reader holding the staged file open blocks renames, not copies.
            log::warn!("Staged file rename blocked; copying instead: {error:#}");
            let temporary = target.with_file_name(format!(
                ".ascendara-install-{}",
                target.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()
            ));
            fs::copy(source, &temporary).with_context(|| format!("Could not install {}", target.display()))?;
            if fs::metadata(&temporary)?.len() != fs::metadata(source)?.len() {
                let _ = fs::remove_file(&temporary);
                bail!("Staged file changed while being installed: {}", source.display());
            }
            replace_file(&temporary, target, Duration::from_secs(10))
        }
    }
}

fn undo(journal: &[(PathBuf, Option<PathBuf>)], filemap: &Path, old_map: Option<&[u8]>) {
    for (target, backup) in journal.iter().rev() {
        if target.is_file() && !remove_path(target) {
            log::error!("Could not remove installed file during rollback: {}", target.display());
        }
        if let Some(backup) = backup {
            if let Err(error) = replace_file(backup, target, Duration::from_secs(20)) {
                log::error!("Rollback could not restore {}: {error:#}", target.display());
            }
        }
    }
    match old_map {
        Some(bytes) => {
            let _ = fs::write(filemap, bytes);
        }
        None => {
            let _ = fs::remove_file(filemap);
        }
    }
}

// ---------------------------------------------------------------- executables

const NON_GAME_DIRS: [&str; 17] = [
    "__installer", "_installer", "installer", "installers", "_commonredist", "commonredist", "redist",
    "redistributables", "_redist", "support", "directx", "dotnet", "vcredist", "prerequisites", "__support",
    "easyanticheat", "battleye",
];

const SKIP_KEYWORDS: [&str; 19] = [
    "unins", "uninstall", "setup", "installer", "redist", "vcredist", "directx", "dotnet", "prerequisite",
    "launcher", "updater", "crash", "report", "config", "settings", "easyanticheat", "battleye", "steam_api",
    "cleanup",
];

fn skip_exe_dir(name: &str) -> bool {
    name.starts_with(".ascendara") || NON_GAME_DIRS.contains(&name.to_lowercase().as_str())
}

/// An executable named in the release's text files, if any.
fn exe_from_text(game_dir: &Path) -> Option<String> {
    let pattern = Regex::new(r"(?i)([a-z0-9_\-\s]+\.exe)").unwrap();
    for (name, path, _) in walk_files(game_dir, &|d| d.starts_with(".ascendara")) {
        let lower = name.to_lowercase();
        if ![".txt", ".nfo", ".md", ".readme", ".diz"].iter().any(|e| lower.ends_with(e)) {
            continue;
        }
        let Ok(bytes) = fs::read(&path) else { continue };
        let text = String::from_utf8_lossy(&bytes[..bytes.len().min(50_000)]);
        for found in pattern.captures_iter(&text) {
            let candidate = found[1].trim().to_string();
            let low = candidate.to_lowercase();
            if !["unins", "setup", "install", "redist", "vcredist", "directx"].iter().any(|s| low.contains(s)) {
                return Some(candidate);
            }
        }
    }
    None
}

pub fn detect_executable(game_dir: &Path, game: &str) -> Option<PathBuf> {
    let exes: Vec<(String, PathBuf, u64)> = walk_files(game_dir, &skip_exe_dir)
        .into_iter()
        .filter(|(name, _, _)| name.to_lowercase().ends_with(".exe"))
        .collect();
    if exes.is_empty() {
        log::warn!("No .exe files found in {}", game_dir.display());
        return None;
    }
    let hinted = exe_from_text(game_dir).map(|s| s.to_lowercase());
    let game_lower = game.to_lowercase();
    let sanitized = sanitize_folder_name(game).to_lowercase();
    let compact = compact_name(game);
    let word = Regex::new(r"\w+").unwrap();
    let game_words: HashSet<String> = word.find_iter(&game_lower).map(|m| m.as_str().to_string()).collect();
    let patterns: Vec<Regex> = [r"^game\.exe$", r"^start\.exe$", r"^play\.exe$", r".*game.*\.exe$", r"^[^_]+\.exe$"]
        .iter()
        .map(|p| Regex::new(p).unwrap())
        .collect();
    let mut best: Option<(i64, &PathBuf, &String)> = None;
    for (relative, path, size) in &exes {
        let file = relative.rsplit('/').next().unwrap_or(relative).to_lowercase();
        if SKIP_KEYWORDS.iter().any(|k| file.contains(k)) {
            continue;
        }
        let stem = file.trim_end_matches(".exe");
        let mut score: i64 = 0;
        if let Some(hint) = &hinted {
            if file == *hint {
                score += 1000;
            }
            if file.contains(hint.as_str()) {
                score += 500;
            }
        }
        if (!sanitized.is_empty() && file.contains(&sanitized)) || stem == sanitized
            || (!compact.is_empty() && compact_name(stem).contains(&compact))
        {
            score += 300;
        }
        let exe_words: HashSet<String> = word.find_iter(stem).map(|m| m.as_str().to_string()).collect();
        score += game_words.intersection(&exe_words).count() as i64 * 50;
        score += match relative.matches('/').count() {
            0 => 100,
            1 => 50,
            _ => 0,
        };
        score += if *size > 10 << 20 { 30 } else if *size > 1 << 20 { 10 } else { 0 };
        if patterns.iter().any(|p| p.is_match(&file)) {
            score += 20;
        }
        if best.map(|(b, _, _)| score > b).unwrap_or(true) {
            best = Some((score, path, relative));
        }
    }
    match best {
        Some((score, path, relative)) => {
            log::info!("Set executable to: {relative} (score: {score})");
            Some(path.clone())
        }
        None => {
            log::warn!("No good executable match, using the first: {}", exes[0].0);
            Some(exes[0].1.clone())
        }
    }
}

/// A repack that installs itself (setup.exe), for the app's manual-install step.
pub fn find_setup_installer(game_dir: &Path) -> Option<PathBuf> {
    let pattern = Regex::new(r"(?i)^(setup|install)([._ -].*)?\.exe$").unwrap();
    walk_files(game_dir, &|d| {
        d.starts_with(".ascendara") || ["redist", "_redist", "_commonredist", "directx"].contains(&d.to_lowercase().as_str())
    })
    .into_iter()
    .filter(|(name, _, _)| pattern.is_match(name.rsplit('/').next().unwrap_or(name)))
    .min_by_key(|(name, _, _)| (name.matches('/').count(), name.to_lowercase()))
    .map(|(_, path, _)| path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make(root: &Path, files: &[(&str, usize)]) -> Manifest {
        let mut manifest = Manifest::new();
        for (name, size) in files {
            let path = root.join(name);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(&path, vec![1u8; *size]).unwrap();
            manifest.insert(name.to_string(), *size as u64);
        }
        manifest
    }

    #[test]
    fn flattens_game_wrapper() {
        let base = std::env::temp_dir().join(format!("ascendara-flatten-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        let payload = base.join("payload");
        let manifest = make(&payload, &[("My Game/MyGame.exe", 10), ("My Game/Data/a.pak", 5), ("readme.txt", 1)]);
        let flat = flatten_payload(&payload, manifest, "My Game").unwrap();
        assert!(flat.contains_key("MyGame.exe"));
        assert!(flat.contains_key("Data/a.pak"));
        assert!(payload.join("MyGame.exe").is_file());
        // An asset folder is never unwrapped.
        let payload2 = base.join("payload2");
        let manifest = make(&payload2, &[("Data/a.pak", 5)]);
        let kept = flatten_payload(&payload2, manifest, "Game").unwrap();
        assert!(kept.contains_key("Data/a.pak"));
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn install_and_rollback() {
        let base = std::env::temp_dir().join(format!("ascendara-install-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        let game = base.join("Game");
        let stage = game.join(".ascendara-stage-test");
        let payload = stage.join("payload");
        fs::create_dir_all(&game).unwrap();
        fs::write(game.join("Game.exe"), b"old").unwrap();
        let manifest = make(&payload, &[("Game.exe", 20), ("data/x.bin", 7)]);
        let stop = StopFlag::default();
        // A failure after moving files restores the old ones.
        let failed = install_payload(&payload, &manifest, &stage, &game, false, &stop, || bail!("boom"));
        assert!(failed.is_err());
        assert_eq!(fs::read(game.join("Game.exe")).unwrap(), b"old");
        let manifest = make(&payload, &[("Game.exe", 20), ("data/x.bin", 7)]);
        let outcome = install_payload(&payload, &manifest, &stage, &game, false, &stop, || Ok(())).unwrap();
        assert!(outcome.errors.is_empty());
        assert_eq!(fs::metadata(game.join("Game.exe")).unwrap().len(), 20);
        assert!(game.join("filemap.ascendara.json").is_file());
        assert_eq!(detect_executable(&game, "Game").unwrap(), game.join("Game.exe"));
        let _ = fs::remove_dir_all(&base);
    }
}
