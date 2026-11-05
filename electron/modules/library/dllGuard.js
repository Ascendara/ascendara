/**
 * Pre-launch check for online-fix / crack compat DLLs.
 *
 * Antivirus frequently quarantines these files after a game is installed,
 * which leaves the game unable to start with a confusing crash instead of a
 * clear reason. This module only *reads* the install to detect that case so
 * Ascendara can explain what happened. It never hides, encrypts or shields
 * files from a scanner's reach.
 */
const fs = require("node:fs");
const path = require("node:path");
const dllRepair = require("../downloads/dllRepair");

// Basenames of DLLs that ship only with a crack / online-fix and that
// antivirus commonly removes. Kept aligned with onlinefix-parser's scan set.
const COMPAT_DLL_PATTERN =
  /^(online.*|steam.*|stubdrm.*|winmm|emp|custom|eos.*|epicfix.*)\.dll$/i;

function basename(name) {
  return path.posix.basename(String(name).replace(/\\/g, "/"));
}

// The compat DLLs the filemap says should be installed, de-duplicated.
function listedCompatDlls(filemap) {
  const seen = new Set();
  const files = [];
  for (const name of Object.keys(filemap)) {
    const base = basename(name);
    const key = base.toLowerCase();
    if (!COMPAT_DLL_PATTERN.test(base) || seen.has(key)) continue;
    seen.add(key);
    files.push(name);
  }
  return files;
}

/**
 * Returns the listed compat DLLs that are now missing or truncated, as
 * `[{ file, reason }]` (reason: "missing" | "corrupt"). An empty array means
 * nothing to warn about. Only meaningful for non-custom installs with a
 * filemap; any read problem is treated as "nothing to warn about" so a bad
 * check can never block a launch.
 */
async function findMissingCompatDlls(gameDirectory, gameName) {
  let filemap;
  try {
    const raw = await dllRepair.readBounded(
      gameDirectory,
      "filemap.ascendara.json",
      16 * 1024 * 1024
    );
    filemap = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!filemap || typeof filemap !== "object") return [];

  // Don't warn while the game is still downloading, extracting or verifying.
  try {
    const info = JSON.parse(
      await dllRepair.readBounded(
        gameDirectory,
        `${gameName}.ascendara.json`,
        4 * 1024 * 1024
      )
    );
    const data = info?.downloadingData;
    if (data && (data.downloading || data.extracting || data.verifying)) return [];
  } catch {
    // No/invalid metadata: still fine to check the files themselves.
  }

  const missing = [];
  for (const name of listedCompatDlls(filemap)) {
    let target;
    try {
      target = await dllRepair.safePath(gameDirectory, name);
    } catch {
      // A filemap entry with an unsafe path is not ours to reason about.
      continue;
    }
    try {
      const stat = await fs.promises.lstat(target);
      if (!stat.isFile()) {
        missing.push({ file: basename(name), reason: "missing" });
      } else if (stat.size === 0) {
        missing.push({ file: basename(name), reason: "corrupt" });
      }
    } catch (error) {
      if (error.code === "ENOENT") missing.push({ file: basename(name), reason: "missing" });
      // Any other stat error (permissions, etc.): leave the launch alone.
    }
  }
  return missing;
}

module.exports = { findMissingCompatDlls, COMPAT_DLL_PATTERN };
