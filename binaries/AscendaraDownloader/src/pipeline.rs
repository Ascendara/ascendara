//! One game download from link to installed game, and local extraction retries.

use crate::archive::{self, Damaged, Kind, Manifest, ProgressHandle, WrongPassword};
use crate::http::{build_client, ChecksumMismatch, Counter, ErrorPage, Rejected, Transfer, TransferOptions};
use crate::install::{self, VerificationFailed};
use crate::providers::{self, RemoteFile};
use crate::state::{is_cancelled, Cancelled, DownloadMeter, ExtractMeter, GameState, StopFlag};
use crate::system::{self, Settings};
use crate::util::{self, member_path, read_size, remove_path, sanitize_folder_name, wanted_member};
use anyhow::{anyhow, bail, Context, Result};
use reqwest::Client;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;

const DOWNLOADS: &str = ".ascendara-downloads";

#[derive(Clone, Debug)]
pub struct LooseFile {
    pub filename: String,
    pub size: u64,
    pub source: PathBuf,
}

/// Where an archive came from, so a damaged one can be downloaded again.
#[derive(Clone)]
struct Source {
    url: String,
    options: TransferOptions,
    client: Client,
    /// The host's checksum matched: a damaged archive is damaged at the source.
    verified: bool,
}

/// The person cancelled a recovery prompt; their files were kept.
#[derive(Debug)]
pub struct RecoveryCancelled(pub String);

impl std::fmt::Display for RecoveryCancelled {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Extraction recovery cancelled; the downloaded source files were retained. Extraction failure: {}", self.0)
    }
}

impl std::error::Error for RecoveryCancelled {}

pub struct Job {
    pub game: String,
    pub game_dir: PathBuf,
    pub state: GameState,
    pub settings: Settings,
    pub theme: Option<String>,
    pub update_flow: bool,
    pub stop: StopFlag,
    /// Retrying extraction: never touch the network.
    pub local_only: bool,
    pub previous_error: Option<String>,
    sources: HashMap<PathBuf, Source>,
    download_meter: DownloadMeter,
    extract_meter: ExtractMeter,
    progress: ProgressHandle,
    /// Torrent and cloud-torrent releases may be installers instead of games.
    may_be_installer: bool,
    prompted: bool,
    /// The size the catalog reported, for the pre-download space check.
    size_hint: Option<u64>,
}

pub struct StartArgs {
    pub game: String,
    pub online: bool,
    pub dlc: bool,
    pub is_vr: bool,
    pub update_flow: bool,
    pub version: String,
    pub size: String,
    pub download_dir: PathBuf,
    pub game_id: String,
    pub theme: Option<String>,
}

impl Job {
    fn new(game: String, game_dir: PathBuf, state: GameState, update_flow: bool, theme: Option<String>, local_only: bool) -> Self {
        Job {
            game,
            game_dir,
            stop: state.stop.clone(),
            state,
            settings: Settings::load(),
            theme,
            update_flow,
            local_only,
            previous_error: None,
            sources: HashMap::new(),
            download_meter: DownloadMeter::new(),
            extract_meter: ExtractMeter::new(),
            progress: ProgressHandle::default(),
            may_be_installer: false,
            prompted: false,
            size_hint: None,
        }
    }

    /// Create or update the game file the app watches.
    pub fn start(args: StartArgs) -> Result<Self> {
        let folder = sanitize_folder_name(&args.game);
        if folder.trim_matches(|c| c == ' ' || c == '.').is_empty() {
            bail!("Game name must contain a valid folder name");
        }
        let game_dir = std::path::absolute(args.download_dir.join(&folder))?;
        std::fs::create_dir_all(&game_dir)?;
        let info_path = game_dir.join(format!("{folder}.ascendara.json"));
        let mut info = if args.update_flow && info_path.exists() {
            let mut info = crate::state::load_info(&info_path)?;
            if !info.get("downloadingData").map(Value::is_object).unwrap_or(false) {
                info["downloadingData"] = json!({});
            }
            info["downloadingData"]["updating"] = json!(true);
            // The installed files stay at the old version until the update is verified.
            if !args.version.is_empty() {
                log::info!("Updating version from {} to {}", info.get("version").and_then(Value::as_str).unwrap_or("unknown"), args.version);
                info["pendingVersion"] = json!(args.version);
            }
            info
        } else {
            json!({
                "game": args.game,
                "online": args.online,
                "dlc": args.dlc,
                "isVr": args.is_vr,
                "version": args.version,
                "size": args.size,
                "gameID": args.game_id,
                "executable": game_dir.join(format!("{folder}.exe")).to_string_lossy(),
                "isRunning": false,
                "downloadingData": {
                    "downloading": false,
                    "verifying": false,
                    "extracting": false,
                    "updating": args.update_flow,
                    "progressCompleted": "0.00",
                    "progressDownloadSpeeds": "0.00 KB/s",
                    "timeUntilComplete": "0s",
                    "extractionProgress": {
                        "currentFile": "",
                        "filesExtracted": 0,
                        "totalFiles": 0,
                        "percentComplete": "0.00",
                        "extractionSpeed": "0 files/s"
                    }
                }
            })
        };
        if let Some(data) = info.get_mut("downloadingData").and_then(Value::as_object_mut) {
            data.remove("stopped");
            // Shown as active straight away, before links resolve and data arrives.
            data.insert("downloading".into(), json!(true));
            data.insert("timeUntilComplete".into(), json!("Starting..."));
        }
        let stop = StopFlag::default();
        let mut state = GameState::new(info_path.clone(), info, stop.clone());
        state.write_unchecked()?;
        crate::state::watch_for_stop(info_path, stop);
        let mut job = Job::new(args.game, game_dir, state, args.update_flow, args.theme, false);
        job.size_hint = parse_size(&args.size);
        Ok(job)
    }

    fn downloads_dir(&self) -> Result<PathBuf> {
        let folder = self.game_dir.join(DOWNLOADS);
        std::fs::create_dir_all(&folder)?;
        Ok(folder)
    }

    fn notify(&self, title: &str, message: &str) {
        system::notify(self.theme.as_deref(), title, message);
    }

    // ------------------------------------------------------------ downloads

