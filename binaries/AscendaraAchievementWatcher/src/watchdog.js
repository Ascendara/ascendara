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
const { getSettings } = require("./userConfig.js");
const { spawn } = require("child_process");

// Get config from ENV or IPC
const timestampFilePath = path.join(process.env.USERPROFILE, "timestamp.ascendara.json");
const STEAM_WEB_API_KEY = process.env.ASCENDARA_STEAM_WEB_API_KEY;
let watchdogRunning = false;

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
    const exePath =
      process.env.NODE_ENV === "development"
        ? path.join(
            path.dirname(process.execPath),
            "../../AscendaraNotificationHelper/dist/AscendaraNotificationHelper.exe"
          )
        : path.join(path.dirname(process.execPath), "AscendaraNotificationHelper.exe");
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

var app = {
  isRecording: false,
  cache: [],
  options: {
    notification_advanced: {
      tick: 2000, // ms between notifications
    },
  },
  watcher: [],
  tick: 0,
  toastID: "Microsoft.XboxApp_8wekyb3d8bbwe!Microsoft.XboxApp",
  start: async function () {
    try {
      let self = this;
      self.cache = [];
      console.log("Achievement Watchdog starting ...");
      const folders = await monitor.getFolders();
      console.log(`monitor.getFolders() returned:`, folders);
      let i = 1;
      for (let folder of folders) {
        try {
          try {
            await fs.access(folder.dir);
            // If no error, folder exists
            self.watch(i, folder.dir, folder.options);
            i = i + 1;
          } catch (err) {
            // Folder does not exist, skip
          }
          i = i + 1;
        } catch (err) {
          console.log(err);
        }
      }
    } catch (err) {
      console.log(err);
      instance.unlock();
      await updateWatchdogStatus(false);
      process.exit();
    }
  },
  watch: function (i, dir, options) {
    let self = this;
    console.log(
      `Monitoring achievement changes in directory: "${dir}" with options:`,
      options
    );
    if (options.file && options.file.length > 0) {
      console.log(
        `Watching files in ${dir}: ${JSON.stringify(options.file)} with filter: ${options.filter}`
      );
    } else {
      console.warn(
        `WARNING: No files specified to watch in ${dir}. options.file is:`,
        options.file
      );
    }

    self.watcher[i] = watch(
      dir,
      { recursive: options.recursive, filter: options.filter },
      async function (evt, name) {
        console.log(`File event: ${evt} on file: ${name}`);
        try {
          if (evt !== "update") {
            console.log(`Ignoring event: ${evt} (only processing 'update' events)`);
            return;
          }

          const currentTime = Date.now();
          const fileLastModified = (await fs.stat(name)).mtimeMs || 0;
          console.log(
            `File last modified: ${fileLastModified}, current time: ${currentTime}, difference: ${currentTime - fileLastModified}ms`
          );
          if (currentTime - fileLastModified > 1000) {
            console.log(`Skipping event: file modified more than 1s ago.`);
            return;
          }

          let filePath = path.parse(name);
          console.log(`Checking if file is in watch list: ${filePath.base}`);
          if (!options.file.some(file => file == filePath.base)) {
            console.log(`File ${filePath.base} not in options.file, skipping.`);
            return;
          }

          console.log(`Achievement file change detected: ${name}`);

          if (
            moment().diff(moment(self.tick)) <= self.options.notification_advanced.tick
          ) {
            console.log(`Spamming protection active, skipping notification.`);
            throw "Spamming protection is enabled > SKIPPING";
          }
          self.tick = moment().valueOf();

          let appID;
          try {
            if (options.appid) {
              appID = options.appid;
            } else {
              // Try to extract appID for OnlineFix: .../OnlineFix/<AppID>/Stats/Achievements.ini
              const parts = filePath.dir.split(path.sep);
              const onlineFixIdx = parts.findIndex(p => p.toLowerCase() === "onlinefix");
              if (onlineFixIdx !== -1 && parts.length > onlineFixIdx + 1) {
                appID = parts[onlineFixIdx + 1];
              } else {
                // Fallback to original logic for other emus
                appID = filePath.dir
                  .replace(/(\\stats$)|(\\SteamEmu$)|(\\SteamEmu\\UserStats$)/gi, "")
                  .match(/([0-9]+$)/g)[0];
              }
            }
            console.log(`Detected appID: ${appID}`);
          } catch (err) {
            console.log(`Failed to extract appID from path: ${filePath.dir}`);
            throw "Unable to find game's appID";
          }

          let game = await self.load(appID);

          let isRunning = false;

          if (options.disableCheckIfProcessIsRunning === true) {
            isRunning = true;
          } else if (self.options.notification_advanced.checkIfProcessIsRunning) {
            if (await isFullscreenAppRunning()) {
              isRunning = true;
              console.log(
                "Fullscreen application detected on primary display. Assuming process is running"
              );
            } else if (game.binary) {
              isRunning = await tasklist.isProcessRunning(game.binary).catch(err => {
                console.error(err);
                console.warn("Assuming process is NOT running");
                return false;
              });

              if (!isRunning) {
                console.log("Trying with '-Win64-Shipping' (Unreal Engine Game) ...");
                isRunning = await tasklist
                  .isProcessRunning(game.binary.replace(".exe", "-Win64-Shipping.exe"))
                  .catch(err => {
                    console.error(err);
                    console.warn("Assuming process is NOT running");
                    return false;
                  });
              }
            } else {
              console.warn(
                `Warning! Missing "${game.name}" (${game.appid}) binary name > Overriding user choice to check if process is running`
              );
              isRunning = true;
            }
          } else {
            isRunning = true;
          }

          if (isRunning) {
            let achievements = await monitor.parse(name);

            if (achievements.length > 0) {
              let cache = await track.load(appID);

              let j = 0;
              for (let i in achievements) {
                if (Object.prototype.hasOwnProperty.call(achievements, i)) {
                  try {
                    let ach = game.achievement.list.find(achievement => {
                      if (achievements[i].crc) {
                        return achievements[i].crc.includes(
                          crc32(achievement.name).toString(16)
                        ); //(SSE) crc module removes leading 0 when dealing with anything below 0x1000 -.-'
                      } else {
                        return (
                          achievement.name == achievements[i].name ||
                          achievement.name.toUpperCase() ==
                            achievements[i].name.toUpperCase()
                        ); //uppercase == uppercase : cdx xcom chimera (apiname doesn't match case with steam schema)
                      }
                    });
                    if (!ach) throw "ACH_NOT_FOUND_IN_SCHEMA";

                    if (achievements[i].crc) {
                      achievements[i].name = ach.name;
                      delete achievements[i].crc;
                    }

                    let previous = cache.find(
                      achievement => achievement.name === ach.name
                    ) || {
                      Achieved: false,
                      CurProgress: 0,
                      MaxProgress: 0,
                      UnlockTime: 0,
                    };

                    if (
                      !previous.Achieved &&
                      achievements[i].Achieved &&
                      !previous.Notified
                    ) {
                      if (!achievements[i].UnlockTime || achievements[i].UnlockTime == 0)
                        achievements[i].UnlockTime = moment().unix();
                      console.log("Unlocked:" + ach.displayName);
                      console.log("Sending notification with payload:", {
                        title: "Achievement Unlocked!",
                        message: ach.displayName,
                        icon: ach.icon || "",
                        appid: game.appid,
                        game: game.name,
                        achievement: ach.name,
                        description: ach.description || "",
                        unlockTime: achievements[i].UnlockTime,
                      });
                      try {
                        await sendNotification({
                          title: "Achievement Unlocked!",
                          message: ach.displayName,
                          icon: ach.icon || "",
                          appid: game.appid,
                          game: game.name,
                          achievement: ach.name,
                          description: ach.description || "",
                          unlockTime: achievements[i].UnlockTime,
                        });
                        console.log("Notification sent successfully.");
                        achievements[i].Notified = true;
                        // Also update 'Notified' in cache for this achievement
                        const cacheIdx = cache.findIndex(a => a.name === ach.name);
                        if (cacheIdx !== -1) {
                          cache[cacheIdx].Notified = true;
                          cache[cacheIdx].Achieved = true;
                          cache[cacheIdx].UnlockTime = achievements[i].UnlockTime;
                        } else {
                          cache.push({
                            name: ach.name,
                            Notified: true,
                            Achieved: true,
                            UnlockTime: achievements[i].UnlockTime,
                          });
                        }
                        await track.save(appID, cache);
                        // Update achievements.ascendara.json for the running game
                        try {
                          await updateAchievementsJsonForRunningGame(game, cache);
                        } catch (err) {
                          console.error(
                            "Failed to update achievements.ascendara.json:",
                            err
                          );
                        }
                      } catch (err) {
                        console.error("Failed to send notification:", err);
                      }
                    } else if (previous.Achieved && achievements[i].Achieved) {
                      console.log("Already unlocked:" + ach.displayName);
                      if (
                        previous.UnlockTime > 0 &&
                        previous.UnlockTime != achievements[i].UnlockTime
                      )
                        achievements[i].UnlockTime = previous.UnlockTime;
                    }
                  } catch (err) {
                    if (err === "ACH_NOT_FOUND_IN_SCHEMA") {
                      console.warn(
                        `${achievements[i].crc ? `${achievements[i].crc} (CRC32)` : `${achievements[i].name}`} not found in game schema data ?! ... Achievement was probably deleted or renamed over time > SKIPPING`
                      );
                    } else {
                      console.error(
                        `Unexpected Error for achievement "${achievements[i].name}": ${err}`
                      );
                    }
                  }
                }
              }
              // Save both the updated achievements and cache for persistence
              await track.save(appID, cache);
            }
          } else {
            console.warn(`game's process "${game.binary}" not running`);
          }
        } catch (err) {
          console.warn(err);
        }
      }
    );
  },
  load: async function (appID) {
    try {
      let self = this;

      console.log(`loading steam schema for ${appID}`);

      let search = self.cache.find(game => game.appid == appID);
      let game;
      if (search) {
        game = search;
        console.log("from memory cache");
      } else {
        const lang = await getSteamApiLang();
        game = await steam.loadSteamData(appID, lang, STEAM_WEB_API_KEY);
        self.cache.push(game);
        console.log("from file cache or remote");
      }
      return game;
    } catch (err) {
      throw err;
    }
  },
};

