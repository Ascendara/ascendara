//! Resumable, multi-connection HTTP transfers.
//!
//! A file is split into pieces that connections claim in file order. When no
//! unclaimed piece is left, an idle connection splits the slowest active piece,
//! so one slow connection never holds up the end of a download. Every response
//! is checked against the file's size and validator before its bytes are kept,
//! and resume state is only saved after the data it describes reached the disk.

use crate::state::{Cancelled, StopFlag};
use anyhow::{anyhow, bail, Context, Result};
use futures_util::StreamExt;
use md5::Md5;
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_RANGE, CONTENT_TYPE, ETAG, LAST_MODIFIED, RANGE, RETRY_AFTER};
use reqwest::{Client, Response, StatusCode};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::VecDeque;
use std::fs::{File, OpenOptions};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

pub const USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

const MIN_PIECE: u64 = 4 * 1024 * 1024;
const MAX_PIECE: u64 = 64 * 1024 * 1024;
/// Smallest remainder worth splitting off a slow connection near the end.
const MIN_SPLIT: u64 = 2 * 1024 * 1024;
/// A socket that delivers nothing for this long is reconnected.
const READ_STALL: Duration = Duration::from_secs(30);
/// Consecutive failures without progress before a connection gives up.
const MAX_FAILURES: u32 = 8;
const STATE_SAVE_INTERVAL: Duration = Duration::from_secs(5);

pub fn build_client(cookies: Option<Arc<reqwest::cookie::Jar>>) -> Result<Client> {
    let mut headers = HeaderMap::new();
    headers.insert("Accept-Encoding", HeaderValue::from_static("identity"));
    let mut builder = Client::builder()
        .user_agent(USER_AGENT)
        .default_headers(headers)
        // Hosts throttle per TCP connection; HTTP/2 would put every
        // connection of a download on one socket and one throttle.
        .http1_only()
        .connect_timeout(Duration::from_secs(20))
        .pool_idle_timeout(Duration::from_secs(30))
        .tcp_keepalive(Duration::from_secs(30));
    if let Some(jar) = cookies {
        builder = builder.cookie_provider(jar);
    }
    Ok(builder.build()?)
}

/// Shared counters a reporter reads while a transfer runs.
#[derive(Default)]
pub struct Counter {
    pub done: AtomicU64,
    pub total: AtomicU64,
    pub retrying: AtomicUsize,
}

impl Counter {
    pub fn total(&self) -> Option<u64> {
        match self.total.load(Ordering::Relaxed) {
            0 => None,
            n => Some(n),
        }
    }
}

#[derive(Clone)]
pub struct TransferOptions {
    pub connections: usize,
    pub limit_bps: u64,
    pub expected_size: Option<u64>,
    pub md5: Option<String>,
    pub sha256: Option<String>,
    pub referer: Option<String>,
}

impl TransferOptions {
    pub fn new(connections: usize, limit_bps: u64) -> Self {
        TransferOptions { connections, limit_bps, expected_size: None, md5: None, sha256: None, referer: None }
    }
}

/// The host rejected the link; resuming with the same link will not help.
#[derive(Debug)]
pub struct Rejected(pub u16);

impl std::fmt::Display for Rejected {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Download server rejected the request (HTTP {}).", self.0)?;
        if matches!(self.0, 401 | 403 | 404 | 410) {
            f.write_str(" The download link may have expired or been removed; refresh the source or choose another link.")?;
        }
        Ok(())
    }
}

impl std::error::Error for Rejected {}

/// The host answered with a web page instead of the file.
#[derive(Debug)]
pub struct ErrorPage(pub String);

impl std::fmt::Display for ErrorPage {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let excerpt: String = self.0.chars().take(50).collect();
        write!(
            f,
            "The download host returned a web page (\"{excerpt}\") instead of the game file. The link may have expired; try again later or choose another link."
        )
    }
}

impl std::error::Error for ErrorPage {}

// ---------------------------------------------------------------- resume state

#[derive(Serialize, Deserialize, Clone)]
struct SavedState {
    version: u32,
    url: String,
    total: u64,
    validator: Option<String>,
    /// [start, position, end) per piece.
    pieces: Vec<[u64; 3]>,
}

struct Piece {
    start: u64,
    pos: u64,
    end: u64,
    owner: Option<usize>,
}

struct Shared {
    pieces: Mutex<Vec<Piece>>,
    total: u64,
    validator: Option<String>,
    counter: Arc<Counter>,
    active: AtomicUsize,
    limiter: Limiter,
    first_error: Mutex<Option<anyhow::Error>>,
    stop: StopFlag,
    /// Set when one connection fails for good, to end the others.
    aborted: std::sync::atomic::AtomicBool,
}

impl Shared {
    fn halted(&self) -> bool {
        self.stop.is_set() || self.aborted.load(Ordering::Relaxed)
    }
}

/// Holds a transfer to the user's speed limit and to the pace the drive can
/// sustain, whichever is lower.
struct Limiter {
    user_bps: u64,
    /// When the bytes already let through are due; later bytes queue behind it.
    next: Mutex<Option<Instant>>,
}

/// Unused allowance a quiet moment may bank, so short gaps are not punished.
const LIMIT_BURST: Duration = Duration::from_millis(250);

impl Limiter {
    fn new(user_bps: u64) -> Self {
        Limiter { user_bps, next: Mutex::new(None) }
    }

