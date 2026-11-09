//! Archive detection and extraction, in-process: RAR (UnRAR), ZIP and 7z,
//! including split volumes. Decoders check every file's CRC as they go.

use crate::state::{Cancelled, StopFlag};
use crate::util::{clean_member_name, member_path, wanted_member};
use anyhow::{anyhow, bail, Context, Result};
use regex::Regex;
use std::collections::BTreeMap;
use std::fs::{self, File};
use std::io::{self, BufWriter, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

/// Password the catalog's repacks use. Ignored by archives that have none.
pub const PASSWORD: &str = "steamrip.com";

pub type Manifest = BTreeMap<String, u64>;

#[derive(Clone, Default, Debug)]
pub struct Progress {
    pub files_done: u64,
    pub files_total: u64,
    pub bytes_done: u64,
    pub bytes_total: u64,
    pub current: String,
    /// The file being written and its expected size, sampled for progress
    /// inside large files.
    pub current_path: Option<(PathBuf, u64)>,
    /// The process's written-bytes counter when the current file started.
    pub current_write_base: Option<u64>,
    /// Size of the current file and how much of it is written (snapshot only).
    pub current_size: u64,
    pub current_done: u64,
}

#[derive(Clone, Default)]
pub struct ProgressHandle(Arc<Mutex<Progress>>);

impl ProgressHandle {
    pub fn update(&self, change: impl FnOnce(&mut Progress)) {
        if let Ok(mut progress) = self.0.lock() {
            change(&mut progress);
        }
    }

    /// Snapshot including the part of the current file already on disk.
    pub fn snapshot(&self) -> Progress {
        let mut progress = self.0.lock().map(|p| p.clone()).unwrap_or_default();
        if let Some((path, expected)) = &progress.current_path {
            // Bytes actually written: UnRAR reserves a large file's full size up
            // front, so the size on disk would read as done and then stand still.
            let written = match (progress.current_write_base, crate::system::process_io()) {
                (Some(base), Some((_, now))) => Some(now.saturating_sub(base)),
                _ => fs::metadata(path).ok().map(|m| m.len()),
            };
            let done = written.unwrap_or(0).min(*expected);
            progress.current_size = *expected;
            progress.current_done = done;
            progress.bytes_done += done;
        }
        progress.bytes_done = progress.bytes_done.min(progress.bytes_total.max(progress.bytes_done));
        progress
    }
}

/// The archive's data is damaged or incomplete: downloading it again can help.
#[derive(Debug)]
pub struct Damaged(pub String);

impl std::fmt::Display for Damaged {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Archive corrupt data: {}", self.0)
    }
}

impl std::error::Error for Damaged {}

#[derive(Debug)]
pub struct WrongPassword(pub String);

impl std::fmt::Display for WrongPassword {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Incorrect password for archive: {}", self.0)
    }
}

impl std::error::Error for WrongPassword {}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Zip,
    Rar,
    SevenZip,
    Exe,
}

fn find(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|w| w == needle)
}

const RAR4: &[u8] = b"Rar!\x1a\x07\x00";
const RAR5: &[u8] = b"Rar!\x1a\x07\x01\x00";
const SEVEN: &[u8] = b"7z\xbc\xaf\x27\x1c";