// Helper to update achievements.ascendara.json for the running game
async function updateAchievementsJsonForRunningGame(game, achievedCache) {
  // 1. Get settings
  const settings = await getSettings();
  const downloadDir = settings.downloadDirectory;
  if (!downloadDir) throw new Error("downloadDirectory not set in settings");

  const fsPath = require("path");
  const fsPromises = require("fs").promises;

  // 2. List subfolders in downloadDir
  const gameFolders = await fsPromises.readdir(downloadDir, { withFileTypes: true });
  let found = null;
  // Check standard Ascendara-installed games
  for (const dirent of gameFolders) {
    if (!dirent.isDirectory()) continue;
    const gameFolderPath = fsPath.join(downloadDir, dirent.name);
    // Look for {gamename}.ascendara.json in this folder
    const jsonPath = fsPath.join(gameFolderPath, `${dirent.name}.ascendara.json`);
    try {
      const data = await fsPromises.readFile(jsonPath, "utf8");
      const parsed = JSON.parse(data);
      if (parsed.isRunning === true) {
        found = { folder: gameFolderPath, json: parsed, jsonPath };
        break;
      }
    } catch (e) {
      // ignore missing or invalid files
    }
  }
  // If not found, check games.json for custom games
  if (!found) {
    const gamesJsonPath = fsPath.join(downloadDir, "games.json");
    try {
      const gamesData = await fsPromises.readFile(gamesJsonPath, "utf8");
      const gamesObj = JSON.parse(gamesData);
      if (Array.isArray(gamesObj.games)) {
        for (const g of gamesObj.games) {
          if (
            g.isRunning === true &&
            typeof g.executable === "string" &&
            g.executable.length > 0
          ) {
            // Get folder from executable path
            const folder = fsPath.dirname(g.executable);
            found = { folder, json: g, jsonPath: gamesJsonPath };
            break;
          }
        }
      }
    } catch (e) {
      // ignore if games.json doesn't exist or is invalid
    }
  }
  if (!found) {
    throw new Error(
      "No running game folder found with isRunning: true (checked both Ascendara-installed and custom games)"
    );
  }
  // 3. Build achievements data in the new format
  const allAchievements = Array.isArray(game.achievement?.list)
    ? game.achievement.list
    : [];
  const achievedMap = {};
  if (Array.isArray(achievedCache)) {
    for (const a of achievedCache) {
      achievedMap[a.name] = a;
    }
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
  // 4. Write achievements data
  const now = new Date().toISOString();
  if (found.jsonPath && found.jsonPath.endsWith("games.json")) {
    // Custom game: update achievementWatcher key in games.json
    try {
      const gamesData = await fsPromises.readFile(found.jsonPath, "utf8");
      const gamesObj = JSON.parse(gamesData);
      if (Array.isArray(gamesObj.games)) {
        // Find the correct game object by executable path (robust, normalized)
        function normalizePath(p) {
          return String(p || "")
            .replace(/\\/g, "/")
            .trim()
            .toLowerCase();
        }
        const targetExe = normalizePath(
          found.json && found.json.executable
            ? found.json.executable
            : game.binaryPath || game.executable || game.binary
        );
        const matchIdx = gamesObj.games.findIndex(
          g => normalizePath(g.executable) === targetExe
        );
        if (matchIdx !== -1) {
          gamesObj.games[matchIdx].achievementWatcher = {
            achievements: achievementsJson,
            lastUpdated: now,
          };
          await fsPromises.writeFile(
            found.jsonPath,
            JSON.stringify(gamesObj, null, 2),
            "utf8"
          );
        } else {
          // Log available executables for debugging
          const available = gamesObj.games.map(g => g.executable);
          console.error(
            "Could not find matching game in games.json to update achievements. Tried to match:",
            targetExe,
            "Available:",
            available
          );
          throw new Error(
            "Could not find matching game in games.json to update achievements"
          );
        }
      } else {
        throw new Error("games.json does not contain a games array");
      }
    } catch (e) {
      throw new Error("Failed to update achievementWatcher in games.json: " + e);
    }
  } else {
    // Standard game: write to achievements.ascendara.json as before
    const outPath = fsPath.join(found.folder, "achievements.ascendara.json");
    await fsPromises.writeFile(
      outPath,
      JSON.stringify({ achievements: achievementsJson, lastUpdated: now }, null, 2),
      "utf8"
    );
  }
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
