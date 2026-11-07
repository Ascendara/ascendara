// Save backups through Ludusavi after the game closes.

use anyhow::{anyhow, Result};
use serde_json::{Map, Value};
use std::process::Command;
use std::time::Duration;

use crate::runners::{run_with_timeout, sanitize_game_slug};
use crate::{error, info, jsonfile, paths, pypath, warn};

fn no_window(command: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(crate::win::CREATE_NO_WINDOW);
    }
    command
}

fn get_settings() -> Option<Map<String, Value>> {
    info!("[ENTRY] get_ludusavi_settings()");
    let settings_path = paths::settings_file();
    if !pypath::exists(&settings_path) {
        warn!("Ludusavi settings file does not exist: {settings_path}");
        info!("[EXIT] get_ludusavi_settings() - None");
        return None;
    }
    match jsonfile::read(&settings_path) {
        Ok(settings) => {
            let ludusavi = settings.get("ludusavi").and_then(Value::as_object);
            if let Some(ludusavi) = ludusavi.filter(|l| l.get("enabled") == Some(&Value::Bool(true))) {
                info!("[EXIT] get_ludusavi_settings() - Ludusavi enabled and settings loaded");
                return Some(ludusavi.clone());
            }
            info!("Ludusavi not enabled in settings");
            info!("[EXIT] get_ludusavi_settings() - None");
            None
        }
        Err(e) => {
            error!("Failed to load Ludusavi settings: {e}");
            info!("[EXIT] get_ludusavi_settings() - Exception");
            None
        }
    }
}

/// Runs `ludusavi find --api --backup ...` and returns the games object
/// ({title: {"score": float}}), or an empty one.
fn run_find(ludusavi: &str, config_dir: &str, extra_args: &[&str], game: &str, global_args: &[&str]) -> Map<String, Value> {
    let mut command = Command::new(ludusavi);
    command.args(["--config", config_dir]).args(global_args).args(["find", "--api", "--backup"]).args(extra_args).arg(game);
    let output = match run_with_timeout(no_window(&mut command), Some(Duration::from_secs(30))) {
        Ok(output) => output,
        Err(e) => {
            warn!("[Ludusavi] find failed to execute : {e}");
            return Map::new();
        }
    };
    let raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if raw.is_empty() {
        return Map::new();
    }
    let Ok(data) = serde_json::from_str::<Value>(&raw) else { return Map::new() };
    data.get("games").and_then(Value::as_object).cloned().unwrap_or_default()
}

/// Resolve a game name to the exact title expected by the Ludusavi manifest.
fn resolve_game_name(game_name: &str, ludusavi: &str, config_dir: &str, skip_manifest_update: bool) -> String {
    if game_name.is_empty() {
        return game_name.to_string();
    }
    let global_args: &[&str] = if skip_manifest_update { &["--no-manifest-update"] } else { &[] };
    // Exact, then normalized, then fuzzy (only accepted if score >= 0.9)
    let modes: [(&str, &[&str], f64); 3] = [
        ("exact", &[], 0.0),
        ("normalized", &["--normalized"], 0.0),
        ("fuzzy", &["--normalized", "--fuzzy"], 0.9),
    ];
    for (mode, extra_args, min_score) in modes {
        for (name, info) in run_find(ludusavi, config_dir, extra_args, game_name, global_args) {
            let score = info.get("score").and_then(Value::as_f64).unwrap_or(0.0);
            if score >= min_score {
                info!("[Ludusavi] Resolved game name \"{game_name}\" -> \"{name}\" ({mode}, score {score})");
                return name;
            }
        }
    }
    game_name.to_string()
}

fn ludusavi_path() -> String {
    if cfg!(windows) {
        return pypath::join(&paths::exe_dir(), "ludusavi.exe");
    }
    let path = pypath::join_all(&[&pypath::home(), ".ascendara", "ludusavi"]);
    if cfg!(target_os = "macos") && !pypath::exists(&path) {
        return pypath::which("ludusavi").unwrap_or(path);
    }
    path
}

fn config_dir() -> String {
    let app_data_dir = if cfg!(windows) {
        let appdata = std::env::var("APPDATA").unwrap_or_default();
        let prod_dir = pypath::join(&appdata, "ascendara");
        if pypath::exists(&prod_dir) {
            prod_dir
        } else {
            pypath::join(&appdata, "Electron")
        }
    } else {
        paths::user_data_dir()
    };
    pypath::join(&app_data_dir, "ludusavi-cloud-config")
}

/// Create config.yaml with the home-directory redirect if it doesn't exist.
fn ensure_config(config_dir: &str) -> Result<()> {
    let config_file = pypath::join(config_dir, "config.yaml");
    if pypath::exists(&config_file) {
        return Ok(());
    }
    std::fs::create_dir_all(config_dir)?;
    let local = pypath::home();
    let (local, cloud) = if cfg!(windows) {
        (local.replace('\\', "\\\\"), "C:\\Users\\ascendara_user".replace('\\', "\\\\"))
    } else {
        (local, "/home/ascendara_user".to_string())
    };
    let yaml = format!("redirects:\n  - kind: bidirectional\n    source: \"{local}\"\n    target: \"{cloud}\"\n");
    std::fs::write(&config_file, yaml)?;
    info!("Created new Ludusavi config with redirects at: {config_file}");
    Ok(())
}