    async fn take(&self, bytes: u64) {
        let rate = match (self.user_bps, DRIVE_PACE_BPS.load(Ordering::Relaxed)) {
            (0, 0) => return,
            (0, limit) | (limit, 0) => limit,
            (user, drive) => user.min(drive),
        };
        let wait = {
            let mut next = self.next.lock().unwrap();
            let now = Instant::now();
            let earliest = now.checked_sub(LIMIT_BURST).unwrap_or(now);
            let start = next.filter(|t| *t > earliest).unwrap_or(earliest);
            let due = start + Duration::from_secs_f64(bytes as f64 / rate as f64);
            *next = Some(due);
            due.saturating_duration_since(now)
        };
        if !wait.is_zero() {
            tokio::time::sleep(wait).await;
        }
    }
}

/// The write speed, in bytes per second, this download is held to once the
/// drive proved slower than the connection. 0 until then. Kept for every file
/// of the download, since they all go to the same drive.
pub static DRIVE_PACE_BPS: AtomicU64 = AtomicU64::new(0);

/// Long enough to cover a whole fill-and-drain cycle of the write cache, so a
/// reading is the drive's average, not one of its fast or slow stretches.
const PACE_WINDOW: Duration = Duration::from_secs(20);
/// Stay a little under the drive's speed so its write cache drains instead of filling.
const PACE_MARGIN: f64 = 0.95;
/// Below this the measurement is more likely a hiccup (a scan, another program) than the drive.
const PACE_FLOOR: u64 = 4 * 1024 * 1024;
/// How long writes must flow freely before a pace below the first reading is raised again.
const PACE_RAISE_AFTER: Duration = Duration::from_secs(30);

/// Watches for writes that block. A drive slower than the connection lets
/// Windows' write cache fill, then stalls every connection until it drains,
/// so the speed rises and falls. Averaged over a full cycle of that, the
/// speed is what the drive can sustain, and the download is held just under
/// it from then on for an even speed.
struct DrivePacer {
    samples: VecDeque<(Instant, u64, u64)>,
    /// The first pace set; a lower pace climbs back toward it while writes flow freely.
    measured: u64,
    changed: Instant,
}

impl DrivePacer {
    fn new() -> Self {
        DrivePacer {
            samples: VecDeque::new(),
            measured: DRIVE_PACE_BPS.load(Ordering::Relaxed),
            changed: Instant::now(),
        }
    }

    /// `done` is the transfer's byte count; call it as often as convenient.
    fn tick(&mut self, done: u64) {
        let now = Instant::now();
        if self.samples.back().is_some_and(|(t, ..)| now.duration_since(*t) < Duration::from_millis(500)) {
            return;
        }
        self.samples.push_back((now, done, WRITE_BLOCKED_NANOS.load(Ordering::Relaxed)));
        while self.samples.len() > 2 && now.duration_since(self.samples[1].0) >= PACE_WINDOW {
            self.samples.pop_front();
        }
        let (Some(&(t0, d0, b0)), Some(&(t1, d1, b1))) = (self.samples.front(), self.samples.back()) else {
            return;
        };
        let span = t1.duration_since(t0).as_secs_f64();
        if span < PACE_WINDOW.as_secs_f64() * 0.9 {
            return;
        }
        // Same test as the app's "drive can't keep up" notice.
        let share = b1.saturating_sub(b0) as f64 / 1e9 / span;
        let rate = d1.saturating_sub(d0) as f64 / span;
        let current = DRIVE_PACE_BPS.load(Ordering::Relaxed);
        let pace = if current == 0 {
            if share < 0.5 {
                return;
            }
            let pace = (rate * PACE_MARGIN) as u64;
            if pace < PACE_FLOOR {
                return;
            }
            self.measured = pace;
            pace
        } else if share >= 0.5 && rate < current as f64 * 0.85 {
            // Under the pace, data arrives at the pace; only a clear shortfall
            // while writes block means the drive itself slowed down.
            let pace = ((rate * PACE_MARGIN) as u64).max(current / 2);
            if pace < PACE_FLOOR {
                return;
            }
            pace
        } else if share < 0.1 && current < self.measured && now.duration_since(self.changed) >= PACE_RAISE_AFTER {
            // The slowdown passed: step back up toward the first reading.
            ((current as f64 * 1.05) as u64).min(self.measured)
        } else {
            return;
        };
        DRIVE_PACE_BPS.store(pace, Ordering::Relaxed);
        self.changed = now;
        self.samples.clear();
        log::info!(
            "Holding the download at {}/s, the speed this drive keeps up with",
            crate::util::read_size(pace as f64)
        );
    }
}

fn validator_of(response: &Response) -> Option<String> {
    let etag = response.headers().get(ETAG).and_then(|v| v.to_str().ok()).map(str::to_string);
    match etag {
        Some(tag) if !tag.starts_with("W/") && !tag.is_empty() => Some(tag),
        _ => response
            .headers()
            .get(LAST_MODIFIED)
            .and_then(|v| v.to_str().ok())
            .filter(|v| !v.is_empty())
            .map(str::to_string),
    }
}

/// Parse `bytes first-last/total`.
fn content_range(response: &Response) -> Option<(u64, u64, u64)> {
    let value = response.headers().get(CONTENT_RANGE)?.to_str().ok()?;
    let rest = value.trim().strip_prefix("bytes ")?;
    let (span, total) = rest.split_once('/')?;
    let (first, last) = span.split_once('-')?;
    let first: u64 = first.trim().parse().ok()?;
    let last: u64 = last.trim().parse().ok()?;
    let total: u64 = total.trim().parse().ok()?;
    (last >= first && last < total).then_some((first, last, total))
}