    pub async fn download(&mut self, link: &str, provider: &str, password: Option<&str>, file_list: bool) -> Result<()> {
        if file_list {
            return self.download_file_list(Path::new(link)).await;
        }
        if crate::torrent::is_torrent_link(link) {
            return self.download_torrent(link).await;
        }
        if !matches!(provider, "auto" | "direct" | "gofile") {
            bail!("Unknown download provider");
        }
        let normalized = if link.contains("://") { link.to_string() } else { format!("https://{}", link.trim_start_matches('/')) };
        if provider == "gofile" || (provider == "auto" && providers::is_gofile(&normalized)) {
            return self.download_gofile(&normalized, password).await;
        }
        providers::validate_url(link)?;
        let client = build_client(None)?;
        let (mut url, pixeldrain_id) = providers::resolve_share_url(link.trim());
        let mut options = TransferOptions::new(self.settings.connections(), self.settings.download_limit());
        let mut filename = None;
        if provider != "direct" && providers::is_buzzheavier(&url) {
            log::info!("Buzzheavier download: {url}");
            let resolved = providers::resolve_buzzheavier(&client, &url).await?;
            url = resolved.url;
            options.referer = resolved.referer;
            filename = resolved.filename;
        }
        if let Some(id) = pixeldrain_id {
            options.sha256 = providers::pixeldrain_hash(&client, &id).await;
        }
        self.check_space_for_download()?;
        self.stop.check()?;
        self.notify("Download Started", &format!("Starting download for {}", self.game));
        let fallback = format!("{}.download", sanitize_folder_name(&self.game));
        let filename = match filename {
            Some(name) => util::safe_file_name(&name, &fallback),
            None => providers::discover_filename(&client, &url, &fallback).await,
        };
        if filename.to_lowercase().ends_with(".ascendara.json") {
            bail!("Download filename conflicts with Ascendara metadata");
        }
        let dest = member_path(&self.downloads_dir()?, &filename)?;
        self.state.set(json!({"downloading": true}));
        self.state.save()?;
        let verified = options.sha256.is_some();
        self.fetch(&client, &url, &dest, options.clone(), 0, None).await?;
        let dest = self.fix_extension(&dest)?;
        self.sources.insert(dest.clone(), Source { url, options, client, verified });
        self.finish_download_phase(None)?;
        self.extract_and_install(vec![dest], vec![], None).await?;
        if !self.state.has_data() {
            self.notify("Download Complete", &format!("Successfully downloaded {}", self.game));
        }
        Ok(())
    }

    fn check_space_for_download(&mut self) -> Result<()> {
        let Some(needed) = self.size_hint else { return Ok(()) };
        if let Ok(free) = util::free_space(&self.game_dir) {
            if needed > free {
                bail!("Insufficient disk space. Need ~{}", read_size(needed as f64));
            }
        }
        Ok(())
    }

    /// Run one transfer, reporting progress as part of a batch.
    async fn fetch(
        &mut self,
        client: &Client,
        url: &str,
        dest: &Path,
        options: TransferOptions,
        batch_done: u64,
        batch_total: Option<u64>,
    ) -> Result<()> {
        let counter = Arc::new(Counter::default());
        let transfer = Transfer {
            client: client.clone(),
            url: url.to_string(),
            dest: dest.to_path_buf(),
            options,
            counter: counter.clone(),
            stop: self.stop.clone(),
        };
        let task = tokio::spawn(async move { transfer.run().await });
        self.watch_transfer(task, counter, batch_done, batch_total).await
    }

    async fn watch_transfer(
        &mut self,
        mut task: tokio::task::JoinHandle<Result<()>>,
        counter: Arc<Counter>,
        batch_done: u64,
        batch_total: Option<u64>,
    ) -> Result<()> {
        loop {
            tokio::select! {
                result = &mut task => {
                    return result.map_err(|e| anyhow!("Download task failed: {e}"))?;
                }
                _ = tokio::time::sleep(Duration::from_millis(500)) => {
                    let done = batch_done + counter.done.load(Ordering::Relaxed);
                    let total = batch_total.or_else(|| counter.total().map(|t| batch_done + t));
                    let retrying = counter.retrying.load(Ordering::Relaxed);
                    if retrying > 0 {
                        self.state.data().insert("retryAttempt".into(), json!(retrying));
                    } else {
                        self.state.data().remove("retryAttempt");
                    }
                    if let Err(error) = self.download_meter.update(&mut self.state, done, total) {
                        // A stop request ends the transfer through the shared flag.
                        if !is_cancelled(&error) {
                            task.abort();
                        }
                        let _ = task.await;
                        return Err(error);
                    }
                }
            }
        }
    }

    fn finish_download_phase(&mut self, total: Option<u64>) -> Result<()> {
        let data = self.state.data();
        data.remove("retryAttempt");
        self.state.set(json!({
            "downloading": false,
            "progressCompleted": "100.00",
            "progressDownloadSpeeds": "0.00 KB/s",
            "timeUntilComplete": "0s",
        }));
        if let Some(total) = total {
            self.state.root().insert("size".into(), json!(read_size(total as f64)));
        }
        self.state.save()
    }

    /// Name the download after what it is, so retries find it by extension.
    fn fix_extension(&mut self, dest: &Path) -> Result<PathBuf> {
        let kind = match archive::detect(dest) {
            Ok(kind) => kind,
            // Handled with the normal recovery: a bad download is fetched again.
            Err(_) => return Ok(dest.to_path_buf()),
        };
        let wanted = match kind {
            Kind::Zip => "zip",
            Kind::Rar => "rar",
            Kind::SevenZip => "7z",
            Kind::Exe => "exe",
        };
        let name = archive::display_name(dest);
        if name.to_lowercase().ends_with(&format!(".{wanted}")) || archive::is_archive_name(&name) && kind != Kind::Exe {
            return Ok(dest.to_path_buf());
        }
        let stem = match name.rsplit_once('.') {
            Some((stem, ext)) if ext.len() <= 5 && !ext.contains(' ') => stem.to_string(),
            _ => name.clone(),
        };
        let renamed = dest.with_file_name(format!("{stem}.{wanted}"));
        log::info!("Renaming download to {}", archive::display_name(&renamed));
        util::replace_file(dest, &renamed, Duration::from_secs(30))?;
        Ok(renamed)
    }

    async fn download_gofile(&mut self, url: &str, password: Option<&str>) -> Result<()> {
        self.stop.check()?;
        let content = providers::gofile_content_id(url)?;
        let folder = member_path(&self.downloads_dir()?, &format!("gofile-{content}"))?;
        let receipts = folder.join(".ascendara-receipts");
        std::fs::create_dir_all(&receipts)?;
        self.state.set(json!({"downloading": true, "extracting": false, "verifying": false, "timeUntilComplete": "Getting download links..."}));
        self.state.save()?;
        self.notify("Download Started", &format!("Starting download for {}", self.game));
        let mut api = providers::Gofile::new(build_client(None)?, self.stop.clone());
        let files: Vec<RemoteFile> = api
            .resolve(url, password)
            .await?
            .into_iter()
            .filter(|f| archive::is_archive_name(&f.filename) || wanted_member(&f.filename))
            .collect();
        if files.is_empty() {
            bail!("no_files_error: GOFile folder contains no downloadable files");
        }
        let token = api.token().ok_or_else(|| anyhow!("GOFile did not issue an account token"))?.to_string();
        let client = build_client(Some(providers::gofile_cookie_jar(&token)))?;
        let mut options = TransferOptions::new(self.settings.connections(), self.settings.download_limit());
        options.referer = Some("https://gofile.io/".into());
        self.download_batch(&client, files, &folder, &receipts, options).await
    }

