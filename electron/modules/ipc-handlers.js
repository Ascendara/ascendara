/**
 * Miscellaneous IPC Handlers Module
 * Contains IPC handlers that don't fit into other modules
 */

const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const axios = require("axios");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { ipcMain, shell, dialog, app, BrowserWindow, Notification } = require("electron");
const {
  isDev,
  isWindows,
  appDirectory,
  APIKEY,
  analyticsAPI,
  imageKey,
  steamWebApiKey,
  TIMESTAMP_FILE,
} = require("./config");
const { getSettingsManager } = require("./settings");
const { sanitizeText, getExtensionFromMimeType } = require("./utils");
const { initializeDiscordRPC, destroyDiscordRPC, setRPCState } = require("./discord-rpc");
const steamgrid = require("./steamgrid");

let apiKeyOverride = null;
let has_launched = false;

/**
 * Get Twitch access token
 */
const getTwitchToken = async (clientId, clientSecret) => {
  try {
    const response = await axios.post(
      `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`
    );
    return response.data.access_token;
  } catch (error) {
    console.error("Error getting Twitch token:", error.message);
    throw error;
  }
};

// IGDB functions removed - now using Steam API only

/**
 * Register miscellaneous IPC handlers
 */
function registerMiscHandlers() {
  const settingsManager = getSettingsManager();

  // Reload app
  ipcMain.handle("reload", () => {
    app.relaunch();
    app.exit();
  });

  // Is dev mode
  ipcMain.handle("is-dev", () => isDev);

  // IGDB handler removed - now using Steam API only

  // GiantBomb API request handler (bypasses CORS)
  ipcMain.handle("giantbomb-request", async (_, { url, apiKey }) => {
    try {
      const response = await axios.get(url, {
        headers: {
          "User-Agent": "Ascendara Game Library (contact@ascendara.com)",
          Accept: "application/json",
        },
        params: {
          api_key: apiKey,
          format: "json",
        },
      });
      return { success: true, data: response.data };
    } catch (error) {
      console.error("GiantBomb request error:", error.message);
      return { success: false, error: error.message };
    }
  });

  // Steam API request handler (now proxied through backend)
  ipcMain.handle("steam-request", async (_, { url }) => {
    try {
      // Parse the URL to determine which proxy endpoint to use
      const urlObj = new URL(url);
      let proxyUrl;

      if (url.includes("storesearch")) {
        // Extract search term from URL
        const term = urlObj.searchParams.get("term");
        proxyUrl = `https://api.ascendara.app/api/proxy/steam/search?term=${encodeURIComponent(term)}`;
      } else if (url.includes("appdetails")) {
        // Extract appids from URL
        const appids = urlObj.searchParams.get("appids");
        proxyUrl = `https://api.ascendara.app/api/proxy/steam/appdetails?appids=${appids}`;
      } else {
        // Fallback to direct request for unknown endpoints
        console.warn("Unknown Steam API endpoint, using direct request:", url);
        const response = await axios.get(url, {
          headers: {
            "User-Agent": "Ascendara Game Library (contact@ascendara.com)",
            Accept: "application/json",
          },
        });
        return { success: true, data: response.data };
      }

      // Make request to backend proxy
      const response = await axios.get(proxyUrl, {
        headers: {
          "User-Agent": "Ascendara Game Library (contact@ascendara.com)",
          Accept: "application/json",
        },
      });

      return { success: true, data: response.data };
    } catch (error) {
      console.error("Steam proxy request error:", error.message);
      return { success: false, error: error.message };
    }
  });

  // Is experiment / branch
  const { appBranch } = require("./config");
  const { testingVersion } = require("./config");

  ipcMain.handle("is-experiment", () => appBranch === "experimental");
  ipcMain.handle("get-testing-version", () => testingVersion);
  ipcMain.handle("get-branch", () => appBranch);

  // Has admin
  let hasAdmin = false;
  ipcMain.handle("has-admin", async () => hasAdmin);

  // API key handlers
  ipcMain.handle("override-api-key", (_, newApiKey) => {
    apiKeyOverride = newApiKey;
    console.log("API Key overridden:", apiKeyOverride);
  });

  // Legacy API key handlers (deprecated - use get-auth-headers instead)
  ipcMain.handle("get-api-key", () => apiKeyOverride || APIKEY);

  ipcMain.handle("get-analytics-key", () => analyticsAPI);

  ipcMain.handle("get-image-key", () => imageKey);

  ipcMain.handle("get-steam-api-key", () => steamWebApiKey);

  // Time-based authentication
  const authHelper = require("./auth-helper");
  ipcMain.handle("get-auth-headers", () => authHelper.generateAuthHeaders());

  // Open URL
  ipcMain.handle("open-url", async (_, url) => {
    shell.openExternal(url);
  });

  // Read local file
  ipcMain.handle("read-local-file", async (_, filePath) => {
    try {
      return await fs.promises.readFile(filePath, "utf8");
    } catch (error) {
      console.error("Error reading local file:", error);
      throw error;
    }
  });

  // List backup files in a directory
  ipcMain.handle("listBackupFiles", async (_, dirPath) => {
    try {
      if (!fs.existsSync(dirPath)) {
        return [];
      }
      const files = await fs.promises.readdir(dirPath);
      return files;
    } catch (error) {
      console.error("Error listing backup files:", error);
      return [];
    }
  });

  // Read backup file as buffer
  ipcMain.handle("readBackupFile", async (_, filePath) => {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error("Backup file not found");
      }
      const buffer = await fs.promises.readFile(filePath);
      return buffer;
    } catch (error) {
      console.error("Error reading backup file:", error);
      throw error;
    }
  });

  // Get temp directory path
  ipcMain.handle("getTempPath", async () => {
    return os.tmpdir();
  });

  // Write file (for cloud backup restore)
  ipcMain.handle("writeFile", async (_, filePath, buffer) => {
    try {
      await fs.promises.writeFile(filePath, Buffer.from(buffer));
      return true;
    } catch (error) {
      console.error("Error writing file:", error);
      throw error;
    }
  });

  // Delete file (cleanup after restore)
  ipcMain.handle("deleteFile", async (_, filePath) => {
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
      return true;
    } catch (error) {
      console.error("Error deleting file:", error);
      throw error;
    }
  });

  // Read/write file
  ipcMain.handle("read-file", async (_, filePath) => {
    try {
      return fs.readFileSync(filePath, "utf8");
    } catch (error) {
      console.error("Error reading file:", error);
      throw error;
    }
  });

  ipcMain.handle("write-file", async (_, filePath, content) => {
    try {
      fs.writeFileSync(filePath, content);
      return true;
    } catch (error) {
      console.error("Error writing file:", error);
      throw error;
    }
  });

  // Fetch API image
  ipcMain.handle("fetch-api-image", async (_, endpoint, imgID, timestamp, signature) => {
    try {
      const url = `https://api.ascendara.app/${endpoint}/${imgID}`;
      const response = await axios.get(url, {
        headers: {
          "X-Timestamp": timestamp.toString(),
          "X-Signature": signature,
          "Cache-Control": "no-store",
        },
        responseType: "arraybuffer",
      });

      if (response.status !== 200) {
        return { error: true, status: response.status };
      }

      const base64 = Buffer.from(response.data).toString("base64");
      const contentType = response.headers["content-type"] || "image/jpeg";
      return { dataUrl: `data:${contentType};base64,${base64}` };
    } catch (error) {
      console.error("Error fetching API image:", error.message);
      return { error: true, status: error.response?.status || 0, message: error.message };
    }
  });

  // Get local image as base64
  ipcMain.handle("get-local-image-url", async (_, imagePath) => {
    try {
      if (fs.existsSync(imagePath)) {
        const imageBuffer = await fs.promises.readFile(imagePath);
        const base64 = imageBuffer.toString("base64");
        return `data:image/jpeg;base64,${base64}`;
      }
      return null;
    } catch (error) {
      console.error("Error getting local image:", error);
      return null;
    }
  });

  // Upload support logs
  ipcMain.handle("upload-support-logs", async (_, sessionToken, appToken) => {
    try {
      const appDataPath = app.getPath("appData");
      const ascendaraPath = path.join(appDataPath, "Ascendara by tagoWorks");

      const logFiles = {
        "debug.log": path.join(ascendaraPath, "debug.log"),
        "downloadmanager.log": path.join(ascendaraPath, "downloadmanager.log"),
        "notificationhelper.log": path.join(ascendaraPath, "notificationhelper.log"),
        "gamehandler.log": path.join(ascendaraPath, "gamehandler.log"),
      };

      const logs = {};
      for (const [name, filePath] of Object.entries(logFiles)) {
        try {
          if (fs.existsSync(filePath)) {
            const content = await fs.promises.readFile(filePath, "utf-8");
            logs[name] = content.slice(-512000);
          } else {
            logs[name] = "[File not found]";
          }
        } catch (err) {
          logs[name] = `[Error reading file: ${err.message}]`;
        }
      }

      const response = await axios.post(
        "https://api.ascendara.app/support/upload-logs",
        { session_token: sessionToken, logs },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${appToken}`,
          },
        }
      );

      return { success: true, data: response.data };
    } catch (error) {
      console.error("Error uploading support logs:", error.message);
      return { success: false, error: error.response?.data?.message || error.message };
    }
  });

  // Dialog handlers
  ipcMain.handle("open-directory-dialog", async () => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("open-file-dialog", async (_, exePath = null) => {
    const settings = settingsManager.getSettings();
    let defaultPath = settings.downloadDirectory || app.getPath("downloads");

    if (exePath) {
      defaultPath = path.dirname(exePath);
    }

    const result = await dialog.showOpenDialog({
      defaultPath,
      properties: ["openFile"],
      filters: [{ name: "Executable Files", extensions: ["exe"] }],
    });

    return result.canceled ? null : result.filePaths[0];
  });

  // Profile image handlers
  ipcMain.handle("upload-profile-image", async (_, imageBase64) => {
    try {
      const userDataPath = app.getPath("userData");
      const imagesDir = path.join(userDataPath, "profile_images");

      await fs.ensureDir(imagesDir);

      const imagePath = path.join(imagesDir, "profile.png");
      const imageBuffer = Buffer.from(imageBase64.split(",")[1], "base64");
      await fs.writeFile(imagePath, imageBuffer);

      return { success: true, path: imagePath };
    } catch (error) {
      console.error("Error saving profile image:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("get-profile-image", async () => {
    try {
      const userDataPath = app.getPath("userData");
      const imagePath = path.join(userDataPath, "profile_images", "profile.png");

      if (await fs.pathExists(imagePath)) {
        const imageBuffer = await fs.readFile(imagePath);
        return imageBuffer.toString("base64");
      }
      return null;
    } catch (error) {
      console.error("Error reading profile image:", error);
      return null;
    }
  });

  // Show test notification
  ipcMain.handle("show-test-notification", async () => {
    try {
      const settings = settingsManager.getSettings();
      const theme = settings.theme || "purple";

      if (!settings.notifications) {
        return { success: false, error: "Notifications are disabled in settings" };
      }

      if (isWindows) {
        const notificationHelperPath = isDev
          ? "./binaries/AscendaraNotificationHelper/dist/AscendaraNotificationHelper.exe"
          : path.join(appDirectory, "/resources/AscendaraNotificationHelper.exe");

        const args = [
          "--theme",
          theme,
          "--title",
          "Test Notification",
          "--message",
          "This is a test notification from Ascendara!",
        ];

        const process = spawn(notificationHelperPath, args, {
          detached: true,
          stdio: "ignore",
        });
        process.unref();
      } else {
        const notification = new Notification({
          title: "Test Notification",
          body: "This is a test notification from Ascendara!",
          silent: false,
          timeoutType: "default",
          urgency: "normal",
          icon: path.join(app.getAppPath(), "build", "icon.png"),
        });
        notification.show();
      }

      return { success: true };
    } catch (error) {
      console.error("Error showing test notification:", error);
      return { success: false, error: error.message };
    }
  });

  // Discord RPC handlers
  ipcMain.handle("toggle-discord-rpc", async (_, enabled) => {
    try {
      if (enabled) {
        initializeDiscordRPC();
        return { success: true, message: "Discord RPC enabled" };
      } else {
        destroyDiscordRPC();
        return { success: true, message: "Discord RPC disabled" };
      }
    } catch (error) {
      console.error("Error toggling Discord RPC:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("switch-rpc", (_, state) => {
    setRPCState(state);
  });

  // Welcome complete
  ipcMain.handle("welcome-complete", () => {
    BrowserWindow.getAllWindows().forEach(window => {
      window.webContents.send("welcome-complete");
    });
  });

  // Check v7 welcome
  ipcMain.handle("check-v7-welcome", async () => {
    try {
      const v7Path = path.join(app.getPath("userData"), "v7.json");
      return !fs.existsSync(v7Path);
    } catch (error) {
      return false;
    }
  });

  // Settings changed listener
  ipcMain.on("settings-changed", () => {
    BrowserWindow.getAllWindows().forEach(window => {
      window.webContents.send("settings-updated");
    });
  });

  // Game rated
  ipcMain.handle("game-rated", async (_, game, isCustom) => {
    const settings = settingsManager.getSettings();
    try {
      if (!settings.downloadDirectory) {
        throw new Error("Download directory not set");
      }

      if (isCustom) {
        const gamesFilePath = path.join(settings.downloadDirectory, "games.json");
        const gamesData = JSON.parse(fs.readFileSync(gamesFilePath, "utf8"));
        const gameInfo = gamesData.games.find(g => g.game === game);
        if (!gameInfo) throw new Error("Custom game not found");
        gameInfo.hasRated = true;
        fs.writeFileSync(gamesFilePath, JSON.stringify(gamesData, null, 2));
      } else {
        const gameDirectory = path.join(settings.downloadDirectory, game);
        const gameInfoPath = path.join(gameDirectory, `${game}.ascendara.json`);
        const gameInfo = JSON.parse(fs.readFileSync(gameInfoPath, "utf8"));
        gameInfo.hasRated = true;
        fs.writeFileSync(gameInfoPath, JSON.stringify(gameInfo, null, 2));
      }
      return true;
    } catch (error) {
      console.error("Error setting game as rated:", error);
      return false;
    }
  });

  // Delete game directory
  ipcMain.handle("delete-game-directory", async (_, game) => {
    try {
      const settings = settingsManager.getSettings();
      if (!settings.downloadDirectory) return;

      const gameDirectory = path.join(settings.downloadDirectory, game);

      try {
        const files = await fs.promises.readdir(gameDirectory, { withFileTypes: true });
        for (const file of files) {
          const fullPath = path.join(gameDirectory, file.name);
          await fs.promises.rm(fullPath, { recursive: true, force: true });
        }
        await fs.promises.rmdir(gameDirectory);
      } catch (error) {
        console.error("Error deleting the game directory:", error);
        throw error;
      }
    } catch (error) {
      console.error("Error deleting the game directory:", error);
    }
  });

  // Read game achievements
  ipcMain.handle("read-game-achievements", async (_, game, isCustom = false) => {
    const settings = settingsManager.getSettings();
    if (!settings.downloadDirectory || !settings.additionalDirectories) {
      return null;
    }

    const allDirectories = [
      settings.downloadDirectory,
      ...settings.additionalDirectories,
    ];

    if (!isCustom) {
      for (const directory of allDirectories) {
        const achievementsPath = path.join(
          directory,
          game,
          "achievements.ascendara.json"
        );
        if (fs.existsSync(achievementsPath)) {
          try {
            const data = fs.readFileSync(achievementsPath, "utf8");
            const parsed = JSON.parse(data);

            if (parsed.achievementWater && !parsed.watcher) {
              parsed.watcher = parsed.achievementWater;
              delete parsed.achievementWater;
              fs.writeFileSync(achievementsPath, JSON.stringify(parsed, null, 4), "utf8");
            }

            return parsed;
          } catch (error) {
            console.error("Error reading achievements file:", error);
            return null;
          }
        }
      }
      return null;
    } else {
      try {
        const gamesFilePath = path.join(settings.downloadDirectory, "games.json");
        const gamesData = JSON.parse(fs.readFileSync(gamesFilePath, "utf8"));
        const gameInfo = gamesData.games.find(g => g.game === game);

        if (gameInfo) {
          if (gameInfo.achievementWater && !gameInfo.achievementWatcher) {
            gameInfo.achievementWatcher = gameInfo.achievementWater;
            delete gameInfo.achievementWater;
            fs.writeFileSync(gamesFilePath, JSON.stringify(gamesData, null, 4), "utf8");
          }

          if (gameInfo.achievementWatcher) {
            return gameInfo.achievementWatcher;
          }

          if (gameInfo.executable) {
            const achievementsPath = path.join(
              path.dirname(gameInfo.executable),
              "achievements.ascendara.json"
            );
            if (fs.existsSync(achievementsPath)) {
              return JSON.parse(fs.readFileSync(achievementsPath, "utf8"));
            }
          }
        }
      } catch (error) {
        console.error("Error reading games.json:", error);
      }
      return null;
    }
  });

  // Compute achievements leaderboard (main process)
  // Expects games as an array of strings or objects: { gameName|game, isCustom }
  // Returns ranked entries: { gameName, unlocked, total, percentage }
  ipcMain.handle("get-achievements-leaderboard", async (_, games = [], options = {}) => {
    try {
      const limit =
        typeof options?.limit === "number" && Number.isFinite(options.limit)
          ? Math.max(1, Math.floor(options.limit))
          : 6;

      if (!Array.isArray(games) || games.length === 0) return [];

      // Reuse the existing achievements reader via a local invoke-style call.
      // We intentionally call the underlying IPC handler logic by invoking the same
      // reader through ipcMain's handler directly is not supported, so we replicate
      // the minimal read logic here.
      const settings = settingsManager.getSettings();
      if (!settings.downloadDirectory || !settings.additionalDirectories) {
        return [];
      }

      const allDirectories = [
        settings.downloadDirectory,
        ...settings.additionalDirectories,
      ];

      const readAchievements = async (gameName, isCustom) => {
        if (!gameName) return null;

        if (!isCustom) {
          for (const directory of allDirectories) {
            const achievementsPath = path.join(
              directory,
              gameName,
              "achievements.ascendara.json"
            );
            if (fs.existsSync(achievementsPath)) {
              try {
                const data = fs.readFileSync(achievementsPath, "utf8");
                const parsed = JSON.parse(data);

                if (parsed.achievementWater && !parsed.watcher) {
                  parsed.watcher = parsed.achievementWater;
                  delete parsed.achievementWater;
                  fs.writeFileSync(
                    achievementsPath,
                    JSON.stringify(parsed, null, 4),
                    "utf8"
                  );
                }

                return parsed;
              } catch (error) {
                console.error("Error reading achievements file:", error);
                return null;
              }
            }
          }
          return null;
        }

        // Custom game: stored in games.json (achievementWatcher) or alongside executable
        try {
          const gamesFilePath = path.join(settings.downloadDirectory, "games.json");
          const gamesData = JSON.parse(fs.readFileSync(gamesFilePath, "utf8"));
          const gameInfo = gamesData.games.find(g => g.game === gameName);

          if (gameInfo) {
            if (gameInfo.achievementWater && !gameInfo.achievementWatcher) {
              gameInfo.achievementWatcher = gameInfo.achievementWater;
              delete gameInfo.achievementWater;
              fs.writeFileSync(gamesFilePath, JSON.stringify(gamesData, null, 4), "utf8");
            }

            if (gameInfo.achievementWatcher) {
              return gameInfo.achievementWatcher;
            }

            if (gameInfo.executable) {
              const achievementsPath = path.join(
                path.dirname(gameInfo.executable),
                "achievements.ascendara.json"
              );
              if (fs.existsSync(achievementsPath)) {
                return JSON.parse(fs.readFileSync(achievementsPath, "utf8"));
              }
            }
          }
        } catch (error) {
          console.error("Error reading games.json:", error);
        }

        return null;
      };

      const entries = await Promise.all(
        games.map(async g => {
          const gameName = typeof g === "string" ? g : g?.gameName || g?.game || g?.name;
          const isCustom = typeof g === "object" ? !!g?.isCustom : false;

          const achievementData = await readAchievements(gameName, isCustom);

          // The achievement data structure has achievements nested in .achievements property
          const list = achievementData?.achievements;

          if (!Array.isArray(list) || list.length === 0) return null;

          const unlocked = list.filter(
            a => !!(a?.achieved || a?.unlocked || a?.isUnlocked)
          ).length;
          const total = list.length;

          return {
            gameName,
            unlocked,
            total,
            percentage: total > 0 ? Math.round((unlocked / total) * 100) : 0,
          };
        })
      );

      return entries
        .filter(Boolean)
        .sort((a, b) => {
          if (b.unlocked !== a.unlocked) return b.unlocked - a.unlocked;
          if (b.percentage !== a.percentage) return b.percentage - a.percentage;
          if (b.total !== a.total) return b.total - a.total;
          return String(a.gameName).localeCompare(String(b.gameName));
        })
        .slice(0, limit);
    } catch (error) {
      console.error("Error computing achievements leaderboard:", error);
      return [];
    }
  });

  // Write game achievements (for cloud restore)
  // isCustom parameter tells us if this is a custom game (stored in games.json)
  ipcMain.handle(
    "write-game-achievements",
    async (_, gameName, achievements, isCustom = false) => {
      const settings = settingsManager.getSettings();
      try {
        if (!settings.downloadDirectory) {
          return { success: false, error: "Download directory not set" };
        }

        // First, check if this is a custom game in games.json
        const gamesFilePath = path.join(settings.downloadDirectory, "games.json");
        if (fs.existsSync(gamesFilePath)) {
          const gamesData = JSON.parse(await fs.promises.readFile(gamesFilePath, "utf8"));

          // Find the game by name (case-insensitive)
          const gameIndex = gamesData.games?.findIndex(
            g => g.game?.toLowerCase() === gameName.toLowerCase()
          );

          if (gameIndex !== -1) {
            // This is a custom game - store achievements in games.json
            gamesData.games[gameIndex].achievementWatcher = achievements;
            await fs.promises.writeFile(
              gamesFilePath,
              JSON.stringify(gamesData, null, 4),
              "utf8"
            );
            console.log(`Wrote achievements for ${gameName} to games.json (custom game)`);
            return { success: true };
          }
        }

        // Not a custom game - find the game directory
        const { sanitizeText } = require("./utils");
        const sanitizedGame = sanitizeText(gameName);
        const allDirectories = [
          settings.downloadDirectory,
          ...(settings.additionalDirectories || []),
        ];

        // Find the game directory (try both sanitized and original name)
        for (const directory of allDirectories) {
          // Try sanitized name first
          let gameDir = path.join(directory, sanitizedGame);
          if (fs.existsSync(gameDir)) {
            const achievementsPath = path.join(gameDir, "achievements.ascendara.json");
            await fs.promises.writeFile(
              achievementsPath,
              JSON.stringify(achievements, null, 4),
              "utf8"
            );
            console.log(`Wrote achievements for ${gameName} to ${achievementsPath}`);
            return { success: true };
          }
          // Try original name
          gameDir = path.join(directory, gameName);
          if (fs.existsSync(gameDir)) {
            const achievementsPath = path.join(gameDir, "achievements.ascendara.json");
            await fs.promises.writeFile(
              achievementsPath,
              JSON.stringify(achievements, null, 4),
              "utf8"
            );
            console.log(`Wrote achievements for ${gameName} to ${achievementsPath}`);
            return { success: true };
          }
        }

        return { success: false, error: "Game not found" };
      } catch (error) {
        console.error("Error writing game achievements:", error);
        return { success: false, error: error.message };
      }
    }
  );

  // Save custom game
  ipcMain.handle(
    "save-custom-game",
    async (event, game, online, dlc, version, executable, imgID) => {
      const settings = settingsManager.getSettings();
      try {
        if (!settings.downloadDirectory) return;

        const gamesFilePath = path.join(settings.downloadDirectory, "games.json");
        const gamesDirectory = path.join(settings.downloadDirectory, "games");

        if (!fs.existsSync(gamesDirectory)) {
          fs.mkdirSync(gamesDirectory, { recursive: true });
        }

        if (imgID) {
          let imageBuffer;
          let extension = ".jpg";

          if (settings.usingLocalIndex && settings.localIndex) {
            const localImagePath = path.join(settings.localIndex, "imgs", `${imgID}.jpg`);
            try {
              imageBuffer = await fs.promises.readFile(localImagePath);
            } catch (error) {
              console.warn(`Could not load local image for ${imgID}, skipping:`, error);
              imageBuffer = null;
            }
          } else {
            let imageLink;
            if (settings.gameSource === "fitgirl") {
              imageLink = `https://api.ascendara.app/v2/fitgirl/image/${imgID}`;
            } else {
              imageLink = `https://api.ascendara.app/v2/image/${imgID}`;
            }

            const response = await axios({
              url: imageLink,
              method: "GET",
              responseType: "arraybuffer",
            });

            imageBuffer = Buffer.from(response.data);
            const mimeType = response.headers["content-type"];
            extension = getExtensionFromMimeType(mimeType);
          }

          if (imageBuffer) {
            await fs.promises.writeFile(
              path.join(gamesDirectory, `${game}.ascendara${extension}`),
              imageBuffer
            );
          }
        }

        try {
          await fs.promises.access(gamesFilePath, fs.constants.F_OK);
        } catch (error) {
          await fs.promises.mkdir(settings.downloadDirectory, { recursive: true });
          await fs.promises.writeFile(
            gamesFilePath,
            JSON.stringify({ games: [] }, null, 2)
          );
        }

        const gamesData = JSON.parse(await fs.promises.readFile(gamesFilePath, "utf8"));
        gamesData.games.push({
          game,
          online,
          dlc,
          version,
          executable,
          isRunning: false,
        });
        await fs.promises.writeFile(gamesFilePath, JSON.stringify(gamesData, null, 2));
      } catch (error) {
        console.error("Error saving custom game:", error);
      }
    }
  );

  // Update game cover
  ipcMain.handle("update-game-cover", async (_, game, imgID, imageData) => {
    const settings = settingsManager.getSettings();
    try {
      if (!settings.downloadDirectory) return false;

      const gamesDirectory = path.join(settings.downloadDirectory, "games");

      if (!fs.existsSync(gamesDirectory)) {
        await fs.promises.mkdir(gamesDirectory, { recursive: true });
      }

      let imageBuffer;
      let extension = ".jpg";

      if (imgID) {
        if (settings.usingLocalIndex && settings.localIndex) {
          const localImagePath = path.join(settings.localIndex, "imgs", `${imgID}.jpg`);
          try {
            imageBuffer = await fs.promises.readFile(localImagePath);
          } catch (error) {
            console.warn(`Could not load local image for ${imgID}:`, error);
            return false;
          }
        } else {
          const imageLink =
            settings.gameSource === "fitgirl"
              ? `https://api.ascendara.app/v2/fitgirl/image/${imgID}`
              : `https://api.ascendara.app/v2/image/${imgID}`;

          const response = await axios({
            url: imageLink,
            method: "GET",
            responseType: "arraybuffer",
          });

          imageBuffer = Buffer.from(response.data);
          const mimeType = response.headers["content-type"];
          extension = getExtensionFromMimeType(mimeType);
        }
      } else if (imageData) {
        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
        imageBuffer = Buffer.from(base64Data, "base64");

        if (imageData.includes("image/png")) {
          extension = ".png";
        } else if (imageData.includes("image/jpeg") || imageData.includes("image/jpg")) {
          extension = ".jpg";
        }
      } else {
        return false;
      }

      const filePath = path.join(gamesDirectory, `${game}.ascendara${extension}`);
      await fs.promises.writeFile(filePath, imageBuffer);

      BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed()) {
          win.webContents.send("cover-image-updated", { game, success: true });
        }
      });

      return true;
    } catch (error) {
      console.error("Error updating game cover:", error);
      return false;
    }
  });

  // Modify game executable
  ipcMain.handle("modify-game-executable", (_, game, executable) => {
    const settings = settingsManager.getSettings();
    try {
      if (!settings.downloadDirectory || !settings.additionalDirectories) return false;

      const allDirectories = [
        settings.downloadDirectory,
        ...settings.additionalDirectories,
      ];

      for (const directory of allDirectories) {
        const gameInfoPath = path.join(directory, game, `${game}.ascendara.json`);

        if (fs.existsSync(gameInfoPath)) {
          const gameInfo = JSON.parse(fs.readFileSync(gameInfoPath, "utf8"));
          gameInfo.executable = executable;
          fs.writeFileSync(gameInfoPath, JSON.stringify(gameInfo, null, 2));
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error("Error modifying game executable:", error);
      return false;
    }
  });

  // Local crack directory handlers
  ipcMain.handle("get-local-crack-directory", () => {
    const possiblePaths = [
      path.join(os.homedir(), "AppData", "Roaming", "Goldberg SteamEmu Saves"),
      path.join(os.homedir(), "AppData", "Local", "Goldberg SteamEmu Saves"),
      path.join(app.getPath("userData"), "Goldberg SteamEmu Saves"),
    ];

    const filePath = path.join(app.getPath("userData"), "ascendarasettings.json");
    let settings;
    try {
      settings = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (error) {
      settings = {};
    }

    let foundPath = null;
    for (const checkPath of possiblePaths) {
      try {
        if (fs.existsSync(checkPath)) {
          foundPath = checkPath;
          break;
        }
      } catch (error) {}
    }

    if (!foundPath) {
      foundPath = possiblePaths[0];
      try {
        fs.mkdirSync(path.join(foundPath, "settings"), { recursive: true });
      } catch (error) {
        return null;
      }
    }

    settings.crackDirectory = path.join(foundPath, "settings");

    try {
      fs.writeFileSync(filePath, JSON.stringify(settings, null, 2));
    } catch (error) {
      return null;
    }

    return settings.crackDirectory;
  });

  ipcMain.handle("set-local-crack-directory", (_, directory) => {
    const filePath = path.join(app.getPath("userData"), "ascendarasettings.json");
    try {
      let settings = {};
      if (fs.existsSync(filePath)) {
        settings = JSON.parse(fs.readFileSync(filePath, "utf8"));
      }
      settings.crackDirectory = directory;
      fs.writeFileSync(filePath, JSON.stringify(settings, null, 2));
      return true;
    } catch (error) {
      return false;
    }
  });

  ipcMain.handle("get-local-crack-username", () => {
    const filePath = path.join(app.getPath("userData"), "ascendarasettings.json");
    try {
      const settings = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const steamEmuPath = settings.crackDirectory;

      if (fs.existsSync(steamEmuPath)) {
        const accountNamePath = path.join(steamEmuPath, "account_name.txt");
        if (fs.existsSync(accountNamePath)) {
          return fs.readFileSync(accountNamePath, "utf8").trim();
        }
      }
    } catch (error) {}
    return null;
  });

  ipcMain.handle("set-local-crack-username", (_, username) => {
    const filePath = path.join(app.getPath("userData"), "ascendarasettings.json");
    try {
      const settings = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const steamEmuPath = settings.crackDirectory;

      if (!fs.existsSync(steamEmuPath)) {
        fs.mkdirSync(steamEmuPath, { recursive: true });
      }

      fs.writeFileSync(path.join(steamEmuPath, "account_name.txt"), username);
      return true;
    } catch (error) {
      return false;
    }
  });

  // Uninstall Ascendara
  ipcMain.handle("uninstall-ascendara", async () => {
    const executablePath = process.execPath;
    const executableDir = path.dirname(executablePath);
    const uninstallerPath = path.join(executableDir, "Uninstall Ascendara.exe");

    try {
      fs.unlinkSync(path.join(process.env.USERPROFILE, "timestamp.ascendara.json"));
    } catch (error) {}

    try {
      fs.unlinkSync(path.join(app.getPath("userData"), "ascendarasettings.json"));
    } catch (error) {}

    shell.openExternal("https://ascendara.app/uninstall");

    spawn(
      "powershell.exe",
      ["-Command", `Start-Process -FilePath "${uninstallerPath}" -Verb RunAs -Wait`],
      { shell: true }
    );
  });

  // qBittorrent handlers
  const qbittorrentClient = axios.create({
    baseURL: "http://localhost:8080/api/v2",
    withCredentials: true,
  });

  let qbittorrentSID = null;

  ipcMain.handle("qbittorrent:login", async (_, { username, password }) => {
    try {
      const response = await qbittorrentClient.post(
        "/auth/login",
        `username=${username}&password=${password}`,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Referer: "http://localhost:8080",
            Origin: "http://localhost:8080",
          },
        }
      );

      const setCookie = response.headers["set-cookie"];
      if (setCookie && setCookie[0]) {
        const match = setCookie[0].match(/SID=([^;]+)/);
        if (match) {
          qbittorrentSID = match[1];
        }
      }

      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data || error.message };
    }
  });

  ipcMain.handle("qbittorrent:version", async () => {
    try {
      if (!qbittorrentSID) {
        throw new Error("No SID available - please login first");
      }

      const response = await qbittorrentClient.get("/app/version", {
        headers: {
          Referer: "http://localhost:8080",
          Origin: "http://localhost:8080",
          Cookie: `SID=${qbittorrentSID}`,
        },
      });

      return { success: true, version: response.data.replace(/['"]+/g, "") };
    } catch (error) {
      return { success: false, error: error.response?.data || error.message };
    }
  });

  // Has launched handler
  ipcMain.handle("has-launched", () => {
    const result = has_launched;
    if (!has_launched) {
      has_launched = true;
    }
    return result;
  });

  // Is new handler
  ipcMain.handle("is-new", () => {
    try {
      fs.accessSync(TIMESTAMP_FILE);
      return false;
    } catch (error) {
      return true;
    }
  });

  // Is v7 handler
  ipcMain.handle("is-v7", () => {
    try {
      const data = fs.readFileSync(TIMESTAMP_FILE, "utf8");
      const timestamp = JSON.parse(data);
      return timestamp.hasOwnProperty("v7") && timestamp.v7 === true;
    } catch (error) {
      return false;
    }
  });

  // Set v7 handler
  ipcMain.handle("set-v7", () => {
    try {
      let timestamp = {
        timestamp: Date.now(),
        v7: true,
      };

      if (fs.existsSync(TIMESTAMP_FILE)) {
        const existingData = JSON.parse(fs.readFileSync(TIMESTAMP_FILE, "utf8"));
        timestamp.timestamp = existingData.timestamp;
      }

      fs.writeFileSync(TIMESTAMP_FILE, JSON.stringify(timestamp, null, 2));
      return true;
    } catch (error) {
      console.error("Error setting v7:", error);
      return false;
    }
  });

  // Create timestamp handler
  ipcMain.handle("create-timestamp", () => {
    let existingData = {};
    try {
      if (fs.existsSync(TIMESTAMP_FILE)) {
        existingData = JSON.parse(fs.readFileSync(TIMESTAMP_FILE, "utf8"));
      }
    } catch (err) {
      console.error("Failed to read existing timestamp file:", err);
    }

    const timestamp = {
      ...existingData,
      timestamp: Date.now(),
      v7: true,
    };
    fs.writeFileSync(TIMESTAMP_FILE, JSON.stringify(timestamp, null, 2));
  });

  // Start Steam handler
  ipcMain.handle("start-steam", async () => {
    const { shell } = require('electron');
    try {
      await shell.openExternal('steam://open');
      return true;
    } catch (error) {
      console.error('Failed to start Steam:', error);
      return false;
    }
  });

  // Import Steam games handler
  ipcMain.handle("import-steam-games", async (_, directory) => {
    const settings = settingsManager.getSettings();
    try {
      if (!settings.downloadDirectory) {
        throw new Error("Download directory not set. Please configure it in Settings.");
      }
      const downloadDirectory = settings.downloadDirectory;
      const gamesFilePath = path.join(downloadDirectory, "games.json");
      const gamesDirectory = path.join(downloadDirectory, "games");

      if (!fs.existsSync(gamesDirectory)) {
        fs.mkdirSync(gamesDirectory, { recursive: true });
      }

      const directories = await fs.promises.readdir(directory, { withFileTypes: true });
      const gameFolders = directories.filter(dirent => dirent.isDirectory());

      try {
        await fs.promises.access(gamesFilePath, fs.constants.F_OK);
      } catch (error) {
        await fs.promises.mkdir(downloadDirectory, { recursive: true });
        await fs.promises.writeFile(
          gamesFilePath,
          JSON.stringify({ games: [] }, null, 2)
        );
      }
      const gamesData = JSON.parse(await fs.promises.readFile(gamesFilePath, "utf8"));

      for (const folder of gameFolders) {
        try {
          if (!gamesData.games.some(g => g.game === folder.name)) {
            const newGame = {
              game: folder.name,
              online: false,
              dlc: false,
              version: "-1",
              executable: path.join(directory, folder.name, `${folder.name}.exe`),
              isRunning: false,
            };
            gamesData.games.push(newGame);
            console.log(`Added game: ${folder.name}`);

            // Fetch game assets (grid, hero, logo) from SteamGridDB
            try {
              const gameDirectory = path.join(directory, folder.name);
              console.log(`Fetching assets for ${folder.name} from SteamGridDB`);
              await steamgrid.fetchGameAssets(folder.name, gameDirectory);
              console.log(`Successfully fetched assets for ${folder.name}`);
            } catch (imageError) {
              console.error(
                `Error fetching assets for ${folder.name}:`,
                imageError.message
              );
            }
          } else {
            console.log(`Game already exists: ${folder.name}`);
          }
        } catch (err) {
          console.error(`Error processing game folder ${folder.name}:`, err.message);
          continue;
        }
      }

      await fs.promises.writeFile(gamesFilePath, JSON.stringify(gamesData, null, 2));
      return true;
    } catch (error) {
      console.error("Error during import:", error.message);
      return false;
    }
  });

  // Download finished handler
  ipcMain.handle("download-finished", async (_, game) => {
    console.log(`Download finished for game: ${game}`);
    return true;
  });

  // Check if trainer exists for game
  ipcMain.handle("check-trainer-exists", async (_, gameName, isCustom) => {
    try {
      const settings = settingsManager.getSettings();
      if (!settings.downloadDirectory) {
        return false;
      }

      let gameDirectory;

      if (isCustom) {
        const gamesFilePath = path.join(settings.downloadDirectory, "games.json");
        if (!fs.existsSync(gamesFilePath)) {
          return false;
        }

        const gamesData = JSON.parse(fs.readFileSync(gamesFilePath, "utf8"));
        const customGame = gamesData.games.find(g => g.game === gameName);

        if (!customGame || !customGame.executable) {
          return false;
        }

        gameDirectory = path.dirname(customGame.executable);
      } else {
        const allDirectories = [
          settings.downloadDirectory,
          ...(settings.additionalDirectories || []),
        ];

        const sanitizedGame = sanitizeText(gameName);

        for (const directory of allDirectories) {
          const testGameDir = path.join(directory, sanitizedGame);
          const testGameInfoPath = path.join(
            testGameDir,
            `${sanitizedGame}.ascendara.json`
          );

          if (fs.existsSync(testGameInfoPath)) {
            gameDirectory = testGameDir;
            break;
          }
        }

        if (!gameDirectory) {
          return false;
        }
      }

      const trainerPath = path.join(gameDirectory, "ascendaraFlingTrainer.exe");
      return fs.existsSync(trainerPath);
    } catch (error) {
      console.error("Error checking trainer existence:", error);
      return false;
    }
  });

  // Download trainer to game directory
  ipcMain.handle(
    "download-trainer-to-game",
    async (_, downloadUrl, gameName, isCustom) => {
      try {
        const settings = settingsManager.getSettings();
        if (!settings.downloadDirectory) {
          throw new Error("Download directory not set");
        }

        let gameDirectory;

        if (isCustom) {
          // For custom games, use the games.json to find the executable path
          const gamesFilePath = path.join(settings.downloadDirectory, "games.json");
          if (!fs.existsSync(gamesFilePath)) {
            throw new Error("Custom games file not found");
          }

          const gamesData = JSON.parse(fs.readFileSync(gamesFilePath, "utf8"));
          const customGame = gamesData.games.find(g => g.game === gameName);

          if (!customGame || !customGame.executable) {
            throw new Error("Custom game executable not found");
          }

          // Get directory from executable path
          gameDirectory = path.dirname(customGame.executable);
        } else {
          // For downloaded games, search in all download directories
          const allDirectories = [
            settings.downloadDirectory,
            ...(settings.additionalDirectories || []),
          ];

          const sanitizedGame = sanitizeText(gameName);

          for (const directory of allDirectories) {
            const testGameDir = path.join(directory, sanitizedGame);
            const testGameInfoPath = path.join(
              testGameDir,
              `${sanitizedGame}.ascendara.json`
            );

            if (fs.existsSync(testGameInfoPath)) {
              gameDirectory = testGameDir;
              break;
            }
          }

          if (!gameDirectory) {
            throw new Error(`Game directory not found for ${gameName}`);
          }
        }

        // Ensure game directory exists
        if (!fs.existsSync(gameDirectory)) {
          throw new Error(`Game directory does not exist: ${gameDirectory}`);
        }

        // Download the trainer file
        const trainerPath = path.join(gameDirectory, "ascendaraFlingTrainer.exe");

        console.log(`Downloading trainer to: ${trainerPath}`);

        // Use axios with proper headers to avoid 403 errors
        const response = await axios({
          method: "GET",
          url: downloadUrl,
          responseType: "stream",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            Referer: "https://flingtrainer.com/",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "same-origin",
          },
          maxRedirects: 5,
          timeout: 60000,
        });

        const writer = fs.createWriteStream(trainerPath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
          writer.on("finish", () => {
            console.log(`Trainer downloaded successfully to: ${trainerPath}`);
            resolve({ success: true, path: trainerPath });
          });
          writer.on("error", err => {
            console.error("Error writing trainer file:", err);
            reject(err);
          });
        });
      } catch (error) {
        console.error("Error downloading trainer to game directory:", error);
        throw error;
      }
    }
  );

  // Generate QR code for webapp connection
  ipcMain.handle("generate-webapp-qrcode", async (_, { code }) => {
    try {
      const { generateWebappQRCode } = require("./qrcode");
      const qrCodeDataUrl = await generateWebappQRCode(code);
      return { success: true, dataUrl: qrCodeDataUrl };
    } catch (error) {
      console.error("Error generating QR code:", error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = {
  registerMiscHandlers,
};
