function isMagnetLink(value) {
  return typeof value === "string" && value.trim().toLowerCase().startsWith("magnet:");
}

function isTorrentFileUrl(value) {
  if (typeof value !== "string") return false;
  const link = value.trim();
  if (!link) return false;

  try {
    return new URL(link).pathname.toLowerCase().endsWith(".torrent");
  } catch {
    return /\.torrent(?:[?#]|$)/i.test(link);
  }
}

function isTorrentLink(value) {
  return isMagnetLink(value) || isTorrentFileUrl(value);
}

const TORRENT_DISABLED_CODE = "TORRENT_DISABLED";
const TORRENT_DISABLED_MESSAGE =
  "Local torrenting is disabled. Enable torrenting in Settings to continue.";

function canStartLocalTorrent(settings, value) {
  return !isTorrentLink(value) || settings?.torrentEnabled === true;
}

function assertLocalTorrentEnabled(settings, value) {
  if (canStartLocalTorrent(settings, value)) return;

  const error = new Error(TORRENT_DISABLED_MESSAGE);
  error.code = TORRENT_DISABLED_CODE;
  throw error;
}

module.exports = {
  TORRENT_DISABLED_CODE,
  TORRENT_DISABLED_MESSAGE,
  isMagnetLink,
  isTorrentFileUrl,
  isTorrentLink,
  canStartLocalTorrent,
  assertLocalTorrentEnabled,
};
