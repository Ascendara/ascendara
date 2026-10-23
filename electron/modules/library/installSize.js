/**
 * Install Size Module
 * Games installed before the downloader measured them still list the catalog's
 * compressed download size. Each such game is measured once, in the background,
 * and marked so it is never measured again. Sizes the downloader measured right
 * after a verified install are shared once with the API, which serves them in
 * the catalog as each game's install size.
 */

const fs = require("fs-extra");
const path = require("path");
const authHelper = require("../core/auth-helper");
const { API_URL } = require("../core/config");


const queued = new Set();
const queue = [];
let running = false;

// Same format as the downloader's read_size, so both writers agree
function formatSize(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(2)} ${units[i]}`;
}

async function folderSize(directory) {
  let total = 0;
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      total += await folderSize(entryPath);
    } else if (entry.isFile()) {
      try {
        total += (await fs.promises.lstat(entryPath)).size;
      } catch {
        // Removed while measuring
      }
    }
  }
  return total;
}

// Nothing else is writing the info file of a finished game that isn't running
const isIdle = info => !info.downloadingData && !info.isRunning;
const needsMeasuring = info => isIdle(info) && !info.sizeMeasured;
const needsReporting = info =>
  isIdle(info) &&
  Number.isSafeInteger(info.installedBytes) &&
  info.installedBytes > 0 &&
  !!info.gameID &&
  !!info.version &&
  !info.sizeReported;

const readInfo = async gameInfoPath =>
  JSON.parse(await fs.promises.readFile(gameInfoPath, "utf8"));

async function writeInfo(gameInfoPath, info) {
  const temporary = `${gameInfoPath}.size.tmp`;
  try {
    await fs.promises.writeFile(temporary, JSON.stringify(info, null, 2));
    await fs.promises.rename(temporary, gameInfoPath);
  } catch (error) {
    await fs.promises.rm(temporary, { force: true });
    throw error;
  }
}

async function measure(gameDirectory, gameInfoPath) {
  if (!needsMeasuring(await readInfo(gameInfoPath))) return;
  const bytes = await folderSize(gameDirectory);
  // Re-read so changes made while measuring are kept
  const info = await readInfo(gameInfoPath);
  if (!needsMeasuring(info)) return;
  info.size = formatSize(bytes);
  info.sizeMeasured = true;
  await writeInfo(gameInfoPath, info);
  console.log(`[installSize] ${info.game || gameDirectory}: ${info.size}`);
}

async function getAuthToken() {
  const response = await fetch(`${API_URL}/auth/token`, {
    headers: authHelper.generateAuthHeaders(),
  });
  if (!response.ok) throw new Error(`Failed to get auth token: ${response.status}`);
  return (await response.json()).token;
}

async function report(gameInfoPath) {
  const before = await readInfo(gameInfoPath);
  if (!needsReporting(before)) return;
  const response = await fetch(`${API_URL}/stats/installsize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await getAuthToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      gameID: String(before.gameID),
      version: before.version,
      bytes: before.installedBytes,
    }),
  });
  // Server errors and rate limits are retried next session; any other answer
  // (accepted, outdated version, out of range) is final for this install
  if (response.status >= 500 || response.status === 429 || response.status === 401) {
    throw new Error(`API answered ${response.status}`);
  }
  const info = await readInfo(gameInfoPath);
  if (!needsReporting(info) || info.installedBytes !== before.installedBytes) return;
  info.sizeReported = true;
  await writeInfo(gameInfoPath, info);
}

async function drain() {
  if (running) return;
  running = true;
  while (queue.length) {
    const job = queue.shift();
    try {
      await job();
    } catch (error) {
      // Left unmarked, so it is tried again next session
      console.warn("[installSize]", error.message);
    }
  }
  running = false;
}

function enqueue(key, job) {
  if (queued.has(key)) return;
  queued.add(key);
  queue.push(job);
  drain();
}

/**
 * Measure an installed game once if it still shows the download size, and
 * share a size measured right after installation once.
 */
function ensureInstallSize(info, gameDirectory, gameInfoPath) {
  if (needsMeasuring(info)) {
    enqueue(`measure:${gameInfoPath}`, () => measure(gameDirectory, gameInfoPath));
  }
  if (needsReporting(info)) {
    enqueue(`report:${gameInfoPath}`, () => report(gameInfoPath));
  }
}

module.exports = { ensureInstallSize };
