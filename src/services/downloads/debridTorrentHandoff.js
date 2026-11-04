// One local transfer per cloud torrent, independent of the currently open page.
const inFlight = new Map();
let localStart = Promise.resolve();
let startingUntil = 0;

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
      const entries = Object.entries(read()).filter(
        ([id, entry]) => id.startsWith("torrent:") && entry && !entry.localDownloadStarted
      );
      for (const [id, entry] of entries) {
        const game = provider.getTorrentGame(entry);
        if (!game?.game) continue;
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
        const files = await provider.getTorrentDownload(apiKey, id.slice(8));
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
        const result = await window.electron.downloadFile(
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
        if (!result?.success)
          throw new Error(result?.error || "Could not start the local debrid download.");
        startingUntil = Date.now() + 15000;
        const latest = read();
        if (latest[id]) {
          latest[id] = { ...latest[id], localDownloadStarted: true };
          localStorage.setItem(provider.metadataStorageKey, JSON.stringify(latest));
        }
        return { game: game.game, providerId: provider.id };
      }
    })
    .finally(() => inFlight.delete(key));
  localStart = task;
  inFlight.set(key, task);
  return task;
}
