//! The game's `.ascendara.json`: the only channel between this process and the app.
//!
//! The app reads progress from it and writes requests into it: `stopped` to stop
//! the download and `recoveryAction` to answer a recovery prompt.

use crate::util::{read_size, format_eta, write_atomic};
use anyhow::{anyhow, Result};
use serde_json::{json, Map, Value};
use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

/// The download was stopped from the app. Never reported as an error.
#[derive(Debug)]
pub struct Cancelled;

impl std::fmt::Display for Cancelled {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("Download stopped by user")
    }
}

impl std::error::Error for Cancelled {}

pub fn is_cancelled(error: &anyhow::Error) -> bool {
    error.chain().any(|cause| cause.is::<Cancelled>())
}

/// Shared stop signal, set when the app asks to stop or removes the download.
#[derive(Clone, Default)]
pub struct StopFlag(Arc<AtomicBool>);

impl StopFlag {
    pub fn is_set(&self) -> bool {
        self.0.load(Ordering::Relaxed)
    }

    pub fn set(&self) {
        self.0.store(true, Ordering::Relaxed);
    }

    pub fn check(&self) -> Result<()> {
        if self.is_set() {
            Err(Cancelled.into())
        } else {
            Ok(())
        }
    }

    /// Sleep that wakes early when the download is stopped.
    pub fn sleep(&self, duration: Duration) -> Result<()> {
        let deadline = Instant::now() + duration;
        loop {
            self.check()?;
            let now = Instant::now();
            if now >= deadline {
                return Ok(());
            }
            std::thread::sleep((deadline - now).min(Duration::from_millis(200)));
        }
    }

    pub async fn sleep_async(&self, duration: Duration) -> Result<()> {
        let deadline = tokio::time::Instant::now() + duration;
        loop {
            self.check()?;
            let now = tokio::time::Instant::now();
            if now >= deadline {
                return Ok(());
            }
            tokio::time::sleep((deadline - now).min(Duration::from_millis(200))).await;
        }
    }
}

fn read_stop_request(path: &Path) -> Option<bool> {
    match std::fs::read(path) {
        Ok(bytes) => {
            let value: Value = serde_json::from_slice(&bytes).ok()?;
            match value.get("downloadingData") {
                Some(Value::Object(data)) => Some(data.get("stopped").and_then(Value::as_bool).unwrap_or(false)),
                // The app removes it when the person removes the download.
                _ => Some(true),
            }
        }
        // A removed download is a stopped one.
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Some(true),
        // The app may be halfway through writing it.
        Err(_) => None,
    }
}

/// Polls the game file for a stop request on its own thread, so transfers and
/// decoders only check an atomic.
pub fn watch_for_stop(path: PathBuf, flag: StopFlag) {
    std::thread::spawn(move || loop {
        if flag.is_set() {
            return;
        }
        if read_stop_request(&path) == Some(true) {
            log::info!("Stop requested from the app");
            flag.set();
            return;
        }
        std::thread::sleep(Duration::from_millis(300));
    });
}

pub fn unix_now() -> f64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs_f64()).unwrap_or(0.0)
}

pub struct GameState {
    pub path: PathBuf,
    pub info: Value,
    pub stop: StopFlag,
    next_progress_write: Instant,
    blocked_since: Option<Instant>,
}

impl GameState {
    pub fn new(path: PathBuf, info: Value, stop: StopFlag) -> Self {
        GameState { path, info, stop, next_progress_write: Instant::now(), blocked_since: None }
    }

    pub fn data(&mut self) -> &mut Map<String, Value> {
        let root = self.info.as_object_mut().expect("game info is an object");
        let entry = root.entry("downloadingData").or_insert_with(|| json!({}));
        if !entry.is_object() {
            *entry = json!({});
        }
        entry.as_object_mut().unwrap()
    }

    pub fn has_data(&self) -> bool {
        self.info.get("downloadingData").map(Value::is_object).unwrap_or(false)
    }

    pub fn root(&mut self) -> &mut Map<String, Value> {
        self.info.as_object_mut().expect("game info is an object")
    }