    /// Download a list of files one after another as one progress bar, then install.
    async fn download_batch(
        &mut self,
        client: &Client,
        files: Vec<RemoteFile>,
        folder: &Path,
        receipts: &Path,
        options: TransferOptions,
    ) -> Result<()> {
        let mut seen = HashSet::new();
        for file in &files {
            let lower = file.filename.to_lowercase();
            if !seen.insert(lower.clone())
                || file.filename.split('/').any(|p| {
                    let p = p.to_lowercase();
                    p.starts_with(".ascendara") || p.ends_with(".ascendara.json") || p.ends_with(".ascpart") || p.ends_with(".ascpart.json")
                })
            {
                bail!("Downloaded filename conflicts with download metadata: {}", file.filename);
            }
        }
        let mut sizes: Vec<Option<u64>> = files.iter().map(|f| f.size).collect();
        let mut completed = 0u64;
        let mut entries = Vec::new();
        for (index, file) in files.iter().enumerate() {
            self.stop.check()?;
            let dest = member_path(folder, &file.filename)?;
            if let Some(parent) = dest.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let receipt = receipts.join(format!("{}.json", hex::encode(Sha256::digest(file.id.as_bytes()))));
            let identity = providers::receipt_identity(file);
            let cached = std::fs::read(&receipt)
                .ok()
                .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
                .map(|saved| saved == identity && file.size.is_some() && std::fs::metadata(&dest).map(|m| Some(m.len()) == file.size).unwrap_or(false))
                .unwrap_or(false);
            let mut file_options = options.clone();
            file_options.expected_size = file.size;
            file_options.md5 = file.md5.clone();
            if !cached {
                let total = sizes.iter().all(Option::is_some).then(|| sizes.iter().map(|s| s.unwrap()).sum());
                let mut attempt = 0;
                loop {
                    match self.fetch(client, &file.url, &dest, file_options.clone(), completed, total).await {
                        Err(error) if error.is::<ChecksumMismatch>() && attempt == 0 => {
                            log::warn!("{} failed its checksum; downloading it again", file.filename);
                            crate::http::discard_partials(&dest);
                            let _ = std::fs::remove_file(&dest);
                            attempt += 1;
                        }
                        Err(error) if error.is::<ChecksumMismatch>() => {
                            return Err(Damaged(format!(
                                "{} failed the host's checksum twice; the file is damaged at the source. Choose another download source",
                                file.filename
                            ))
                            .into());
                        }
                        other => break other?,
                    }
                }
                let size = std::fs::metadata(&dest)?.len();
                let mut saved = identity.clone();
                saved["size"] = json!(size);
                if file.size.is_none() {
                    // Remember the size we got, so a resume can trust this file.
                    let _ = util::write_atomic(&receipt, &serde_json::to_vec(&saved)?);
                } else {
                    util::write_atomic(&receipt, &serde_json::to_vec(&identity)?)?;
                }
                sizes[index] = Some(size);
            }
            let size = std::fs::metadata(&dest)?.len();
            completed += size;
            sizes[index] = Some(size);
            self.sources.insert(
                dest.clone(),
                Source { url: file.url.clone(), options: file_options.clone(), client: client.clone(), verified: file.md5.is_some() },
            );
            entries.push((file.filename.clone(), dest, size));
        }
        self.stop.check()?;
        self.download_meter.update(&mut self.state, completed, Some(completed))?;
        self.finish_download_phase(Some(completed))?;
        let (archives, loose) = split_sources(&entries)?;
        self.extract_and_install(archives, loose, Some(folder.to_path_buf())).await?;
        if !self.state.has_data() {
            self.notify("Download Complete", &format!("Successfully downloaded {}", self.game));
        }
        Ok(())
    }

    async fn download_file_list(&mut self, manifest: &Path) -> Result<()> {
        let (transfer_id, files) = providers::read_file_list(manifest)?;
        let folder = member_path(&self.downloads_dir()?, "torrent")?;
        let receipts = folder.join(".ascendara-receipts");
        std::fs::create_dir_all(&receipts)?;
        self.state.root().insert("debridTransferId".into(), json!(transfer_id));
        self.state.set(json!({"downloading": true, "extracting": false, "verifying": false, "timeUntilComplete": "Getting torrent files..."}));
        self.state.save()?;
        self.may_be_installer = true;
        let client = build_client(None)?;
        let options = TransferOptions::new(self.settings.connections(), self.settings.download_limit());
        self.download_batch(&client, files, &folder, &receipts, options).await
    }

    async fn download_torrent(&mut self, link: &str) -> Result<()> {
        let folder = member_path(&self.downloads_dir()?, "torrent-files")?;
        self.state.set(json!({"downloading": true, "extracting": false, "verifying": false, "timeUntilComplete": "Finding peers..."}));
        self.state.save()?;
        self.notify("Download Started", &format!("Starting download for {}", self.game));
        self.may_be_installer = true;
        let client = build_client(None)?;
        let counter = Arc::new(Counter::default());
        let stop = self.stop.clone();
        let limit = self.settings.download_limit();
        let link = link.to_string();
        let target = folder.clone();
        let task_counter = counter.clone();
        let task = tokio::spawn(async move { crate::torrent::download(&client, &link, &target, &stop, task_counter, limit).await });
        self.watch_transfer(task, counter.clone(), 0, None).await?;
        let total = counter.done.load(Ordering::Relaxed);
        self.finish_download_phase(Some(total))?;
        let entries: Vec<(String, PathBuf, u64)> = util::walk_files(&folder, &|d| d.starts_with(".ascendara"));
        if entries.is_empty() {
            bail!("no_files_error: The torrent contains no files");
        }
        let (archives, loose) = split_sources(&entries)?;
        self.extract_and_install(archives, loose, Some(folder)).await?;
        if !self.state.has_data() {
            self.notify("Download Complete", &format!("Successfully downloaded {}", self.game));
        }
        Ok(())
    }

    // ------------------------------------------------------------ extraction

