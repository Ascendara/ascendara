/**
 * Download Watchdog Module
 * Detects downloads whose helper process exited without updating its metadata
 * (app or PC closed mid-extraction, process killed or crashed) and restarts
 * them: extraction is retried from the retained archives, and downloads are
 * resumed. After repeated failures the download is left for a manual retry.
 */

const fs = require("fs-extra");
const path = require("path");
const { execFile } = require("child_process");
const { BrowserWindow } = require("electron");
const { isWindows } = require("../core/config");

const HELPERS = /Ascendara(Downloader|GofileHelper|TorrentHandler)/i;
// Metadata written this recently may belong to a helper that is still starting.
const GRACE_MS = 30000;
const CHECK_INTERVAL_MS = 15000;
// Caps restarts so a helper that keeps crashing cannot loop forever.
const MAX_ATTEMPTS = 3;
// A running helper that makes no progress this long is reported as stalled.
const STALL_MS = { download: 120000, extraction: 180000 };

// game folder -> automatic restarts this session.
const recoveries = new Map();
// game folder -> { game, since, stalled } for downloads whose helper is running.
const progressWatch = new Map();
let checking = false;

function isActive(data) {
  return Boolean(data && (data.downloading || data.extracting || data.verifying));
}

// PIDs of running helper processes, or null when they cannot be listed.
function listHelperPids() {
  return new Promise(resolve => {
    const [command, args] = isWindows
      ? ["tasklist", ["/FO", "CSV", "/NH"]]
      : ["ps", ["-A", "-o", "pid=,args="]];
    execFile(
      command,
      args,
      { windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout) => {
        if (error) return resolve(null);
        const pids = new Set();
        for (const line of stdout.split(/\r?\n/)) {
          if (!HELPERS.test(line)) continue;
          const pid = isWindows
            ? Number(line.split('","')[1])
            : Number(line.trim().split(/\s+/)[0]);
          if (Number.isInteger(pid)) pids.add(pid);
        }
        resolve(pids);
      }
    );
  });
}

// Paused, stopped, queued or waiting downloads are expected to stand still.
function isProgressExpected(data) {
  return (
    isActive(data) &&
    !data.stopped &&
    !data.paused &&
    !data.waiting &&
    !data.error &&
    !data.awaitingRecoveryAction &&
    !data.pendingManualInstall
  );
}

// Fallback for helpers that do not record lastProgress (torrents, older downloaders).
function progressSignature(data) {
  const extraction = data.extractionProgress || {};
  return JSON.stringify([
    data.progressCompleted,
    extraction.filesExtracted,
    extraction.percentComplete,
    extraction.readSpeed,
    extraction.writeSpeed,
  ]);
}

function broadcastStall(folder, entry) {
  const payload = {
    folder,
    game: entry.game,
    stalled: entry.stalled,
    since: entry.since,
    phase: entry.phase,
  };
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send("download-stall", payload);
  }
}

function watchProgress(folder, info, now) {
  const data = info.downloadingData;
  const previous = progressWatch.get(folder);
  const phase = isExtraction(data, info) ? "extraction" : "download";
  const signature = progressSignature(data);
  let since;
  if (typeof data.lastProgress === "number") {
    since = data.lastProgress * 1000;
  } else {
    since =
      previous && previous.signature === signature && previous.phase === phase
        ? previous.since
        : now;
  }
  const stalled = now - since > STALL_MS[phase];
  const entry = { game: info.game || folder, since, stalled, phase, signature };
  progressWatch.set(folder, entry);
  if (stalled !== Boolean(previous?.stalled)) {
    console.warn(
      `[downloads] ${folder} ${stalled ? `has made no ${phase} progress since ${new Date(since).toISOString()}` : "is progressing again"}`
    );
    broadcastStall(folder, entry);
  }
}

function forgetProgress(folder) {
  const entry = progressWatch.get(folder);
  if (!entry) return;
  progressWatch.delete(folder);
  if (entry.stalled) broadcastStall(folder, { ...entry, stalled: false });
}