/// Identify a downloaded file from its bytes, not its name.
pub fn detect(path: &Path) -> Result<Kind> {
    let mut head = vec![0u8; 1024 * 1024];
    let read = read_head(path, &mut head)?;
    head.truncate(read);
    if head.is_empty() {
        return Err(Damaged(format!("{} is empty", display_name(path))).into());
    }
    let start = &head[..head.len().min(16)];
    if start.starts_with(b"PK\x03\x04") || start.starts_with(b"PK\x05\x06") || start.starts_with(b"PK\x07\x08") {
        return Ok(Kind::Zip);
    }
    if start.starts_with(RAR4) || start.starts_with(RAR5) {
        return Ok(Kind::Rar);
    }
    if start.starts_with(SEVEN) {
        return Ok(Kind::SevenZip);
    }
    let lower = display_name(path).to_lowercase();
    let named_archive = [".rar", ".zip", ".7z"].iter().any(|e| lower.ends_with(e));
    if start.starts_with(b"MZ") {
        // A self-extracting archive under an archive's name is opened as the archive.
        if named_archive && (find(&head, RAR5).is_some() || find(&head, RAR4).is_some()) {
            return Ok(Kind::Rar);
        }
        return Ok(Kind::Exe);
    }
    if crate::http::looks_like_page(&head[..head.len().min(64 * 1024)]) {
        let text = String::from_utf8_lossy(&head[..head.len().min(300)]).split_whitespace().collect::<Vec<_>>().join(" ");
        return Err(crate::http::ErrorPage(text).into());
    }
    if head.iter().take(64 * 1024).all(|b| *b == 0) {
        return Err(Damaged(format!("{} holds no data where the archive should start; the download did not finish writing", display_name(path))).into());
    }
    // Archives with data in front of them (some hosts and SFX stubs).
    if find(&head, RAR5).is_some() || find(&head, RAR4).is_some() {
        return Ok(Kind::Rar);
    }
    if find(&head, b"PK\x03\x04").is_some() && lower.ends_with(".zip") {
        return Ok(Kind::Zip);
    }
    Err(Damaged(format!(
        "{} is not a ZIP, RAR or 7z archive or a program (starts with {})",
        display_name(path),
        hex::encode(&head[..head.len().min(8)])
    ))
    .into())
}

fn read_head(path: &Path, buffer: &mut [u8]) -> Result<usize> {
    let mut last = None;
    for attempt in 0..4 {
        match File::open(path) {
            Ok(mut file) => {
                let mut total = 0;
                loop {
                    let read = file.read(&mut buffer[total..])?;
                    if read == 0 || total + read == buffer.len() {
                        return Ok(total + read);
                    }
                    total += read;
                }
            }
            Err(error) => {
                if matches!(error.raw_os_error(), Some(225) | Some(226)) {
                    bail!(
                        "Security software blocked the downloaded archive, usually a false positive. Add an exclusion for the download folder (Windows error {}). The source file was retained.",
                        error.raw_os_error().unwrap()
                    );
                }
                if !crate::util::is_transient_lock(&error) {
                    return Err(error).with_context(|| format!("Cannot read downloaded archive {}", path.display()));
                }
                last = Some(error);
                std::thread::sleep(std::time::Duration::from_millis(250 << attempt));
            }
        }
    }
    Err(anyhow!(
        "The downloaded file could not be read: {}. Check that the drive is available and the file is not blocked by another program.",
        last.map(|e| e.to_string()).unwrap_or_default()
    ))
}

pub fn display_name(path: &Path) -> String {
    path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()
}

// ---------------------------------------------------------------- volumes

fn part_number(name: &str) -> Option<(String, u32)> {
    let re = Regex::new(r"(?i)^(.+)\.part(\d+)\.rar$").unwrap();
    re.captures(name).map(|c| (c[1].to_string(), c[2].parse().unwrap_or(0)))
}

fn split_number(name: &str) -> Option<(String, u32)> {
    let re = Regex::new(r"(?i)^(.+\.(?:7z|zip))\.(\d{3})$").unwrap();
    re.captures(name).map(|c| (c[1].to_string(), c[2].parse().unwrap_or(0)))
}

fn old_style(name: &str) -> Option<String> {
    let re = Regex::new(r"(?i)^(.+)\.(?:rar|[r-z]\d{2})$").unwrap();
    re.captures(name).map(|c| c[1].to_string())
}

/// True for a volume that is not the first of its set: extraction starts at the first.
pub fn is_continuation(name: &str) -> bool {
    if let Some((_, n)) = part_number(name) {
        return n > 1;
    }
    if let Some((_, n)) = split_number(name) {
        return n > 1;
    }
    Regex::new(r"(?i)\.[r-z]\d{2}$").unwrap().is_match(name)
}