    pub async fn extract_and_install(&mut self, archives: Vec<PathBuf>, loose: Vec<LooseFile>, cleanup: Option<PathBuf>) -> Result<()> {
        let relative = |p: &Path| util::relative_name(&self.game_dir, p).unwrap_or_else(|| p.to_string_lossy().into_owned());
        let plan = json!({
            "archives": archives.iter().map(|p| relative(p)).collect::<Vec<_>>(),
            "loose": loose.iter().map(|l| json!({"filename": l.filename, "size": l.size, "source": relative(&l.source)})).collect::<Vec<_>>(),
            "cleanup": cleanup.as_ref().map(|p| relative(p)),
            "updating": self.update_flow,
        });
        self.state.root().insert("extractionSources".into(), plan);
        self.state.save()?;
        for attempt in 0..2 {
            match self.extract_once(&archives, &loose, cleanup.as_deref()).await {
                Err(error) if error.is::<MissingOutput>() => {
                    let missing = error.downcast_ref::<MissingOutput>().unwrap().0.clone();
                    if attempt == 1 {
                        bail!(
                            "Extracted files are still missing or incomplete after recovery ({}). Check security-software quarantine/history and whether another program removed or blocked the listed files. The downloaded source files were retained.",
                            missing.first().map(|e| e.file.clone()).unwrap_or_default()
                        );
                    }
                    let retry = tokio::task::block_in_place(|| {
                        self.state.await_recovery(json!({
                            "type": "missingExtractedFiles",
                            "archive": "staged payload",
                            "files": install::verify_errors_json(&missing),
                        }))
                    })?;
                    self.prompted = true;
                    if !retry {
                        return Err(RecoveryCancelled("Missing or incomplete extracted files".into()).into());
                    }
                }
                other => return other,
            }
        }
        unreachable!()
    }

