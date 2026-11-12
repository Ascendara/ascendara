import { isTorrentLink } from "../downloads/torrentLink";

export function hydraHostKey(uri) {
  if (!uri) return null;
  if (isTorrentLink(uri)) return "torrent";

  try {
    let host = new URL(uri).hostname.toLowerCase();
    if (host.startsWith("www.")) host = host.slice(4);
    if (!host) return null;
    const parts = host.split(".");
    if (parts.length >= 2) return parts[parts.length - 2];
    return host;
  } catch {
    return null;
  }
}
