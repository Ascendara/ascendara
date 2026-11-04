import {
  createSupportedHostCache,
  isSupportedUrl as matchesSupportedUrl,
} from "./supportedHostCache";

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

async function request(apiKey, path, method = "GET", data) {
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
  if (!response.ok || result?.error) {
    const error = new Error(
      response.status === 401
        ? "Real-Debrid API key is invalid or expired. Update it in Settings."
        : `Real-Debrid: ${result?.error || `request failed (${response.status})`}`
    );
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