    fn remove_abandoned_stages(&self) {
        let Ok(entries) = std::fs::read_dir(&self.game_dir) else { return };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if !name.starts_with(".ascendara-stage-") || !entry.path().is_dir() {
                continue;
            }
            if stage_has_backups(&entry.path()) {
                log::warn!("Keeping abandoned stage with rollback files: {name}");
                continue;
            }
            log::info!("Removing abandoned extraction stage {name}");
            remove_path(&entry.path());
        }
    }

    async fn extract_once(&mut self, archives: &[PathBuf], loose: &[LooseFile], cleanup: Option<&Path>) -> Result<()> {
        self.stop.check()?;
        let archives = primaries(archives)?;
        if archives.is_empty() && loose.is_empty() {
            bail!("No archive found to extract");
        }
        self.state.set(json!({
            "downloading": false, "extracting": true, "verifying": false,
            "progressCompleted": "100.00", "progressDownloadSpeeds": "0.00 KB/s", "timeUntilComplete": "Preparing extraction...",
        }));
        self.state.save()?;
        // Totals up front, so progress is one bar over every archive.
        self.progress = ProgressHandle::default();
        let mut kinds = HashMap::new();
        let mut total_files = loose.len() as u64;
        let mut total_bytes: u64 = loose.iter().map(|l| l.size).sum();
        for path in &archives {
            if let Ok(kind) = archive::detect(path) {
                if let Ok(listing) = archive::list(path, kind) {
                    total_files += listing.files;
                    total_bytes += listing.bytes;
                }
                kinds.insert(path.clone(), kind);
            }
        }
        self.progress.update(|p| {
            p.files_total = total_files;
            p.bytes_total = total_bytes;
        });
        self.remove_abandoned_stages();
        let stage = self.game_dir.join(format!(".ascendara-stage-{}-{}", std::process::id(), chrono::Utc::now().timestamp_millis()));
        let payload = stage.join("payload");
        std::fs::create_dir_all(&payload)?;
        let result = self.stage_and_install(&archives, loose, &stage, &payload).await;
        if !stage_has_backups(&stage) {
            remove_path(&stage);
        } else if result.is_err() {
            log::error!("Rollback could not finish. Recovery files retained at {}", stage.display());
        } else {
            remove_path(&stage);
        }
        result?;
        self.complete(&archives, loose, cleanup)
    }

    async fn stage_and_install(&mut self, archives: &[PathBuf], loose: &[LooseFile], stage: &Path, payload: &Path) -> Result<()> {
        let mut manifest = Manifest::new();
        for item in loose {
            self.stop.check()?;
            let target = member_path(payload, &item.filename)?;
            let source = item.source.clone();
            let size = item.size;
            let progress = self.progress.clone();
            let name = item.filename.clone();
            let stop = self.extract_stop();
            self.run_blocking(stop, move || {
                if let Some(parent) = target.parent() {
                    std::fs::create_dir_all(parent)?;
                }
                progress.update(|p| {
                    p.current = name.clone();
                    p.current_path = Some((target.clone(), size));
                });
                // Same volume: a hard link costs nothing and keeps the source for retries.
                let _ = std::fs::remove_file(&target);
                if std::fs::hard_link(&source, &target).is_err() {
                    std::fs::copy(&source, &target).with_context(|| format!("Could not copy {name}"))?;
                }
                let actual = std::fs::metadata(&target)?.len();
                if actual != size {
                    bail!("Incomplete downloaded file: {name} ({actual} of {size} bytes)");
                }
                progress.update(|p| {
                    p.current_path = None;
                    p.files_done += 1;
                    p.bytes_done += size;
                });
                Ok(())
            })
            .await?;
            manifest.insert(util::clean_member_name(&item.filename)?, item.size);
        }
        let mut pending: VecDeque<PathBuf> = archives.iter().cloned().collect();
        let mut processed: Vec<PathBuf> = Vec::new();
        while let Some(path) = pending.pop_front() {
            self.stop.check()?;
            let extracted = self.extract_with_recovery(&path, payload).await?;
            manifest.extend(extracted);
            processed.push(path.clone());
            if path.starts_with(payload) {
                // A nested archive is consumed by its extraction.
                for volume in archive::volumes(&path) {
                    if let Some(name) = util::relative_name(payload, &volume) {
                        manifest.remove(&name);
                    }
                    let _ = std::fs::remove_file(&volume);
                }
            }
            if pending.is_empty() {
                manifest = install::flatten_payload(payload, manifest, &self.game)?;
            }
            // Root continuation archives are part of the release; nested game assets stay.
            let nested: Vec<PathBuf> = manifest
                .keys()
                .filter(|n| !n.contains('/') && archive::is_archive_name(n) && !archive::is_continuation(n))
                .map(|n| payload.join(n))
                .collect();
            for candidate in nested {
                if pending.contains(&candidate) {
                    continue;
                }
                if processed.contains(&candidate) {
                    bail!("Recursive archive wrapper detected");
                }
                if let Ok(kind) = archive::detect(&candidate) {
                    if let Ok(listing) = archive::list(&candidate, kind) {
                        self.progress.update(|p| {
                            p.files_total += listing.files;
                            p.bytes_total += listing.bytes;
                        });
                    }
                }
                pending.push_back(candidate);
            }
            if processed.len() + pending.len() > archives.len() + 32 {
                bail!("Too many nested archive wrappers");
            }
        }
        manifest = install::flatten_payload(payload, manifest, &self.game)?;
        let errors = install::verify_manifest(payload, &manifest, &self.stop)?;
        if !errors.is_empty() {
            return Err(MissingOutput(errors).into());
        }
        self.stop.check()?;
        self.install(payload, &manifest, stage)
    }

    fn extract_stop(&self) -> StopFlag {
        StopFlag::default()
    }

    /// Run blocking work while reporting extraction progress. `local` lets the
    /// progress loop end the work when the app stops the download.
    async fn run_blocking<T: Send + 'static>(
        &mut self,
        local: StopFlag,
        work: impl FnOnce() -> Result<T> + Send + 'static,
    ) -> Result<T> {
        let mut task = tokio::task::spawn_blocking(work);
        let mut failure: Option<anyhow::Error> = None;
        loop {
            tokio::select! {
                result = &mut task => {
                    let result = result.map_err(|e| anyhow!("Extraction task failed: {e}"))?;
                    if let Some(error) = failure {
                        return Err(error);
                    }
                    if self.stop.is_set() {
                        return Err(Cancelled.into());
                    }
                    return result;
                }
                _ = tokio::time::sleep(Duration::from_millis(500)) => {
                    if self.stop.is_set() {
                        local.set();
                        continue;
                    }
                    if failure.is_some() {
                        continue;
                    }
                    let snapshot = self.progress.snapshot();
                    if let Err(error) = self.extract_meter.update(&mut self.state, &snapshot) {
                        local.set();
                        if !is_cancelled(&error) {
                            failure = Some(error);
                        }
                    }
                }
            }
        }
    }

    async fn extract_archive(&mut self, path: &Path, destination: &Path) -> Result<Manifest> {
        let kind = archive::detect(path)?;
        if kind != Kind::Exe {
            if let Ok(listing) = archive::list(path, kind) {
                ensure_room(destination, listing.bytes)?;
            }
        }
        let local = self.extract_stop();
        let progress = self.progress.clone();
        let source = path.to_path_buf();
        let target = destination.to_path_buf();
        let stop = local.clone();
        log::info!("Extracting {} ({kind:?})", archive::display_name(path));
        self.run_blocking(local, move || {
            archive::Extractor { stop: &stop, progress: &progress }.extract(&source, kind, &target)
        })
        .await
    }

    /// Extract one archive, recovering automatically where that can help and
    /// asking the person otherwise.
    async fn extract_with_recovery(&mut self, path: &Path, destination: &Path) -> Result<Manifest> {
        let mut redownloaded = false;
        let mut auto_retried = false;
        let mut manual = false;
        loop {
            self.stop.check()?;
            let before = self.progress.snapshot();
            let outcome = self.extract_archive(path, destination).await;
            let error = match outcome {
                Ok(manifest) => {
                    self.state.data().remove("autoRecovery");
                    return Ok(manifest);
                }
                Err(error) if is_cancelled(&error) => return Err(error),
                Err(error) => error,
            };
            // Progress for this archive starts over on a retry.
            self.progress.update(|p| {
                p.files_done = before.files_done;
                p.bytes_done = before.bytes_done;
                p.current_path = None;
            });
            let reason = failure_reason(&error);
            log::warn!("Extraction of {} failed ({reason}): {error:#}", archive::display_name(path));
            let mut failure = anyhow!("{error:#}");
            if reason == "damaged" && !manual && !redownloaded && !self.local_only {
                if let Some(source) = self.source_for(path) {
                    if source.verified && !error.is::<ErrorPage>() {
                        failure = anyhow!(
                            "{error:#}. The file matched the host's checksum, so the archive is damaged at the source. Choose another download source"
                        );
                    } else {
                        self.set_auto_recovery("redownload", path, reason)?;
                        match self.redownload(path).await {
                            Ok(()) => {
                                redownloaded = true;
                                continue;
                            }
                            Err(repair) if is_cancelled(&repair) => return Err(repair),
                            Err(repair) => failure = repair,
                        }
                    }
                }
            }
            if !manual && !auto_retried && !redownloaded && reason != "password" && reason != "damaged" {
                // One quiet retry first: locks and scans are often gone a moment later.
                auto_retried = true;
                manual = true;
                self.set_auto_recovery("reextract", path, reason)?;
                self.state.set(json!({"extracting": true, "timeUntilComplete": "Retrying extraction..."}));
                self.state.save()?;
                self.stop.sleep_async(Duration::from_secs(2)).await?;
                continue;
            }
            self.state.data().remove("autoRecovery");
            let message = format!("{failure:#}");
            let retry = tokio::task::block_in_place(|| {
                self.state.await_recovery(json!({
                    "type": "archiveExtractionFailed",
                    "archive": archive::display_name(path),
                    "message": message,
                    "extractionError": format!("{error:#}"),
                    "files": [],
                    "reason": reason,
                    "autoRetried": auto_retried,
                    "redownloaded": redownloaded,
                }))
            })?;
            self.prompted = true;
            if !retry {
                return Err(RecoveryCancelled(format!("{error:#}")).into());
            }
            manual = true;
            self.state.set(json!({"extracting": true, "timeUntilComplete": "Retrying extraction..."}));
            self.state.save()?;
        }
    }

    fn set_auto_recovery(&mut self, kind: &str, path: &Path, reason: &str) -> Result<()> {
        self.state.data().insert(
            "autoRecovery".into(),
            json!({"kind": kind, "archive": archive::display_name(path), "reason": reason}),
        );
        self.state.save()
    }

    fn source_for(&self, path: &Path) -> Option<Source> {
        archive::volumes(path).iter().chain(std::iter::once(&path.to_path_buf())).find_map(|v| self.sources.get(v).cloned())
    }

    /// Download every volume of a damaged archive again, replacing only what changed.
    async fn redownload(&mut self, path: &Path) -> Result<()> {
        let volumes: Vec<(PathBuf, Source)> = {
            let mut found: Vec<(PathBuf, Source)> = archive::volumes(path)
                .into_iter()
                .filter_map(|v| self.sources.get(&v).cloned().map(|s| (v, s)))
                .collect();
            if found.is_empty() {
                if let Some(source) = self.sources.get(path).cloned() {
                    found.push((path.to_path_buf(), source));
                }
            }
            found
        };
        if volumes.is_empty() {
            bail!("The damaged archive has no known download source. Choose another source with all archive volumes.");
        }
        log::warn!("Downloading damaged archive again: {}", archive::display_name(path));
        self.stop.sleep_async(Duration::from_secs(2)).await?;
        self.state.set(json!({
            "extracting": false, "downloading": true, "verifying": false,
            "progressCompleted": "0.00", "retryAttempt": 1, "timeUntilComplete": "Repairing archive",
        }));
        self.state.save()?;
        self.download_meter = DownloadMeter::new();
        let total: u64 = volumes.iter().map(|(v, _)| std::fs::metadata(v).map(|m| m.len()).unwrap_or(0)).sum();
        let mut done = 0;
        let mut changed = false;
        for (volume, source) in volumes {
            let folder = volume.parent().unwrap_or(&self.game_dir).to_path_buf();
            let temporary = folder.join(format!(".ascendara-repair-{}", std::process::id()));
            remove_path(&temporary);
            std::fs::create_dir_all(&temporary)?;
            let replacement = temporary.join(archive::display_name(&volume));
            let outcome = self.fetch(&source.client, &source.url, &replacement, source.options.clone(), done, Some(total)).await;
            if let Err(error) = outcome {
                remove_path(&temporary);
                if is_cancelled(&error) {
                    return Err(error);
                }
                return Err(error.context("Archive repair download failed; the original archive has been kept"));
            }
            done += std::fs::metadata(&replacement).map(|m| m.len()).unwrap_or(0);
            let (old, new) = (volume.clone(), replacement.clone());
            let stop = self.stop.clone();
            let same = tokio::task::spawn_blocking(move || -> Result<bool> {
                if !old.exists() {
                    return Ok(false);
                }
                Ok(digest(&old, &stop)? == digest(&new, &stop)?)
            })
            .await??;
            if !same {
                util::replace_file(&replacement, &volume, Duration::from_secs(60))?;
                changed = true;
            }
            remove_path(&temporary);
        }
        self.state.data().remove("retryAttempt");
        self.state.set(json!({"downloading": false, "extracting": true, "progressCompleted": "100.00"}));
        self.state.save()?;
        if !changed {
            bail!("The source returned identical archive bytes after a fresh download. The archive may be damaged at the source or missing a volume. Choose another source; retrying this download again will not repair it.");
        }
        Ok(())
    }

    // ------------------------------------------------------------ install

    fn install(&mut self, payload: &Path, manifest: &Manifest, stage: &Path) -> Result<()> {
        let theme = self.theme.clone();
        let game = self.game.clone();
        let outcome = {
            let state = &mut self.state;
            install::install_payload(payload, manifest, stage, &self.game_dir, self.update_flow, &self.stop, || {
                state.set(json!({"extracting": false, "verifying": true}));
                state.save()?;
                system::notify(theme.as_deref(), "Extraction Complete", &format!("Extraction complete for {game}"));
                Ok(())
            })?
        };
        self.state.data().insert("verifying".into(), json!(false));
        if !outcome.errors.is_empty() {
            self.state.data().insert("verifyError".into(), install::verify_errors_json(&outcome.errors));
            let repairable = !self.update_flow
                && !self.state.info.get("privateSource").map(|v| !v.is_null()).unwrap_or(false)
                && install::can_keep_for_dll_repair(&self.game_dir, &outcome.errors)
                && self.game_dir.join("filemap.ascendara.json").exists();
            if repairable {
                self.set_executable();
                self.state.set(json!({
                    "downloading": false, "extracting": false, "verifying": false,
                    "progressCompleted": "100.00", "dllRepairPending": true,
                }));
            }
            self.state.save()?;
            return Err(VerificationFailed { repairable_dlls: repairable }.into());
        }
        if let Some(version) = self.state.root().remove("pendingVersion") {
            self.state.root().insert("version".into(), version);
        }
        self.set_executable();
        self.state.save()?;
        self.stop.check()
    }

    fn set_executable(&mut self) {
        if let Some(exe) = install::detect_executable(&self.game_dir, &self.game) {
            self.state.root().insert("executable".into(), json!(exe.to_string_lossy()));
        }
    }

    /// Clean up the sources and tell the app the game is ready.
    fn complete(&mut self, archives: &[PathBuf], loose: &[LooseFile], cleanup: Option<&Path>) -> Result<()> {
        if self.state.info.get("privateSource").map(Value::is_object).unwrap_or(false) {
            // Private packages keep their archives and never run post-download actions.
            self.state.info["privateSource"]["extracted"] = json!(true);
            self.state.root().insert("executable".into(), json!(""));
            let manual_dir = self.game_dir.to_string_lossy().into_owned();
            self.state.root().insert(
                "downloadingData".into(),
                json!({
                    "downloading": false, "pendingManualInstall": true, "privatePackage": true,
                    "progressCompleted": "100.00", "manualInstallDir": manual_dir,
                    "message": "privateSources.status.archiveExtracted",
                }),
            );
            self.state.root().remove("extractionSources");
            return self.state.save();
        }
        let downloads = self.game_dir.join(DOWNLOADS);
        for path in archives {
            if !path.starts_with(&self.game_dir) {
                continue;
            }
            // A non-archive download was copied into the install; drop it only from the cache.
            if !archive::is_archive_name(&archive::display_name(path)) && !path.starts_with(&downloads) {
                continue;
            }
            for volume in archive::volumes(path) {
                remove_path(&volume);
            }
            remove_path(path);
        }
        for item in loose {
            if item.source.starts_with(&downloads) {
                remove_path(&item.source);
            }
        }
        if let Some(folder) = cleanup {
            if folder.starts_with(&self.game_dir) && folder != self.game_dir {
                remove_path(folder);
            }
        }
        if std::fs::read_dir(&downloads).map(|mut d| d.next().is_none()).unwrap_or(false) {
            let _ = std::fs::remove_dir(&downloads);
        }
        // The catalog size is the compressed download; record what the install occupies.
        let measured = util::tree_size(&self.game_dir);
        let root = self.state.root();
        root.insert("size".into(), json!(read_size(measured as f64)));
        root.insert("sizeMeasured".into(), json!(true));
        root.insert("installedBytes".into(), json!(measured));
        root.remove("sizeReported");
        if self.may_be_installer || self.state.info.get("debridTransferId").is_some() {
            if cfg!(windows) {
                if let Some(installer) = install::find_setup_installer(&self.game_dir) {
                    let dir = self.game_dir.to_string_lossy().into_owned();
                    self.state.root().insert("executable".into(), json!(""));
                    self.state.root().insert(
                        "downloadingData".into(),
                        json!({
                            "downloading": false, "extracting": false, "verifying": false,
                            "pendingManualInstall": true,
                            "manualInstallerPath": installer.to_string_lossy(),
                            "manualInstallDir": dir,
                            "progressCompleted": "100.00", "progressDownloadSpeeds": "0.00 KB/s", "timeUntilComplete": "0s",
                        }),
                    );
                    self.state.root().remove("extractionSources");
                    return self.state.save();
                }
            }
        }
        self.state.root().remove("downloadingData");
        self.state.root().remove("extractionSources");
        self.state.save()?;
        system::run_post_download_behavior(&self.settings);
        Ok(())
    }
}