fn retry_after(response: &Response) -> Option<Duration> {
    let value = response.headers().get(RETRY_AFTER)?.to_str().ok()?;
    value.trim().parse::<u64>().ok().map(|s| Duration::from_secs(s.min(120)))
}

fn is_html(response: &Response) -> bool {
    response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|v| v.to_ascii_lowercase().contains("text/html"))
        .unwrap_or(false)
}

/// Looks like markup or an API error instead of file data.
pub fn looks_like_page(bytes: &[u8]) -> bool {
    let text = bytes.strip_prefix(b"\xef\xbb\xbf").unwrap_or(bytes);
    let start = text.iter().position(|b| !b.is_ascii_whitespace()).map(|i| &text[i..]).unwrap_or(&[]);
    start.starts_with(b"<") || (start.starts_with(b"{") && start.len() < 64 * 1024)
}

fn page_excerpt(bytes: &[u8]) -> String {
    let text = String::from_utf8_lossy(&bytes[..bytes.len().min(4096)]);
    let title = regex::Regex::new(r"(?is)<title[^>]*>(.*?)</title>")
        .ok()
        .and_then(|re| re.captures(&text).map(|c| c[1].trim().to_string()));
    title.unwrap_or_else(|| text.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(160).collect())
}

/// Time spent blocked in disk writes, summed over every connection, in nanoseconds.
/// When this grows about as fast as the clock, the drive is what holds the download back.
pub static WRITE_BLOCKED_NANOS: AtomicU64 = AtomicU64::new(0);

fn write_all_at(file: &File, bytes: &[u8], offset: u64) -> std::io::Result<()> {
    let started = Instant::now();
    let result = write_all_at_raw(file, bytes, offset);
    WRITE_BLOCKED_NANOS.fetch_add(started.elapsed().as_nanos() as u64, Ordering::Relaxed);
    result
}

#[cfg(windows)]
fn write_all_at_raw(file: &File, mut bytes: &[u8], mut offset: u64) -> std::io::Result<()> {
    use std::os::windows::fs::FileExt;
    while !bytes.is_empty() {
        let written = file.seek_write(bytes, offset)?;
        if written == 0 {
            return Err(std::io::Error::new(std::io::ErrorKind::WriteZero, "write returned zero"));
        }
        bytes = &bytes[written..];
        offset += written as u64;
    }
    Ok(())
}

#[cfg(unix)]
fn write_all_at_raw(file: &File, bytes: &[u8], offset: u64) -> std::io::Result<()> {
    use std::os::unix::fs::FileExt;
    file.write_all_at(bytes, offset)
}

/// NTFS zero-fills the gap before a write past the end of the written data,
/// which stalls connections writing far into a fresh file. A sparse file
/// skips that.
#[cfg(windows)]
fn make_sparse(file: &File) {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::System::Ioctl::FSCTL_SET_SPARSE;
    use windows_sys::Win32::System::IO::DeviceIoControl;
    let mut returned = 0u32;
    unsafe {
        DeviceIoControl(
            file.as_raw_handle() as _,
            FSCTL_SET_SPARSE,
            std::ptr::null(),
            0,
            std::ptr::null_mut(),
            0,
            &mut returned,
            std::ptr::null_mut(),
        );
    }
}
#[cfg(not(windows))]
fn make_sparse(_file: &File) {}

fn part_paths(dest: &Path) -> (PathBuf, PathBuf) {
    let name = dest.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    (dest.with_file_name(format!("{name}.ascpart")), dest.with_file_name(format!("{name}.ascpart.json")))
}

/// Remove every resume artifact of a destination, including the older downloader's.
pub fn discard_partials(dest: &Path) {
    let (data, state) = part_paths(dest);
    let name = dest.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    for path in [
        data,
        state,
        dest.with_file_name(format!("{name}.partial")),
        dest.with_file_name(format!("{name}.partial.json")),
        dest.with_file_name(format!("{name}.resume.json")),
    ] {
        let _ = std::fs::remove_file(path);
    }
}

/// Load resume state, adopting partial downloads the older downloader left.
fn load_state(dest: &Path) -> Option<SavedState> {
    let (data, state_path) = part_paths(dest);
    if let Ok(text) = std::fs::read_to_string(&state_path) {
        if let Ok(state) = serde_json::from_str::<SavedState>(&text) {
            if data.exists() {
                return Some(state);
            }
        }
    }
    let name = dest.file_name()?.to_string_lossy().into_owned();
    // Parallel partial: {url, validator, total, pieces: [[start, end, done]]}
    let old_partial = dest.with_file_name(format!("{name}.partial"));
    let old_state = dest.with_file_name(format!("{name}.partial.json"));
    if let Ok(text) = std::fs::read_to_string(&old_state) {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
            let total = value.get("total").and_then(|v| v.as_u64())?;
            let pieces: Vec<[u64; 3]> = value
                .get("pieces")?
                .as_array()?
                .iter()
                .filter_map(|p| {
                    let p = p.as_array()?;
                    Some([p.first()?.as_u64()?, p.get(2)?.as_u64()?, p.get(1)?.as_u64()?])
                })
                .collect();
            if old_partial.exists() && std::fs::rename(&old_partial, &data).is_ok() {
                let _ = std::fs::remove_file(&old_state);
                log::info!("Continuing a partial download from the previous downloader: {name}");
                return Some(SavedState {
                    version: 1,
                    url: value.get("url").and_then(|v| v.as_str()).unwrap_or("").into(),
                    total,
                    validator: value.get("validator").and_then(|v| v.as_str()).map(str::to_string),
                    pieces,
                });
            }
        }
    }
    // Single stream: the file itself is a prefix, described by {url, validator, total}.
    let old_resume = dest.with_file_name(format!("{name}.resume.json"));
    if let Ok(text) = std::fs::read_to_string(&old_resume) {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
            let total = value.get("total").and_then(|v| v.as_u64())?;
            let have = std::fs::metadata(dest).ok()?.len().min(total);
            if std::fs::rename(dest, &data).is_ok() {
                let _ = std::fs::remove_file(&old_resume);
                log::info!("Continuing a single-stream download from the previous downloader: {name}");
                return Some(SavedState {
                    version: 1,
                    url: value.get("url").and_then(|v| v.as_str()).unwrap_or("").into(),
                    total,
                    validator: value.get("validator").and_then(|v| v.as_str()).map(str::to_string),
                    pieces: vec![[0, have, total]],
                });
            }
        }
    }
    None
}

