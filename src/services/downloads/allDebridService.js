import {
  createSupportedHostCache,
  isSupportedUrl as matchesSupportedUrl,
} from "./supportedHostCache";

const API_BASE_URL = "/api/alldebrid";
// AllDebrid asks for at least 5 seconds between delayed link checks.
const DELAYED_POLL_MS = 5000;
const DELAYED_POLL_TRIES = 24;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export const isSupportedUrl = (link, domains = getCachedSupportedHosts()) =>
  matchesSupportedUrl(link, domains);
export const { getCachedSupportedHosts, getSupportedHosts } = createSupportedHostCache({
  cacheKey: "allDebridSupportedHosts",
  loadDomains: async () => {
    const response = await fetch(`${API_BASE_URL}/v4/hosts/domains`, {
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.status !== "success")
      throw new Error("Could not fetch AllDebrid hosts.");
    return result.data?.hosts;
  },
});

const INVALID_KEY = "AllDebrid API key is invalid or expired. Update it in Settings.";
const RATE_LIMITED = "AllDebrid is limiting requests. Try again in a minute.";
const PREMIUM_ONLY = "This needs a premium AllDebrid account.";
// The codes a user can act on, from the error list in AllDebrid's API docs.
const ERROR_MESSAGES = {
  AUTH_MISSING_APIKEY: INVALID_KEY,
  AUTH_BAD_APIKEY: INVALID_KEY,
  AUTH_BLOCKED:
    "AllDebrid blocked this location. Confirm it from the email AllDebrid sent you.",
  AUTH_USER_BANNED: "Your AllDebrid account is banned.",
  NO_SERVER: "AllDebrid does not allow requests from servers or VPNs.",
  MUST_BE_PREMIUM: PREMIUM_ONLY,
  LINK_HOST_NOT_SUPPORTED: "AllDebrid does not support this host.",
  LINK_DOWN: "This file is no longer available on its host.",
  LINK_HOST_UNAVAILABLE: "This host is temporarily unavailable on AllDebrid.",
  LINK_TOO_MANY_DOWNLOADS:
    "You have too many active downloads for this host on AllDebrid.",
  LINK_HOST_FULL: "AllDebrid's servers for this host are full. Try again later.",
  LINK_HOST_LIMIT_REACHED: "You reached your AllDebrid limit for this host.",
  MAGNET_MUST_BE_PREMIUM: PREMIUM_ONLY,
  MAGNET_INVALID_URI: "AllDebrid could not read this magnet link.",
  MAGNET_TOO_MANY_ACTIVE: "Your AllDebrid account has too many active torrents.",
};

const apiError = (status, error) => {
  let message = ERROR_MESSAGES[error?.code];
  if (!message && status === 401) message = INVALID_KEY;
  if (!message && (status === 429 || status === 503)) message = RATE_LIMITED;
  const result = new Error(
    message || `AllDebrid: ${error?.message || `request failed (${status})`}`
  );
  result.code = error?.code;
  result.status = status;
  return result;
};

// AllDebrid answers most errors with HTTP 200, so the body decides every call.
async function request(apiKey, path, form) {
  if (!apiKey?.trim()) throw new Error("AllDebrid API key is missing.");
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: form ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    ...(form ? { body: new URLSearchParams(form) } : {}),
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.status !== "success")
    throw apiError(response.status, result?.error);
  return result.data ?? {};
}

export async function getUserInfo(apiKey) {
  const data = await request(apiKey, "/v4/user");
  if (!data.user) throw new Error("AllDebrid did not return account details.");
  return data.user;
}

export async function unlockLink(link, apiKey, wait = sleep) {
  const url = new URL(link);
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("Invalid download link.");
  const data = await request(apiKey, "/v4/link/unlock", { link: url.href });
  let download = data.link;
  // Some hosts need time: AllDebrid hands back an id to check until the link is ready.
  for (let tries = 0; !download && data.delayed && tries < DELAYED_POLL_TRIES; tries++) {
    await wait(DELAYED_POLL_MS);
    const state = await request(apiKey, "/v4/link/delayed", { id: data.delayed });
    if (state.status === 3) throw new Error("AllDebrid could not prepare this download.");
    if (state.status === 2) download = state.link;
  }
  if (!download || !/^https?:\/\//i.test(download))
    throw new Error("AllDebrid did not return a download URL.");
  return { ...data, link: download };
}

export async function createTorrentFromMagnet(magnet, apiKey) {
  if (!/^magnet:\?/i.test(magnet?.trim() || "")) {
    throw new Error("AllDebrid requires a magnet link.");
  }
  const data = await request(apiKey, "/v4/magnet/upload", [["magnets[]", magnet.trim()]]);
  const [added] = Array.isArray(data.magnets) ? data.magnets : [];
  if (added?.error) throw apiError(200, added.error);
  if (!added?.id) throw new Error("AllDebrid did not return a torrent ID.");
  return added;
}

export async function getMagnetStatus(apiKey, id) {
  const data = await request(apiKey, "/v4.1/magnet/status", { id });
  return (Array.isArray(data.magnets) ? data.magnets[0] : data.magnets) || null;
}

// Folders carry their children in `e`, files carry their link in `l`.
export const flattenFiles = (nodes, folder = "") =>
  (Array.isArray(nodes) ? nodes : []).flatMap(node =>
    node.e
      ? flattenFiles(node.e, `${folder}${node.n}/`)
      : node.l
        ? [{ path: `${folder}${node.n}`, size: node.s ?? null, link: node.l }]
        : []
  );

export async function getMagnetFiles(apiKey, id) {
  const data = await request(apiKey, "/v4/magnet/files", [["id[]", id]]);
  const entry = (Array.isArray(data.magnets) ? data.magnets : []).find(
    item => String(item.id) === String(id)
  );
  if (entry?.error) throw apiError(200, entry.error);
  if (!entry) throw new Error("AllDebrid did not return the torrent's files.");
  return flattenFiles(entry.files);
}
