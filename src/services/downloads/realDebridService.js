import {
  createSupportedHostCache,
  isSupportedUrl as matchesSupportedUrl,
} from "./supportedHostCache";
import { refreshSignIn } from "./realDebridSignIn";

const API_BASE_URL = "/api/realdebrid";
export const isSupportedUrl = (link, domains = getCachedSupportedHosts()) =>
  matchesSupportedUrl(link, domains);
export const { getCachedSupportedHosts, getSupportedHosts } = createSupportedHostCache({
  cacheKey: "realDebridSupportedHosts",
  loadDomains: async () => {
    const response = await fetch(`${API_BASE_URL}/hosts/domains`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Could not fetch Real-Debrid hosts.");
    return response.json();
  },
});

export const isEnabled = settings => Boolean(settings?.realDebridApiKey?.trim());

const RATE_LIMITED = "Real-Debrid is limiting requests. Try again in a minute.";
// The codes a user can act on, from the error table in Real-Debrid's API docs.
const ERROR_MESSAGES = {
  5: RATE_LIMITED,
  9: "Real-Debrid denied this request for your account.",
  10: "Real-Debrid needs two-factor authentication for this account.",
  11: "Real-Debrid is waiting for two-factor authentication on this account.",
  14: "Your Real-Debrid account is locked.",
  15: "Your Real-Debrid account is not activated.",
  16: "Real-Debrid does not support this host.",
  17: "This host is under maintenance on Real-Debrid.",
  18: "You reached the limit for this host on Real-Debrid.",
  19: "This host is temporarily unavailable on Real-Debrid.",
  20: "This host is not available to free Real-Debrid accounts.",
  21: "Your Real-Debrid account has too many active downloads.",
  22: "Real-Debrid does not allow requests from this IP address.",
  23: "Your Real-Debrid traffic is used up.",
  24: "This file is no longer available on Real-Debrid.",
  25: "Real-Debrid is temporarily unavailable.",
  28: "Real-Debrid does not allow this file.",
  29: "This torrent is too big for Real-Debrid.",
  30: "Real-Debrid could not read this torrent.",
  33: "This torrent is already active on Real-Debrid.",
  34: RATE_LIMITED,
  35: "Real-Debrid blocked this file as infringing.",
  36: "You reached Real-Debrid's fair usage limit.",
};

const errorMessage = (status, result) => {
  // A 403 with code 8 is also a bad token.
  if (status === 401 || result?.error_code === 8)
    return "Real-Debrid API key is invalid or expired. Update it in Settings.";
  if (ERROR_MESSAGES[result?.error_code]) return ERROR_MESSAGES[result.error_code];
  if (status === 429) return RATE_LIMITED;
  return `Real-Debrid: ${result?.error || `request failed (${status})`}`;
};

async function request(apiKey, path, method = "GET", data, canRefresh = true) {
  if (!apiKey?.trim()) throw new Error("Real-Debrid API key is missing.");
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      ...(data ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    ...(data ? { body: new URLSearchParams(data) } : {}),
    signal: AbortSignal.timeout(30000),
  });
  if (response.status === 204 || response.status === 202) return null;
  const result = await response.json().catch(() => null);
  if (canRefresh && (response.status === 401 || result?.error_code === 8)) {
    const refreshed = await refreshSignIn(apiKey.trim());
    if (refreshed) return request(refreshed, path, method, data, false);
  }
  if (!response.ok || result?.error) {
    const error = new Error(errorMessage(response.status, result));
    error.code = result?.error_code;
    error.status = response.status;
    throw error;
  }
  return result;
}

export const getUserInfo = apiKey => request(apiKey, "/user");
export const getTorrentInfo = (apiKey, id) =>
  request(apiKey, `/torrents/info/${encodeURIComponent(id)}`);
export const selectFiles = (apiKey, id) =>
  request(apiKey, `/torrents/selectFiles/${encodeURIComponent(id)}`, "POST", {
    files: "all",
  });

export async function createTorrentFromMagnet(magnet, apiKey) {
  if (!/^magnet:\?/i.test(magnet?.trim() || "")) {
    throw new Error("Real-Debrid requires a magnet link.");
  }
  const result = await request(apiKey, "/torrents/addMagnet", "POST", {
    magnet: magnet.trim(),
  });
  if (!result?.id) throw new Error("Real-Debrid did not return a torrent ID.");
  // Metadata may still be downloading; the adapter's startup task selects files once ready.
  return result;
}

export async function unrestrictLink(link, apiKey) {
  const url = new URL(link);
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("Invalid download link.");
  const result = await request(apiKey, "/unrestrict/link", "POST", { link: url.href });
  if (!result?.download || !/^https?:\/\//i.test(result.download)) {
    throw new Error("Real-Debrid did not return a download URL.");
  }
  return result;
}

const list = async (apiKey, path, limit = 100) => {
  const items = [];
  for (let page = 1; ; page++) {
    const batch = await request(apiKey, `${path}?limit=${limit}&page=${page}`);
    if (!Array.isArray(batch)) throw new Error("Invalid Real-Debrid download list.");
    items.push(...batch);
    if (batch.length < limit) return items;
  }
};

export const getTorrents = apiKey => list(apiKey, "/torrents", 1000);

export async function getAllDownloads(apiKey) {
  const [torrents, downloads] = await Promise.all([
    getTorrents(apiKey),
    list(apiKey, "/downloads"),
  ]);
  const activeStates = new Set([
    "magnet_conversion",
    "waiting_files_selection",
    "queued",
    "downloading",
    "compressing",
    "uploading",
  ]);
  const currentTorrents = await Promise.all(
    torrents.map(async item => {
      if (!activeStates.has(item.status)) return item;
      try {
        return { ...item, ...(await getTorrentInfo(apiKey, item.id)) };
      } catch {
        return item;
      }
    })
  );
  return [
    ...currentTorrents.map(item => ({ ...item, type: "torrent" })),
    ...downloads.map(item => ({ ...item, type: "download" })),
  ];
}

export const deleteDownload = (apiKey, item) =>
  request(
    apiKey,
    `/${item.type === "torrent" ? "torrents" : "downloads"}/delete/${encodeURIComponent(item.id)}`,
    "DELETE"
  );