fn save_state(path: &Path, url: &str, shared: &Shared, data: &File) {
    // Data first: the state must never describe bytes that are not on disk.
    if let Err(error) = data.sync_data() {
        log::warn!("Could not flush download data: {error}");
        return;
    }
    let mut pieces: Vec<[u64; 3]> = {
        let guard = shared.pieces.lock().unwrap();
        guard.iter().map(|p| [p.start, p.pos, p.end]).collect()
    };
    pieces.sort_by_key(|p| p[0]);
    let state = SavedState {
        version: 1,
        url: url.to_string(),
        total: shared.total,
        validator: shared.validator.clone(),
        pieces,
    };
    if let Ok(text) = serde_json::to_vec(&state) {
        if let Err(error) = crate::util::write_atomic(path, &text) {
            log::warn!("Could not save download progress: {error:#}");
        }
    }
}

fn plan_pieces(total: u64, connections: usize) -> Vec<Piece> {
    let size = (total / (connections as u64 * 4).max(1)).clamp(MIN_PIECE, MAX_PIECE);
    let mut pieces = Vec::new();
    let mut start = 0;
    while start < total {
        let end = (start + size).min(total);
        pieces.push(Piece { start, pos: start, end, owner: None });
        start = end;
    }
    if pieces.is_empty() {
        pieces.push(Piece { start: 0, pos: 0, end: 0, owner: None });
    }
    pieces
}

// ---------------------------------------------------------------- transfer

pub struct Transfer {
    pub client: Client,
    pub url: String,
    pub dest: PathBuf,
    pub options: TransferOptions,
    pub counter: Arc<Counter>,
    pub stop: StopFlag,
}

enum Opened {
    /// 206 for the requested start.
    Ranged(Response, u64, Option<String>),
    /// 200: the whole file from byte 0, ranges unsupported.
    Whole(Response, Option<u64>),
}

impl Transfer {
    fn request(&self, start: u64, validator: Option<&str>) -> reqwest::RequestBuilder {
        let mut request = self.client.get(&self.url).header(RANGE, format!("bytes={start}-"));
        if let Some(validator) = validator {
            request = request.header("If-Range", validator);
        }
        if let Some(referer) = &self.options.referer {
            request = request.header("Referer", referer);
        }
        request
    }

    async fn open(&self, start: u64, validator: Option<&str>) -> Result<Opened> {
        let response = self.request(start, validator).send().await?;
        let status = response.status();
        if status == StatusCode::RANGE_NOT_SATISFIABLE {
            bail!(RangeProblem("Download server rejected the saved range".into()));
        }
        if status.is_client_error() && !matches!(status.as_u16(), 408 | 429) {
            return Err(Rejected(status.as_u16()).into());
        }
        if matches!(status.as_u16(), 408 | 429) || status.is_server_error() {
            let wait = retry_after(&response).unwrap_or(Duration::from_secs(2));
            return Err(Busy(status.as_u16(), wait).into());
        }
        if let Some(encoding) = response.headers().get("Content-Encoding").and_then(|v| v.to_str().ok()) {
            if !encoding.eq_ignore_ascii_case("identity") && !encoding.is_empty() {
                bail!(RangeProblem(format!("Download server returned encoded bytes ({encoding})")));
            }
        }
        if status == StatusCode::PARTIAL_CONTENT {
            let (first, _, total) =
                content_range(&response).ok_or_else(|| RangeProblem("Missing or invalid Content-Range".into()))?;
            if first != start {
                bail!(RangeProblem("Download server returned the wrong byte range".into()));
            }
            let validator = validator_of(&response);
            return Ok(Opened::Ranged(response, total, validator));
        }
        if status == StatusCode::OK {
            let total = response.content_length().filter(|n| *n > 0);
            return Ok(Opened::Whole(response, total));
        }
        bail!("Unexpected response from the download server (HTTP {})", status.as_u16())
    }