pub fn is_archive_name(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.ends_with(".rar")
        || lower.ends_with(".zip")
        || lower.ends_with(".7z")
        || split_number(name).is_some()
        || Regex::new(r"(?i)\.[r-z]\d{2}$").unwrap().is_match(name)
}

/// Every volume of the set `primary` belongs to, in order (just `primary` if it has none).
pub fn volumes(primary: &Path) -> Vec<PathBuf> {
    let Some(folder) = primary.parent() else { return vec![primary.to_path_buf()] };
    let name = display_name(primary);
    let siblings: Vec<String> = fs::read_dir(folder)
        .map(|entries| entries.flatten().map(|e| e.file_name().to_string_lossy().into_owned()).collect())
        .unwrap_or_default();
    let mut family: Vec<(u32, String)> = if let Some((base, _)) = part_number(&name) {
        siblings
            .iter()
            .filter_map(|s| part_number(s).filter(|(b, _)| b.eq_ignore_ascii_case(&base)).map(|(_, n)| (n, s.clone())))
            .collect()
    } else if let Some((base, _)) = split_number(&name) {
        siblings
            .iter()
            .filter_map(|s| split_number(s).filter(|(b, _)| b.eq_ignore_ascii_case(&base)).map(|(_, n)| (n, s.clone())))
            .collect()
    } else if let Some(base) = old_style(&name) {
        siblings
            .iter()
            .filter(|s| old_style(s).map(|b| b.eq_ignore_ascii_case(&base)).unwrap_or(false))
            .map(|s| {
                let lower = s.to_lowercase();
                // name.rar first, then .r00.. .r99, .s00..
                let order = if lower.ends_with(".rar") {
                    0
                } else {
                    let ext = &lower[lower.len() - 3..];
                    let letter = (ext.as_bytes()[0] - b'r') as u32;
                    1 + letter * 100 + ext[1..].parse::<u32>().unwrap_or(0)
                };
                (order, s.clone())
            })
            .collect()
    } else {
        vec![]
    };
    if family.is_empty() {
        return vec![primary.to_path_buf()];
    }
    family.sort();
    family.into_iter().map(|(_, s)| folder.join(s)).collect()
}

/// Reads consecutive split files (`game.7z.001`, `.002`, ...) as one stream.
struct MultiFile {
    files: Vec<(File, u64)>,
    offsets: Vec<u64>,
    total: u64,
    position: u64,
}

impl MultiFile {
    fn open(paths: &[PathBuf]) -> Result<Self> {
        let mut files = Vec::new();
        let mut offsets = Vec::new();
        let mut total = 0;
        for path in paths {
            let file = File::open(path).with_context(|| format!("Archive volume unavailable: {}", path.display()))?;
            let size = file.metadata()?.len();
            offsets.push(total);
            total += size;
            files.push((file, size));
        }
        Ok(MultiFile { files, offsets, total, position: 0 })
    }
}

impl Read for MultiFile {
    fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
        if self.position >= self.total || buffer.is_empty() {
            return Ok(0);
        }
        let index = match self.offsets.binary_search(&self.position) {
            Ok(i) => i,
            Err(i) => i - 1,
        };
        let (file, size) = &mut self.files[index];
        let within = self.position - self.offsets[index];
        file.seek(SeekFrom::Start(within))?;
        let wanted = buffer.len().min((*size - within) as usize);
        let read = file.read(&mut buffer[..wanted])?;
        self.position += read as u64;
        Ok(read)
    }
}

impl Seek for MultiFile {
    fn seek(&mut self, position: SeekFrom) -> io::Result<u64> {
        let target = match position {
            SeekFrom::Start(n) => n as i128,
            SeekFrom::End(n) => self.total as i128 + n as i128,
            SeekFrom::Current(n) => self.position as i128 + n as i128,
        };
        if target < 0 {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "seek before start"));
        }
        self.position = target as u64;
        Ok(self.position)
    }
}

