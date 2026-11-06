import * as api from "../allDebridService";

export default {
  id: "alldebrid",
  name: "AllDebrid",
  apiKeyUrl: "https://alldebrid.com/apikeys/",
  getUserInfo: api.getUserInfo,
  describeAccount: (user, t) => ({
    name: user.username || user.email,
    plan: user.isPremium ? t("debrid.planPremium") : t("debrid.planFree"),
    expiresAt: user.isPremium && user.premiumUntil > 0 ? user.premiumUntil * 1000 : null,
    stats: [{ label: t("debrid.points"), value: user.fidelityPoints ?? 0 }],
  }),
  apiKeySetting: "allDebridApiKey",
  torrentSetting: "useAllDebridForTorrents",
  prioritizeSetting: "prioritizeAllDebridOverSeamless",
  seamlessHosts: ["gofile", "pixeldrain", "buzzheavier", "megadb"],
  // No cloud page: finished torrents move to the local downloads list.
  downloadsPath: "/downloads",
  hostDownloadMode: "direct",
  metadataStorageKey: "allDebridGameData",
  getCachedSupportedHosts: api.getCachedSupportedHosts,
  getSupportedHosts: api.getSupportedHosts,
  isSupportedUrl: api.isSupportedUrl,
  getTorrentGame: entry => entry,
  async getTorrentDownload(apiKey, id) {
    let magnet;
    try {
      magnet = await api.getMagnetStatus(apiKey, id);
    } catch (error) {
      if (error.code === "MAGNET_INVALID_ID") return "missing";
      throw error;
    }
    if (!magnet) return "missing";
    // 0-3 are queued to uploading, 4 is ready, 5 and up are failures.
    if (magnet.statusCode >= 5)
      throw new Error(`AllDebrid could not download this torrent: ${magnet.status}`);
    if (magnet.statusCode !== 4) return null;
    const files = magnet.files
      ? api.flattenFiles(magnet.files)
      : await api.getMagnetFiles(apiKey, id);
    if (!files.length) throw new Error("AllDebrid returned an empty torrent file list.");
    const downloads = [];
    for (const file of files) {
      const result = await api.unlockLink(file.link, apiKey);
      downloads.push({
        url: result.link,
        filename: file.path || result.filename,
        size: result.filesize ?? file.size,
      });
    }
    return downloads;
  },
  async submitMagnet(link, apiKey) {
    const result = await api.createTorrentFromMagnet(link, apiKey);
    return { id: result.id };
  },
  async resolveHost(link, apiKey) {
    const result = await api.unlockLink(link, apiKey);
    return { id: result.id || link, status: "ready", url: result.link };
  },
  // Only torrents are read back (by the handoff); host links start right away.
  serializeMetadata({ result, kind, game, directory }) {
    if (kind !== "torrent") return {};
    return {
      [`torrent:${result.id}`]: {
        ...game,
        additionalDirIndex: directory,
        autoHandoff: true,
      },
    };
  },
};
