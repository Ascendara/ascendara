import { requestPartChoice, resolveTorrentParts } from "./debridParts";
import { getTorrentInfo, selectFiles } from "./realDebridService";

const STORAGE_KEY = "realDebridGameData";
const inFlight = new Map();
const readMetadata = () => JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
const startedStates = new Set([
  "queued",
  "downloading",
  "downloaded",
  "compressing",
  "uploading",
]);
const terminalStates = new Set(["magnet_error", "error", "virus", "dead"]);

// Only torrents recorded by Ascendara are eligible for automatic file selection.
// Missing flags in old records are included so previously stuck torrents recover.
export function resumePendingTorrents(apiKey, settings) {
  if (inFlight.has(apiKey)) return inFlight.get(apiKey);
  const task = Promise.resolve()
    .then(async () => {
      const pendingIds = Object.entries(readMetadata())
        .filter(
          ([key, entry]) =>
            key.startsWith("torrent:") && entry && entry.autoStartPending !== false
        )
        .map(([key]) => key.slice("torrent:".length));
      if (!pendingIds.length) return { started: 0 };
      const finished = [];
      let started = 0;
      let failure;
      for (const id of pendingIds) {
        let torrent;
        try {
          // The list endpoint can still report conversion after metadata is ready.
          torrent = await getTorrentInfo(apiKey, id);
        } catch (error) {
          // Deleted from the account: the handoff reports it.
          if (error.status === 404 || error.code === 7) finished.push(id);
          else failure ||= error;
          continue;
        }
        if (torrent?.status === "waiting_files_selection") {
          const files = (torrent.files || []).map(file => ({
            id: file.id,
            name: String(file.path || "").replace(/^\/+/, ""),
            size: file.bytes ?? null,
          }));
          const chosen = resolveTorrentParts(
            files,
            readMetadata()[`torrent:${id}`],
            settings?.debridTorrentParts,
            globalThis.navigator?.language
          );
          if (!chosen) {
            // Stays pending until the user picks its parts.
            requestPartChoice(STORAGE_KEY, `torrent:${id}`, files);
            continue;
          }
          try {
            await selectFiles(
              apiKey,
              id,
              chosen.length === files.length ? "all" : chosen.map(file => file.id)
            );
            started++;
            finished.push(id);
          } catch (error) {
            // Keep failed selections pending, without repeating addMagnet.
            failure ||= error;
          }
        } else if (
          startedStates.has(torrent.status) ||
          terminalStates.has(torrent.status)
        ) {
          finished.push(id);
        }
        // magnet_conversion remains pending until metadata becomes available.
      }
      if (finished.length) {
        // Merge into the latest metadata so concurrent submissions are not lost.
        const latest = readMetadata();
        for (const id of finished) {
          const key = `torrent:${id}`;
          if (latest[key]) latest[key] = { ...latest[key], autoStartPending: false };
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(latest));
      }
      if (failure) throw failure;
      return { started };
    })
    .finally(() => {
      inFlight.delete(apiKey);
    });
  inFlight.set(apiKey, task);
  return task;
}