fn open_reader(primary: &Path) -> Result<MultiFile> {
    let paths = if split_number(&display_name(primary)).is_some() { volumes(primary) } else { vec![primary.to_path_buf()] };
    MultiFile::open(&paths)
}

// ---------------------------------------------------------------- listing

pub struct Listing {
    pub files: u64,
    pub bytes: u64,
}

/// Count wanted files and bytes without decompressing, for overall progress.
pub fn list(primary: &Path, kind: Kind) -> Result<Listing> {
    let mut listing = Listing { files: 0, bytes: 0 };
    match kind {
        Kind::Exe => {
            listing.files = 1;
            listing.bytes = fs::metadata(primary)?.len();
        }
        Kind::Zip => {
            let mut archive = zip::ZipArchive::new(io::BufReader::new(open_reader(primary)?)).map_err(zip_error)?;
            for index in 0..archive.len() {
                let entry = archive.by_index_raw(index).map_err(zip_error)?;
                if !entry.is_dir() && !entry.is_symlink() && wanted_member(entry.name()) {
                    listing.files += 1;
                    listing.bytes += entry.size();
                }
            }
        }
        Kind::SevenZip => {
            let archive = open_7z_archive(primary)?;
            for entry in &archive.files {
                if !entry.is_directory && entry.has_stream && wanted_member(&entry.name) && !seven_link(entry) {
                    listing.files += 1;
                    listing.bytes += entry.size;
                }
            }
        }
        Kind::Rar => {
            let archive = unrar::Archive::with_password(primary, PASSWORD.as_bytes())
                .open_for_listing()
                .map_err(|e| rar_error(e, primary))?;
            for header in archive {
                let header = header.map_err(|e| rar_error(e, primary))?;
                let name = header.filename.to_string_lossy();
                if header.is_file() && !header.is_split_before() && !rar_link(header.file_attr) && wanted_member(&name) {
                    listing.files += 1;
                    listing.bytes += header.unpacked_size;
                }
            }
        }
    }
    Ok(listing)
}

fn open_7z_archive(primary: &Path) -> Result<sevenz_rust2::Archive> {
    let mut reader = open_reader(primary)?;
    match sevenz_rust2::Archive::read(&mut reader, &sevenz_rust2::Password::empty()) {
        Ok(archive) => Ok(archive),
        Err(sevenz_rust2::Error::PasswordRequired) => {
            reader.seek(SeekFrom::Start(0))?;
            sevenz_rust2::Archive::read(&mut reader, &sevenz_rust2::Password::from(PASSWORD)).map_err(seven_error)
        }
        Err(error) => Err(seven_error(error)),
    }
}

// ---------------------------------------------------------------- extraction

pub struct Extractor<'a> {
    pub stop: &'a StopFlag,
    pub progress: &'a ProgressHandle,
}

