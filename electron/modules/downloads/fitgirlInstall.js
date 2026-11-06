/**
 * Pure helpers for installing a finished FitGirl pack: detection, the MD5 list,
 * a streamed hash check, Inno Setup arguments and the cleanup file list.
 * Nothing here spawns processes or deletes files; callers pass fs in for tests.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const MD5_DIR = "MD5";
const MD5_LIST = "fitgirl-bins.md5";
const PROGRESS_INTERVAL_MS = 250;

const md5ListPath = packDir => path.join(packDir, MD5_DIR, MD5_LIST);

function isFitgirlPack(packDir, fsApi = fs) {
  return Boolean(packDir) && fsApi.existsSync(md5ListPath(packDir));
}

const isInside = (parent, child) => {
  const relative = path.relative(parent, child);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
};

// Selective language and optional parts may be left out of a download on purpose.
const isOptionalPart = name => /^fg-(?:optional|selective)-/i.test(path.basename(name));

/** Parse fitgirl-bins.md5 into [{ hash, name, filePath, optional }] inside packDir. */
function parseMd5List(text, packDir) {
  const entries = [];
  String(text)
    .split(/\r?\n/)
    .forEach((raw, index) => {
      const line = raw.trim();
      if (!line || line.startsWith(";")) return;
      const match = /^([0-9a-f]{32})\s+\*?(.+)$/i.exec(line);
      if (!match) throw new Error(`Unreadable MD5 list line ${index + 1}`);
      const listed = match[2].trim();
      if (/^(?:[a-z]:|[\\/])/i.test(listed)) {
        throw new Error(`MD5 list names a file outside the pack: ${listed}`);
      }
      const parts = listed.split(/[\\/]+/).filter(Boolean);
      // QuickSFV lists may be written relative to the MD5 folder ("..\fg-01.bin").
      const base = parts[0] === ".." ? path.join(packDir, MD5_DIR) : packDir;
      const filePath = path.resolve(base, ...parts);
      if (!isInside(packDir, filePath)) {
        throw new Error(`MD5 list names a file outside the pack: ${listed}`);
      }
      entries.push({
        hash: match[1].toLowerCase(),
        name: path.relative(packDir, filePath),
        filePath,
        optional: isOptionalPart(filePath),
      });
    });
  if (!entries.length) throw new Error("MD5 list has no files");
  return entries;
}

function hashFile(filePath, { fsApi, signal, onBytes }) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("md5");
    const stream = fsApi.createReadStream(filePath);
    const abort = () => {
      stream.destroy();
      reject(new Error("Verification cancelled"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    stream.on("data", chunk => {
      hash.update(chunk);
      onBytes(chunk.length);
    });
    stream.on("error", error => {
      signal?.removeEventListener("abort", abort);
      reject(error);
    });
    stream.on("end", () => {
      signal?.removeEventListener("abort", abort);
      resolve(hash.digest("hex"));
    });
  });
}

/**
 * Hash every listed file that exists. Missing optional parts count as skipped,
 * missing required parts as missing. Progress is throttled to ~4 updates a second.
 */
async function verifyPack(
  entries,
  { fsApi = fs, signal, onProgress = () => {}, now = Date.now } = {}
) {
  const result = { ok: false, passed: [], bad: [], missing: [], skipped: [] };
  const present = [];
  let bytesTotal = 0;
  for (const item of entries) {
    if (!fsApi.existsSync(item.filePath)) {
      (item.optional ? result.skipped : result.missing).push(item.name);
      continue;
    }
    const { size } = fsApi.statSync(item.filePath);
    bytesTotal += size;
    present.push(item);
  }

  let bytesDone = 0;
  let lastSent = -Infinity;
  const report = (file, force = false) => {
    const time = now();
    if (!force && time - lastSent < PROGRESS_INTERVAL_MS) return;
    lastSent = time;
    onProgress({ file, bytesDone, bytesTotal });
  };

  for (const item of present) {
    if (signal?.aborted) throw new Error("Verification cancelled");
    const digest = await hashFile(item.filePath, {
      fsApi,
      signal,
      onBytes: count => {
        bytesDone += count;
        report(item.name);
      },
    });
    (digest === item.hash ? result.passed : result.bad).push(item.name);
  }
  report(null, true);
  result.ok = result.bad.length === 0 && result.missing.length === 0;
  return result;
}

/**
 * Inno Setup command line (jrsoftware.org/ishelp, Setup Command Line Parameters).
 * The 2 GB RAM limit is a checkbox in FitGirl's own setup page with no
 * command-line switch, so that option keeps the setup window open for the user.
 */
function buildSetupArgs({ silent, limitRam, installDir, logPath }) {
  for (const value of [installDir, logPath]) {
    if (String(value).includes('"')) throw new Error("Paths cannot contain a quote");
    if (!path.win32.isAbsolute(String(value))) throw new Error("Paths must be absolute");
  }
  const quiet = silent && !limitRam;
  return [
    "/SP-",
    ...(quiet ? ["/SILENT", "/SUPPRESSMSGBOXES"] : []),
    "/NORESTART",
    `/DIR="${installDir}"`,
    `/LOG="${logPath}"`,
  ];
}

/** Returns the pack folder when installerPath is setup.exe inside gameDirectory. */
function checkInstaller(installerPath, gameDirectory) {
  const resolved = path.resolve(String(installerPath || ""));
  if (path.basename(resolved).toLowerCase() !== "setup.exe") {
    throw new Error("Only the pack's setup.exe can run");
  }
  if (!isInside(path.resolve(gameDirectory), resolved)) {
    throw new Error("Installer is outside this download's folder");
  }
  return path.dirname(resolved);
}

function chooseInstallDir(gameDirectory, packDir, gameName) {
  const preferred = path.join(gameDirectory, gameName);
  const pack = path.resolve(packDir);
  // The pack must never sit inside (or be) the folder setup writes to.
  return path.resolve(preferred) === pack || isInside(preferred, pack)
    ? path.join(gameDirectory, `${gameName} (installed)`)
    : preferred;
}

/** Files to delete after a good install: listed parts, setup.exe and the MD5 folder files. */
function selectCleanup({ packDir, entries, installerPath, installDir, fsApi = fs }) {
  const pack = path.resolve(packDir);
  const install = path.resolve(installDir);
  if (install === pack || isInside(install, pack)) return [];
  const candidates = [...entries.map(item => item.filePath), installerPath];
  const md5Dir = path.join(pack, MD5_DIR);
  try {
    for (const item of fsApi.readdirSync(md5Dir, { withFileTypes: true })) {
      if (item.isFile()) candidates.push(path.join(md5Dir, item.name));
    }
  } catch {}
  return [...new Set(candidates.map(file => path.resolve(file)))].filter(
    file => isInside(pack, file) && !isInside(install, file) && fsApi.existsSync(file)
  );
}

module.exports = {
  MD5_DIR,
  MD5_LIST,
  md5ListPath,
  isFitgirlPack,
  isOptionalPart,
  parseMd5List,
  verifyPack,
  buildSetupArgs,
  checkInstaller,
  chooseInstallDir,
  selectCleanup,
};
