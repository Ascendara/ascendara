//! Turning the links the app hands over into file URLs: direct links, file host
//! pages (Pixeldrain, Buzzheavier) and GoFile folders.

use crate::state::StopFlag;
use anyhow::{anyhow, bail, Context, Result};
use percent_encoding::percent_decode_str;
use regex::Regex;
use reqwest::Client;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::time::Duration;
use url::Url;

pub fn validate_url(url: &str) -> Result<Url> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        bail!("No download link was provided. Refresh the game source or choose another download link.");
    }
    let parsed = Url::parse(trimmed)
        .map_err(|_| anyhow!("The download link is invalid. Refresh the game source or choose another download link."))?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
        bail!("The download link is invalid. Refresh the game source or choose another download link.");
    }
    Ok(parsed)
}

pub fn host_of(url: &str) -> String {
    Url::parse(url).ok().and_then(|u| u.host_str().map(str::to_lowercase)).unwrap_or_default()
}

fn host_matches(host: &str, domains: &[&str]) -> bool {
    domains.iter().any(|d| host == *d || host.ends_with(&format!(".{d}")))
}

pub const BUZZHEAVIER_DOMAINS: [&str; 7] =
    ["buzzheavier.com", "bzzhr.co", "bzzhr.to", "ts.bzzhr.to", "fafda.to", "fuckingfast.net", "fuckingfast.co"];

pub fn is_buzzheavier(url: &str) -> bool {
    host_matches(&host_of(url), &BUZZHEAVIER_DOMAINS)
}

pub fn is_gofile(url: &str) -> bool {
    matches!(host_of(url).as_str(), "gofile.io" | "www.gofile.io")
}

/// A file host's viewer page link, turned into the link that serves the file.
pub fn resolve_share_url(url: &str) -> (String, Option<String>) {
    if let Ok(parsed) = Url::parse(url) {
        let host = parsed.host_str().unwrap_or("").to_lowercase();
        if matches!(host.as_str(), "pixeldrain.com" | "www.pixeldrain.com") {
            let re = Regex::new(r"^/(?:u|api/file)/([A-Za-z0-9]+)/?$").unwrap();
            if let Some(id) = re.captures(parsed.path()).map(|c| c[1].to_string()) {
                return (format!("https://pixeldrain.com/api/file/{id}?download"), Some(id));
            }
        }
    }
    (url.to_string(), None)
}

/// Pixeldrain publishes a SHA-256 for every file.
pub async fn pixeldrain_hash(client: &Client, id: &str) -> Option<String> {
    let info: Value = client
        .get(format!("https://pixeldrain.com/api/file/{id}/info"))
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .ok()?
        .json()
        .await
        .ok()?;
    info.get("hash_sha256").and_then(Value::as_str).filter(|h| h.len() == 64).map(str::to_string)
}