impl Extractor<'_> {
    /// Extract `primary` (and its volumes) into `destination`. Returns the
    /// regular files written, with their sizes.
    pub fn extract(&self, primary: &Path, kind: Kind, destination: &Path) -> Result<Manifest> {
        fs::create_dir_all(destination)?;
        let manifest = match kind {
            Kind::Exe => self.copy_file(primary, destination)?,
            Kind::Zip => self.extract_zip(primary, destination)?,
            Kind::SevenZip => self.extract_7z(primary, destination)?,
            Kind::Rar => self.extract_rar(primary, destination)?,
        };
        self.progress.update(|p| p.current_path = None);
        Ok(manifest)
    }

    fn begin_file(&self, name: &str, path: &Path, size: u64) {
        let name = name.to_string();
        let path = path.to_path_buf();
        let base = crate::system::process_io().map(|(_, written)| written);
        self.progress.update(|p| {
            p.current = name;
            p.current_path = Some((path, size));
            p.current_write_base = base;
        });
    }

    fn end_file(&self, size: u64) {
        self.progress.update(|p| {
            p.current_path = None;
            p.current_write_base = None;
            p.files_done += 1;
            p.bytes_done += size;
        });
    }

    fn copy_file(&self, source: &Path, destination: &Path) -> Result<Manifest> {
        let name = display_name(source);
        let target = member_path(destination, &name)?;
        let size = fs::metadata(source)?.len();
        self.begin_file(&name, &target, size);
        let mut input = File::open(source)?;
        let mut output = BufWriter::with_capacity(1 << 20, File::create(&target)?);
        self.copy(&mut input, &mut output)?;
        output.flush()?;
        self.end_file(size);
        Ok(BTreeMap::from([(name, size)]))
    }

    fn copy(&self, input: &mut dyn Read, output: &mut dyn Write) -> io::Result<u64> {
        let mut buffer = vec![0u8; 1 << 20];
        let mut total = 0;
        loop {
            if self.stop.is_set() {
                return Err(io::Error::new(io::ErrorKind::Interrupted, Cancelled));
            }
            let read = input.read(&mut buffer)?;
            if read == 0 {
                return Ok(total);
            }
            output.write_all(&buffer[..read])?;
            total += read as u64;
        }
    }

    fn write_entry(&self, name: &str, size: u64, destination: &Path, input: &mut dyn Read) -> Result<u64> {
        let target = member_path(destination, name)?;
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).with_context(|| format!("Cannot create folder for {name}"))?;
        }
        replace_existing(&target);
        self.begin_file(name, &target, size);
        let file = File::create(&target).map_err(|e| file_error("create", &target, e))?;
        let mut output = BufWriter::with_capacity(1 << 20, file);
        let written = self.copy(input, &mut output).map_err(|e| io_to_archive(e, name))?;
        output.flush().map_err(|e| file_error("write", &target, e))?;
        drop(output);
        if written != size {
            return Err(Damaged(format!("{name}: expected {size} bytes, got {written}")).into());
        }
        self.end_file(size);
        Ok(written)
    }

    fn extract_zip(&self, primary: &Path, destination: &Path) -> Result<Manifest> {
        let mut archive = zip::ZipArchive::new(io::BufReader::new(open_reader(primary)?)).map_err(zip_error)?;
        let mut manifest = BTreeMap::new();
        for index in 0..archive.len() {
            self.stop.check()?;
            let (name, is_dir, is_link, encrypted) = {
                let raw = archive.by_index_raw(index).map_err(zip_error)?;
                (raw.name().to_string(), raw.is_dir(), raw.is_symlink(), raw.encrypted())
            };
            if is_dir || !wanted_member(&name) {
                continue;
            }
            if is_link {
                log::warn!("Skipping archive link: {name}");
                continue;
            }
            let clean = clean_member_name(&name)?;
            let mut entry = if encrypted {
                archive.by_index_decrypt(index, PASSWORD.as_bytes()).map_err(|e| match e {
                    zip::result::ZipError::InvalidPassword => WrongPassword(name.clone()).into(),
                    other => zip_error(other),
                })?
            } else {
                archive.by_index(index).map_err(zip_error)?
            };
            let size = entry.size();
            self.write_entry(&clean, size, destination, &mut entry)?;
            manifest.insert(clean, size);
        }
        Ok(manifest)
    }

    fn extract_7z(&self, primary: &Path, destination: &Path) -> Result<Manifest> {
        match self.extract_7z_with(primary, destination, sevenz_rust2::Password::empty()) {
            Err(error) if error.is::<NeedsPassword>() => {
                self.extract_7z_with(primary, destination, sevenz_rust2::Password::from(PASSWORD))
            }
            other => other,
        }
    }

    fn extract_7z_with(&self, primary: &Path, destination: &Path, password: sevenz_rust2::Password) -> Result<Manifest> {
        let with_password = !password.is_empty();
        let mut reader = match sevenz_rust2::ArchiveReader::new(open_reader(primary)?, password) {
            Ok(reader) => reader,
            Err(sevenz_rust2::Error::PasswordRequired) if !with_password => return Err(NeedsPassword.into()),
            Err(error) => return Err(seven_error(error)),
        };
        let threads = std::thread::available_parallelism().map(|n| n.get() as u32).unwrap_or(2).clamp(1, 8);
        reader.set_thread_count(threads);
        let mut manifest = BTreeMap::new();
        let mut failure: Option<anyhow::Error> = None;
        let start = self.progress.snapshot();
        let result = reader.for_each_entries(|entry, input| {
            let skip = entry.is_directory || entry.is_anti_item || !wanted_member(&entry.name) || seven_link(entry);
            if skip {
                if seven_link(entry) {
                    log::warn!("Skipping archive link: {}", entry.name);
                }
                // Solid blocks decode in order: read past what is not written.
                io::copy(input, &mut io::sink()).map_err(|e| sevenz_rust2::Error::Io(e, "".into()))?;
                return Ok(!self.stop.is_set());
            }
            let outcome = clean_member_name(&entry.name)
                .and_then(|clean| self.write_entry(&clean, entry.size, destination, input).map(|_| clean));
            match outcome {
                Ok(clean) => {
                    manifest.insert(clean, entry.size);
                    Ok(true)
                }
                Err(error) => {
                    failure = Some(error);
                    Ok(false)
                }
            }
        });
        if let Some(error) = failure {
            if !with_password && is_password_signal(&error) {
                self.progress.update(|p| {
                    p.files_done = start.files_done;
                    p.bytes_done = start.bytes_done;
                });
                return Err(NeedsPassword.into());
            }
            return Err(error);
        }
        self.stop.check()?;
        match result {
            Ok(()) => Ok(manifest),
            Err(sevenz_rust2::Error::PasswordRequired) if !with_password => {
                self.progress.update(|p| {
                    p.files_done = start.files_done;
                    p.bytes_done = start.bytes_done;
                });
                Err(NeedsPassword.into())
            }
            Err(error) => Err(seven_error(error)),
        }
    }

    fn extract_rar(&self, primary: &Path, destination: &Path) -> Result<Manifest> {
        let mut manifest = BTreeMap::new();
        let mut archive = unrar::Archive::with_password(primary, PASSWORD.as_bytes())
            .open_for_processing()
            .map_err(|e| rar_error(e, primary))?;
        loop {
            self.stop.check()?;
            let Some(header) = archive.read_header().map_err(|e| rar_error(e, primary))? else { break };
            let entry = header.entry();
            let name = entry.filename.to_string_lossy().replace('\\', "/");
            let size = entry.unpacked_size;
            let skip = entry.is_directory() || entry.is_split_before() || !wanted_member(&name) || rar_link(entry.file_attr);
            if skip {
                if rar_link(entry.file_attr) {
                    log::warn!("Skipping archive link: {name}");
                }
                archive = header.skip().map_err(|e| rar_error(e, primary))?;
                continue;
            }
            let clean = clean_member_name(&name)?;
            let target = member_path(destination, &clean)?;
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|e| file_error("create folder for", &target, e))?;
            }
            replace_existing(&target);
            self.begin_file(&clean, &target, size);
            // UnRAR writes the file and checks its CRC across volumes.
            archive = header.extract_to(&target).map_err(|e| rar_error(e, primary))?;
            let written = fs::metadata(&target).map(|m| m.len()).unwrap_or(u64::MAX);
            if written != size {
                return Err(Damaged(format!("{clean}: expected {size} bytes, wrote {written}")).into());
            }
            self.end_file(size);
            manifest.insert(clean, size);
        }
        Ok(manifest)
    }
}

