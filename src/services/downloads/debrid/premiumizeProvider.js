import * as api from "../premiumizeService";

const premiumUntil = user =>
  Number(user.premium_until) * 1000 > Date.now() ? user.premium_until * 1000 : null;

export default {
  id: "premiumize",
  name: "Premiumize",
  apiKeyUrl: "https://www.premiumize.me/account",
  getUserInfo: api.getUserInfo,
  describeAccount: (user, t) => ({
    name: String(user.customer_id ?? ""),
    plan: premiumUntil(user) ? t("debrid.planPremium") : t("debrid.planFree"),
    expiresAt: premiumUntil(user),
    stats: [],
  }),
  apiKeySetting: "premiumizeApiKey",
  torrentSetting: "usePremiumizeForTorrents",
  prioritizeSetting: "prioritizePremiumizeOverSeamless",
  removeAfterDoneSetting: "premiumizeRemoveAfterDone",
  seamlessHosts: ["gofile", "pixeldrain", "buzzheavier", "megadb"],
  // No cloud page: torrents being prepared are listed on the local Downloads page.
  hasDownloadsPage: false,
  downloadsPath: "/downloads",
  hostDownloadMode: "direct",
  metadataStorageKey: "premiumizeGameData",
  getCachedSupportedHosts: api.getCachedSupportedHosts,
  getSupportedHosts: api.getSupportedHosts,
  isSupportedUrl: api.isSupportedUrl,
  getTorrentGame: entry => entry,
  async getTorrentStatus(apiKey, id) {
    const transfer = await api.getTransfer(apiKey, id);
    if (!transfer) return { status: "missing" };
    if (transfer.status === "error")
      return { status: "failed", message: transfer.message || "error" };
    // A seeding transfer is already complete in the cloud.
    if (["finished", "seeding"].includes(transfer.status))
      return { status: "ready", progress: 100, transfer };
    return {
      status: transfer.status === "running" ? "downloading" : "queued",
      progress:
        typeof transfer.progress === "number"
          ? Math.round(transfer.progress * 100)
          : null,
    };
  },
  async getTorrentDownload(apiKey, id) {
    const state = await this.getTorrentStatus(apiKey, id);
    if (state.status === "missing") return "missing";
    if (state.status === "failed")
      throw new Error(`Premiumize could not download this torrent: ${state.message}`);
    if (state.status !== "ready") return null;
    const files = await api.getTransferFiles(apiKey, state.transfer);
    if (!files.length) throw new Error("Premiumize returned an empty torrent file list.");
    return files.map(file => ({ url: file.url, filename: file.path, size: file.size }));
  },
  async removeTorrent(apiKey, id) {
    const transfer = await api.getTransfer(apiKey, id);
    if (transfer) await api.deleteTransfer(apiKey, transfer);
  },
  async submitMagnet(link, apiKey) {
    const result = await api.createTorrentFromMagnet(link, apiKey);
    return { id: result.id };
  },
  async resolveHost(link, apiKey) {
    const file = await api.getDirectDownload(link, apiKey);
    return { id: link, status: "ready", url: file.link };
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
