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
const MAX_COVER_DOWNLOADS = 8;

let activeSync = null;
const pendingCovers = new Map(); // imgID -> Promise<boolean>
// A 404 from the bucket is never cached and is billed as a read, so remember
// misses for the session instead of asking again.
const missingCovers = new Set();
let activeCoverDownloads = 0;
const coverQueue = [];

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

async function runSync(indexPath, force) {
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

  const text = await response.text();
  const data = JSON.parse(text);
  if (!Array.isArray(data?.games) || data.games.length === 0) {
    throw new Error("Game list is empty");
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
  missingCovers.clear();
  await writeProgress(indexPath);

  return { updated: true, games: data.games.length };
}

/**
 * Bring the local game list up to date with the shared one
 * @param {string} indexPath - Path to the local index directory
 * @param {object} options - force: replace the local list even if it is unchanged or newer
 * @returns {Promise<{updated: boolean, games?: number}>}
 */
function syncCommunityIndex(indexPath, { force = false } = {}) {
  if (!activeSync) {
    activeSync = runSync(indexPath, force).finally(() => {
      activeSync = null;
    });
  }
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
  const next = coverQueue.shift();
  if (next) {
    next();
  } else {
    activeCoverDownloads--;
  }
}

async function downloadCover(imgID, coverPath) {
  await acquireCoverSlot();
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
    releaseCoverSlot();
  }
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
};
