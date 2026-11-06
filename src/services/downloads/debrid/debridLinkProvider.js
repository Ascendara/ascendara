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
  removeAfterDoneSetting: "debridLinkRemoveAfterDone",
  seamlessHosts: ["gofile", "pixeldrain", "buzzheavier", "megadb"],
  // No cloud page: torrents being prepared are listed on the local Downloads page.
  hasDownloadsPage: false,
  downloadsPath: "/downloads",
  hostDownloadMode: "direct",
  metadataStorageKey: "debridLinkGameData",
  getCachedSupportedHosts: api.getCachedSupportedHosts,
  getSupportedHosts: api.getSupportedHosts,
  isSupportedUrl: api.isSupportedUrl,
  getTorrentGame: entry => entry,
  async getTorrentStatus(apiKey, id) {
    let torrent;
    try {
      torrent = await api.getTorrent(apiKey, id);
    } catch (error) {
      if (error.code === "badId") return { status: "missing" };
      throw error;
    }
    if (!torrent) return { status: "missing" };
    const files = api.flattenFiles(torrent.files);
    // A file is ready when it reaches 100 percent. Debrid-Link reports no failed state.
    if (files.length && files.every(file => file.downloadPercent === 100))
      return { status: "ready", progress: 100, files };
    return {
      status: torrent.status === 4 ? "downloading" : "queued",
      progress:
        typeof torrent.downloadPercent === "number"
          ? Math.round(torrent.downloadPercent)
          : null,
    };
  },
  async getTorrentDownload(apiKey, id) {
    const state = await this.getTorrentStatus(apiKey, id);
    if (state.status === "missing") return "missing";
    if (state.status !== "ready") return null;
    if (state.files.some(file => !file.downloadUrl))
      throw new Error("Debrid-Link returned an incomplete torrent file list.");
    return state.files.map(file => ({
      url: file.downloadUrl,
      filename: file.path,
      size: file.size ?? null,
    }));
  },
  async removeTorrent(apiKey, id) {
    try {
      await api.deleteTorrent(apiKey, id);
    } catch (error) {
      // Already gone from the account
      if (error.code !== "badId") throw error;
    }
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
