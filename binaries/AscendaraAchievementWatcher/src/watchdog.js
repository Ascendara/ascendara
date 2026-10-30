"use strict";
console.log("watchdog.js script loaded and running.");

const instance = new (require("single-instance"))("Achievement Watchdog");
const path = require("path");
const watch = require("node-watch");
const moment = require("moment");
const fs = require("fs").promises;
const monitor = require("./monitor.js");
const steam = require("./steam.js");
const steamLangDefs = require("./steam.json");
const track = require("./track.js");
const crc32 = require("./crc32.js");
const library = require("./library.js");
const { getSettings } = require("./userConfig.js");
const { spawn } = require("child_process");

// Get config from ENV or IPC
const homeDir = process.env.USERPROFILE || process.env.HOME || require("os").homedir();
const timestampFilePath =
  process.platform === "win32"
    ? path.join(homeDir, "timestamp.ascendara.json")
    : path.join(homeDir, ".ascendara", "timestamp.ascendara.json");
const pendingFilePath = path.join(
  process.env["APPDATA"] || path.join(homeDir, ".config"),
  "Achievement Watcher/steam_cache/pending.json"
);
let watchdogRunning = false;

// Resource optimization constants
// Linux has no native recursive watching, so every subfolder costs an inotify watch
const MAX_WATCHERS = process.platform === "linux" ? 100 : 500;
const MAX_CACHE_SIZE = 20; // Limit number of cached game schemas
const FILE_EVENT_DEBOUNCE_MS = 500; // Debounce file events
const CACHE_CLEANUP_INTERVAL_MS = 300000; // Clean cache every 5 minutes
const RESCAN_INTERVAL_MS = 60000; // Look for new save folders every minute
const CATCH_UP_NOTIFY_WINDOW_MS = 2 * RESCAN_INTERVAL_MS; // Toast missed unlocks this recent
const CATCH_UP_MAX_DEPTH = 5;
const CATCH_UP_MAX_ENTRIES = 5000;

// Debounce tracking
const fileEventTimers = new Map();

// Performance monitoring
function logMemoryUsage() {
  const usage = process.memoryUsage();
  const formatMB = bytes => (bytes / 1024 / 1024).toFixed(2);
  console.log(
    `Memory Usage: RSS=${formatMB(usage.rss)}MB, Heap=${formatMB(usage.heapUsed)}/${formatMB(usage.heapTotal)}MB`
  );

  // Warn if memory usage is excessive
  if (usage.heapUsed > 500 * 1024 * 1024) {
    // 500MB
    console.warn(`WARNING: High memory usage detected: ${formatMB(usage.heapUsed)}MB`);
  }
}

async function updateWatchdogStatus(running) {
  watchdogRunning = running;
  let payload = {};
  try {
    // Try to read the existing file and parse it
    const data = await fs.readFile(timestampFilePath, "utf8");
    payload = JSON.parse(data);
  } catch (e) {
    // If file doesn't exist or is invalid, start with empty object
    payload = {};
  }
  payload.watchdogRunning = running;
  payload.watchdogLastUpdated = moment().format();
  try {
    await fs.writeFile(timestampFilePath, JSON.stringify(payload, null, 2), "utf8");
    console.log(
      `Watchdog status updated: running=${running}, timestamp=${payload.watchdogLastUpdated}`
    );
  } catch (e) {
    console.error("Failed to write watchdog status:", e);
  }
}

