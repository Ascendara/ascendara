/**
 * Community Index Module
 * Syncs the shared game list and loads covers on demand
 */

const fs = require("fs-extra");
const path = require("path");

const GAMES_URL = "https://api.ascendara.app/json/v2/games";
const COVERS_URL = "https://r2.ascendara.app/covers";
const GAMES_FILE = "ascendara_games.json";
const SYNC_STATE_FILE = "sync.json";
const IMG_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_COVER_DOWNLOADS = 12;
// Covers fetched ahead of time after a sync, so the pages people open first
// aren't blank: the most popular games plus the most recently updated ones.
const PREFETCH_POPULAR = 300;
const PREFETCH_RECENT = 100;
const PREFETCH_CONCURRENCY = 5;

let activeSync = null;
let activeSyncPath = null;
let activeSyncForced = false;
const pendingCovers = new Map(); // imgID -> Promise<boolean>
// A 404 from the bucket is never cached and is billed as a read, so remember
// misses for the session instead of asking again.
const missingCovers = new Set();
let activeCoverDownloads = 0;
const coverQueue = [];
let activePrefetch = null;

async function readSyncState(indexPath) {
  try {
    return await fs.readJson(path.join(indexPath, SYNC_STATE_FILE));
  } catch (e) {
    return {};
  }
}

async function writeProgress(indexPath) {
  await fs.writeJson(
    path.join(indexPath, "progress.json"),
    {
      status: "completed",
      phase: "done",
      progress: 1,
      lastSuccessfulTimestamp: Math.floor(Date.now() / 1000),
    },
    { spaces: 2 }
  );
}

/**
 * Remove covers that the current game list no longer references
 */
async function pruneCovers(indexPath, games) {
  const imgsDir = path.join(indexPath, "imgs");
  if (!(await fs.pathExists(imgsDir))) return;

  const referenced = new Set(games.map(game => String(game.imgID)));
  const files = await fs.readdir(imgsDir);
  for (const file of files) {
    if (!referenced.has(path.parse(file).name)) {
      await fs.remove(path.join(imgsDir, file)).catch(() => {});
    }
  }
}

/**
 * Remove files the old zip-based index download could leave behind
 */
async function removeLegacyFiles(indexPath) {
  for (const name of ["downloaded_index.zip", "shared_index.zip", "imgs_backup"]) {
    await fs.remove(path.join(indexPath, name)).catch(() => {});
  }
}

