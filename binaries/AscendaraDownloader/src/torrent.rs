//! Built-in BitTorrent client for magnet links and .torrent files, so torrents
//! no longer depend on a separately installed and configured qBittorrent.

use crate::http::Counter;
use crate::state::{Cancelled, StopFlag};
use anyhow::{anyhow, bail, Context, Result};
use librqbit::{AddTorrent, AddTorrentOptions, AddTorrentResponse, DhtSessionConfig, Session, SessionOptions};
use std::num::NonZeroU32;
use std::path::Path;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::{Duration, Instant};

pub fn is_torrent_link(link: &str) -> bool {
    let lower = link.trim().to_lowercase();
    lower.starts_with("magnet:") || lower.split(['?', '#']).next().unwrap_or("").ends_with(".torrent")
}

/// Download the torrent's files into `folder`. Progress goes to `counter`;
/// `on_metadata` runs once the torrent's name and size are known.
pub async fn download(
    client: &reqwest::Client,
    link: &str,
    folder: &Path,
    stop: &StopFlag,
    counter: Arc<Counter>,
    limit_bps: u64,
) -> Result<()> {
    std::fs::create_dir_all(folder)?;
    let add = if link.trim().to_lowercase().starts_with("magnet:") {
        AddTorrent::from_url(link.trim().to_string())
    } else {
        crate::providers::validate_url(link)?;
        let bytes = client
            .get(link.trim())
            .timeout(Duration::from_secs(60))
            .send()
            .await
            .context("Could not download the .torrent file")?
            .error_for_status()
            .context("Could not download the .torrent file")?
            .bytes()
            .await?;
        AddTorrent::from_bytes(bytes)
    };
    let options = SessionOptions {
        dht: Some(DhtSessionConfig { persistence: None, ..Default::default() }),
        persistence: None,
        fastresume: false,
        ratelimits: librqbit::limits::LimitsConfig {
            download_bps: NonZeroU32::new(limit_bps.min(u32::MAX as u64) as u32),
            upload_bps: None,
        },
        ..Default::default()
    };
    let session = Session::new_with_opts(folder.to_path_buf(), options)
        .await
        .map_err(|e| anyhow!("Could not start the torrent engine: {e:#}"))?;
    let outcome = run(&session, add, folder, stop, counter).await;
    session.stop().await;
    outcome
}

async fn run(
    session: &Arc<Session>,
    add: AddTorrent<'_>,
    folder: &Path,
    stop: &StopFlag,
    counter: Arc<Counter>,
) -> Result<()> {
    let adding = session.add_torrent(
        add,
        Some(AddTorrentOptions {
            // Resuming rechecks what is already on disk and keeps the good pieces.
            overwrite: true,
            output_folder: Some(folder.to_string_lossy().into_owned()),
            ..Default::default()
        }),
    );
    // Finding peers for a magnet's metadata can take a while; stay stoppable.
    let response = tokio::select! {
        response = adding => response.map_err(|e| anyhow!("Could not add the torrent: {e:#}"))?,
        _ = wait_for_stop(stop) => return Err(Cancelled.into()),
    };
    let handle = match response {
        AddTorrentResponse::Added(_, handle) | AddTorrentResponse::AlreadyManaged(_, handle) => handle,
        AddTorrentResponse::ListOnly(_) => bail!("The torrent could not be started"),
    };
    log::info!("Torrent added: {}", handle.name().unwrap_or_else(|| "unnamed".into()));
    let mut last_progress = (0u64, Instant::now());
    loop {
        if stop.is_set() {
            let _ = session.pause(&handle).await;
            return Err(Cancelled.into());
        }
        let stats = handle.stats();
        if let Some(error) = &stats.error {
            bail!("Torrent error: {error}");
        }
        counter.total.store(stats.total_bytes, Ordering::Relaxed);
        counter.done.store(stats.progress_bytes, Ordering::Relaxed);
        if stats.finished && stats.total_bytes > 0 {
            return Ok(());
        }
        if stats.progress_bytes > last_progress.0 {
            last_progress = (stats.progress_bytes, Instant::now());
        } else if last_progress.1.elapsed() > Duration::from_secs(30 * 60) && stats.total_bytes > 0 {
            bail!("The torrent has had no peers sending data for 30 minutes. Try again later or choose another download source.");
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
}

async fn wait_for_stop(stop: &StopFlag) {
    while !stop.is_set() {
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
}