async function getSteamApiLang() {
  // Get settings from preload/renderer
  try {
    const settings = await getSettings();
    const userLang = settings?.language || "en";
    // Map to steam.json api code
    const match = steamLangDefs.find(
      lang =>
        lang.iso?.toLowerCase().startsWith(userLang.toLowerCase()) ||
        lang.webapi?.toLowerCase().startsWith(userLang.toLowerCase()) ||
        lang.api?.toLowerCase() === userLang.toLowerCase()
    );
    return match ? match.api : "english";
  } catch {
    // fallback: default to English
    return "english";
  }
}
let sendNotification = async opts => {
  try {
    const helperName =
      process.platform === "win32"
        ? "AscendaraNotificationHelper.exe"
        : "AscendaraNotificationHelper";
    const exePath =
      process.env.NODE_ENV === "development"
        ? path.join(
            path.dirname(process.execPath),
            "../../AscendaraNotificationHelper/dist",
            helperName
          )
        : path.join(path.dirname(process.execPath), helperName);
    let args = [];
    args.push("--is-achievement");
    let settings = await getSettings();
    let theme = opts.theme;
    if (!theme && typeof settings === "object" && settings.theme) {
      theme = settings.theme;
    }
    if (theme) args.push("--theme", String(theme));
    if (opts.title) args.push("--title", String(opts.title));
    if (opts.message) args.push("--message", String(opts.message));
    if (opts.icon) args.push("--icon", String(opts.icon));
    if (opts.appid) args.push("--appid", String(opts.appid));
    if (opts.game) args.push("--game", String(opts.game));
    if (opts.achievement) args.push("--achievement", String(opts.achievement));
    if (opts.description) args.push("--description", String(opts.description));
    const child = spawn(exePath, args, {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    child.on("error", err => {
      if (err.code === "ENOENT") {
        console.error("Notification helper executable not found:", exePath);
      } else {
        console.error("Failed to spawn notification helper:", err);
      }
      // Do not exit or throw, just log
    });
  } catch (err) {
    console.error("Failed to spawn notification helper:", err);
  }
};

const fileMatches = (options, name) =>
  (options.file || []).some(
    file => file.toLowerCase() === path.basename(name).toLowerCase()
  );

function getAppIdForFile(filePath, options) {
  if (options.appid) return String(options.appid);
  const parts = filePath.dir.split(/[\\/]/);
  const onlineFixIdx = parts.findIndex(p => p.toLowerCase() === "onlinefix");
  if (onlineFixIdx !== -1 && parts.length > onlineFixIdx + 1) {
    return parts[onlineFixIdx + 1];
  }
  // Use a separator-agnostic pattern so this works on both
  // Windows ("\\") and Linux/Proton ("/") paths.
  const match = filePath.dir
    .replace(/([\\/]stats$)|([\\/]SteamEmu$)|([\\/]SteamEmu[\\/]UserStats$)/gi, "")
    .match(/([0-9]+$)/);
  if (!match) throw `Unable to find game's appID in ${filePath.dir}`;
  return match[0];
}

// Achievement files are handled one at a time so two watchers firing for the
// same file can't both read the cache before either saves it (double toasts).
let queue = Promise.resolve();
function enqueue(task) {
  queue = queue.then(task).catch(err => console.warn(err));
  return queue;
}

// AppIDs whose unlocks couldn't be written to a game yet (game folder unknown),
// retried on every rescan so they still show up in Ascendara later.
let pendingSync = null;
async function loadPending() {
  if (!pendingSync) {
    try {
      pendingSync = new Set(JSON.parse(await fs.readFile(pendingFilePath, "utf8")));
    } catch (e) {
      pendingSync = new Set();
    }
  }
  return pendingSync;
}

async function savePending() {
  await fs.mkdir(path.dirname(pendingFilePath), { recursive: true });
  await fs.writeFile(pendingFilePath, JSON.stringify([...pendingSync]), "utf8");
}

async function syncAchievements(appID, game, cache) {
  const pending = await loadPending();
  const target = await library.resolveGame(appID, game.name);
  if (!target) {
    // Retried every rescan, so only log when it first becomes pending
    if (!pending.has(appID)) {
      console.warn(`No installed game matches appid ${appID} (${game.name}), will retry`);
      pending.add(appID);
      await savePending();
    }
    return false;
  }
  await writeAchievementsJson(target, game, cache);
  if (pending.delete(appID)) await savePending();
  return true;
}

async function processAchievementFile(name, options, { notify = true } = {}) {
  const filePath = path.parse(name);
  if (!fileMatches(options, filePath.base)) return;

  console.log(`Achievement file change detected: ${name}`);
  const appID = getAppIdForFile(filePath, options);
  console.log(`Detected appID: ${appID}`);

  const game = await app.load(appID);
  const achievements = await monitor.parse(name);
  if (achievements.length === 0) return;

  const cache = await track.load(appID);
  let changed = false;

  for (const unlocked of achievements) {
    const ach = game.achievement.list.find(achievement => {
      if (unlocked.crc) {
        return unlocked.crc.includes(crc32(achievement.name).toString(16));
      }
      return achievement.name.toUpperCase() == String(unlocked.name).toUpperCase();
    });
    if (!ach) {
      console.warn(
        `${unlocked.crc ? `${unlocked.crc} (CRC32)` : unlocked.name} not found in game schema data ?! ... Achievement was probably deleted or renamed over time > SKIPPING`
      );
      continue;
    }
    if (!unlocked.Achieved) continue;

    const previous = cache.find(achievement => achievement.name === ach.name);
    if (previous && previous.Achieved) continue;

    const unlockTime = unlocked.UnlockTime || moment().unix();
    if (notify) {
      console.log("Unlocked:" + ach.displayName);
      await sendNotification({
        title: "Achievement Unlocked!",
        message: ach.displayName,
        icon: ach.icon || "",
        appid: game.appid,
        game: game.name,
        achievement: ach.name,
        description: ach.description || "",
        unlockTime,
      });
    } else {
      console.log("Recorded earlier unlock:" + ach.displayName);
    }

    const entry = {
      name: ach.name,
      Notified: true,
      Achieved: true,
      UnlockTime: unlockTime,
    };
    if (previous) Object.assign(previous, entry);
    else cache.push(entry);
    changed = true;
  }

  if (changed) await track.save(appID, cache);
  // Always resync: earlier unlocks may never have reached the game's file
  if (cache.some(achievement => achievement.Achieved)) {
    await syncAchievements(appID, game, cache);
  }
}

async function findAchievementFiles(dir, options) {
  const found = [];
  const stack = [{ dir, depth: 0 }];
  const maxDepth = options.recursive ? CATCH_UP_MAX_DEPTH : 0;
  let seen = 0;
  while (stack.length && seen < CATCH_UP_MAX_ENTRIES) {
    const current = stack.pop();
    let entries;
    try {
      entries = await fs.readdir(current.dir, { withFileTypes: true });
    } catch (e) {
      continue;
    }
    for (const entry of entries) {
      seen++;
      const full = path.join(current.dir, entry.name);
      if (entry.isDirectory()) {
        if (current.depth < maxDepth) stack.push({ dir: full, depth: current.depth + 1 });
      } else if (
        fileMatches(options, entry.name) &&
        (!options.filter || options.filter.test(full))
      ) {
        found.push(full);
      }
    }
  }
  return found;
}

var app = {
  cache: [],
  watched: new Map(),
  start: async function () {
    console.log("Achievement Watchdog starting ...");
    await this.refresh({ initial: true });
    logMemoryUsage();

    // Pick up save folders and games that appear after startup
    setInterval(() => {
      this.refresh().catch(err => console.warn("Rescan failed:", err));
    }, RESCAN_INTERVAL_MS);

    // Cache cleanup and memory monitoring interval
    setInterval(() => {
      if (this.cache.length > MAX_CACHE_SIZE) {
        console.log(`Cleaning cache (size: ${this.cache.length})`);
        this.cache = this.cache.slice(-MAX_CACHE_SIZE);
      }

      // Log memory usage periodically
      logMemoryUsage();

      // Clean up old debounce timers (shouldn't happen, but just in case)
      if (fileEventTimers.size > 100) {
        console.warn(
          `WARNING: Large number of pending file events: ${fileEventTimers.size}`
        );
      }
    }, CACHE_CLEANUP_INTERVAL_MS);
  },
  discover: async function () {
    const gameDirList = [];
    for (const game of await library.listGames()) {
      if (game.kind !== "ascendara") continue;
      if (!game.installed && !game.hasEmuConfig && !game.hasAchievements) continue;
      gameDirList.push({
        path: game.folder,
        notify: true,
        appid: await library.getAppId(game.folder),
      });
    }

    const tempFile = path.join(
      process.env.TEMP || process.env.TMP || "/tmp",
      "ascendara_game_dirs.json"
    );
    await fs.writeFile(tempFile, JSON.stringify(gameDirList), "utf8");
    return monitor.getFolders(tempFile);
  },
  refresh: async function ({ initial = false } = {}) {
    await enqueue(() => repairAchievements());
    const folders = await this.discover();
    const added = [];
    for (const folder of folders) {
      if (this.watched.has(folder.dir)) continue;
      if (this.watched.size >= MAX_WATCHERS) {
        console.warn(
          `Watcher limit (${MAX_WATCHERS}) reached, not watching ${folder.dir}`
        );
        continue;
      }
      try {
        await fs.access(folder.dir);
      } catch (err) {
        continue;
      }
      this.watch(folder.dir, folder.options);
      added.push(folder);
    }
    if (added.length > 0) {
      console.log(`Started ${added.length} file watchers (${this.watched.size} total)`);
    }

    // Unlocks made while a folder wasn't watched (Ascendara closed, folder
    // created mid-session) are recorded too, but only recent ones get a toast.
    for (const folder of added) {
      for (const file of await findAchievementFiles(folder.dir, folder.options)) {
        await enqueue(async () => {
          const age = Date.now() - (await fs.stat(file)).mtimeMs;
          await processAchievementFile(file, folder.options, {
            notify: !initial && age < CATCH_UP_NOTIFY_WINDOW_MS,
          });
        });
      }
    }

    for (const appID of [...(await loadPending())]) {
      await enqueue(async () => {
        const cache = await track.load(appID);
        if (cache.length > 0)
          await syncAchievements(appID, await this.load(appID), cache);
      });
    }
  },
  watch: function (dir, options) {
    console.log(
      `Monitoring achievement changes in "${dir}" for ${JSON.stringify(options.file)}`
    );

    const watcher = watch(
      dir,
      {
        recursive: options.recursive,
        // Returning false (not skip) for a folder still recurses into it
        filter: f =>
          fileMatches(options, f) && (!options.filter || options.filter.test(f)),
      },
      (evt, name) => {
        if (evt !== "update") return;

        const debounceKey = `${dir}:${name}`;
        if (fileEventTimers.has(debounceKey)) {
          clearTimeout(fileEventTimers.get(debounceKey));
        }
        const timerId = setTimeout(() => {
          fileEventTimers.delete(debounceKey);
          enqueue(() => processAchievementFile(name, options));
        }, FILE_EVENT_DEBOUNCE_MS);
        fileEventTimers.set(debounceKey, timerId);
      }
    );
    // A watched folder that gets deleted is picked up again by the next rescan
    watcher.on("error", err => {
      console.warn(`Watcher error on ${dir}:`, err);
      watcher.close();
      this.watched.delete(dir);
    });
    this.watched.set(dir, watcher);
  },
  load: async function (appID) {
    let game = this.cache.find(game => game.appid == appID);
    if (!game) {
      console.log(`loading steam schema for ${appID}`);
      const lang = await getSteamApiLang();
      game = await steam.loadSteamData(appID, lang);
      this.cache.push(game);
      console.log("from file cache or remote");
    }
    return game;
  },
};

// Revalidate legacy displays even when no save file changes after an update.
// Keep a backup and retain the per-app unlock database; never transfer unlocks
// from a display that may belong to a different game.
async function repairAchievements() {
  for (const target of await library.listGames()) {
    if (target.kind !== "custom" && !target.installed) continue;
    try {
      const file =
        target.kind === "custom"
          ? target.gamesJsonPath
          : path.join(target.folder, "achievements.ascendara.json");
      let document;
      try {
        document = JSON.parse(await fs.readFile(file, "utf8"));
      } catch (error) {
        if (error.code === "ENOENT") continue;
        throw error;
      }
      const custom =
        target.kind === "custom"
          ? document.games.find(
              g =>
                library.normalizePath(g.executable) ===
                library.normalizePath(target.executable)
            )
          : null;
      const display = custom ? custom.achievementWatcher : document;
      if (!display) continue;
      const appid = await library.getAppId(target.folder);
      if (display.identityVersion === 1 && (!appid || display.appid === appid)) continue;
      if (display.identityVersion !== 1) {
        // Exclusive copy preserves the original backup across retries/restarts.
        await fs
          .copyFile(
            file,
            file + ".before-identity-fix.bak",
            require("fs").constants.COPYFILE_EXCL
          )
          .catch(error => {
            if (error.code !== "EEXIST") throw error;
          });
      }
      const cleared = {
        identityVersion: 1,
        appid: null,
        achievements: [],
        lastUpdated: new Date().toISOString(),
      };
      if (custom) custom.achievementWatcher = cleared;
      await fs.writeFile(
        file,
        JSON.stringify(custom ? document : cleared, null, 2),
        "utf8"
      );
      if (appid) {
        const game = await app.load(appid);
        await writeAchievementsJson(target, game, await track.load(appid));
      }
    } catch (error) {
      console.warn(`Achievement identity repair failed for ${target.name}:`, error);
    }
  }
}

// Writes the game's full achievement list where Ascendara reads it from
async function writeAchievementsJson(target, game, achievedCache) {
  const allAchievements = Array.isArray(game.achievement?.list)
    ? game.achievement.list
    : [];
  const achievedMap = {};
  for (const a of achievedCache) {
    achievedMap[a.name] = a;
  }
  const achievementsJson = allAchievements.map(a => {
    const achieved = achievedMap[a.name];
    return {
      message: a.displayName,
      achieved: achieved ? !!achieved.Achieved : false,
      unlockTime:
        achieved && achieved.Achieved && achieved.UnlockTime
          ? String(achieved.UnlockTime)
          : null,
      achID: a.name,
      icon: a.icon || null,
      description: a.description || "",
    };
  });
  const now = new Date().toISOString();

  if (target.kind === "custom") {
    // Custom game: update achievementWatcher key in games.json
    const gamesObj = JSON.parse(await fs.readFile(target.gamesJsonPath, "utf8"));
    if (!Array.isArray(gamesObj.games)) {
      throw new Error("games.json does not contain a games array");
    }
    const targetExe = library.normalizePath(target.executable);
    const matchIdx = gamesObj.games.findIndex(
      g => library.normalizePath(g.executable) === targetExe
    );
    if (matchIdx === -1) {
      throw new Error(`Could not find ${target.executable} in games.json`);
    }
    gamesObj.games[matchIdx].achievementWatcher = {
      identityVersion: 1,
      appid: String(game.appid),
      achievements: achievementsJson,
      lastUpdated: now,
    };
    await fs.writeFile(target.gamesJsonPath, JSON.stringify(gamesObj, null, 2), "utf8");
  } else {
    await fs.writeFile(
      path.join(target.folder, "achievements.ascendara.json"),
      JSON.stringify(
        {
          identityVersion: 1,
          appid: String(game.appid),
          achievements: achievementsJson,
          lastUpdated: now,
        },
        null,
        2
      ),
      "utf8"
    );
  }
  console.log(`Wrote ${game.name} achievements to ${target.name}`);
}

console.log("About to acquire single-instance lock...");

// Add error handler for uncaught exceptions from single-instance module
process.on("uncaughtException", err => {
  if (
    err.code === "EINVAL" &&
    err.syscall === "unlink" &&
    err.path &&
    err.path.includes("Achievement Watchdog-sock")
  ) {
    console.error("Single-instance lock cleanup error (ignoring):", err.message);
    // This is a known issue with single-instance on Windows - ignore and continue
    return;
  }
  // For other errors, log and exit
  console.error("Uncaught exception:", err);
  updateWatchdogStatus(false).then(() => {
    process.exit(1);
  });
});

instance
  .lock()
  .then(() => {
    console.log("Single-instance lock acquired. Starting app...");
    updateWatchdogStatus(true);
    app.start().catch(err => {
      console.error("app.start() failed:", err);
      updateWatchdogStatus(false);
      process.exit(1);
    });
  })
  .catch(err => {
    console.error("Failed to acquire single-instance lock:", err);
    console.log("Another instance may already be running.");
    process.exit(0);
  });