/// An earlier attempt may have left this file; write a fresh one.
fn replace_existing(target: &Path) {
    if let Ok(meta) = fs::symlink_metadata(target) {
        if meta.is_file() {
            let _ = crate::util::remove_path(target);
        }
    }
}

#[derive(Debug)]
struct NeedsPassword;
impl std::fmt::Display for NeedsPassword {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("archive is encrypted")
    }
}
impl std::error::Error for NeedsPassword {}

fn is_password_signal(error: &anyhow::Error) -> bool {
    error.to_string().to_lowercase().contains("password")
}

fn seven_link(entry: &sevenz_rust2::ArchiveEntry) -> bool {
    if !entry.has_windows_attributes {
        return false;
    }
    let attributes = entry.windows_attributes;
    let unix_link = attributes & 0x8000 != 0 && ((attributes >> 16) & 0xF000) == 0xA000;
    attributes & 0x400 != 0 || unix_link
}

/// RAR stores Unix modes for archives made on Unix and Windows attributes otherwise.
fn rar_link(attributes: u32) -> bool {
    if attributes & 0xF000 == 0xA000 && attributes & 0x8000 != 0 {
        return true;
    }
    attributes & 0x8000 == 0 && attributes & 0x400 != 0
}

fn file_error(action: &str, path: &Path, error: io::Error) -> anyhow::Error {
    if error.raw_os_error() == Some(112) || error.kind() == io::ErrorKind::StorageFull {
        return anyhow!("Insufficient disk space for extraction while writing {}", path.display());
    }
    anyhow!(
        "Cannot {action} extracted file {}: {error}. Check destination permissions, free disk space, and whether another program has locked the file.",
        path.display()
    )
}