    pub async fn run(&self) -> Result<()> {
        crate::providers::validate_url(&self.url)?;
        if let Some(parent) = self.dest.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let (data_path, state_path) = part_paths(&self.dest);
        let mut saved = load_state(&self.dest);
        if let (Some(state), Some(expected)) = (&saved, self.options.expected_size) {
            if state.total != expected {
                saved = None;
            }
        }
        let mut attempt = 0u32;
        loop {
            self.stop.check()?;
            let resume_from = saved
                .as_ref()
                .and_then(|s| s.pieces.iter().filter(|p| p[1] < p[2]).map(|p| p[1]).min());
            if let Some(state) = &saved {
                if resume_from.is_none() && std::fs::metadata(&data_path).map(|m| m.len()).ok() == Some(state.total) {
                    // Every byte arrived before the last run ended.
                    return self.finish(&data_path, &state_path, state.total).await;
                }
            }
            let start = resume_from.unwrap_or(0);
            let validator = saved.as_ref().and_then(|s| s.validator.clone());
            let opened = match self.open(start, validator.as_deref().filter(|_| start > 0)).await {
                Ok(opened) => opened,
                Err(error) if error.is::<RangeProblem>() && saved.is_some() => {
                    log::warn!("Discarding saved download progress: {error}");
                    discard_partials(&self.dest);
                    saved = None;
                    continue;
                }
                Err(error) => {
                    attempt += 1;
                    if error.is::<Rejected>() || attempt >= 6 {
                        return Err(network_context(error, "Download could not start"));
                    }
                    let wait = error.downcast_ref::<Busy>().map(|b| b.1).unwrap_or(Duration::from_secs(1 << attempt.min(4)));
                    log::warn!("Download request failed ({error}); retrying in {}s", wait.as_secs());
                    self.counter.retrying.store(attempt as usize, Ordering::Relaxed);
                    self.stop.sleep_async(wait).await?;
                    continue;
                }
            };
            self.counter.retrying.store(0, Ordering::Relaxed);
            match opened {
                Opened::Ranged(response, total, validator_now) => {
                    if let Some(expected) = self.options.expected_size {
                        if total != expected {
                            bail!("Remote file size ({total} bytes) differs from the source listing ({expected} bytes)");
                        }
                    }
                    if let Some(state) = &saved {
                        let changed = state.total != total
                            || matches!((&state.validator, &validator_now), (Some(a), Some(b)) if a != b);
                        if changed {
                            log::warn!("The remote file changed since the download started; starting over");
                            drop(response);
                            discard_partials(&self.dest);
                            saved = None;
                            continue;
                        }
                    }
                    return self.run_pieces(response, total, validator_now, saved.take(), &data_path, &state_path).await;
                }
                Opened::Whole(response, total) => {
                    if start > 0 && validator.is_some() {
                        // If-Range answered with the whole file: it changed since last time.
                        log::warn!("The remote file changed since the download started; starting over");
                        drop(response);
                        discard_partials(&self.dest);
                        saved = None;
                        continue;
                    }
                    if start > 0 {
                        log::warn!("Server no longer honors byte ranges; restarting the download");
                    }
                    discard_partials(&self.dest);
                    return self.run_single(response, total, &data_path, &state_path).await;
                }
            }
        }
    }

    async fn sniff_page(&self, first: &[u8], response_was_html: bool) -> Result<()> {
        if (response_was_html || first.len() < 64 * 1024) && looks_like_page(first) {
            return Err(ErrorPage(page_excerpt(first)).into());
        }
        Ok(())
    }

    /// Hosts that ignore byte ranges: one connection, start to finish.
    async fn run_single(
        &self,
        mut response: Response,
        total: Option<u64>,
        data_path: &Path,
        state_path: &Path,
    ) -> Result<()> {
        if let Some(expected) = self.options.expected_size {
            if let Some(total) = total {
                if total != expected {
                    bail!("Remote file size ({total} bytes) differs from the source listing ({expected} bytes)");
                }
            }
        }
        if let Some(total) = total {
            ensure_space(data_path, total)?;
        }
        let html = is_html(&response);
        let file = File::create(data_path).with_context(|| format!("Could not create {}", data_path.display()))?;
        let _ = std::fs::remove_file(state_path);
        self.counter.total.store(total.unwrap_or(0), Ordering::Relaxed);
        self.counter.done.store(0, Ordering::Relaxed);
        let limiter = Limiter::new(self.options.limit_bps);
        let mut pacer = DrivePacer::new();
        let mut written = 0u64;
        let mut first = true;
        loop {
            self.stop.check()?;
            let chunk = match tokio::time::timeout(READ_STALL, response.chunk()).await {
                Err(_) => bail!(network_message("the connection stalled")),
                Ok(Err(error)) => return Err(network_context(error.into(), "Download interrupted")),
                Ok(Ok(None)) => break,
                Ok(Ok(Some(chunk))) => chunk,
            };
            if first {
                first = false;
                self.sniff_page(&chunk, html).await?;
            }
            write_all_at(&file, &chunk, written)?;
            written += chunk.len() as u64;
            self.counter.done.store(written, Ordering::Relaxed);
            pacer.tick(written);
            limiter.take(chunk.len() as u64).await;
        }
        if let Some(total) = total {
            if written != total {
                bail!(network_message(&format!("Incomplete download: {written}/{total} bytes")));
            }
        }
        if written == 0 && self.options.expected_size != Some(0) {
            bail!("Download server returned an empty file");
        }
        file.sync_all()?;
        drop(file);
        self.counter.total.store(written, Ordering::Relaxed);
        self.finish(data_path, state_path, written).await
    }