function isExtraction(data, info) {
  return Boolean(data.extracting || data.verifying || info.extractionSources);
}

function interruptedState(data, info, message) {
  const base = { ...data, downloading: false, extracting: false, verifying: false };
  delete base.ownerPid;
  delete base.extractionProgress;
  if (isExtraction(data, info)) {
    // error + progressCompleted 100 lets the UI offer "Retry Extraction".
    return { ...base, error: true, progressCompleted: "100.00", message };
  }
  return { ...base, stopped: true };
}

async function activeMetadata(directories) {
  const found = [];
  for (const directory of directories) {
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const file = path.join(directory, entry.name, `${entry.name}.ascendara.json`);
      try {
        const info = await fs.readJson(file);
        if (isActive(info.downloadingData)) found.push({ file, folder: entry.name });
        else if (!info.downloadingData) recoveries.delete(entry.name);
      } catch {}
    }
  }
  return found;
}

async function check({ getDirectories, retryExtraction, resumeDownload }) {
  if (checking) return;
  checking = true;
  try {
    const active = await activeMetadata(getDirectories());
    const watched = new Set();
    try {
      if (!active.length) return;
      const pids = await listHelperPids();
      if (!pids) {
        active.forEach(({ folder }) => watched.add(folder));
        return;
      }
      for (const { file, folder } of active) {
        try {
          const now = Date.now();
          const stat = await fs.stat(file);
          const info = await fs.readJson(file);
          const data = info.downloadingData;
          if (!isActive(data)) continue;
          const privateRunning =
            info.privateSource && require("./privateSources").active.has(folder);
          // Older downloaders did not record their PID; then any helper still
          // running might own this download, so leave it alone.
          const alive =
            privateRunning || (data.ownerPid ? pids.has(data.ownerPid) : pids.size > 0);
          if (alive || now - stat.mtimeMs < GRACE_MS) {
            if (isProgressExpected(data)) {
              watched.add(folder);
              watchProgress(folder, info, now);
            }
            continue;
          }

          const attempts = recoveries.get(folder) || 0;
          const extraction = isExtraction(data, info);
          const exhausted = attempts >= MAX_ATTEMPTS;

          console.warn(
            `[downloads] Helper for ${folder} is no longer running (restart ${attempts + 1}/${MAX_ATTEMPTS})`
          );
          info.downloadingData = interruptedState(
            data,
            info,
            exhausted
              ? "Extraction stopped repeatedly. Your downloaded files were kept; check downloadmanager.log, then retry extraction."
              : "Extraction was interrupted; restarting it automatically."
          );
          await fs.writeJson(file, info, { spaces: 4 });
          if (exhausted) continue;

          recoveries.set(folder, attempts + 1);
          const result = extraction
            ? await retryExtraction(folder)
            : await resumeDownload(folder);
          if (!result?.success) {
            console.error(
              `[downloads] Automatic recovery of ${folder} failed:`,
              result?.error
            );
          }
        } catch (error) {
          watched.add(folder);
          console.error(`[downloads] Could not check ${folder}:`, error.message);
        }
      }
    } finally {
      // Finished, paused or removed downloads are no longer stalled.
      for (const folder of [...progressWatch.keys()]) {
        if (!watched.has(folder)) forgetProgress(folder);
      }
    }
  } finally {
    checking = false;
  }
}

// Stalled downloads, for a renderer that opens after the warning was sent.
function getDownloadStalls() {
  return [...progressWatch.entries()]
    .filter(([, entry]) => entry.stalled)
    .map(([folder, entry]) => ({
      folder,
      game: entry.game,
      stalled: true,
      since: entry.since,
      phase: entry.phase,
    }));
}

/**
 * Start watching for interrupted downloads. Runs once shortly after startup and
 * then periodically, whether or not the Downloads page is open.
 */
function startDownloadWatchdog(options) {
  const run = () => check(options).catch(error => console.error("[downloads]", error));
  setTimeout(run, 5000).unref?.();
  setInterval(run, CHECK_INTERVAL_MS).unref?.();
}

module.exports = { startDownloadWatchdog, getDownloadStalls };
