import * as api from "../debridLinkService";

export default {
  id: "debridlink",
  name: "Debrid-Link",
  apiKeyUrl: "https://debrid-link.com/webapp/apikey",
  getUserInfo: api.getUserInfo,
  // accountType: 0 free, 1 premium, 2 lifetime (no end date).
  describeAccount: (user, t) => ({
    name: user.username || user.email,
    plan: user.accountType >= 1 ? t("debrid.planPremium") : t("debrid.planFree"),
    expiresAt:
      user.accountType === 1 && user.premiumLeft > 0
        ? Date.now() + user.premiumLeft * 1000
        : null,
    expiryNote: user.accountType === 2 ? t("debrid.lifetime") : null,
    stats: [{ label: t("debrid.points"), value: user.pts ?? 0 }],
  }),
  apiKeySetting: "debridLinkApiKey",
  torrentSetting: "useDebridLinkForTorrents",
  prioritizeSetting: "prioritizeDebridLinkOverSeamless",
  seamlessHosts: ["gofile", "pixeldrain", "buzzheavier", "megadb"],
  // No cloud page: finished torrents move to the local downloads list.
  downloadsPath: "/downloads",
  hostDownloadMode: "direct",
  metadataStorageKey: "debridLinkGameData",
  getCachedSupportedHosts: api.getCachedSupportedHosts,
  getSupportedHosts: api.getSupportedHosts,
  isSupportedUrl: api.isSupportedUrl,
  getTorrentGame: entry => entry,
  async getTorrentDownload(apiKey, id) {
    let torrent;
    try {
      torrent = await api.getTorrent(apiKey, id);
    } catch (error) {
      if (error.code === "badId") return "missing";
      throw error;
    }
    if (!torrent) return "missing";
    const files = api.flattenFiles(torrent.files);
    // A file is ready when it reaches 100 percent.
    if (!files.length || !files.every(file => file.downloadPercent === 100)) return null;
    if (files.some(file => !file.downloadUrl))
      throw new Error("Debrid-Link returned an incomplete torrent file list.");
    return files.map(file => ({
      url: file.downloadUrl,
      filename: file.path,
      size: file.size ?? null,
    }));
  },
  async submitMagnet(link, apiKey) {
    const result = await api.createTorrentFromMagnet(link, apiKey);
    return { id: result.id };
  },
  async resolveHost(link, apiKey) {
    const result = await api.addLink(link, apiKey);
    return { id: result.id || link, status: "ready", url: result.downloadUrl };
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
