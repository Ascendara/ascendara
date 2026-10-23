/**
 * Install Size Module
 * Games installed before the downloader measured them still list the catalog's
 * compressed download size. Each such game is measured once, in the background,
 * and marked so it is never measured again.
 */

const fs = require("fs-extra");
const path = require("path");

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

// A game is only measured when nothing else is writing its info file
const isSettled = info => !info.sizeMeasured && !info.downloadingData && !info.isRunning;

async function measure(gameDirectory, gameInfoPath) {
  const before = JSON.parse(await fs.promises.readFile(gameInfoPath, "utf8"));
  if (!isSettled(before)) return;
  const bytes = await folderSize(gameDirectory);
  // Re-read so changes made while measuring are kept
  const info = JSON.parse(await fs.promises.readFile(gameInfoPath, "utf8"));
  if (!isSettled(info)) return;
  info.size = formatSize(bytes);
  info.sizeMeasured = true;
  const temporary = `${gameInfoPath}.size.tmp`;
  try {
    await fs.promises.writeFile(temporary, JSON.stringify(info, null, 2));
    await fs.promises.rename(temporary, gameInfoPath);
  } catch (error) {
    await fs.promises.rm(temporary, { force: true });
    throw error;
  }
  console.log(`[installSize] ${info.game || gameDirectory}: ${info.size}`);
}

async function drain() {
  if (running) return;
  running = true;
  while (queue.length) {
    const [gameDirectory, gameInfoPath] = queue.shift();
    try {
      await measure(gameDirectory, gameInfoPath);
    } catch (error) {
      // Left unmarked, so it is tried again next session
      console.warn(`[installSize] Could not measure ${gameDirectory}:`, error.message);
    }
  }
  running = false;
}

/** Measure an installed game once if it still shows the download size. */
function ensureInstallSize(info, gameDirectory, gameInfoPath) {
  if (!isSettled(info) || queued.has(gameInfoPath)) return;
  queued.add(gameInfoPath);
  queue.push([gameDirectory, gameInfoPath]);
  drain();
}

module.exports = { ensureInstallSize };
