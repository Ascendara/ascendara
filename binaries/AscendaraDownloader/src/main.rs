//! Ascendara Downloader.
//!
//! Same command line as the previous downloader:
//!   AscendaraDownloader <url> <game> <online> <dlc> <isVr> <updateFlow> <version> <size> <dir> [gameID]
//!       [--withNotification THEME] [--provider auto|direct|gofile] [--password PW] [--file-list]
//!   AscendaraDownloader --retry-extraction <game.ascendara.json>
//!
//! `url` may also be a magnet link or a .torrent URL; torrents download with the
//! built-in client.

#![cfg_attr(windows, windows_subsystem = "windows")]

mod archive;
mod http;
mod install;
mod pipeline;
mod providers;
mod state;
mod system;
mod torrent;
mod util;

use anyhow::{anyhow, bail, Result};
use std::path::PathBuf;

struct Args {
    positional: Vec<String>,
    theme: Option<String>,
    provider: String,
    password: Option<String>,
    file_list: bool,
}

fn parse_bool(value: &str) -> Result<bool> {
    match value.to_lowercase().as_str() {
        "true" | "1" | "yes" => Ok(true),
        "false" | "0" | "no" => Ok(false),
        _ => bail!("Invalid boolean value: {value}"),
    }
}

fn parse_args(raw: Vec<String>) -> Result<Args> {
    let mut args = Args { positional: Vec::new(), theme: None, provider: "auto".into(), password: None, file_list: false };
    let mut iter = raw.into_iter();
    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "--withNotification" => args.theme = iter.next(),
            "--provider" => args.provider = iter.next().ok_or_else(|| anyhow!("--provider needs a value"))?,
            "--password" => args.password = iter.next(),
            "--file-list" => args.file_list = true,
            // Settings for the old qBittorrent handler; torrents are built in now.
            "--torrentClient" | "--qbitHost" | "--qbitPort" | "--qbitUsername" | "--qbitPassword" => {
                iter.next();
            }
            _ => args.positional.push(arg),
        }
    }
    if args.positional.len() < 9 {
        bail!("usage: AscendaraDownloader <url> <game> <online> <dlc> <isVr> <updateFlow> <version> <size> <dir> [gameID]");
    }
    Ok(args)
}

async fn run(raw: Vec<String>) -> Result<()> {
    if raw.len() == 2 && raw[0] == "--retry-extraction" {
        return pipeline::retry_local_extraction(&PathBuf::from(&raw[1])).await;
    }
    let args = parse_args(raw)?;
    let p = &args.positional;
    let start = pipeline::StartArgs {
        game: p[1].clone(),
        online: parse_bool(&p[2])?,
        dlc: parse_bool(&p[3])?,
        is_vr: parse_bool(&p[4])?,
        update_flow: parse_bool(&p[5])?,
        version: p[6].clone(),
        size: p[7].clone(),
        download_dir: PathBuf::from(&p[8]),
        game_id: p.get(9).cloned().unwrap_or_default(),
        theme: args.theme.clone(),
    };
    let mut job = pipeline::Job::start(start)?;
    let result = job.download(&p[0], &args.provider, args.password.as_deref(), args.file_list).await;
    job.record(result);
    Ok(())
}

fn main() {
    let raw: Vec<String> = std::env::args().skip(1).collect();
    util::init_logging(!cfg!(windows));
    log::info!("Ascendara Downloader {} starting", env!("CARGO_PKG_VERSION"));
    std::panic::set_hook(Box::new(|info| {
        let message = format!("Downloader crashed: {info}");
        log::error!("{message}");
        system::launch_crash_reporter(1, &message);
    }));
    let _awake = system::AwakeGuard::new();
    let runtime = match tokio::runtime::Builder::new_multi_thread().enable_all().build() {
        Ok(runtime) => runtime,
        Err(error) => {
            log::error!("Could not start: {error}");
            system::launch_crash_reporter(1, &error.to_string());
            std::process::exit(1);
        }
    };
    let outcome = runtime.block_on(run(raw));
    // Torrent sessions and stalled sockets must not keep the process alive.
    runtime.shutdown_timeout(std::time::Duration::from_secs(5));
    if let Err(error) = outcome {
        if state::is_cancelled(&error) {
            log::info!("Download paused during startup; retaining partial files");
            return;
        }
        log::error!("Fatal error: {error:#}");
        system::launch_crash_reporter(1, &format!("{error:#}"));
        std::process::exit(1);
    }
}
