import { isPendingTorrent, readRecords, updateRecord } from "./debridRecords";

// One local transfer per cloud torrent, independent of the currently open page.
const inFlight = new Map();
let localStart = Promise.resolve();
let startingUntil = 0;
// A torrent that could not start waits before its links are requested again.
const HANDOFF_RETRY_MS = 5 * 60 * 1000;
const handoffFailures = new Map();
// A cloud torrent with no progress for this long is reported once and no longer polled.
const STALL_MS = 72 * 60 * 60 * 1000;
// Services that ask for gentler polling than the 5-second pass set pollIntervalMs.
const lastPolled = new Map();

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
      const update = (id, fields) => updateRecord(provider, id, fields);
      const mark = (id, flag) => update(id, { [flag]: true });
      // Stalled and failed torrents wait in the Downloads list for the user to remove.
      const entries = Object.entries(readRecords(provider.metadataStorageKey)).filter(
        ([id, entry]) =>
          isPendingTorrent(id, entry) &&
          !entry.cloudTorrentStalled &&
          !entry.cloudTorrentFailed
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
        if (provider.pollIntervalMs) {
          if (Date.now() - (lastPolled.get(retryKey) || 0) < provider.pollIntervalMs)
            continue;
          lastPolled.set(retryKey, Date.now());
        }
        let files;
        try {
          files = await provider.getTorrentDownload(apiKey, id.slice(8));
        } catch (error) {
          // A torrent the service gave up on is reported once, then left for Remove.
          if (error.terminal) {
            mark(id, "cloudTorrentFailed");
            fail(
              retryKey,
              new Error(
                `${game.game}: ${error.message} Remove it from Downloads or try another source.`
              )
            );
          } else fail(retryKey, error);
          continue;
        }
        // Removed from the cloud: stop polling it.
        if (files === "missing") {
          mark(id, "cloudTorrentMissing");
          continue;
        }
        if (!files) {
          // Progress is checked when first seen, then once per stall window.
          const since = entry.lastProgressAt;
          if (
            provider.getTorrentStatus &&
            (since == null || Date.now() - since >= STALL_MS)
          ) {
            const state = await provider
              .getTorrentStatus(apiKey, id.slice(8))
              .catch(() => null);
            if (!state) continue;
            const progress = state.progress ?? -1;
            if (since == null || progress > (entry.lastProgress ?? -1)) {
              update(id, { lastProgress: progress, lastProgressAt: Date.now() });
            } else {
              mark(id, "cloudTorrentStalled");
              fail(
                retryKey,
                new Error(
                  `${provider.name} made no progress on ${game.game} for 3 days. Remove it from Downloads or try another source.`
                )
              );
            }
          }
          continue;
        }
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
        update(id, { localDownloadStarted: true, localDownloadStartedAt: Date.now() });
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
// A game still downloading, stopped or failed keeps its cloud copy; one deleted locally
// keeps it for good.
const CLEANUP_INTERVAL_MS = 60 * 1000;
// A new download's game folder appears a moment after the handoff starts it.
const APPEAR_MS = 10 * 60 * 1000;
const lastCleanup = new Map();

export async function removeFinishedTorrents(provider, apiKey) {
  if (!provider.removeTorrent || !globalThis.window?.electron?.getGames) return;
  // Reading the game list touches every game folder: at most once a minute per service.
  if (Date.now() - (lastCleanup.get(provider.id) || 0) < CLEANUP_INTERVAL_MS) return;
  lastCleanup.set(provider.id, Date.now());
  const finished = Object.entries(readRecords(provider.metadataStorageKey)).filter(
    ([id, entry]) =>
      id.startsWith("torrent:") &&
      entry?.localDownloadStarted &&
      !entry.cloudTorrentCleaned &&
      !entry.cloudTorrentKept
  );
  if (!finished.length) return;
  const games = await window.electron.getGames();
  for (const [id, entry] of finished) {
    const name = provider.getTorrentGame(entry)?.game;
    const game = games.find(item => item.game === name);
    if (!game) {
      if (Date.now() - (entry.localDownloadStartedAt || 0) > APPEAR_MS)
        updateRecord(provider, id, { cloudTorrentKept: true });
      continue;
    }
    if (game.downloadingData) continue;
    try {
      await provider.removeTorrent(apiKey, id.slice(8));
    } catch (error) {
      console.warn(
        `[Debrid] Could not remove a finished ${provider.name} torrent:`,
        error.message
      );
      continue;
    }
    updateRecord(provider, id, { cloudTorrentCleaned: true });
  }
}
