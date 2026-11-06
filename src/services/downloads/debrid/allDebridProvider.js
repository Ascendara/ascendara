import * as api from "../allDebridService";
import * as signIn from "../allDebridSignIn";

export default {
  id: "alldebrid",
  name: "AllDebrid",
  apiKeyUrl: "https://alldebrid.com/apikeys/",
  docsUrl: "https://ascendara.app/docs/downloads/alldebrid",
  signIn: {
    start: signIn.startCodeSignIn,
    poll: signIn.pollCodeSignIn,
    verificationUrl: signIn.VERIFICATION_URL,
    clearedSettings: signIn.CLEARED_SIGN_IN,
    isSignedIn: settings => settings.allDebridSignedIn === true,
    // The PIN yields a plain API key: there is no login to renew.
    signedInText: "debrid.signIn.signedInKey",
  },
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
  removeAfterDoneSetting: "allDebridRemoveAfterDone",
  seamlessHosts: ["gofile", "pixeldrain", "buzzheavier", "megadb"],
  // No cloud page: torrents being prepared are listed on the local Downloads page.
  hasDownloadsPage: false,
  // Torrents take minutes to hours in the cloud; no need to ask every 5 seconds.
  pollIntervalMs: 30 * 1000,
  downloadsPath: "/downloads",
  hostDownloadMode: "direct",
  metadataStorageKey: "allDebridGameData",
  getCachedSupportedHosts: api.getCachedSupportedHosts,
  getSupportedHosts: api.getSupportedHosts,
  isSupportedUrl: api.isSupportedUrl,
  getTorrentGame: entry => entry,
  async getTorrentStatus(apiKey, id) {
    let magnet;
    try {
      magnet = await api.getMagnetStatus(apiKey, id);
    } catch (error) {
      if (error.code === "MAGNET_INVALID_ID") return { status: "missing" };
      throw error;
    }
    if (!magnet) return { status: "missing" };
    // 0-3 are queued to uploading, 4 is ready, 5 and up are failures.
    if (magnet.statusCode >= 5) return { status: "failed", message: magnet.status };
    if (magnet.statusCode === 4)
      return { status: "ready", progress: 100, files: magnet.files };
    return {
      status: magnet.statusCode === 0 ? "queued" : "downloading",
      progress:
        magnet.size > 0 ? Math.round((100 * magnet.downloaded) / magnet.size) : null,
    };
  },
  async getTorrentDownload(apiKey, id) {
    const state = await this.getTorrentStatus(apiKey, id);
    if (state.status === "missing") return "missing";
    if (state.status === "failed")
      // Final: the handoff reports it once instead of retrying.
      throw Object.assign(
        new Error(`AllDebrid could not download this torrent (${state.message}).`),
        { terminal: true }
      );
    if (state.status !== "ready") return null;
    // The status of one magnet usually carries its file tree already.
    const files = state.files
      ? api.flattenFiles(state.files)
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
  async removeTorrent(apiKey, id) {
    try {
      await api.deleteMagnet(apiKey, id);
    } catch (error) {
      // Already gone from the account
      if (error.code !== "MAGNET_INVALID_ID") throw error;
    }
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