    pub fn set(&mut self, values: Value) {
        if let Value::Object(values) = values {
            let data = self.data();
            for (key, value) in values {
                data.insert(key, value);
            }
        }
    }

    /// Persist now. Fails with [`Cancelled`] when the app asked to stop, so a
    /// stop request written by the app is never overwritten.
    pub fn save(&mut self) -> Result<()> {
        self.stop.check()?;
        if self.has_data() && read_stop_request(&self.path) == Some(true) {
            self.stop.set();
            return Err(Cancelled.into());
        }
        self.write_unchecked()
    }

    /// Persist even after a stop request: used for the final state of a stop the
    /// app asked for (it expects us to leave the file alone otherwise).
    pub fn write_unchecked(&mut self) -> Result<()> {
        let pid = std::process::id();
        if self.has_data() {
            self.data().insert("ownerPid".into(), json!(pid));
        }
        let text = serde_json::to_vec_pretty(&self.info)?;
        write_atomic(&self.path, &text)
    }

    /// Coalesced progress snapshot. Tolerates the file being locked briefly by
    /// other programs, but not for more than a minute.
    pub fn save_progress(&mut self) -> Result<()> {
        let now = Instant::now();
        if now < self.next_progress_write {
            return self.stop.check();
        }
        match self.save() {
            Ok(()) => {
                if self.blocked_since.take().is_some() {
                    log::info!("Progress metadata writes recovered");
                }
                self.next_progress_write = now + Duration::from_millis(500);
                Ok(())
            }
            Err(error) if crate::state::is_cancelled(&error) => Err(error),
            Err(error) => {
                let since = *self.blocked_since.get_or_insert(now);
                if since.elapsed() > Duration::from_secs(60) {
                    return Err(error.context(format!(
                        "Cannot update download progress for over a minute: {}. Check file permissions and other programs accessing this file.",
                        self.path.display()
                    )));
                }
                log::warn!("Progress metadata is temporarily locked: {error:#}");
                self.next_progress_write = now + Duration::from_secs(2);
                Ok(())
            }
        }
    }

    /// Record a failure for the app, keeping the last progress for error reports.
    pub fn fail(&mut self, message: &str, previous: Option<&str>) {
        let message = clip(message);
        let previous = previous.map(clip);
        let root = self.root();
        root.insert("online".into(), json!(""));
        root.insert("dlc".into(), json!(""));
        root.insert("isRunning".into(), json!(false));
        root.insert("executable".into(), json!(""));
        let old = self.info.get("downloadingData").cloned().unwrap_or(json!({}));
        let mut data = json!({
            "error": true,
            "message": message,
            "progressCompleted": old.get("progressCompleted").cloned().unwrap_or(json!("0.00")),
            "progressDownloadSpeeds": old.get("progressDownloadSpeeds").cloned().unwrap_or(json!("0.00 KB/s")),
            "timeUntilComplete": old.get("timeUntilComplete").cloned().unwrap_or(json!("0s")),
        });
        if let Some(updating) = old.get("updating") {
            data["updating"] = updating.clone();
        }
        if let Some(previous) = previous.filter(|p| *p != message) {
            data["previousError"] = json!(previous);
        }
        self.root().insert("downloadingData".into(), data);
        if let Err(error) = self.write_unchecked() {
            log::error!("Could not record the error: {error:#}");
        }
    }

