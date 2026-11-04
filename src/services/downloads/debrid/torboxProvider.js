import * as api from "../torboxService";

export default {
  id: "torbox",
  name: "TorBox",
  apiKeyUrl: "https://ascendara.app/docs/features/torbox-integration",
  getUserInfo: api.getUserInfo,
  apiKeySetting: "torboxApiKey",
  torrentSetting: "useTorboxForTorrents",
  prioritizeSetting: "prioritizeTorboxOverSeamless",
  torrentFallbackSetting: "fallbackToQbittorrentOnTorboxFailure",
  seamlessHosts: ["gofile", "pixeldrain", "buzzheavier"],
  downloadsPath: "/torboxdownloads",
  hostDownloadMode: "cloud",
  metadataStorageKey: "torboxGameNames",
  getCachedSupportedHosts: api.getCachedSupportedHosts,
  getSupportedHosts: api.getSupportedHosts,
  isSupportedUrl: api.isSupportedUrl,
  async submitMagnet(link, apiKey, game) {
    const result = await api.createTorrentFromMagnet(link, apiKey, game.game);
    if (result.torrentId == null) throw new Error("TorBox did not return a torrent ID.");
    return { id: result.torrentId };
  },
  async resolveHost(link, apiKey) {
    const result = await api.getDirectDownloadLinkFromUrl(link, apiKey);
    return {
      id: result.webdownloadId,
      status: result.status,
      url: result.url || null,
      details: result.item,
    };
  },
  serializeMetadata({ result, kind, link, host, game, directory }) {
    const data = {
      name: game.game,
      timestamp: Date.now(),
      imgUrl: game.imgID || null,
      provider: host,
      originalUrl: link,
      downloadId: result.id,
      ...(kind === "torrent" ? { torboxType: "torrent" } : {}),
      gameData: {
        ...game,
        vr: game.category?.includes("Virtual Reality") || false,
        additionalDirIndex: directory,
      },
      files: result.details?.files || [],
      status: result.status || "unknown",
      size: result.details?.size || game.size || "",
    };
    const key = kind === "torrent" ? `torrent:${result.id}` : result.id;
    return { [link]: data, [key]: data };
  },
};