    async fn run_pieces(
        &self,
        first_response: Response,
        total: u64,
        validator: Option<String>,
        saved: Option<SavedState>,
        data_path: &Path,
        state_path: &Path,
    ) -> Result<()> {
        let connections = self.options.connections.max(1);
        let pieces = match &saved {
            Some(state) => state
                .pieces
                .iter()
                .map(|p| Piece { start: p[0], pos: p[1].min(p[2]), end: p[2], owner: None })
                .collect(),
            None => plan_pieces(total, connections),
        };
        let done: u64 = pieces.iter().map(|p| p.pos - p.start).sum();
        ensure_space(data_path, total - done)?;
        let file = OpenOptions::new()
            .create(true)
            .read(true)
            .write(true)
            .truncate(false)
            .open(data_path)
            .with_context(|| format!("Could not open {}", data_path.display()))?;
        if saved.is_none() {
            make_sparse(&file);
        }
        if file.metadata()?.len() != total {
            file.set_len(total)?;
        }
        self.counter.total.store(total, Ordering::Relaxed);
        self.counter.done.store(done, Ordering::Relaxed);
        let shared = Arc::new(Shared {
            pieces: Mutex::new(pieces),
            total,
            validator,
            counter: self.counter.clone(),
            active: AtomicUsize::new(0),
            limiter: Limiter::new(self.options.limit_bps),
            first_error: Mutex::new(None),
            stop: self.stop.clone(),
            aborted: std::sync::atomic::AtomicBool::new(false),
        });
        let file = Arc::new(file);
        save_state(state_path, &self.url, &shared, &file);
        log::info!(
            "Downloading {} ({} bytes, {} already) over up to {connections} connections",
            self.dest.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
            total,
            done
        );
        let mut tasks = Vec::new();
        let mut first = Some(first_response);
        for index in 0..connections {
            let worker = Worker {
                index,
                client: self.client.clone(),
                url: self.url.clone(),
                referer: self.options.referer.clone(),
                shared: shared.clone(),
                file: file.clone(),
            };
            shared.active.fetch_add(1, Ordering::SeqCst);
            let opened = first.take();
            tasks.push(tokio::spawn(async move {
                let result = worker.run(opened).await;
                worker.shared.active.fetch_sub(1, Ordering::SeqCst);
                if let Err(error) = result {
                    let mut slot = worker.shared.first_error.lock().unwrap();
                    if slot.is_none() {
                        *slot = Some(error);
                    }
                    worker.shared.aborted.store(true, Ordering::Relaxed);
                }
            }));
            // Stagger new connections slightly; some hosts refuse a burst.
            if index + 1 < connections {
                tokio::time::sleep(Duration::from_millis(150)).await;
            }
        }
        let mut last_save = Instant::now();
        let mut pacer = DrivePacer::new();
        loop {
            if tasks.iter().all(|t| t.is_finished()) {
                break;
            }
            tokio::time::sleep(Duration::from_millis(250)).await;
            pacer.tick(self.counter.done.load(Ordering::Relaxed));
            if last_save.elapsed() >= STATE_SAVE_INTERVAL {
                let shared = shared.clone();
                let file = file.clone();
                let path = state_path.to_path_buf();
                let url = self.url.clone();
                let _ = tokio::task::spawn_blocking(move || save_state(&path, &url, &shared, &file)).await;
                last_save = Instant::now();
            }
            if shared.halted() {
                break;
            }
        }
        for task in tasks {
            task.abort();
            let _ = task.await;
        }
        save_state(state_path, &self.url, &shared, &file);
        if let Some(error) = shared.first_error.lock().unwrap().take() {
            return Err(error);
        }
        self.stop.check()?;
        let complete = shared.pieces.lock().unwrap().iter().all(|p| p.pos >= p.end);
        if !complete {
            bail!(network_message("Download stopped after repeated connection failures; partial data was retained"));
        }
        file.sync_all()?;
        drop(file);
        self.finish(data_path, state_path, total).await
    }

    /// Check the finished data and move it into place.
    async fn finish(&self, data_path: &Path, state_path: &Path, total: u64) -> Result<()> {
        let size = std::fs::metadata(data_path)?.len();
        if size != total {
            bail!("Downloaded file has the wrong size: {size} of {total} bytes");
        }
        self.counter.total.store(total, Ordering::Relaxed);
        self.counter.done.store(total, Ordering::Relaxed);
        // Sniff the start: a host can serve an error page with a 206 too.
        let mut head = vec![0u8; 4096.min(total as usize)];
        File::open(data_path)?.read_exact(&mut head)?;
        if total < 256 * 1024 && looks_like_page(&head) {
            discard_partials(&self.dest);
            return Err(ErrorPage(page_excerpt(&head)).into());
        }
        if self.options.md5.is_some() || self.options.sha256.is_some() {
            let path = data_path.to_path_buf();
            let stop = self.stop.clone();
            let md5 = self.options.md5.clone();
            let sha = self.options.sha256.clone();
            tokio::task::spawn_blocking(move || verify_hashes(&path, md5.as_deref(), sha.as_deref(), &stop)).await??;
        }
        let dest = self.dest.clone();
        let data = data_path.to_path_buf();
        // Security software scans a finished multi-GB file and holds it open meanwhile.
        tokio::task::spawn_blocking(move || crate::util::replace_file(&data, &dest, Duration::from_secs(180)))
            .await?
            .context("The finished download is still locked by another program (often security software scanning it). The downloaded data was retained; retry once the scan finishes")?;
        let _ = std::fs::remove_file(state_path);
        Ok(())
    }
}

/// A checksum the host published did not match the downloaded bytes.
#[derive(Debug)]
pub struct ChecksumMismatch(pub String);

impl std::fmt::Display for ChecksumMismatch {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Downloaded data is damaged: {} checksum does not match the host's", self.0)
    }
}

impl std::error::Error for ChecksumMismatch {}