// ---------------------------------------------------------------- helpers

#[derive(Debug)]
struct MissingOutput(Vec<install::VerifyError>);

impl std::fmt::Display for MissingOutput {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Incomplete archive output: {}", self.0.first().map(|e| format!("{} ({})", e.file, e.error)).unwrap_or_default())
    }
}

impl std::error::Error for MissingOutput {}

fn stage_has_backups(stage: &Path) -> bool {
    std::fs::read_dir(stage.join("rollback"))
        .map(|entries| entries.flatten().any(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            name != "paths.json" && name != "previous-filemap.json"
        }))
        .unwrap_or(false)
}

fn ensure_room(destination: &Path, needed: u64) -> Result<()> {
    if let Ok(free) = util::free_space(destination) {
        if needed > free {
            bail!(
                "Insufficient disk space for extraction: {} needed, {} free. Free up space on this drive, then retry.",
                read_size(needed as f64),
                read_size(free as f64)
            );
        }
    }
    Ok(())
}

fn digest(path: &Path, stop: &StopFlag) -> Result<Vec<u8>> {
    use std::io::Read;
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 4 << 20];
    loop {
        stop.check()?;
        let read = file.read(&mut buffer)?;
        if read == 0 {
            return Ok(hasher.finalize().to_vec());
        }
        hasher.update(&buffer[..read]);
    }
}