fn io_to_archive(error: io::Error, name: &str) -> anyhow::Error {
    if error.kind() == io::ErrorKind::Interrupted && error.get_ref().map(|e| e.is::<Cancelled>()).unwrap_or(false) {
        return Cancelled.into();
    }
    if error.raw_os_error() == Some(112) || error.kind() == io::ErrorKind::StorageFull {
        return anyhow!("Insufficient disk space for extraction");
    }
    let text = error.to_string();
    let lower = text.to_lowercase();
    if lower.contains("checksum") || lower.contains("crc") || lower.contains("corrupt") || lower.contains("invalid")
        || error.kind() == io::ErrorKind::UnexpectedEof || error.kind() == io::ErrorKind::InvalidData
    {
        return Damaged(format!("{name}: {text}")).into();
    }
    if lower.contains("password") {
        return WrongPassword(name.to_string()).into();
    }
    anyhow!("Extracting {name} failed: {text}")
}

fn zip_error(error: zip::result::ZipError) -> anyhow::Error {
    use zip::result::ZipError;
    match error {
        ZipError::Io(io) => io_to_archive(io, "ZIP archive"),
        ZipError::InvalidArchive(reason) => Damaged(format!("ZIP archive: {reason}")).into(),
        ZipError::UnsupportedArchive(reason) => anyhow!("Unsupported ZIP archive: {reason}"),
        ZipError::InvalidPassword => WrongPassword("ZIP archive".into()).into(),
        other => anyhow!("ZIP archive error: {other}"),
    }
}

fn seven_error(error: sevenz_rust2::Error) -> anyhow::Error {
    use sevenz_rust2::Error as E;
    match error {
        E::ChecksumVerificationFailed | E::NextHeaderCrcMismatch | E::BadSignature(_) => {
            Damaged(format!("7z archive: {error}")).into()
        }
        E::PasswordRequired => WrongPassword("7z archive needs a password".into()).into(),
        E::MaybeBadPassword(io) => {
            let text = io.to_string();
            Damaged(format!("7z archive: {text} (damaged data or wrong password)")).into()
        }
        E::Io(io, _) | E::FileOpen(io, _) => io_to_archive(io, "7z archive"),
        other => anyhow!("7z archive error: {other}"),
    }
}