async function runSync(indexPath, force, blacklist) {
  await fs.ensureDir(indexPath);
  const gamesPath = path.join(indexPath, GAMES_FILE);
  const statePath = path.join(indexPath, SYNC_STATE_FILE);
  const state = await readSyncState(indexPath);
  const localStat = await fs.stat(gamesPath).catch(() => null);

  // Only trust the saved ETag if the game list is still the file we wrote.
  // A manual scrape replaces it, and then the lists have to be compared.
  const untouched = localStat && state.etag && state.mtimeMs === localStat.mtimeMs;
  const headers = !force && untouched ? { "If-None-Match": state.etag } : {};

  const response = await fetch(GAMES_URL, {
    headers,
    signal: AbortSignal.timeout(60000),
  });

  if (response.status === 304) {
    await writeProgress(indexPath);
    return { updated: false };
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch game list: ${response.status}`);
  }

  let text = await response.text();
  const data = JSON.parse(text);
  if (!Array.isArray(data?.games) || data.games.length === 0) {
    throw new Error("Game list is empty");
  }

  // The shared list has every game, so apply the user's blacklist here
  const blocked = new Set(blacklist);
  if (data.games.some(game => blocked.has(game.gameID))) {
    data.games = data.games.filter(game => !blocked.has(game.gameID));
    text = JSON.stringify(data);
  }
  const etag = response.headers.get("etag");

  // Don't replace a manual scrape that is newer than the shared list
  const sharedDate = Date.parse(data.metadata?.lastUpdated);
  if (!force && localStat && !untouched && !(sharedDate > localStat.mtimeMs)) {
    await fs.writeJson(statePath, { etag, mtimeMs: localStat.mtimeMs });
    return { updated: false };
  }

  const tempPath = `${gamesPath}.tmp`;
  await fs.writeFile(tempPath, text);
  await fs.move(tempPath, gamesPath, { overwrite: true });
  const { mtimeMs } = await fs.stat(gamesPath);
  await fs.writeJson(statePath, { etag, mtimeMs });

  await pruneCovers(indexPath, data.games);
  await removeLegacyFiles(indexPath);
  missingCovers.clear();
  await writeProgress(indexPath);

  return { updated: true, games: data.games.length };
}

/**
 * Bring the local game list up to date with the shared one
 * @param {string} indexPath - Path to the local index directory
 * @param {object} options - force: replace the local list even if it is unchanged or newer;
 *   blacklist: gameIDs to leave out
 * @returns {Promise<{updated: boolean, games?: number}>}
 */
function syncCommunityIndex(indexPath, { force = false, blacklist = [] } = {}) {
  if (activeSync) {
    if (activeSyncPath === indexPath && (!force || activeSyncForced)) return activeSync;
    // A repair must not inherit a non-forced sync (or another folder's result).
    return activeSync
      .catch(() => {})
      .then(() => syncCommunityIndex(indexPath, { force, blacklist }));
  }
  activeSyncPath = indexPath;
  activeSyncForced = force;
  activeSync = runSync(indexPath, force, blacklist).finally(() => {
    activeSync = null;
    activeSyncPath = null;
    activeSyncForced = false;
  });
  return activeSync;
}

function acquireCoverSlot() {
  if (activeCoverDownloads < MAX_COVER_DOWNLOADS) {
    activeCoverDownloads++;
    return Promise.resolve();
  }
  return new Promise(resolve => coverQueue.push(resolve));
}

function releaseCoverSlot() {
  // Newest request first: it's the one most likely still on screen
  const next = coverQueue.pop();
  if (next) {
    next();
  } else {
    activeCoverDownloads--;
  }
}

async function downloadCover(imgID, coverPath, { background = false } = {}) {
  // Background fetches have their own small pool and never hold up visible covers
  if (!background) await acquireCoverSlot();
  try {
    const response = await fetch(`${COVERS_URL}/${imgID}.jpg`, {
      signal: AbortSignal.timeout(30000),
    });
    if (response.status === 404) {
      missingCovers.add(imgID);
      return false;
    }
    if (!response.ok) return false;

    const buffer = Buffer.from(await response.arrayBuffer());
    const tempPath = `${coverPath}.tmp`;
    await fs.outputFile(tempPath, buffer);
    await fs.move(tempPath, coverPath, { overwrite: true });
    return true;
  } catch (e) {
    console.error(`Failed to download cover ${imgID}:`, e.message);
    return false;
  } finally {
    if (!background) releaseCoverSlot();
  }
}

async function runPrefetch(indexPath) {
  const data = await fs.readJson(path.join(indexPath, GAMES_FILE));
  const games = (data.games || []).filter(game => IMG_ID_PATTERN.test(game.imgID || ""));

  const popular = [...games]
    .sort((a, b) => (parseInt(b.weight, 10) || 0) - (parseInt(a.weight, 10) || 0))
    .slice(0, PREFETCH_POPULAR);
  const recent = [...games]
    .sort((a, b) =>
      String(b.latest_update || "").localeCompare(String(a.latest_update || ""))
    )
    .slice(0, PREFETCH_RECENT);
  const queue = [...new Set([...popular, ...recent].map(game => game.imgID))];

  const worker = async () => {
    for (let imgID = queue.shift(); imgID; imgID = queue.shift()) {
      const coverPath = path.join(indexPath, "imgs", `${imgID}.jpg`);
      if (missingCovers.has(imgID) || (await fs.pathExists(coverPath))) continue;
      if (!pendingCovers.has(imgID)) {
        pendingCovers.set(
          imgID,
          downloadCover(imgID, coverPath, { background: true }).finally(() =>
            pendingCovers.delete(imgID)
          )
        );
      }
      await pendingCovers.get(imgID);
    }
  };
  await Promise.all(Array.from({ length: PREFETCH_CONCURRENCY }, worker));
}

/**
 * Download the covers people are most likely to see first, in the background
 * @param {string} indexPath - Path to the local index directory
 */
function prefetchCovers(indexPath) {
  if (!activePrefetch) {
    activePrefetch = runPrefetch(indexPath)
      .catch(error => console.error("Cover prefetch failed:", error.message))
      .finally(() => {
        activePrefetch = null;
      });
  }
  return activePrefetch;
}

/**
 * Get a cover as a data URL, downloading and caching it on first use
 * @param {string} indexPath - Path to the local index directory
 * @param {string} imgID - Cover ID from the game list
 * @returns {Promise<string|null>}
 */
async function getIndexCover(indexPath, imgID) {
  if (typeof imgID !== "string" || !IMG_ID_PATTERN.test(imgID)) return null;

  const coverPath = path.join(indexPath, "imgs", `${imgID}.jpg`);
  if (!(await fs.pathExists(coverPath))) {
    if (missingCovers.has(imgID)) return null;
    if (!pendingCovers.has(imgID)) {
      pendingCovers.set(
        imgID,
        downloadCover(imgID, coverPath).finally(() => pendingCovers.delete(imgID))
      );
    }
    if (!(await pendingCovers.get(imgID))) return null;
  }

  const buffer = await fs.readFile(coverPath);
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}

module.exports = {
  syncCommunityIndex,
  getIndexCover,
  prefetchCovers,
};