/// First volumes only; a continuation without its first volume is an error.
fn primaries(archives: &[PathBuf]) -> Result<Vec<PathBuf>> {
    let mut result: Vec<PathBuf> = Vec::new();
    for path in archives {
        let name = archive::display_name(path);
        let first = archive::volumes(path).into_iter().next().unwrap_or_else(|| path.clone());
        if archive::is_continuation(&name) {
            if archive::is_continuation(&archive::display_name(&first)) || !first.exists() {
                bail!("Missing first archive volume for {name}");
            }
            if !result.contains(&first) {
                result.push(first);
            }
        } else if !result.contains(path) {
            result.push(path.clone());
        }
    }
    Ok(result)
}

/// Split downloaded files into archives to extract and files to install as they are.
fn split_sources(entries: &[(String, PathBuf, u64)]) -> Result<(Vec<PathBuf>, Vec<LooseFile>)> {
    let mut archives = Vec::new();
    let mut loose = Vec::new();
    for (name, path, size) in entries {
        let lower = name.to_lowercase();
        if lower.contains("/.ascendara-receipts/") || lower.starts_with(".ascendara-receipts/") {
            continue;
        }
        if archive::is_archive_name(name) {
            if !archive::is_continuation(name) {
                archives.push(path.clone());
            }
        } else if wanted_member(name) {
            loose.push(LooseFile { filename: name.clone(), size: *size, source: path.clone() });
        }
    }
    // A continuation volume needs its first volume among the files.
    for (name, path, _) in entries {
        if archive::is_continuation(name) {
            let first = archive::volumes(path).into_iter().next();
            if first.map(|f| archive::is_continuation(&archive::display_name(&f))).unwrap_or(true) {
                bail!("Missing first archive volume for {name}");
            }
        }
    }
    Ok((archives, loose))
}

/// Plain-language category the app explains to the person.
pub fn failure_reason(error: &anyhow::Error) -> &'static str {
    if error.chain().any(|c| c.is::<WrongPassword>()) {
        return "password";
    }
    let text = format!("{error:#}").to_lowercase();
    if text.contains("security software") || text.contains("windows error 225") || text.contains("windows error 226") {
        return "security";
    }
    if text.contains("disk space") || text.contains("no space left") || text.contains("not enough space") {
        return "disk";
    }
    if error.chain().any(|c| c.is::<Damaged>() || c.is::<ErrorPage>() || c.is::<ChecksumMismatch>()) {
        return "damaged";
    }
    if text.contains("permission denied") || text.contains("access is denied") || text.contains("os error 32")
        || text.contains("being used by another process") || text.contains("could not be read") || text.contains("locked")
    {
        return "blocked";
    }
    if text.contains("crc") || text.contains("corrupt") {
        return "damaged";
    }
    "unknown"
}

/// What the app shows: provider and network failures become its known error keys.
pub fn user_message(error: &anyhow::Error) -> String {
    if error.chain().any(|c| c.is::<Rejected>() || c.is::<ErrorPage>()) {
        return format!("{error}");
    }
    let text = format!("{error:#}");
    let lower = text.to_lowercase();
    if ["wrong version number", "os error 10054", "forcibly closed"].iter().any(|m| lower.contains(m)) {
        return "provider_blocked_error".into();
    }
    let network = [
        "connection broken", "connection reset", "connection aborted", "connection closed", "connection refused",
        "error sending request", "error decoding response body", "dns error", "timed out", "tls handshake",
        "unexpected eof", "incomplete download",
    ];
    if !lower.contains("extraction") && network.iter().any(|m| lower.contains(m)) {
        log::error!("Network failure: {text}");
        return "download_connection_error".into();
    }
    text
}

fn parse_size(text: &str) -> Option<u64> {
    let mut parts = text.split_whitespace();
    let value: f64 = parts.next()?.parse().ok()?;
    let unit = parts.next()?.to_uppercase();
    let multiplier: u64 = match unit.as_str() {
        "B" => 1,
        "KB" => 1 << 10,
        "MB" => 1 << 20,
        "GB" => 1 << 30,
        "TB" => 1 << 40,
        _ => return None,
    };
    Some((value * multiplier as f64) as u64)
}

// ---------------------------------------------------------------- local retry