    /// Ask the person what to do and wait for the app's answer.
    /// Returns true for retry, false for cancel.
    pub fn await_recovery(&mut self, details: Value) -> Result<bool> {
        let request_id = format!("{}-{}", std::process::id(), (unix_now() * 1e6) as u64);
        let mut details = details;
        details["requestId"] = json!(request_id);
        {
            let data = self.data();
            for key in ["error", "message", "retryAttempt", "recoveryAction"] {
                data.remove(key);
            }
            data.insert("downloading".into(), json!(false));
            data.insert("extracting".into(), json!(false));
            data.insert("verifying".into(), json!(false));
            data.insert("awaitingRecoveryAction".into(), json!(true));
            data.insert("timeUntilComplete".into(), json!("Action required"));
            data.insert("progressDownloadSpeeds".into(), json!("0.00 KB/s"));
            data.insert("recoverableError".into(), details);
        }
        self.save()?;
        loop {
            self.stop.sleep(Duration::from_millis(250))?;
            let Ok(bytes) = std::fs::read(&self.path) else { continue };
            let Ok(current) = serde_json::from_slice::<Value>(&bytes) else { continue };
            let data = current.get("downloadingData").cloned().unwrap_or(json!({}));
            let action = data.get("recoveryAction").and_then(Value::as_str).unwrap_or("");
            let matches = data.pointer("/recoverableError/requestId").and_then(Value::as_str) == Some(&request_id);
            if matches && (action == "retry" || action == "cancel") {
                self.info = current;
                let retry = action == "retry";
                let data = self.data();
                data.remove("recoveryAction");
                data.remove("recoverableError");
                data.insert("awaitingRecoveryAction".into(), json!(false));
                data.insert("extracting".into(), json!(retry));
                data.insert(
                    "timeUntilComplete".into(),
                    json!(if retry { "Retrying extraction..." } else { "Cancelled" }),
                );
                self.save()?;
                return Ok(retry);
            }
        }
    }
}

const MAX_ERROR_LENGTH: usize = 600;

fn clip(message: &str) -> String {
    if message.chars().count() <= MAX_ERROR_LENGTH {
        return message.to_string();
    }
    log::error!("Full error: {message}");
    let clipped: String = message.chars().take(MAX_ERROR_LENGTH - 3).collect();
    format!("{}...", clipped.trim_end())
}

// ---------------------------------------------------------------- meters

/// Speed over the last few seconds and a smoothed ETA, for the transfer phase.
pub struct DownloadMeter {
    samples: VecDeque<(Instant, u64)>,
    rate: Option<f64>,
    updated: Option<Instant>,
    last_total: Option<u64>,
    last_done: u64,
    /// (time, total time blocked writing) for telling a slow drive from a slow connection.
    writes: VecDeque<(Instant, u64)>,
    waiting_on_drive: bool,
}

impl DownloadMeter {
    pub fn new() -> Self {
        DownloadMeter {
            samples: VecDeque::new(),
            rate: None,
            updated: None,
            last_total: None,
            last_done: 0,
            writes: VecDeque::new(),
            waiting_on_drive: false,
        }
    }