pub fn verify_hashes(path: &Path, md5: Option<&str>, sha256: Option<&str>, stop: &StopFlag) -> Result<()> {
    let mut file = File::open(path)?;
    let mut md5_hasher = md5.map(|_| Md5::new());
    let mut sha_hasher = sha256.map(|_| Sha256::new());
    let mut buffer = vec![0u8; 4 * 1024 * 1024];
    loop {
        stop.check()?;
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        if let Some(hasher) = md5_hasher.as_mut() {
            hasher.update(&buffer[..read]);
        }
        if let Some(hasher) = sha_hasher.as_mut() {
            hasher.update(&buffer[..read]);
        }
    }
    if let (Some(expected), Some(hasher)) = (md5, md5_hasher) {
        if !hex::encode(hasher.finalize()).eq_ignore_ascii_case(expected.trim()) {
            return Err(ChecksumMismatch("MD5".into()).into());
        }
    }
    if let (Some(expected), Some(hasher)) = (sha256, sha_hasher) {
        if !hex::encode(hasher.finalize()).eq_ignore_ascii_case(expected.trim()) {
            return Err(ChecksumMismatch("SHA-256".into()).into());
        }
    }
    Ok(())
}

fn ensure_space(path: &Path, needed: u64) -> Result<()> {
    let folder = path.parent().unwrap_or(path);
    if let Ok(free) = crate::util::free_space(folder) {
        if needed > free {
            bail!(
                "Insufficient disk space for download: {} needed, {} free",
                crate::util::read_size(needed as f64),
                crate::util::read_size(free as f64)
            );
        }
    }
    Ok(())
}

#[derive(Debug)]
struct RangeProblem(String);
impl std::fmt::Display for RangeProblem {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}
impl std::error::Error for RangeProblem {}

#[derive(Debug)]
struct Busy(u16, Duration);
impl std::fmt::Display for Busy {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Download server is busy (HTTP {})", self.0)
    }
}
impl std::error::Error for Busy {}

/// Messages carrying this marker are shown as a connection problem in the app.
pub fn network_message(detail: &str) -> anyhow::Error {
    anyhow!("Connection broken: {detail}")
}

fn network_context(error: anyhow::Error, what: &str) -> anyhow::Error {
    if error.is::<Rejected>() || error.is::<ErrorPage>() || error.is::<Cancelled>() {
        return error;
    }
    if error.downcast_ref::<reqwest::Error>().is_some() {
        return network_message(&format!("{what}: {error}"));
    }
    error
}

// ---------------------------------------------------------------- connections

struct Worker {
    index: usize,
    client: Client,
    url: String,
    referer: Option<String>,
    shared: Arc<Shared>,
    file: Arc<File>,
}

impl Worker {
    /// Claim the first unclaimed piece, or split the largest active one.
    fn claim(&self) -> Option<usize> {
        let mut pieces = self.shared.pieces.lock().unwrap();
        if let Some(index) = pieces
            .iter()
            .enumerate()
            .filter(|(_, p)| p.owner.is_none() && p.pos < p.end)
            .min_by_key(|(_, p)| p.start)
            .map(|(i, _)| i)
        {
            pieces[index].owner = Some(self.index);
            return Some(index);
        }
        let (index, remaining) = pieces
            .iter()
            .enumerate()
            .filter(|(_, p)| p.owner.is_some() && p.pos < p.end)
            .map(|(i, p)| (i, p.end - p.pos))
            .max_by_key(|(_, r)| *r)?;
        if remaining < 2 * MIN_SPLIT {
            return None;
        }
        let middle = pieces[index].pos + remaining / 2;
        let end = pieces[index].end;
        pieces[index].end = middle;
        pieces.push(Piece { start: middle, pos: middle, end, owner: Some(self.index) });
        Some(pieces.len() - 1)
    }

    /// Keep reading the same response into the next piece when it is free and
    /// starts where this one ended: no reconnect, no extra request to the host.
    fn claim_next(&self, index: usize) -> Option<usize> {
        let mut pieces = self.shared.pieces.lock().unwrap();
        let end = pieces[index].end;
        let next = pieces.iter().position(|p| p.start == end && p.pos == p.start && p.pos < p.end && p.owner.is_none())?;
        pieces[next].owner = Some(self.index);
        Some(next)
    }

    fn release(&self, index: usize) {
        let mut pieces = self.shared.pieces.lock().unwrap();
        if pieces[index].owner == Some(self.index) {
            pieces[index].owner = None;
        }
    }

    async fn run(&self, mut opened: Option<Response>) -> Result<()> {
        let mut failures = 0u32;
        loop {
            if self.shared.halted() {
                return Ok(());
            }
            let Some(mut index) = self.claim() else {
                return Ok(());
            };
            let (error, progressed) = match self.fetch_piece(&mut index, opened.take()).await {
                Ok(progressed) => {
                    let finished = {
                        let pieces = self.shared.pieces.lock().unwrap();
                        pieces[index].pos >= pieces[index].end
                    };
                    if finished {
                        if progressed >= 1024 * 1024 {
                            failures = 0;
                            self.shared.counter.retrying.store(0, Ordering::Relaxed);
                        }
                        continue;
                    }
                    (network_message("the server closed the connection early"), progressed)
                }
                Err(failure) => failure,
            };
            self.release(index);
            if error.is::<Cancelled>() || self.shared.halted() {
                return Ok(());
            }
            if progressed >= 1024 * 1024 {
                failures = 0;
            }
            failures += 1;
            let others = self.shared.active.load(Ordering::SeqCst) > 1;
            let rejected = error.is::<Rejected>() || error.is::<RangeProblem>() || error.is::<ErrorPage>();
            // Hosts that cap connections refuse the extra ones: leave the piece
            // to the connections that work.
            if others && (rejected || failures >= 3) {
                log::info!("Dropping download connection {} ({error})", self.index);
                return Ok(());
            }
            if rejected || failures >= MAX_FAILURES {
                return Err(network_context(
                    error,
                    "Download stopped after repeated connection failures; partial data was retained",
                ));
            }
            if !others {
                self.shared.counter.retrying.store(failures as usize, Ordering::Relaxed);
            }
            let wait = error
                .downcast_ref::<Busy>()
                .map(|b| b.1)
                .unwrap_or_else(|| Duration::from_secs((1u64 << failures.min(5)).min(30)));
            log::warn!("Connection {} failed ({error}); retrying in {}s", self.index, wait.as_secs());
            let deadline = tokio::time::Instant::now() + wait;
            while tokio::time::Instant::now() < deadline && !self.shared.halted() {
                tokio::time::sleep(Duration::from_millis(200)).await;
            }
        }
    }