/// Restart extraction from the files already on disk, without any network access.
pub async fn retry_local_extraction(metadata: &Path) -> Result<()> {
    let metadata = std::path::absolute(metadata)?;
    let info = crate::state::load_info(&metadata)?;
    let game_dir = metadata.parent().ok_or_else(|| anyhow!("Invalid game file path"))?.to_path_buf();
    let game = info.get("game").and_then(Value::as_str).unwrap_or_default().to_string();
    let prior = info.get("downloadingData").cloned().unwrap_or(json!({}));
    let previous_error = prior
        .get("previousError")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| prior.get("error").and_then(Value::as_bool).filter(|e| *e).and_then(|_| prior.get("message").and_then(Value::as_str).map(str::to_string)));
    let plan = info.get("extractionSources").cloned().filter(Value::is_object);
    let update_flow = plan
        .as_ref()
        .and_then(|p| p.get("updating").and_then(Value::as_bool))
        .or_else(|| prior.get("updating").and_then(Value::as_bool))
        .unwrap_or(false);
    let stop = StopFlag::default();
    let state = GameState::new(metadata.clone(), info, stop.clone());
    let mut job = Job::new(game, game_dir.clone(), state, update_flow, None, true);
    job.previous_error = previous_error;
    job.may_be_installer = job.state.info.get("debridTransferId").is_some();
    let result = async {
        let (archives, loose, cleanup) = match &plan {
            Some(plan) => planned_sources(&game_dir, plan)?,
            None => scan_sources(&mut job)?,
        };
        if archives.is_empty() && loose.is_empty() {
            bail!("The downloaded files for this game are no longer on disk. Download the game again or choose another download source.");
        }
        job.state.root().insert(
            "downloadingData".into(),
            json!({
                "downloading": false, "extracting": true, "verifying": false, "updating": update_flow,
                "progressCompleted": "100.00", "progressDownloadSpeeds": "0.00 KB/s", "timeUntilComplete": "Preparing extraction...",
            }),
        );
        // The app cleared its stop request before starting us; start clean.
        job.state.write_unchecked()?;
        crate::state::watch_for_stop(metadata.clone(), stop.clone());
        job.extract_and_install(archives, loose, cleanup).await
    }
    .await;
    finish(&mut job, result);
    Ok(())
}

fn planned_sources(game_dir: &Path, plan: &Value) -> Result<(Vec<PathBuf>, Vec<LooseFile>, Option<PathBuf>)> {
    let resolve = |name: &str| -> Result<PathBuf> { member_path(game_dir, name) };
    let mut archives = Vec::new();
    for name in plan.get("archives").and_then(Value::as_array).into_iter().flatten().filter_map(Value::as_str) {
        let path = resolve(name)?;
        if !path.is_file() {
            bail!("Retained source is missing: {name}. Download the game again or choose another download source.");
        }
        archives.push(path);
    }
    let mut loose = Vec::new();
    for item in plan.get("loose").and_then(Value::as_array).into_iter().flatten() {
        let source = resolve(item.get("source").and_then(Value::as_str).unwrap_or_default())?;
        if !source.is_file() {
            bail!("Retained source is missing: {}", source.display());
        }
        loose.push(LooseFile {
            filename: item.get("filename").and_then(Value::as_str).unwrap_or_default().to_string(),
            size: item.get("size").and_then(Value::as_u64).unwrap_or(0),
            source,
        });
    }
    let cleanup = plan.get("cleanup").and_then(Value::as_str).map(resolve).transpose()?;
    Ok((archives, loose, cleanup))
}

/// Older downloads did not record their sources: look in the download cache
/// and at top-level archives, never in installed subfolders.
fn scan_sources(job: &mut Job) -> Result<(Vec<PathBuf>, Vec<LooseFile>, Option<PathBuf>)> {
    let mut archives = Vec::new();
    let mut loose = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&job.game_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if entry.path().is_file() && archive::is_archive_name(&name) && !archive::is_continuation(&name) {
                archives.push(entry.path());
            }
        }
    }
    let cache = job.game_dir.join(DOWNLOADS);
    let files = util::walk_files(&cache, &|d| d == ".ascendara-receipts" || d.starts_with(".ascendara-inplace-") || d.starts_with(".ascendara-repair-"));
    for (name, path, size) in files {
        let lower = name.to_lowercase();
        if lower.ends_with(".ascpart") || lower.ends_with(".partial") || lower.ends_with(".json") || lower.ends_with(".tmp") {
            continue;
        }
        let base = archive::display_name(&path);
        if archive::is_archive_name(&base) {
            if !archive::is_continuation(&base) {
                archives.push(path);
            }
            continue;
        }
        if base.to_lowercase().starts_with(".ascendara") {
            continue;
        }
        // A finished download that failed before being named by its type.
        match archive::detect(&path) {
            Ok(_) => {
                let typed = job.fix_extension(&path)?;
                archives.push(typed);
            }
            Err(_) if wanted_member(&name) && path.parent() != Some(cache.as_path()) => {
                loose.push(LooseFile { filename: name, size, source: path });
            }
            Err(_) => {}
        }
    }
    Ok((archives, loose, None))
}

/// Record the outcome of a job for the app.
pub fn finish(job: &mut Job, result: Result<()>) {
    match result {
        Ok(()) => {}
        Err(error) if is_cancelled(&error) => log::info!("Download stopped; partial and source files retained"),
        Err(error) if error.is::<VerificationFailed>() => log::error!("{error}; source archives retained for recovery"),
        Err(error) => {
            log::error!("Download failed: {error:#}");
            let message = user_message(&error);
            let previous = job.previous_error.clone();
            job.state.fail(&message, previous.as_deref());
            system::notify(job.theme.as_deref(), "Download Error", &format!("Error downloading {}: {error}", job.game));
        }
    }
}

impl Job {
    pub fn record(&mut self, result: Result<()>) {
        finish(self, result);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reasons() {
        assert_eq!(failure_reason(&anyhow::Error::new(Damaged("x".into()))), "damaged");
        assert_eq!(failure_reason(&anyhow::Error::new(WrongPassword("x".into()))), "password");
        assert_eq!(failure_reason(&anyhow!("Insufficient disk space for extraction")), "disk");
        assert_eq!(failure_reason(&anyhow!("Access is denied. (os error 5)")), "blocked");
        assert_eq!(user_message(&anyhow!("Connection broken: the connection stalled")), "download_connection_error");
    }

    #[test]
    fn sizes() {
        assert_eq!(parse_size("19.05 GB"), Some((19.05 * (1u64 << 30) as f64) as u64));
        assert_eq!(parse_size("374 MB"), Some(374 << 20));
        assert_eq!(parse_size("unknown"), None);
    }
}