    /// Update the game state's download fields. `total` is None while unknown.
    pub fn update(&mut self, state: &mut GameState, done: u64, total: Option<u64>) -> Result<()> {
        let now = Instant::now();
        if done < self.last_done || total != self.last_total {
            self.samples.clear();
            self.rate = None;
        }
        if self.samples.back().map(|(_, d)| done > *d).unwrap_or(true) {
            // The app warns about a stalled download from this time.
            state.data().insert("lastProgress".into(), json!(unix_now()));
        }
        self.last_done = done;
        self.last_total = total;
        self.samples.push_back((now, done));
        while self.samples.len() > 2 && now.duration_since(self.samples[1].0) >= Duration::from_secs(5) {
            self.samples.pop_front();
        }
        let speed = match (self.samples.front(), self.samples.back()) {
            (Some((t0, d0)), Some((t1, d1))) if t1 > t0 => (d1 - d0) as f64 / t1.duration_since(*t0).as_secs_f64(),
            _ => 0.0,
        };
        // Smooth the rate rather than the time, so a brief dip barely moves the ETA.
        let eta = match total {
            Some(total) if total > done => {
                let rate = match (self.rate, self.updated) {
                    (Some(rate), Some(updated)) => {
                        let weight = 1.0 - (-now.duration_since(updated).as_secs_f64() / 8.0).exp();
                        rate + (speed - rate) * weight
                    }
                    _ => speed,
                };
                self.rate = Some(rate);
                self.updated = Some(now);
                if rate > 0.0 {
                    format_eta((((total - done) as f64) / rate).ceil().max(1.0) as u64)
                } else {
                    "Calculating...".into()
                }
            }
            Some(_) => "0s".into(),
            None => format!("Downloaded: {}", read_size(done as f64)),
        };
        let percent = match total {
            Some(total) if total > 0 => (done as f64 / total as f64 * 100.0).min(100.0),
            _ => 0.0,
        };
        // Writes to a drive with room to spare return at once. When they spend over
        // half the time blocked, the drive cannot take data as fast as it arrives
        // (common on hard drives once Windows' write cache fills). The transfer
        // then holds itself to the drive's pace within a few seconds, which ends
        // the stalls; the notice waits longer than that and stays off once paced,
        // so it only shows when pacing could not help.
        let blocked = crate::http::WRITE_BLOCKED_NANOS.load(std::sync::atomic::Ordering::Relaxed);
        let paced = crate::http::DRIVE_PACE_BPS.load(std::sync::atomic::Ordering::Relaxed) > 0;
        self.writes.push_back((now, blocked));
        while self.writes.len() > 2 && now.duration_since(self.writes[1].0) >= Duration::from_secs(30) {
            self.writes.pop_front();
        }
        if paced {
            self.waiting_on_drive = false;
        } else if let (Some((t0, b0)), Some((t1, b1))) = (self.writes.front(), self.writes.back()) {
            let span = t1.duration_since(*t0).as_secs_f64();
            if span >= 25.0 {
                let share = b1.saturating_sub(*b0) as f64 / 1e9 / span;
                // Separate on and off levels so the notice does not flicker.
                self.waiting_on_drive = if self.waiting_on_drive { share >= 0.2 } else { share >= 0.5 };
            }
        }
        state.set(json!({
            "downloading": true,
            "waitingOnDrive": self.waiting_on_drive,
            "extracting": false,
            "verifying": false,
            "progressCompleted": format!("{percent:.2}"),
            "progressDownloadSpeeds": format!("{}/s", read_size(speed)),
            "timeUntilComplete": eta,
        }));
        state.save_progress()
    }
}

/// Extraction progress that never moves backwards, so a person never sees it
/// climb and then drop to zero.
pub struct ExtractMeter {
    samples: VecDeque<(Instant, u64)>,
    /// Process counters (time, bytes read, bytes written, CPU time) for the
    /// read/write graph and for telling decoding apart from a stall.
    io: VecDeque<(Instant, u64, u64, Duration)>,
    shown_percent: f64,
    last_marker: (u64, u64),
    last_log: Instant,
}

impl ExtractMeter {
    pub fn new() -> Self {
        ExtractMeter {
            samples: VecDeque::new(),
            io: VecDeque::new(),
            shown_percent: 0.0,
            last_marker: (u64::MAX, u64::MAX),
            last_log: Instant::now() - Duration::from_secs(60),
        }
    }

