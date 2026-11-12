export function isMagnetLink(value) {
  return typeof value === "string" && value.trim().toLowerCase().startsWith("magnet:");
}

export function isTorrentFileUrl(value) {
  if (typeof value !== "string") return false;
  const link = value.trim();
  if (!link) return false;

  try {
    return new URL(link).pathname.toLowerCase().endsWith(".torrent");
  } catch {
    return /\.torrent(?:[?#]|$)/i.test(link);
  }
}

export function isTorrentLink(value) {
  return isMagnetLink(value) || isTorrentFileUrl(value);
}

export const TORRENT_DISABLED_CODE = "TORRENT_DISABLED";

export function pickTorrentLink(links, { preferMagnet = false } = {}) {
  if (!Array.isArray(links)) return null;

  if (preferMagnet) {
    const magnet = links.find(isMagnetLink);
    if (magnet) return magnet;
  }

  return links.find(isTorrentLink) || null;
}
