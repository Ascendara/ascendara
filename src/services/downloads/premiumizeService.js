import {
  createSupportedHostCache,
  isSupportedUrl as matchesSupportedUrl,
} from "./supportedHostCache";

const API_BASE_URL = "/api/premiumize";

export const isSupportedUrl = (link, domains = getCachedSupportedHosts()) =>
  matchesSupportedUrl(link, domains);
export const { getCachedSupportedHosts, getSupportedHosts } = createSupportedHostCache({
  cacheKey: "premiumizeSupportedHosts",
  loadDomains: async () => {
    const response = await fetch(`${API_BASE_URL}/services/list`, {
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(result?.directdl))
      throw new Error("Could not fetch Premiumize hosts.");
    // Only direct-download services: links on the queue list are refused by directdl.
    return result.directdl
      .flatMap(name => [name, ...(result.aliases?.[name] || [])])
      .filter(name => typeof name === "string" && name.includes("."));
  },
});

const INVALID_KEY = "Premiumize API key is invalid or expired. Update it in Settings.";
// The codes a user can act on, from Premiumize's API docs.
const ERROR_MESSAGES = {
  authentication_failed: INVALID_KEY,
  permission_denied: "Premiumize denied this request for your account.",
  rate_limit_reached: "Premiumize is limiting requests. Try again in a minute.",
  service_unsupported: "Premiumize does not support this host.",
  service_down: "This host is temporarily unavailable on Premiumize.",
  service_limit_reached: "You reached your Premiumize limit for this host.",
  link_generation_failed: "Premiumize could not create a download for this link.",
  not_found: "This file is no longer available on Premiumize.",
};

// Premiumize answers most errors with HTTP 200, so the body decides every call.
async function request(apiKey, path, form) {
  if (!apiKey?.trim()) throw new Error("Premiumize API key is missing.");
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
  if (!response.ok || result?.status !== "success") {
    let message = ERROR_MESSAGES[result?.code];
    if (!message && response.status === 401) message = INVALID_KEY;
    const error = new Error(
      message || `Premiumize: ${result?.message || `request failed (${response.status})`}`
    );
    error.code = result?.code;
    error.status = response.status;
    throw error;
  }
  return result;
}

export const getUserInfo = apiKey => request(apiKey, "/account/info");

export async function getDirectDownload(link, apiKey) {
  const url = new URL(link);
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("Invalid download link.");
  const result = await request(apiKey, "/transfer/directdl", { src: url.href });
  const files = (Array.isArray(result.content) ? result.content : []).filter(file =>
    /^https?:\/\//i.test(file?.link || "")
  );
  if (files.length > 1) throw new Error("This Premiumize link holds several files.");
  if (!files.length) throw new Error("Premiumize did not return a download URL.");
  return files[0];
}

export async function createTorrentFromMagnet(magnet, apiKey) {
  if (!/^magnet:\?/i.test(magnet?.trim() || "")) {
    throw new Error("Premiumize requires a magnet link.");
  }
  const result = await request(apiKey, "/transfer/create", { src: magnet.trim() });
  if (!result.id) throw new Error("Premiumize did not return a transfer ID.");
  return result;
}

export async function getTransfer(apiKey, id) {
  const result = await request(apiKey, "/transfer/list");
  const transfers = Array.isArray(result.transfers) ? result.transfers : [];
  return transfers.find(transfer => String(transfer.id) === String(id)) || null;
}

const getFolder = (apiKey, id) =>
  request(apiKey, `/folder/list?id=${encodeURIComponent(id)}`);
const toFile = (entry, folder) => ({
  path: `${folder}${entry.name}`,
  url: entry.link,
  size: entry.size ?? null,
});

// A bad answer (a folder inside itself, or endless nesting) must not loop forever.
const MAX_FOLDER_DEPTH = 32;

async function collectFolder(apiKey, id, folder = "", seen = new Set()) {
  if (seen.has(String(id)))
    throw new Error("Premiumize returned a folder tree that loops.");
  if (folder.split("/").length > MAX_FOLDER_DEPTH)
    throw new Error("Premiumize returned a folder tree that is too deep.");
  seen.add(String(id));
  const { content } = await getFolder(apiKey, id);
  const files = [];
  // One request at a time to stay clear of rate_limit_reached.
  for (const entry of Array.isArray(content) ? content : []) {
    if (entry.type === "folder")
      files.push(
        ...(await collectFolder(apiKey, entry.id, `${folder}${entry.name}/`, seen))
      );
    else if (entry.link) files.push(toFile(entry, folder));
  }
  return files;
}

// Where a finished transfer's content is: its own file, its own folder, or the entry
// with its name in the folder it landed in. Null when that is not certain.
async function findTransferContent(apiKey, transfer) {
  if (transfer.file_id) return { type: "file", id: transfer.file_id };
  if (!transfer.folder_id) return null;
  const folder = await getFolder(apiKey, transfer.folder_id);
  if (folder.name === transfer.name)
    return { type: "folder", id: transfer.folder_id, path: "" };
  const entry = (Array.isArray(folder.content) ? folder.content : []).find(
    item => item.name === transfer.name
  );
  if (!entry) return null;
  return entry.type === "folder"
    ? { type: "folder", id: entry.id, path: `${entry.name}/` }
    : { type: "file", id: entry.id, entry };
}

export async function getTransferFiles(apiKey, transfer) {
  const content = await findTransferContent(apiKey, transfer);
  if (!content) return [];
  if (content.type === "folder") return collectFolder(apiKey, content.id, content.path);
  const item = content.entry?.link
    ? content.entry
    : await request(apiKey, `/item/details?id=${encodeURIComponent(content.id)}`);
  return item.link ? [toFile(item, "")] : [];
}

// Deletes the transfer and, once it finished, the files Premiumize ties to it: its file,
// or its own folder. Never a folder found only by name, and never the root folder.
export async function deleteTransfer(apiKey, transfer) {
  if (["finished", "seeding"].includes(transfer.status)) {
    if (transfer.file_id) {
      await request(apiKey, "/item/delete", { id: transfer.file_id });
    } else if (transfer.folder_id) {
      const [folder, root] = await Promise.all([
        getFolder(apiKey, transfer.folder_id),
        request(apiKey, "/folder/list"),
      ]);
      if (
        folder.name === transfer.name &&
        root.folder_id != null &&
        String(root.folder_id) !== String(transfer.folder_id)
      )
        await request(apiKey, "/folder/delete", { id: transfer.folder_id });
    }
  }
  await request(apiKey, "/transfer/delete", { id: transfer.id });
}