    pub fn update(&mut self, state: &mut GameState, snapshot: &crate::archive::Progress) -> Result<()> {
        let now = Instant::now();
        let bytes = snapshot.bytes_done;
        if self.samples.back().map(|(_, b)| bytes < *b).unwrap_or(false) {
            self.samples.clear();
        }
        self.samples.push_back((now, bytes));
        while self.samples.len() > 2 && now.duration_since(self.samples[1].0) >= Duration::from_secs(5) {
            self.samples.pop_front();
        }
        let rate = match (self.samples.front(), self.samples.back()) {
            (Some((t0, b0)), Some((t1, b1))) if t1 > t0 => (b1 - b0) as f64 / t1.duration_since(*t0).as_secs_f64(),
            _ => 0.0,
        };
        let computed = if snapshot.bytes_total > 0 {
            bytes as f64 / snapshot.bytes_total as f64 * 100.0
        } else if snapshot.files_total > 0 {
            snapshot.files_done as f64 / snapshot.files_total as f64 * 100.0
        } else {
            0.0
        };
        self.shown_percent = self.shown_percent.max(computed.min(100.0));
        let marker = (snapshot.files_done, bytes);
        if marker != self.last_marker {
            self.last_marker = marker;
            state.data().insert("lastProgress".into(), json!(unix_now()));
        }
        // Read is archive data coming off the disk, write is game files going on:
        // different numbers, since compressed data unpacks to more than it reads.
        // Decoders unpack big blocks in memory and then write them at once, so
        // rates average over several seconds rather than dropping to zero between.
        let mut decompressing = false;
        let mut waiting_on_drive = false;
        let (read_speed, write_speed) = match crate::system::process_io() {
            Some((read, written)) => {
                let cpu = crate::system::process_cpu().unwrap_or_default();
                if self.io.back().map(|(_, r, w, _)| read < *r || written < *w).unwrap_or(false) {
                    self.io.clear();
                }
                self.io.push_back((now, read, written, cpu));
                while self.io.len() > 2 && now.duration_since(self.io[1].0) >= Duration::from_secs(3) {
                    self.io.pop_front();
                }
                // Busy CPU with nothing written lately: decoding, not stalled.
                if let Some((t0, _, w0, c0)) = self.io.iter().rev().find(|s| now.duration_since(s.0) >= Duration::from_millis(1500)) {
                    let span = now.duration_since(*t0).as_secs_f64();
                    let cores = cpu.saturating_sub(*c0).as_secs_f64() / span;
                    // Our own progress file writes a few KB each time; that is not game data.
                    let idle_disk = written.saturating_sub(*w0) < 1024 * 1024;
                    // Busy CPU: decoding in memory. Idle CPU: blocked on a drive that is
                    // still writing out what it was given (common on hard drives).
                    decompressing = idle_disk && cores >= 0.25;
                    waiting_on_drive = idle_disk && cores < 0.25;
                }
                match (self.io.front(), self.io.back()) {
                    (Some((t0, r0, w0, _)), Some((t1, r1, w1, _))) if t1 > t0 => {
                        let span = t1.duration_since(*t0).as_secs_f64();
                        ((r1 - r0) as f64 / span, (w1 - w0) as f64 / span)
                    }
                    _ => (0.0, 0.0),
                }
            }
            None => (0.0, rate),
        };
        if decompressing {
            // Keeps the app's stall warning quiet while a large block decodes.
            state.data().insert("lastProgress".into(), json!(unix_now()));
        }
        let name = snapshot.current.rsplit('/').next().unwrap_or("").to_string();
        let eta = if rate > 0.0 && snapshot.bytes_total > bytes {
            format_eta(((snapshot.bytes_total - bytes) as f64 / rate).ceil() as u64)
        } else {
            "0s".into()
        };
        state.set(json!({
            "downloading": false,
            "extracting": true,
            "waitingOnDrive": false,
            "verifying": false,
            "progressCompleted": "100.00",
            "progressDownloadSpeeds": "0.00 KB/s",
            "timeUntilComplete": eta,
            "extractionProgress": {
                "currentFile": name,
                "filesExtracted": snapshot.files_done,
                "totalFiles": snapshot.files_total,
                "percentComplete": format!("{:.2}", self.shown_percent),
                "extractionSpeed": format!("{}/s", read_size(rate)),
                "readSpeed": read_speed.round() as u64,
                "writeSpeed": write_speed.round() as u64,
                "currentFileSize": snapshot.current_size,
                "currentFileDone": snapshot.current_done,
                "decompressing": decompressing,
                "waitingOnDrive": waiting_on_drive,
            },
        }));
        if now.duration_since(self.last_log) >= Duration::from_secs(15) {
            self.last_log = now;
            log::info!(
                "Extraction: {}/{} files, {:.2}%, {}/s, {}",
                snapshot.files_done,
                snapshot.files_total,
                self.shown_percent,
                read_size(rate),
                name
            );
        }
        state.save_progress()
    }
}

pub fn load_info(path: &Path) -> Result<Value> {
    let bytes = std::fs::read(path).map_err(|e| anyhow!("Could not read {}: {e}", path.display()))?;
    let text = String::from_utf8_lossy(&bytes);
    let text = text.trim_start_matches('\u{feff}');
    Ok(serde_json::from_str(text)?)
}