fn filename_from_disposition(value: &str) -> Option<String> {
    let extended = Regex::new(r#"(?i)filename\*\s*=\s*(?:UTF-8|utf-8)?''([^;\r\n]+)"#).unwrap();
    if let Some(captures) = extended.captures(value) {
        return Some(percent_decode_str(captures[1].trim().trim_matches('"')).decode_utf8_lossy().into_owned());
    }
    let plain = Regex::new(r#"(?i)filename\s*=\s*"?([^";\r\n]+)"?"#).unwrap();
    plain.captures(value).map(|c| c[1].trim().to_string())
}

/// File name from the response headers, then the URL path.
pub async fn discover_filename(client: &Client, url: &str, fallback: &str) -> String {
    let from_path = Url::parse(url)
        .ok()
        .and_then(|u| u.path_segments().and_then(|mut s| s.next_back().map(str::to_string)))
        .map(|s| percent_decode_str(&s).decode_utf8_lossy().into_owned())
        .unwrap_or_default();
    let mut name = from_path;
    // A one-byte ranged GET: HEAD is refused or answered differently by some hosts.
    if let Ok(Ok(response)) = tokio::time::timeout(
        Duration::from_secs(15),
        client.get(url).header("Range", "bytes=0-0").send(),
    )
    .await
    {
        if let Some(found) = response
            .headers()
            .get("content-disposition")
            .and_then(|v| v.to_str().ok())
            .and_then(filename_from_disposition)
        {
            name = found;
        }
    }
    crate::util::safe_file_name(&name, fallback)
}

// ---------------------------------------------------------------- Buzzheavier

pub struct Resolved {
    pub url: String,
    pub filename: Option<String>,
    pub referer: Option<String>,
}

pub async fn resolve_buzzheavier(client: &Client, url: &str) -> Result<Resolved> {
    let parsed = Url::parse(url)?;
    let parts: Vec<&str> = parsed.path().trim_matches('/').split('/').collect();
    // Pre-signed links (https://ts.bzzhr.to/d/{id}?v=...) serve the file directly.
    if parts.len() >= 2 && parts[0] == "d" && parsed.query().is_some() {
        return Ok(Resolved { url: url.to_string(), filename: None, referer: None });
    }
    let page = client
        .get(url)
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .header("Accept-Language", "en-US,en;q=0.9")
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .context("Could not open the Buzzheavier page")?;
    match page.status().as_u16() {
        403 | 429 => bail!(
            "Buzzheavier blocked the request (HTTP {}). The host may be rate limiting you; try again later or with a VPN.",
            page.status().as_u16()
        ),
        404 => bail!("Buzzheavier file not found (HTTP 404). The link may have expired or been removed."),
        status if status >= 400 => bail!("Buzzheavier returned HTTP {status}"),
        _ => {}
    }
    let html = page.text().await?;
    let title = Regex::new(r"(?is)<title[^>]*>(.*?)</title>")
        .unwrap()
        .captures(&html)
        .map(|c| c[1].trim().to_string())
        .filter(|t| !t.is_empty());
    let token = Regex::new(r#"hx-get="[^"]+/download\?t=([^"&]+)"#)
        .unwrap()
        .captures(&html)
        .map(|c| c[1].to_string())
        .ok_or_else(|| anyhow!("Could not find download token in page. Buzzheavier may have changed their site."))?;
    let host = parsed.host_str().unwrap_or_default();
    let id = parts.last().copied().unwrap_or_default();
    let response = client
        .head(format!("https://{host}/{id}/download?t={token}"))
        .header("hx-current-url", url)
        .header("hx-request", "true")
        .header("referer", url)
        .timeout(Duration::from_secs(30))
        .send()
        .await?;
    let redirect = response
        .headers()
        .get("hx-redirect")
        .and_then(|v| v.to_str().ok())
        .map(str::to_string)
        .ok_or_else(|| anyhow!("Buzzheavier did not return a download link (HTTP {})", response.status().as_u16()))?;
    if redirect.trim_end_matches('/') == url.trim_end_matches('/') {
        bail!("Buzzheavier returned a redirect loop");
    }
    let final_url = if redirect.starts_with('/') { format!("https://{host}{redirect}") } else { redirect };
    Ok(Resolved { url: final_url, filename: title, referer: Some(url.to_string()) })
}

// ---------------------------------------------------------------- GoFile

#[derive(Clone, Debug)]
pub struct RemoteFile {
    pub id: String,
    pub filename: String,
    pub url: String,
    pub size: Option<u64>,
    pub md5: Option<String>,
}

pub fn gofile_content_id(url: &str) -> Result<String> {
    let normalized = if url.starts_with("//") {
        format!("https:{url}")
    } else if !url.contains("://") {
        format!("https://{url}")
    } else {
        url.to_string()
    };
    let parsed = Url::parse(&normalized).map_err(|_| anyhow!("Expected a GOFile sharing URL: https://gofile.io/d/CONTENT_ID"))?;
    let re = Regex::new(r"^/d/([A-Za-z0-9_-]+)/?$").unwrap();
    match (parsed.scheme(), parsed.host_str(), re.captures(parsed.path())) {
        ("https", Some("gofile.io" | "www.gofile.io"), Some(captures)) => Ok(captures[1].to_string()),
        _ => bail!("Expected a GOFile sharing URL: https://gofile.io/d/CONTENT_ID"),
    }
}

pub struct Gofile {
    client: Client,
    user_agent: String,
    token: Option<String>,
    secret: String,
    stop: StopFlag,
}

impl Gofile {
    pub fn new(client: Client, stop: StopFlag) -> Self {
        Gofile {
            client,
            user_agent: std::env::var("GF_USERAGENT").unwrap_or_else(|_| crate::http::USER_AGENT.to_string()),
            token: None,
            secret: String::new(),
            stop,
        }
    }

    pub fn token(&self) -> Option<&str> {
        self.token.as_deref()
    }

    fn website_token(&self) -> String {
        let slot = chrono::Utc::now().timestamp() / 14400;
        let raw = format!("{}::en-US::{}::{}::{}", self.user_agent, self.token.as_deref().unwrap_or(""), slot, self.secret);
        hex::encode(Sha256::digest(raw.as_bytes()))
    }

    async fn request(&self, method: reqwest::Method, path: &str, query: &[(&str, String)]) -> Result<Value> {
        let mut last = None;
        for attempt in 0..5u32 {
            self.stop.check()?;
            let mut request = self
                .client
                .request(method.clone(), format!("https://api.gofile.io/{path}"))
                .header("User-Agent", &self.user_agent)
                .header("Accept", "*/*")
                .header("Origin", "https://gofile.io")
                .header("Referer", "https://gofile.io/")
                .header("X-Website-Token", self.website_token())
                .header("X-BL", "en-US")
                .query(query)
                .timeout(Duration::from_secs(30));
            if let Some(token) = &self.token {
                request = request.bearer_auth(token);
            }
            let outcome: Result<Value> = async {
                let response = request.send().await?;
                let status = response.status().as_u16();
                if status == 429 {
                    bail!(GofileBusy);
                }
                if status >= 500 || status == 408 {
                    bail!("GOFile returned HTTP {status}");
                }
                if status >= 400 {
                    bail!(GofileFatal(format!("Unable to fetch GOFile content information (HTTP {status}). Refresh the source or try again later.")));
                }
                let payload: Value = response.json().await?;
                match payload.get("status").and_then(Value::as_str) {
                    Some("ok") => payload
                        .get("data")
                        .filter(|d| d.is_object())
                        .cloned()
                        .ok_or_else(|| anyhow!(GofileFatal("GOFile returned invalid content information".into()))),
                    Some("error-rateLimit") => bail!(GofileBusy),
                    Some(other) => {
                        let message = match other {
                            "error-passwordRequired" => "This GOFile folder requires a password.".to_string(),
                            "error-passwordWrong" => "The GOFile folder password is incorrect.".to_string(),
                            "error-notFound" => "GOFile content was removed or could not be found.".to_string(),
                            "error-notPublic" => "GOFile content is not publicly accessible.".to_string(),
                            other => format!("GOFile could not provide the content ({other})"),
                        };
                        bail!(GofileFatal(message))
                    }
                    None => bail!(GofileFatal("GOFile returned invalid content information".into())),
                }
            }
            .await;
            match outcome {
                Ok(data) => return Ok(data),
                Err(error) if error.is::<GofileFatal>() => return Err(error),
                Err(error) => {
                    let busy = error.is::<GofileBusy>();
                    let wait = if busy { 30 * (attempt as u64 + 1) } else { 1 << attempt };
                    log::warn!("GOFile request retry {} in {wait}s ({error})", attempt + 1);
                    last = Some((error, busy));
                    self.stop.sleep_async(Duration::from_secs(wait)).await?;
                }
            }
        }
        match last {
            Some((_, true)) => bail!("GOFile rate limit persisted after retries. Please try again later."),
            Some((error, _)) => Err(error.context("Unable to fetch GOFile content information. Refresh the source or try again later.")),
            None => bail!("GOFile request failed"),
        }
    }

    pub async fn resolve(&mut self, url: &str, password: Option<&str>) -> Result<Vec<RemoteFile>> {
        let root = gofile_content_id(url)?;
        self.secret = match self
            .client
            .get("https://api.ascendara.app/app/json/gofilesecret")
            .timeout(Duration::from_secs(5))
            .send()
            .await
        {
            Ok(response) => response
                .json::<Value>()
                .await
                .ok()
                .and_then(|v| v.get("secret").and_then(Value::as_str).map(str::to_string))
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "f4s58gs6".into()),
            Err(_) => "f4s58gs6".into(),
        };
        let account = self.request(reqwest::Method::POST, "accounts", &[]).await?;
        self.token = account.get("token").and_then(Value::as_str).map(str::to_string);
        if self.token.is_none() {
            bail!("GOFile did not issue an account token");
        }
        let mut query = vec![
            ("cache", "true".to_string()),
            ("sortField", "createTime".to_string()),
            ("sortDirection", "1".to_string()),
        ];
        if let Some(password) = password {
            query.push(("password", hex::encode(Sha256::digest(password.as_bytes()))));
        }
        let mut pending = vec![root];
        let mut visited = std::collections::HashSet::new();
        let mut files: Vec<RemoteFile> = Vec::new();
        let mut names = std::collections::HashMap::new();
        while let Some(id) = pending.pop() {
            if !visited.insert(id.clone()) {
                continue;
            }
            let data = self.request(reqwest::Method::GET, &format!("contents/{id}"), &query).await?;
            let nodes: Vec<(String, Value)> = if data.get("type").and_then(Value::as_str) == Some("folder") {
                let children = data
                    .get("children")
                    .and_then(Value::as_object)
                    .ok_or_else(|| anyhow!("GOFile folder listing is unavailable or incomplete"))?;
                let count = data.get("childrenCount").and_then(Value::as_u64).unwrap_or(children.len() as u64);
                if count as usize > children.len() {
                    bail!("GOFile returned an incomplete folder listing; no files were installed");
                }
                children.iter().map(|(k, v)| (k.clone(), v.clone())).collect()
            } else {
                vec![(id.clone(), data.clone())]
            };
            for (key, mut node) in nodes {
                let file_id = node.get("id").and_then(Value::as_str).map(str::to_string).unwrap_or(key);
                match node.get("type").and_then(Value::as_str) {
                    Some("folder") => {
                        pending.push(file_id);
                        continue;
                    }
                    Some("file") => {}
                    _ => bail!("GOFile returned an unsupported content type"),
                }
                if node.get("link").and_then(Value::as_str).is_none() {
                    node = self.request(reqwest::Method::GET, &format!("contents/{file_id}"), &query).await?;
                }
                let name = node.get("name").and_then(Value::as_str).map(str::to_string);
                let link = node.get("link").and_then(Value::as_str).map(str::to_string);
                let (Some(name), Some(link)) = (name, link) else {
                    bail!("GOFile did not provide a filename and download link");
                };
                if name.contains('/') || name.contains('\\') {
                    bail!("GOFile returned a filename containing a directory separator");
                }
                let previous = names.entry(name.to_lowercase()).or_insert_with(|| file_id.clone());
                if *previous != file_id {
                    bail!("GOFile folders contain duplicate filenames: {name}");
                }
                let parsed = Url::parse(&link).map_err(|_| anyhow!("GOFile returned an invalid download URL"))?;
                if parsed.scheme() != "https" || !parsed.username().is_empty() || parsed.password().is_some() {
                    bail!("GOFile returned an invalid download URL");
                }
                files.push(RemoteFile {
                    id: file_id,
                    filename: name,
                    url: link,
                    size: node.get("size").and_then(Value::as_u64),
                    md5: node.get("md5").and_then(Value::as_str).filter(|m| m.len() == 32).map(str::to_string),
                });
            }
        }
        if files.is_empty() {
            bail!("no_files_error: GOFile folder contains no downloadable files");
        }
        Ok(files)
    }
}

/// Cookie that authenticates file downloads. It is limited to GOFile domains,
/// so external CDNs never receive the token.
pub fn gofile_cookie_jar(token: &str) -> std::sync::Arc<reqwest::cookie::Jar> {
    let jar = reqwest::cookie::Jar::default();
    let url = Url::parse("https://gofile.io/").unwrap();
    jar.add_cookie_str(&format!("accountToken={token}; Domain=.gofile.io; Path=/; Secure"), &url);
    std::sync::Arc::new(jar)
}

#[derive(Debug)]
struct GofileBusy;
impl std::fmt::Display for GofileBusy {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("GOFile rate limit reached")
    }
}
impl std::error::Error for GofileBusy {}

#[derive(Debug)]
struct GofileFatal(String);
impl std::fmt::Display for GofileFatal {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}
impl std::error::Error for GofileFatal {}

/// The cloud-torrent file list the app writes for debrid transfers.
pub fn read_file_list(path: &std::path::Path) -> Result<(String, Vec<RemoteFile>)> {
    let plan: Value = serde_json::from_slice(&std::fs::read(path)?)?;
    let transfer = plan.get("transferId").map(|v| match v {
        Value::String(s) => s.clone(),
        other => other.to_string(),
    });
    let items = plan.get("files").and_then(Value::as_array).ok_or_else(|| anyhow!("Invalid torrent file list"))?;
    if items.is_empty() || items.len() > 10000 {
        bail!("Invalid torrent file list");
    }
    let mut files = Vec::new();
    for (index, item) in items.iter().enumerate() {
        let filename = item.get("filename").and_then(Value::as_str).ok_or_else(|| anyhow!("Invalid torrent file list"))?;
        let url = item.get("url").and_then(Value::as_str).ok_or_else(|| anyhow!("Invalid torrent file list"))?;
        validate_url(url)?;
        let size = match item.get("size") {
            None | Some(Value::Null) => None,
            Some(value) => Some(value.as_u64().ok_or_else(|| anyhow!("Invalid torrent file size"))?),
        };
        files.push(RemoteFile {
            id: format!("{index}:{filename}"),
            filename: filename.replace('\\', "/"),
            url: url.to_string(),
            size,
            md5: None,
        });
    }
    Ok((transfer.unwrap_or_default(), files))
}

pub fn receipt_identity(file: &RemoteFile) -> Value {
    json!({"id": file.id, "filename": file.filename, "size": file.size, "md5": file.md5})
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn share_links() {
        assert_eq!(
            resolve_share_url("https://pixeldrain.com/u/abc123").0,
            "https://pixeldrain.com/api/file/abc123?download"
        );
        assert_eq!(resolve_share_url("https://example.com/a.rar").0, "https://example.com/a.rar");
        assert!(is_buzzheavier("https://ts.bzzhr.to/d/x?v=1"));
        assert!(is_buzzheavier("https://buzzheavier.com/abc"));
        assert!(!is_buzzheavier("https://notbuzzheavier.com/abc"));
        assert_eq!(gofile_content_id("https://gofile.io/d/AbC-1").unwrap(), "AbC-1");
        assert!(gofile_content_id("https://evil.io/d/AbC").is_err());
    }

    #[test]
    fn dispositions() {
        assert_eq!(filename_from_disposition("attachment; filename=\"Game.rar\"").unwrap(), "Game.rar");
        assert_eq!(filename_from_disposition("attachment; filename*=UTF-8''My%20Game.zip").unwrap(), "My Game.zip");
    }
}
