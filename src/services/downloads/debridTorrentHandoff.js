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

// Torrents often use names Windows cannot store ("Game: Edition", "notes."), which made
// the whole handoff fail on every retry. Each folder and file name is made storable here;
// the main process still validates the result.
export const storableFilename = name =>
  typeof name !== "string" || !name
    ? name
    : name
        .replaceAll("\\", "/")
        .split("/")
        .filter(Boolean)
        .map(part => {
          let safe = [...part]
            .map(char => (/[<>:"|?*]/.test(char) || char.charCodeAt(0) < 32 ? "_" : char))
            .join("")
            .replace(/[. ]+$/, "");
          if (!safe || safe === ".") safe = "_";
          if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(safe))
            safe = `_${safe}`;
          // Names the app keeps for its own files
          const lower = safe.toLowerCase();
          if (lower.startsWith(".ascendara")) safe = `_${safe}`;
          if (lower.endsWith(".ascendara.json")) safe = `${safe}_`;
          return safe;
        })
        .join("/");

// Names that only differ after that, or by case, get " (2)", " (3)"... before the extension.
export const storableFiles = files => {
  const used = new Set();
  return files.map(file => {
    const name = storableFilename(file.filename);
    if (typeof name !== "string" || !name) return file;
    const [, stem, extension] = /^(.*?)(\.[^./]*)?$/.exec(name);
    let unique = name;
    for (let copy = 2; used.has(unique.toLowerCase()); copy++)
      unique = `${stem} (${copy})${extension || ""}`;
    used.add(unique.toLowerCase());
    return { ...file, filename: unique };
  });
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
          !entry.cloudTorrentMissing
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
          {
            transferId: `${provider.id}:${id}`,
            files: storableFiles(files),
          },
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
