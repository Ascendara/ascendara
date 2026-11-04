import * as api from "../realDebridService";
import { resumePendingTorrents } from "../realDebridTorrentStartup";

export default {
  id: "realdebrid",
  name: "Real-Debrid",
  apiKeyUrl: "https://real-debrid.com/apitoken",
  getUserInfo: api.getUserInfo,
  apiKeySetting: "realDebridApiKey",
  torrentSetting: "useRealDebridForTorrents",
  prioritizeSetting: "prioritizeRealDebridOverSeamless",
  seamlessHosts: ["gofile", "pixeldrain", "buzzheavier", "megadb"],
  downloadsPath: "/realdebriddownloads",
  hostDownloadMode: "direct",
  metadataStorageKey: "realDebridGameData",
  getCachedSupportedHosts: api.getCachedSupportedHosts,
  getSupportedHosts: api.getSupportedHosts,
  isSupportedUrl: api.isSupportedUrl,
  resumePendingTorrents,
  async submitMagnet(link, apiKey) {
    const result = await api.createTorrentFromMagnet(link, apiKey);
    return { id: result.id };
  },
  async resolveHost(link, apiKey) {
    const result = await api.unrestrictLink(link, apiKey);
    return { id: result.id, status: "ready", url: result.download };
  },
  serializeMetadata({ result, kind, game, directory }) {
    return {
      [`${kind}:${result.id}`]: {
        ...game,
        additionalDirIndex: directory,
        ...(kind === "torrent" ? { autoStartPending: true } : {}),
      },
    };
  },
};
