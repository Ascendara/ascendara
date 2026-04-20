/**
 * Ludusavi Module
 * Handles game save backup and restore operations
 */

const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const { ipcMain, app, dialog } = require("electron");
const { isDev, isWindows, appDirectory } = require("./config");
const { getSettingsManager } = require("./settings");

/**
 * Build and write the ludusavi config.yaml used for all commands.
 * Includes redirects + all customGames entries from every game that has
 * custom save paths configured.
 *
 * @param {string} configDir    - Directory where config.yaml is written
 * @param {Array}  customGames  - [{ name, files: [], registry: [] }, ...]
 */
function writeLudusaviConfig(configDir, customGames = []) {
  fs.ensureDirSync(configDir);

  const localUserDir = os.homedir();
  const cloudUserDir = "C:\\Users\\ascendara_user";

  let yaml = `redirects:\n`;
  yaml += `  - kind: bidirectional\n`;
  yaml += `    source: "${localUserDir.replace(/\\/g, "\\\\")}"\n`;
  yaml += `    target: "${cloudUserDir.replace(/\\/g, "\\\\")}"\n`;

  if (customGames.length > 0) {
    yaml += `\ncustomGames:\n`;
    for (const cg of customGames) {
      if (!cg.name) continue;
      yaml += `  - name: "${cg.name.replace(/"/g, '\\"')}"\n`;

      if (cg.files && cg.files.length > 0) {
        yaml += `    files:\n`;
        for (const f of cg.files) {
          // Ludusavi expects forward slashes in YAML paths
          const normalized = f.replace(/\\/g, "/");
          yaml += `      - "${normalized.replace(/"/g, '\\"')}"\n`;
        }
      }

      if (cg.registry && cg.registry.length > 0) {
        yaml += `    registry:\n`;
        for (const r of cg.registry) {
          yaml += `      - "${r.replace(/"/g, '\\"')}"\n`;
        }
      }
    }
  }

  const configFilePath = path.join(configDir, "config.yaml");
  fs.writeFileSync(configFilePath, yaml.trim(), "utf8");
}

// Helpers: read / write customSavePaths in game JSON files

function readCustomSavePaths(gameName, isCustomGame, settings) {
  if (!settings.downloadDirectory) return [];
  try {
    if (isCustomGame) {
      const gamesFilePath = path.join(settings.downloadDirectory, "games.json");
      if (!fs.existsSync(gamesFilePath)) return [];
      const data = JSON.parse(fs.readFileSync(gamesFilePath, "utf8"));
      const gameInfo = data.games.find(g => g.game === gameName);
      return gameInfo?.customSavePaths || [];
    } else {
      const gameInfoPath = path.join(
        settings.downloadDirectory,
        gameName,
        `${gameName}.ascendara.json`
      );
      if (!fs.existsSync(gameInfoPath)) return [];
      const data = JSON.parse(fs.readFileSync(gameInfoPath, "utf8"));
      return data?.customSavePaths || [];
    }
  } catch {
    return [];
  }
}

function writeCustomSavePaths(gameName, isCustomGame, settings, paths) {
  if (!settings.downloadDirectory) throw new Error("Download directory not set");

  if (isCustomGame) {
    const gamesFilePath = path.join(settings.downloadDirectory, "games.json");
    const data = JSON.parse(fs.readFileSync(gamesFilePath, "utf8"));
    const gameInfo = data.games.find(g => g.game === gameName);
    if (!gameInfo) throw new Error("Custom game not found");
    if (paths.length > 0) gameInfo.customSavePaths = paths;
    else delete gameInfo.customSavePaths;
    fs.writeFileSync(gamesFilePath, JSON.stringify(data, null, 2));
  } else {
    const gameInfoPath = path.join(
      settings.downloadDirectory,
      gameName,
      `${gameName}.ascendara.json`
    );
    const data = JSON.parse(fs.readFileSync(gameInfoPath, "utf8"));
    if (paths.length > 0) data.customSavePaths = paths;
    else delete data.customSavePaths;
    fs.writeFileSync(gameInfoPath, JSON.stringify(data, null, 2));
  }
}

/**
 * Scan all games and return the full customGames list for config.yaml.
 * Ludusavi needs the complete list every time — not just the current game.
 */
function collectAllCustomGames(settings) {
  const result = [];
  if (!settings.downloadDirectory) return result;

  try {
    const downloadDir = settings.downloadDirectory;

    // Regular games (each has its own <name>.ascendara.json)
    if (fs.existsSync(downloadDir)) {
      for (const entry of fs.readdirSync(downloadDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const jsonPath = path.join(
          downloadDir,
          entry.name,
          `${entry.name}.ascendara.json`
        );
        if (!fs.existsSync(jsonPath)) continue;
        try {
          const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
          if (data.customSavePaths?.length > 0) {
            result.push({ name: entry.name, files: data.customSavePaths });
          }
        } catch { /* skip corrupt files */ }
      }
    }

    // Custom games (stored in games.json)
    const gamesFilePath = path.join(downloadDir, "games.json");
    if (fs.existsSync(gamesFilePath)) {
      const gamesData = JSON.parse(fs.readFileSync(gamesFilePath, "utf8"));
      for (const g of gamesData.games || []) {
        if (g.customSavePaths?.length > 0) {
          result.push({ name: g.game || g.name, files: g.customSavePaths });
        }
      }
    }
  } catch { /* best-effort */ }

  return result;
}

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

        // Always regenerate config.yaml with up-to-date customGames before any command
        const ludusaviConfigDir = path.join(app.getPath("userData"), "ludusavi-cloud-config");
        const allCustomGames = collectAllCustomGames(settings);
        writeLudusaviConfig(ludusaviConfigDir, allCustomGames);

        let args = [];
        args.push("--config", ludusaviConfigDir);

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
            args.push("restore");
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
            args.push("backups");
            if (game) args.push(game);

            if (ludusaviSettings.backupLocation) {
              args.push("--path", ludusaviSettings.backupLocation);
            }

            args.push("--api");
            break;

          case "find-game":
            args.push("find");
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

  // Custom save paths: get
  ipcMain.handle("get-custom-save-paths", async (_, gameName, isCustomGame) => {
    try {
      const settings = settingsManager.getSettings();
      const paths = readCustomSavePaths(gameName, isCustomGame, settings);
      return { success: true, paths };
    } catch (error) {
      console.error("Error in get-custom-save-paths:", error);
      return { success: false, error: error.message, paths: [] };
    }
  });

  // Custom save paths: set
  // Persists to game json & immediately rewrites config.yaml.
  ipcMain.handle("set-custom-save-paths", async (_, gameName, isCustomGame, paths) => {
    try {
      const settings = settingsManager.getSettings();

      // Deduplicate & strip empties
      const cleaned = [...new Set((paths || []).map(p => p.trim()).filter(Boolean))];

      writeCustomSavePaths(gameName, isCustomGame, settings, cleaned);

      // Eagerly regenerate config.yaml
      const ludusaviConfigDir = path.join(app.getPath("userData"), "ludusavi-cloud-config");
      const allCustomGames = collectAllCustomGames(settings);
      writeLudusaviConfig(ludusaviConfigDir, allCustomGames);

      return { success: true, paths: cleaned };
    } catch (error) {
      console.error("Error in set-custom-save-paths:", error);
      return { success: false, error: error.message };
    }
  });

  // Open native folder picker
  ipcMain.handle("open-folder-dialog", async () => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: true, path: null };
    }
    return { success: true, path: result.filePaths[0] };
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