fn rar_error(error: unrar::error::UnrarError, archive: &Path) -> anyhow::Error {
    use unrar::error::Code;
    let name = display_name(archive);
    match error.code {
        Code::BadData | Code::BadArchive => Damaged(format!(
            "{name}: corrupt data or CRC mismatch. Check that all archive volumes downloaded completely"
        ))
        .into(),
        Code::EOpen => Damaged(format!("{name}: an archive volume is missing or unavailable")).into(),
        Code::UnknownFormat => Damaged(format!("{name}: unknown archive format")).into(),
        Code::MissingPassword | Code::BadPassword => WrongPassword(name).into(),
        Code::ECreate | Code::EWrite => anyhow!(
            "Cannot write extracted files from {name}: check free disk space, permissions and security software"
        ),
        Code::ERead => anyhow!("Cannot read {name}: the drive or security software blocked it"),
        other => anyhow!("Extracting {name} failed (UnRAR {other:?})"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn continuation_names() {
        assert!(!is_continuation("Game.part1.rar"));
        assert!(!is_continuation("Game.part01.rar"));
        assert!(is_continuation("Game.part2.rar"));
        assert!(is_continuation("Game.r00"));
        assert!(!is_continuation("Game.rar"));
        assert!(!is_continuation("Game.7z.001"));
        assert!(is_continuation("Game.7z.002"));
        assert!(is_archive_name("Game.zip.003"));
        assert!(!is_archive_name("readme.txt"));
    }

    #[test]
    fn links() {
        assert!(rar_link(0o120777));
        assert!(!rar_link(0o100644));
        assert!(rar_link(0x400));
        assert!(!rar_link(0x20));
    }

    #[test]
    fn zip_roundtrip() {
        let dir = std::env::temp_dir().join(format!("ascendara-zip-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let archive = dir.join("game.zip");
        {
            let mut writer = zip::ZipWriter::new(File::create(&archive).unwrap());
            let options: zip::write::SimpleFileOptions = Default::default();
            writer.start_file("Game/game.exe", options).unwrap();
            writer.write_all(&vec![7u8; 300_000]).unwrap();
            writer.start_file("Game/link.url", options).unwrap();
            writer.write_all(b"[InternetShortcut]").unwrap();
            writer.finish().unwrap();
        }
        assert_eq!(detect(&archive).unwrap(), Kind::Zip);
        let listing = list(&archive, Kind::Zip).unwrap();
        assert_eq!((listing.files, listing.bytes), (1, 300_000));
        let stop = StopFlag::default();
        let progress = ProgressHandle::default();
        let manifest = Extractor { stop: &stop, progress: &progress }
            .extract(&archive, Kind::Zip, &dir.join("out"))
            .unwrap();
        assert_eq!(manifest.get("Game/game.exe"), Some(&300_000));
        assert!(!dir.join("out/Game/link.url").exists());
        // A damaged copy is reported as damaged, so it gets downloaded again.
        let mut bytes = fs::read(&archive).unwrap();
        bytes[200] ^= 0xff;
        bytes[201] ^= 0xff;
        let broken = dir.join("broken.zip");
        fs::write(&broken, &bytes).unwrap();
        let error = Extractor { stop: &stop, progress: &progress }
            .extract(&broken, Kind::Zip, &dir.join("out2"))
            .unwrap_err();
        assert!(error.chain().any(|c| c.is::<Damaged>()), "{error:#}");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn web_page_is_not_an_archive() {
        let dir = std::env::temp_dir().join(format!("ascendara-detect-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let page = dir.join("game.zip");
        fs::write(&page, b"<!DOCTYPE html><title>Rate limited</title>").unwrap();
        let error = detect(&page).unwrap_err();
        assert!(error.is::<crate::http::ErrorPage>());
        let zeros = dir.join("zeros.rar");
        fs::write(&zeros, vec![0u8; 100_000]).unwrap();
        assert!(detect(&zeros).unwrap_err().is::<Damaged>());
        let _ = fs::remove_dir_all(&dir);
    }
}
