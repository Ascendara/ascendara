/**
 * Finds folders named after a Steam App ID inside the Achievement Watcher's locations.
 */

const fs = require("fs-extra");
const os = require("os");
const path = require("path");

const DEFAULT_MAX_ENTRIES = 30000;
const DEFAULT_MAX_DEPTH = 8;
const DEFAULT_MAX_RESULTS = 100;
const DEFAULT_MAX_MS = 15000;

function normalizeAppId(value) {
  const raw = String(value ?? "").trim();
  return /^\d{1,10}$/.test(raw) ? raw : null;
}

function getWindowsRoots({
  env = process.env,
  homedir = os.homedir(),
  documentsPath,
} = {}) {
  const systemDrive = env.SystemDrive || env.SYSTEMDRIVE || "C:";
  const publicDir = env.PUBLIC || env.Public || path.join(systemDrive, "Users", "Public");
  const appData = env.APPDATA || path.join(homedir, "AppData", "Roaming");
  const localAppData = env.LOCALAPPDATA || path.join(homedir, "AppData", "Local");
  const programData = env.PROGRAMDATA || path.join(systemDrive, "ProgramData");
  const documents = documentsPath || path.join(homedir, "Documents");

  return [
    path.join(publicDir, "Documents", "Steam", "CODEX"),
    path.join(appData, "Steam", "CODEX"),
    path.join(appData, "Goldberg SteamEmu Saves"),
    path.join(appData, "GSE Saves"),
    path.join(appData, "EMPRESS"),
    path.join(publicDir, "Documents", "EMPRESS"),
    path.join(publicDir, "Documents", "Steam", "RUNE"),
    path.join(publicDir, "Documents", "OnlineFix"),
    path.join(programData, "Steam"),
    path.join(localAppData, "SKIDROW"),
    path.join(appData, "SmartSteamEmu"),
    path.join(documents, "SKIDROW"),
  ];
}

function getDriveRoots(driveC) {
  return [
    path.join(driveC, "users", "Public", "Documents", "Steam", "CODEX"),
    path.join(driveC, "users", "Public", "Documents", "EMPRESS"),
    path.join(driveC, "users", "Public", "Documents", "Steam", "RUNE"),
    path.join(driveC, "users", "Public", "Documents", "OnlineFix"),
    path.join(driveC, "ProgramData", "Steam"),
  ];
}

async function getUserRoots(driveC) {
  const roots = [];
  const usersDir = path.join(driveC, "users");
  const users = await fs.promises
    .readdir(usersDir, { withFileTypes: true })
    .catch(() => []);

  for (const user of users) {
    if (!user.isDirectory() || user.isSymbolicLink()) continue;
    const home = path.join(usersDir, user.name);
    roots.push(
      path.join(home, "AppData", "Roaming", "Steam", "CODEX"),
      path.join(home, "AppData", "Roaming", "Goldberg SteamEmu Saves"),
      path.join(home, "AppData", "Roaming", "GSE Saves"),
      path.join(home, "AppData", "Roaming", "EMPRESS"),
      path.join(home, "AppData", "Roaming", "SmartSteamEmu"),
      path.join(home, "AppData", "Local", "SKIDROW"),
      path.join(home, "Documents", "SKIDROW")
    );
  }

  return roots;
}

async function getUnixRoots({
  platform = process.platform,
  homedir = os.homedir(),
} = {}) {
  const prefixes = [
    {
      root: path.join(homedir, ".ascendara", "compatdata"),
      driveC: path.join("pfx", "drive_c"),
    },
  ];

  if (platform === "darwin") {
    prefixes.push({
      root: path.join(
        homedir,
        "Library",
        "Application Support",
        "ascendara",
        "highball",
        "bottles"
      ),
      driveC: "drive_c",
    });
  }

  const roots = [];
  for (const prefix of prefixes) {
    const games = await fs.promises
      .readdir(prefix.root, { withFileTypes: true })
      .catch(() => []);

    for (const game of games) {
      if (!game.isDirectory() || game.isSymbolicLink()) continue;
      const driveC = path.join(prefix.root, game.name, prefix.driveC);
      const stat = await fs.promises.stat(driveC).catch(() => null);
      if (!stat?.isDirectory()) continue;

      roots.push(...getDriveRoots(driveC), ...(await getUserRoots(driveC)));
    }
  }

  return roots;
}

async function getDefaultRoots(options = {}) {
  const platform = options.platform || process.platform;
  return platform === "win32" ? getWindowsRoots(options) : getUnixRoots(options);
}

function dedupeRoots(roots) {
  const seen = new Set();
  const result = [];
  for (const root of roots) {
    if (typeof root !== "string" || !root.trim()) continue;
    const resolved = path.resolve(root);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    result.push(resolved);
  }
  return result;
}

/**
 * Breadth-first scan for directories whose name matches the App ID exactly.
 * Symlinks are not followed so the scan cannot escape the watched folders.
 */
async function searchAppIdFolders(roots, appId, options = {}) {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;
  const maxMs = options.maxMs ?? DEFAULT_MAX_MS;
  const deadline = Date.now() + maxMs;

  const queue = dedupeRoots(roots).map(dir => ({ dir, depth: 0 }));
  const seen = new Set();
  const results = [];
  let scanned = 0;
  let inaccessible = 0;
  let truncated = false;
  let timedOut = false;

  while (queue.length) {
    if (Date.now() > deadline) {
      timedOut = true;
      break;
    }
    if (scanned >= maxEntries) {
      truncated = true;
      break;
    }

    const { dir, depth } = queue.shift();
    if (seen.has(dir)) continue;
    seen.add(dir);

    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      inaccessible += 1;
      continue;
    }

    for (const entry of entries) {
      if (scanned >= maxEntries) {
        truncated = true;
        break;
      }
      scanned += 1;

      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const child = path.join(dir, entry.name);
      if (entry.name === appId) results.push(child);
      if (depth < maxDepth) queue.push({ dir: child, depth: depth + 1 });
    }

    if (results.length >= maxResults) {
      truncated = true;
      break;
    }
  }

  if (queue.length) truncated = true;

  return {
    results: results.slice(0, maxResults),
    scanned,
    inaccessible,
    truncated: truncated || timedOut,
    timedOut,
  };
}

async function searchAchievementFolders({
  appId,
  watchedFolders = [],
  platform = process.platform,
  env = process.env,
  homedir = os.homedir(),
  documentsPath,
  ...searchOptions
} = {}) {
  const normalized = normalizeAppId(appId);
  if (!normalized) {
    return { success: false, error: "invalidAppId" };
  }

  const defaults = await getDefaultRoots({
    platform,
    env,
    homedir,
    documentsPath,
  });
  const custom = Array.isArray(watchedFolders) ? watchedFolders : [];
  const found = await searchAppIdFolders(
    [...defaults, ...custom],
    normalized,
    searchOptions
  );

  return {
    success: true,
    appId: normalized,
    ...found,
  };
}

module.exports = {
  normalizeAppId,
  getWindowsRoots,
  getUnixRoots,
  getDefaultRoots,
  searchAppIdFolders,
  searchAchievementFolders,
  DEFAULT_MAX_ENTRIES,
  DEFAULT_MAX_DEPTH,
  DEFAULT_MAX_RESULTS,
};
