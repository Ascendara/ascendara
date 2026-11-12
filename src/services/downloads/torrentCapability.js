import { canUseCloudTorrents } from "./debridService";
import { isMagnetLink, isTorrentFileUrl, isTorrentLink } from "./torrentLink";

export function localTorrentEnabled(settings) {
  return settings?.torrentEnabled === true;
}

export function canDownloadTorrentLinks(links, settings) {
  if (!Array.isArray(links)) return false;

  return (
    (localTorrentEnabled(settings) && links.some(isTorrentLink)) ||
    (canUseCloudTorrents(settings) && links.some(isMagnetLink))
  );
}

export function isSourceMetaTorrentOnly(source) {
  const options = Array.isArray(source?.topDownloadOption)
    ? source.topDownloadOption
    : null;
  if (!options || options.length === 0) return false;

  return options.every(
    option => String(option?.name || "").toLowerCase() === "torrent"
  );
}

export function analyzeTorrentSource(games) {
  if (!Array.isArray(games) || games.length === 0) {
    return {
      known: false,
      torrentOnly: false,
      hasMagnet: false,
      hasTorrentFile: false,
      cloudCompatible: false,
    };
  }

  let linkedGames = 0;
  let torrentGames = 0;
  let cloudCoveredTorrentGames = 0;
  let hasMagnet = false;
  let hasTorrentFile = false;
  let hasNonTorrentLinks = false;

  for (const game of games) {
    const links = game?.download_links;
    if (!links || typeof links !== "object") continue;

    const torrentLinks = Array.isArray(links.torrent)
      ? links.torrent.filter(isTorrentLink)
      : [];
    const nonTorrentLinks = Object.entries(links).some(
      ([provider, values]) =>
        provider !== "torrent" &&
        Array.isArray(values) &&
        values.some(value => typeof value === "string" && value.trim())
    );

    if (torrentLinks.length === 0 && !nonTorrentLinks) continue;
    linkedGames++;

    if (nonTorrentLinks) hasNonTorrentLinks = true;
    if (torrentLinks.length === 0) continue;

    torrentGames++;
    const gameHasMagnet = torrentLinks.some(isMagnetLink);
    if (gameHasMagnet) {
      hasMagnet = true;
      cloudCoveredTorrentGames++;
    }
    if (torrentLinks.some(isTorrentFileUrl)) hasTorrentFile = true;
  }

  return {
    known: linkedGames > 0,
    torrentOnly:
      linkedGames > 0 &&
      torrentGames === linkedGames &&
      !hasNonTorrentLinks,
    hasMagnet,
    hasTorrentFile,
    cloudCompatible:
      torrentGames > 0 && cloudCoveredTorrentGames === torrentGames,
  };
}

export function withTorrentSourceCapabilities(source, games) {
  const analysis = analyzeTorrentSource(games);
  if (!analysis.known) {
    return {
      ...source,
      torrentOnly:
        source?.torrentOnly === true || isSourceMetaTorrentOnly(source) || undefined,
    };
  }

  const torrentOnly = analysis.torrentOnly;
  return {
    ...source,
    torrentOnly: torrentOnly || undefined,
    torrentSupport: torrentOnly
      ? {
          hasMagnet: analysis.hasMagnet,
          hasTorrentFile: analysis.hasTorrentFile,
          cloudCompatible: analysis.cloudCompatible,
        }
      : null,
  };
}

export function canUseTorrentOnlySource(
  source,
  settings,
  { allowUnknownCloud = false } = {}
) {
  if (!source?.torrentOnly) return true;
  if (localTorrentEnabled(settings)) return true;
  if (!canUseCloudTorrents(settings)) return false;

  if (!source?.torrentSupport) {
    // Browsing must be able to select a metadata-only source long enough to sync
    // and inspect its links. Persisted/saved sources are stricter: without a
    // summary we cannot assume a magnet-only cloud route is sufficient.
    return allowUnknownCloud;
  }

  return source.torrentSupport.cloudCompatible === true;
}

export function wouldDisableActiveTorrentSource(currentSettings, nextSettings) {
  const source =
    currentSettings?.customSourcesMode === true ? currentSettings.customSource : null;
  if (!source?.torrentOnly) return false;

  return (
    canUseTorrentOnlySource(source, currentSettings) &&
    !canUseTorrentOnlySource(source, nextSettings)
  );
}