    /// Download the claimed piece, continuing into following free pieces.
    /// `index` ends at the last piece worked on. Returns bytes gained, also on error.
    async fn fetch_piece(&self, index: &mut usize, opened: Option<Response>) -> std::result::Result<u64, (anyhow::Error, u64)> {
        let (start, validator) = {
            let pieces = self.shared.pieces.lock().unwrap();
            (pieces[*index].pos, self.shared.validator.clone())
        };
        let response = match opened {
            Some(response) => response,
            None => {
                let mut request = self.client.get(&self.url).header(RANGE, format!("bytes={start}-"));
                if let Some(validator) = &validator {
                    request = request.header("If-Range", validator);
                }
                if let Some(referer) = &self.referer {
                    request = request.header("Referer", referer);
                }
                let response = request.send().await.map_err(|e| (e.into(), 0))?;
                let status = response.status();
                if matches!(status.as_u16(), 408 | 429) || status.is_server_error() {
                    let wait = retry_after(&response).unwrap_or(Duration::from_secs(2));
                    return Err((Busy(status.as_u16(), wait).into(), 0));
                }
                if status.is_client_error() {
                    return Err((Rejected(status.as_u16()).into(), 0));
                }
                if status != StatusCode::PARTIAL_CONTENT {
                    return Err((RangeProblem(format!("Server did not honor the byte range (HTTP {})", status.as_u16())).into(), 0));
                }
                match content_range(&response) {
                    Some((first, _, total)) if first == start && total == self.shared.total => {}
                    _ => return Err((RangeProblem("Download server returned the wrong byte range".into()).into(), 0)),
                }
                if let (Some(expected), Some(found)) = (&validator, validator_of(&response)) {
                    if expected != &found {
                        return Err((RangeProblem("Remote file changed during the download".into()).into(), 0));
                    }
                }
                response
            }
        };
        let html = is_html(&response);
        let mut stream = response.bytes_stream();
        let mut gained = 0u64;
        let mut first = start == 0;
        loop {
            if self.shared.halted() {
                return Err((Cancelled.into(), gained));
            }
            let chunk = match tokio::time::timeout(READ_STALL, stream.next()).await {
                Err(_) => return Err((network_message("the connection stalled"), gained)),
                Ok(None) => return Ok(gained),
                Ok(Some(Err(error))) => return Err((error.into(), gained)),
                Ok(Some(Ok(chunk))) => chunk,
            };
            if first {
                first = false;
                if (html || self.shared.total < 64 * 1024) && looks_like_page(&chunk) {
                    return Err((ErrorPage(page_excerpt(&chunk)).into(), gained));
                }
            }
            let mut data = chunk;
            while !data.is_empty() {
                // The piece may have been split while this chunk was in flight.
                let (pos, end) = {
                    let pieces = self.shared.pieces.lock().unwrap();
                    (pieces[*index].pos, pieces[*index].end)
                };
                let take = (data.len() as u64).min(end.saturating_sub(pos)) as usize;
                if take > 0 {
                    let file = self.file.clone();
                    let bytes = data.slice(..take);
                    // Writing at the same offset twice is harmless: it is the same remote file.
                    tokio::task::block_in_place(|| write_all_at(&file, &bytes, pos)).map_err(|e| (e.into(), gained))?;
                    let added = {
                        let mut pieces = self.shared.pieces.lock().unwrap();
                        let piece = &mut pieces[*index];
                        let new_pos = (pos + take as u64).min(piece.end).max(piece.pos);
                        let added = new_pos - piece.pos;
                        piece.pos = new_pos;
                        added
                    };
                    gained += added;
                    self.shared.counter.done.fetch_add(added, Ordering::Relaxed);
                    self.shared.limiter.take(take as u64).await;
                }
                data = data.slice(take..);
                if pos + take as u64 >= end {
                    match self.claim_next(*index) {
                        Some(next) => *index = next,
                        None => return Ok(gained),
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn page_detection() {
        assert!(looks_like_page(b"  <!DOCTYPE html><html>"));
        assert!(looks_like_page(b"\xef\xbb\xbf<html>"));
        assert!(looks_like_page(br#"{"success":false,"value":"not_found"}"#));
        assert!(!looks_like_page(b"Rar!\x1a\x07\x01\x00"));
        assert!(!looks_like_page(b"PK\x03\x04"));
    }

    #[test]
    fn pieces_cover_file() {
        let pieces = plan_pieces(1_000_000_007, 8);
        assert_eq!(pieces.first().unwrap().start, 0);
        assert_eq!(pieces.last().unwrap().end, 1_000_000_007);
        for pair in pieces.windows(2) {
            assert_eq!(pair[0].end, pair[1].start);
        }
    }
}
