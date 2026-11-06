// One local transfer per cloud torrent, independent of the currently open page.
const inFlight = new Map();
let localStart = Promise.resolve();
let startingUntil = 0;
// A torrent that could not start waits before its links are requested again.
const HANDOFF_RETRY_MS = 5 * 60 * 1000;
const handoffFailures = new Map();

const startLocalDownload = async (...args) => {
  try {
    return await window.electron.downloadFile(...args);
  } catch (error) {
    return { error: error.message };
  }
};

export function handoffTorrents(provider, apiKey) {
  if (!globalThis.window?.electron?.downloadFile || !provider.getTorrentDownload)
    return Promise.resolve();
  const key = `${provider.id}:${apiKey}`;
  if (inFlight.has(key)) return inFlight.get(key);
  const task = localStart
    .catch(() => {})
    .then(async () => {
      // The child process needs a moment to publish its first game metadata.
      if (Date.now() < startingUntil) return;
      const read = () =>
        JSON.parse(localStorage.getItem(provider.metadataStorageKey) || "{}");
      const mark = (id, flag) => {
        const latest = read();
        if (!latest[id]) return;
        latest[id] = { ...latest[id], [flag]: true };
        localStorage.setItem(provider.metadataStorageKey, JSON.stringify(latest));
      };
      // Only torrents added since auto-handoff existed; older records were handled manually.
      const entries = Object.entries(read()).filter(
        ([id, entry]) =>
          id.startsWith("torrent:") &&
          entry?.autoHandoff === true &&
          !entry.localDownloadStarted &&
          !entry.cloudTorrentMissing &&
          !entry.cloudTorrentRemoved
      );
      let failure;
      const fail = (retryKey, error) => {
        handoffFailures.set(retryKey, { error, retryAt: Date.now() + HANDOFF_RETRY_MS });
        failure ??= error;
      };
      for (const [id, entry] of entries) {
        const game = provider.getTorrentGame(entry);
        if (!game?.game) continue;
        const retryKey = `${provider.id}:${id}`;
        const previous = handoffFailures.get(retryKey);
        if (previous && Date.now() < previous.retryAt) {
          failure ??= previous.error;
          continue;
        }
        // Wait for the current local transfer; cloud preparation can continue meanwhile.
        const games = await window.electron.getGames();
        if (
          games.some(item => {
            const data = item.downloadingData;
            return (
              data &&
              !data.error &&
              !data.stopped &&
              (data.downloading || data.extracting || data.verifying || data.updating)
            );
          })
        )
          return;
        let files;
        try {
          files = await provider.getTorrentDownload(apiKey, id.slice(8));
        } catch (error) {
          fail(retryKey, error);
          continue;
        }
        // Removed from the cloud: stop polling it.
        if (files === "missing") {
          mark(id, "cloudTorrentMissing");
          continue;
        }
        if (!files) continue;
        if (window.electron.getSettings) {
          const current = await window.electron.getSettings();
          if (
            current.debridEnabled !== true ||
            current.debridProviderEnabled?.[provider.id] === false ||
            current[provider.apiKeySetting]?.trim() !== apiKey ||
            current[provider.torrentSetting] === false
          )
            return;
        }
        const result = await startLocalDownload(
          { transferId: `${provider.id}:${id}`, files },
          game.game,
          game.online || false,
          game.dlc || false,
          game.vr || game.category?.includes("Virtual Reality") || false,
          game.isUpdating || false,
          game.version || "",
          game.imgID,
          game.size || "",
          game.additionalDirIndex || 0,
          game.gameID || "",
          true
        );
        if (!result?.success) {
          fail(
            retryKey,
            new Error(result?.error || "Could not start the local debrid download.")
          );
          continue;
        }
        handoffFailures.delete(retryKey);
        startingUntil = Date.now() + 15000;
        mark(id, "localDownloadStarted");
        return { game: game.game, providerId: provider.id };
      }
      if (failure) throw failure;
    })
    .finally(() => inFlight.delete(key));
  localStart = task;
  inFlight.set(key, task);
  return task;
}

// Opt-in: once a torrent's game is on this PC, delete the torrent from the service.
// A game still downloading, stopped, failed or deleted locally keeps its cloud copy.
export async function removeFinishedTorrents(provider, apiKey) {
  if (!provider.removeTorrent || !globalThis.window?.electron?.getGames) return;
  const read = () =>
    JSON.parse(localStorage.getItem(provider.metadataStorageKey) || "{}");
  const finished = Object.entries(read()).filter(
    ([id, entry]) =>
      id.startsWith("torrent:") &&
      entry?.localDownloadStarted &&
      !entry.cloudTorrentCleaned
  );
  if (!finished.length) return;
  const games = await window.electron.getGames();
  for (const [id, entry] of finished) {
    const name = provider.getTorrentGame(entry)?.game;
    const game = games.find(item => item.game === name);
    if (!game || game.downloadingData) continue;
    try {
      await provider.removeTorrent(apiKey, id.slice(8));
    } catch (error) {
      console.warn(
        `[Debrid] Could not remove a finished ${provider.name} torrent:`,
        error.message
      );
      continue;
    }
    const latest = read();
    if (!latest[id]) continue;
    latest[id] = { ...latest[id], cloudTorrentCleaned: true };
    localStorage.setItem(provider.metadataStorageKey, JSON.stringify(latest));
  }
}
