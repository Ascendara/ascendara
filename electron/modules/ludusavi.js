/**
 * Ludusavi Module
 * Handles game save backup and restore operations
 */

const fs = require("fs-extra");
const path = require("path");
const { spawn } = require("child_process");
const { ipcMain, app } = require("electron");
const { isDev, isWindows, appDirectory } = require("./config");
const { getSettingsManager } = require("./settings");

/**
 * Register Ludusavi IPC handlers
 */
function registerLudusaviHandlers() {
  const settingsManager = getSettingsManager();

  ipcMain.handle("ludusavi", async (_, action, game, backupName) => {
    try {
      if (isWindows) {
        const ludusaviPath = isDev
          ? path.join("./binaries/AscendaraGameHandler/dist/ludusavi.exe")
          : path.join(appDirectory, "/resources/ludusavi.exe");

        const settings = settingsManager.getSettings();
        const ludusaviSettings = settings.ludusavi || {};

        if (!fs.existsSync(ludusaviPath)) {
          return { success: false, error: "Ludusavi executable not found" };
        }

        let args = [];

        switch (action) {
          case "backup":
            if (ludusaviSettings.backupOptions?.skipManifestCheck) {
              args.push("--no-manifest-update");
            }
            args.push("backup");

            if (game) args.push(game);
            args.push("--force");

            if (ludusaviSettings.backupLocation) {
              args.push("--path", ludusaviSettings.backupLocation);
            }

            if (ludusaviSettings.backupFormat) {
              args.push("--format", ludusaviSettings.backupFormat);
            }

            if (backupName) {
              args.push("--backup", backupName);
            }

            if (ludusaviSettings.backupOptions?.compressionLevel) {
              let compressionLevel = ludusaviSettings.backupOptions.compressionLevel;
              if (compressionLevel === "default") compressionLevel = "deflate";
              args.push("--compression", compressionLevel);
            }

            if (ludusaviSettings.backupOptions?.backupsToKeep) {
              args.push("--full-limit", ludusaviSettings.backupOptions.backupsToKeep);
            }

            args.push("--api");
            break;

          case "restore":
            args = ["restore"];
            if (game) args.push(game);
            args.push("--force");

            if (backupName) {
              args.push("--backup", backupName);
            }
            
            if (ludusaviSettings.backupLocation) {
              args.push("--path", ludusaviSettings.backupLocation);
            }

            if (ludusaviSettings.preferences?.skipConfirmations) {
              args.push("--force");
            }

            args.push("--api");
            break;

          case "list-backups":
            args = ["backups"];
            if (game) args.push(game);

            if (ludusaviSettings.backupLocation) {
              args.push("--path", ludusaviSettings.backupLocation);
            }

            args.push("--api");
            break;

          case "find-game":
            args = ["find"];
            if (game) args.push(game);
            args.push("--multiple");
            args.push("--api");
            break;

          default:
            return { success: false, error: `Unknown action: ${action}` };
        }

        console.log(`Executing ludusavi command: ${ludusaviPath} ${args.join(" ")}`);

        const process = spawn(ludusaviPath, args);

        return new Promise((resolve, reject) => {
          let stdout = "";
          let stderr = "";

          process.stdout.on("data", data => {
            stdout += data.toString();
          });

          process.stderr.on("data", data => {
            stderr += data.toString();
          });

          process.on("close", code => {
            if (code === 0) {
              try {
                const result = JSON.parse(stdout);
                resolve({ success: true, data: result });
              } catch (e) {
                resolve({ success: true, data: stdout });
              }
            } else {
              resolve({
                success: false,
                error: stderr || `Process exited with code ${code}`,
                stdout: stdout,
              });
            }
          });

          process.on("error", err => {
            reject({ success: false, error: err.message });
          });
        });
      } else {
        return { success: false, error: "Ludusavi is only supported on Windows" };
      }
    } catch (error) {
      console.error("Error executing ludusavi command:", error);
      return { success: false, error: error.message };
    }
  });

  // Enable game auto backups
  ipcMain.handle("enable-game-auto-backups", async (_, game, isCustom) => {
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
        gameInfo.backups = true;
        fs.writeFileSync(gamesFilePath, JSON.stringify(gamesData, null, 2));
      } else {
        const gameDirectory = path.join(settings.downloadDirectory, game);
        const gameInfoPath = path.join(gameDirectory, `${game}.ascendara.json`);
        const gameInfo = JSON.parse(fs.readFileSync(gameInfoPath, "utf8"));
        gameInfo.backups = true;
        fs.writeFileSync(gameInfoPath, JSON.stringify(gameInfo, null, 2));
      }
      return true;
    } catch (error) {
      console.error("Error enabling game auto backups:", error);
      return false;
    }
  });

  // Disable game auto backups
  ipcMain.handle("disable-game-auto-backups", async (_, game, isCustom) => {
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
        gameInfo.backups = false;
        fs.writeFileSync(gamesFilePath, JSON.stringify(gamesData, null, 2));
      } else {
        const gameDirectory = path.join(settings.downloadDirectory, game);
        const gameInfoPath = path.join(gameDirectory, `${game}.ascendara.json`);
        const gameInfo = JSON.parse(fs.readFileSync(gameInfoPath, "utf8"));
        gameInfo.backups = false;
        fs.writeFileSync(gameInfoPath, JSON.stringify(gameInfo, null, 2));
      }
      return true;
    } catch (error) {
      console.error("Error disabling game auto backups:", error);
      return false;
    }
  });

  // Check if game auto backups enabled
  ipcMain.handle("is-game-auto-backups-enabled", async (_, game, isCustom) => {
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
        return !!gameInfo.backups;
      } else {
        const gameDirectory = path.join(settings.downloadDirectory, game);
        const gameInfoPath = path.join(gameDirectory, `${game}.ascendara.json`);
        const gameInfoData = fs.readFileSync(gameInfoPath, "utf8");
        const gameInfo = JSON.parse(gameInfoData);
        return !!gameInfo.backups;
      }
    } catch (error) {
      console.error("Error checking if game auto backups enabled:", error);
      return false;
    }
  });
}

module.exports = {
  registerLudusaviHandlers,
};
