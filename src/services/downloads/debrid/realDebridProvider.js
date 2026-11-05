import * as api from "../realDebridService";
import * as signIn from "../realDebridSignIn";
import { resumePendingTorrents } from "../realDebridTorrentStartup";

export default {
  id: "realdebrid",
  name: "Real-Debrid",
  apiKeyUrl: "https://real-debrid.com/apitoken",
  signIn: {
    start: signIn.startCodeSignIn,
    poll: signIn.pollCodeSignIn,
    verificationUrl: signIn.VERIFICATION_URL,
    clearedSettings: signIn.CLEARED_SIGN_IN,
    isSignedIn: settings => Boolean(settings.realDebridOauthRefreshToken),
  },
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
  getTorrentGame: entry => entry,
  async getTorrentDownload(apiKey, id) {
    let info;
    try {
      info = await api.getTorrentInfo(apiKey, id);
    } catch (error) {
      if (error.status === 404) return "missing";
      throw error;
    }
    if (info.status !== "downloaded") return null;
    const selected = info.files.filter(file => file.selected);
    if (!selected.length || !info.links?.length)
      throw new Error("Real-Debrid returned an incomplete torrent file list.");
    const files = [];
    const individualFiles = selected.length === info.links.length;
    for (const [index, link] of info.links.entries()) {
      const result = await api.unrestrictLink(link, apiKey);
      // RD can wrap several selected files in one RAR (or split archive links).
      const file = individualFiles ? selected[index] : null;
      const filename = file?.path?.replace(/^\/+/, "") || result.filename;
      if (!filename) throw new Error("Real-Debrid did not name a torrent download.");
      files.push({
        url: result.download,
        filename,
        size: result.filesize ?? file?.bytes ?? null,
      });
    }
    return files;
  },
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
        ...(kind === "torrent" ? { autoStartPending: true, autoHandoff: true } : {}),
      },
    };
  },
};