/// Linux games keep saves in their Proton prefix unless the user set custom save paths.
fn has_custom_save_paths(game_name: &str) -> Result<bool> {
    let settings = jsonfile::read(&paths::settings_file())?;
    let download_dir = settings.get("downloadDirectory").and_then(Value::as_str).unwrap_or("");
    if download_dir.is_empty() {
        return Ok(false);
    }
    let game_json = pypath::join_all(&[download_dir, game_name, &format!("{game_name}.ascendara.json")]);
    let mut has_custom = false;
    if pypath::exists(&game_json) {
        has_custom = jsonfile::truthy(jsonfile::read(&game_json)?.get("customSavePaths"));
    }
    if !has_custom {
        let games_json = pypath::join(download_dir, "games.json");
        if pypath::exists(&games_json) {
            let data = jsonfile::read(&games_json)?;
            for game in data.get("games").and_then(Value::as_array).into_iter().flatten() {
                let name_matches = [game.get("game"), game.get("name")]
                    .iter()
                    .any(|v| v.and_then(Value::as_str) == Some(game_name));
                if name_matches {
                    has_custom = jsonfile::truthy(game.get("customSavePaths"));
                    break;
                }
            }
        }
    }
    Ok(has_custom)
}

fn backup(game_name: &str, wine_prefix: Option<&str>, settings: &Map<String, Value>) -> Result<bool> {
    let ludusavi = ludusavi_path();
    if !pypath::exists(&ludusavi) {
        error!("Ludusavi executable not found at: {ludusavi}");
        info!("[EXIT] run_ludusavi_backup() - No executable");
        return Ok(false);
    }

    let config_dir = config_dir();
    ensure_config(&config_dir)?;

    let options = settings.get("backupOptions").and_then(Value::as_object).cloned().unwrap_or_default();
    let skip_manifest_update = jsonfile::truthy(options.get("skipManifestCheck"));
    let resolved = resolve_game_name(game_name, &ludusavi, &config_dir, skip_manifest_update);
    let backup_location = settings
        .get("backupLocation")
        .filter(|v| !v.is_null())
        .map(jsonfile::as_arg)
        .ok_or_else(|| anyhow!("expected str, bytes or os.PathLike object, not NoneType"))?;
    let backup_format = settings.get("backupFormat").map_or("zip".into(), jsonfile::as_arg);
    let backups_to_keep = options.get("backupsToKeep").map_or("5".into(), jsonfile::as_arg);
    let mut compression = options.get("compressionLevel").map_or("default".into(), jsonfile::as_arg);
    if compression == "default" {
        compression = "deflate".into();
    }

    // Global options go before "backup"
    let mut args: Vec<String> = vec!["--config".into(), config_dir];
    if skip_manifest_update {
        args.push("--no-manifest-update".into());
    }
    args.extend([
        "backup".into(), resolved,
        "--path".into(), backup_location,
        "--format".into(), backup_format,
        "--full-limit".into(), backups_to_keep,
        "--compression".into(), compression,
        "--force".into(),
    ]);

    if cfg!(target_os = "linux") {
        let has_custom = has_custom_save_paths(game_name).unwrap_or_else(|e| {
            warn!("[Ludusavi] Could not check custom save paths: {e}");
            false
        });
        if !has_custom {
            let pfx = pypath::join_all(&[&pypath::home(), ".ascendara", "compatdata", &sanitize_game_slug(game_name), "pfx"]);
            if pypath::exists(&pfx) {
                info!("[Ludusavi] Linux: using wine prefix at {pfx}");
                args.extend(["--wine-prefix".into(), pfx]);
            } else {
                warn!("[Ludusavi] Linux: wine prefix not found at {pfx}");
            }
        }
    }

    // macOS: games run in a Highball bottle, which is a Wine prefix
    if let Some(prefix) = wine_prefix.filter(|p| cfg!(target_os = "macos") && pypath::is_dir(p)) {
        args.extend(["--wine-prefix".into(), prefix.into()]);
        info!("[Ludusavi] macOS: using Highball bottle at {prefix}");
    }

    let mut command = Command::new(&ludusavi);
    command.args(&args);
    let output = run_with_timeout(no_window(&mut command), None)?;
    if output.status.success() {
        info!("Ludusavi backup completed successfully for {game_name}");
        info!("[EXIT] run_ludusavi_backup() - Success");
        Ok(true)
    } else {
        error!("Ludusavi backup failed: {}", String::from_utf8_lossy(&output.stderr));
        info!("[EXIT] run_ludusavi_backup() - Failure");
        Ok(false)
    }
}

pub fn run_backup(game_name: &str, wine_prefix: Option<&str>) -> bool {
    info!("[ENTRY] run_ludusavi_backup(game_name={game_name})");
    let Some(settings) = get_settings() else {
        info!("Ludusavi backup skipped: not enabled in settings");
        info!("[EXIT] run_ludusavi_backup() - Skipped");
        return false;
    };
    backup(game_name, wine_prefix, &settings).unwrap_or_else(|e| {
        error!("Error running Ludusavi backup: {e}");
        info!("[EXIT] run_ludusavi_backup() - Exception");
        false
    })
}
