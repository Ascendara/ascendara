import {
  createSupportedHostCache,
  isSupportedUrl as matchesSupportedUrl,
} from "./supportedHostCache";

const API_BASE_URL = "/api/debridlink";
const PROCESSING_POLL_MS = 5000;
const PROCESSING_POLL_TRIES = 24;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export const isSupportedUrl = (link, domains = getCachedSupportedHosts()) =>
  matchesSupportedUrl(link, domains);
export const { getCachedSupportedHosts, getSupportedHosts } = createSupportedHostCache({
  cacheKey: "debridLinkSupportedHosts",
  // Short, because offline hosts are left out of the list.
  ttl: 15 * 60 * 1000,
  loadDomains: async () => {
    const response = await fetch(
      `${API_BASE_URL}/downloader/hosts?types=host&keys=domains,status`,
      {
        signal: AbortSignal.timeout(10000),
      }
    );
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.success !== true || !Array.isArray(result.value))
      throw new Error("Could not fetch Debrid-Link hosts.");
    // A host is online when its status is 1 or more: offline ones go to another service.
    return result.value
      .filter(host => !(host?.status < 1))
      .flatMap(host => (Array.isArray(host?.domains) ? host.domains : []));
  },
});

const INVALID_KEY = "Debrid-Link API key is invalid or expired. Update it in Settings.";
const HOST_LIMIT = "You reached your Debrid-Link limit for this host today.";
const FILE_GONE = "This file is no longer available on its host.";
// The codes a user can act on, from Debrid-Link's API error list.
const ERROR_MESSAGES = {
  badToken: INVALID_KEY,
  unverifiedEmail: "Confirm your email address with Debrid-Link first.",
  floodDetected: "Debrid-Link is limiting requests. Try again later.",
  hostNotValid: "Debrid-Link does not support this host.",
  notDebrid: "Debrid-Link cannot unlock this link right now.",
  notFreeHost: "This host needs a premium Debrid-Link account.",
  maintenanceHost: "This host is under maintenance on Debrid-Link.",
  maxLink: HOST_LIMIT,
  maxLinkHost: HOST_LIMIT,
  maxData: HOST_LIMIT,
  maxDataHost: HOST_LIMIT,
  fileNotFound: FILE_GONE,
  fileNotAvailable: FILE_GONE,
  maxTorrent: "You reached Debrid-Link's limit of new torrents for today.",
  maxTransfer: "Your Debrid-Link account has too many active torrents.",
  torrentTooBig: "This torrent is too big for Debrid-Link.",
};

async function request(apiKey, path, form, method = form ? "POST" : "GET") {
  if (!apiKey?.trim()) throw new Error("Debrid-Link API key is missing.");
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    ...(form ? { body: new URLSearchParams(form) } : {}),
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.success !== true) {
    let message = ERROR_MESSAGES[result?.error];
    if (!message && response.status === 401) message = INVALID_KEY;
    const error = new Error(
      message ||
        `Debrid-Link: ${result?.error_description || result?.error || `request failed (${response.status})`}`
    );
    error.code = result?.error;
    error.status = response.status;
    throw error;
  }
  return result.value;
}

export async function getUserInfo(apiKey) {
  const user = await request(apiKey, "/account/infos");
  if (!user) throw new Error("Debrid-Link did not return account details.");
  return user;
}

export async function addLink(link, apiKey, wait = sleep) {
  const url = new URL(link);
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("Invalid download link.");
  let added = await request(apiKey, "/downloader/add", { url: url.href });
  // A folder link answers with one entry per file.
  if (Array.isArray(added)) {
    if (added.length > 1) throw new Error("This Debrid-Link link holds several files.");
    [added] = added;
  }
  // Debrid-Link asks clients to wait while a link is processing (or has no URL yet).
  for (
    let tries = 0;
    added?.id &&
    (added.isProcessing || !added.downloadUrl) &&
    tries < PROCESSING_POLL_TRIES;
    tries++
  ) {
    await wait(PROCESSING_POLL_MS);
    const [state] = await request(
      apiKey,
      `/downloader/list?ids=${encodeURIComponent(added.id)}`
    );
    if (state) added = state;
  }
  if (added?.isProcessing)
    throw new Error("Debrid-Link is still preparing this file. Try again later.");
  if (!/^https?:\/\//i.test(added?.downloadUrl || ""))
    throw new Error("Debrid-Link did not return a download URL.");
  return added;
}

export async function createTorrentFromMagnet(magnet, apiKey) {
  if (!/^magnet:\?/i.test(magnet?.trim() || "")) {
    throw new Error("Debrid-Link requires a magnet link.");
  }
  const torrent = await request(apiKey, "/seedbox/add", { url: magnet.trim() });
  if (!torrent?.id) throw new Error("Debrid-Link did not return a torrent ID.");
  return torrent;
}

// Folders hold their children in `files`; a file's path keeps its folders.
export const flattenFiles = (items, folder = "") =>
  (Array.isArray(items) ? items : []).flatMap(item =>
    item.type === "folder"
      ? flattenFiles(item.files, `${folder}${item.name}/`)
      : [{ ...item, path: `${folder}${item.name}` }]
  );

export async function getTorrent(apiKey, id) {
  const torrents = await request(
    apiKey,
    `/seedbox/list?ids=${encodeURIComponent(id)}&structureType=tree`
  );
  return (
    (Array.isArray(torrents) ? torrents : []).find(
      torrent => String(torrent.id) === String(id)
    ) || null
  );
}

export const deleteTorrent = (apiKey, id) =>
  request(apiKey, `/seedbox/${encodeURIComponent(id)}/remove`, null, "DELETE");
