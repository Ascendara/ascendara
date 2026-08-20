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
const { sanitizeGameName } = require("./utils");

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
  // Different default user according to the platform
  const cloudUserDir = isWindows
    ? "C:\\Users\\ascendara_user"
    : "/home/ascendara_user";

  let yaml = `redirects:\n`;
  yaml += `  - kind: bidirectional\n`;

  if (isWindows) {
    yaml += `    source: "${localUserDir.replace(/\\/g, "\\\\")}"\n`;
    yaml += `    target: "${cloudUserDir.replace(/\\/g, "\\\\")}"\n`;
  } else {
    yaml += `    source: "${localUserDir}"\n`;
    yaml += `    target: "${cloudUserDir}"\n`;
  }

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

function getConfiguredGameDirectories(settings) {
  const directories = [
    settings.downloadDirectory,
    ...(Array.isArray(settings.additionalDirectories) ? settings.additionalDirectories : []),
  ]
    .map(directory => (typeof directory === "string" ? directory.trim() : ""))
    .filter(Boolean);

  return [...new Set(directories)];
}

function findRegularGameInfoPath(gameName, settings) {
  const sanitizedGame = sanitizeGameName(gameName);
  const candidateNames = [...new Set([gameName, sanitizedGame].filter(Boolean))];

  for (const directory of getConfiguredGameDirectories(settings)) {
    for (const candidateName of candidateNames) {
      const gameInfoPath = path.join(
        directory,
        candidateName,
        `${candidateName}.ascendara.json`
      );
      if (fs.existsSync(gameInfoPath)) return gameInfoPath;
    }
  }

  return null;
}

function findCustomGameRecord(gameName, settings) {
  for (const directory of getConfiguredGameDirectories(settings)) {
    const gamesFilePath = path.join(directory, "games.json");
    if (!fs.existsSync(gamesFilePath)) continue;

    try {
      const data = JSON.parse(fs.readFileSync(gamesFilePath, "utf8"));
      const games = Array.isArray(data.games) ? data.games : [];
      const index = games.findIndex(game => game.game === gameName);
      if (index !== -1) {
        return {
          gamesFilePath,
          data,
          gameInfo: games[index],
          index,
        };
      }
    } catch {
      // A corrupt games.json in one location should not hide a valid copy elsewhere.
    }
  }

  return null;
}

// Helpers: read / write customSavePaths in game JSON files

function readCustomSavePaths(gameName, isCustomGame, settings) {
  if (!settings.downloadDirectory) return [];
  try {
    if (isCustomGame) {
      return findCustomGameRecord(gameName, settings)?.gameInfo?.customSavePaths || [];
    }

    const gameInfoPath = findRegularGameInfoPath(gameName, settings);
    if (!gameInfoPath) return [];
    const data = JSON.parse(fs.readFileSync(gameInfoPath, "utf8"));
    return data?.customSavePaths || [];
  } catch {
    return [];
  }
}

function writeCustomSavePaths(gameName, isCustomGame, settings, paths) {
  if (!settings.downloadDirectory) throw new Error("Download directory not set");

  if (isCustomGame) {
    const record = findCustomGameRecord(gameName, settings);
    if (!record) throw new Error("Custom game not found");
    if (paths.length > 0) record.gameInfo.customSavePaths = paths;
    else delete record.gameInfo.customSavePaths;
    fs.writeFileSync(record.gamesFilePath, JSON.stringify(record.data, null, 2));
    return;
  }

  const gameInfoPath = findRegularGameInfoPath(gameName, settings);
  if (!gameInfoPath) throw new Error("Game configuration not found");
  const data = JSON.parse(fs.readFileSync(gameInfoPath, "utf8"));
  if (paths.length > 0) data.customSavePaths = paths;
  else delete data.customSavePaths;
  fs.writeFileSync(gameInfoPath, JSON.stringify(data, null, 2));
}

/**
 * Scan all games and return the full customGames list for config.yaml.
 * Ludusavi needs the complete list every time — not just the current game.
 */
function collectAllCustomGames(settings) {
  const gamesByName = new Map();
  if (!settings.downloadDirectory) return [];

  const addGame = (name, files) => {
    if (!name || !Array.isArray(files) || files.length === 0) return;
    const existing = gamesByName.get(name) || { name, files: [] };
    existing.files = [...new Set([...existing.files, ...files])];
    gamesByName.set(name, existing);
  };

  for (const downloadDir of getConfiguredGameDirectories(settings)) {
    try {
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
            addGame(data.game || data.name || entry.name, data.customSavePaths);
          } catch {
            // Skip a corrupt game entry and continue collecting the rest.
          }
        }
      }

      // Custom games (stored in games.json)
      const gamesFilePath = path.join(downloadDir, "games.json");
      if (fs.existsSync(gamesFilePath)) {
        const gamesData = JSON.parse(fs.readFileSync(gamesFilePath, "utf8"));
        for (const game of gamesData.games || []) {
          addGame(game.game || game.name, game.customSavePaths);
        }
      }
    } catch {
      // One inaccessible configured location should not prevent backups elsewhere.
    }
  }

  return Array.from(gamesByName.values());
}

/**
 * Register Ludusavi IPC handlers
 */
function registerLudusaviHandlers() {
  const settingsManager = getSettingsManager();

  ipcMain.handle("ludusavi", async (_, action, game, backupName) => {
    try {
      let ludusaviPath;
      if (isWindows) {
        ludusaviPath = isDev
          ? path.join("./binaries/AscendaraGameHandler/dist/ludusavi.exe")
          : path.join(appDirectory, "/resources/ludusavi.exe");
      } else {
        // Linux : downloaded in ~/.ascendara/
        const { linuxConfigDir } = require("./config");
        ludusaviPath = path.join(linuxConfigDir, "ludusavi");
      }

      if (!fs.existsSync(ludusaviPath)) {
        console.error(`[Ludusavi] Executable not found at: ${ludusaviPath}`);
        return {
          success: false,
          error: `Ludusavi executable not found at ${ludusaviPath}. Please install it from the Components page.`,
        };
      }

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

          // Linux : add --wine-prefix if no customSavePaths for this game
          if (!isWindows && game) {
            const { sanitizeGameSlug } = require("./proton");
            const { linuxCompatDataDir } = require("./config");
            const customPaths = readCustomSavePaths(game, false, settings);
            // verify custom games
            const customPathsCustom = readCustomSavePaths(game, true, settings);
            const hasCustomPaths = customPaths.length + customPathsCustom.length > 0;

            if (!hasCustomPaths) {
              const slug = sanitizeGameSlug(game);
              const pfxPath = path.join(linuxCompatDataDir, slug, "pfx");
              if (fs.existsSync(pfxPath)) {
                args.push("--wine-prefix", pfxPath);
                console.log(`[Ludusavi] Linux: using wine prefix at ${pfxPath}`);
              } else {
                console.warn(
                  `[Ludusavi] Linux: wine prefix not found at ${pfxPath}, backup may find nothing`
                );
              }
            }
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
        const record = findCustomGameRecord(game, settings);
        if (!record) throw new Error("Custom game not found");
        record.gameInfo.backups = true;
        fs.writeFileSync(record.gamesFilePath, JSON.stringify(record.data, null, 2));
      } else {
        const gameInfoPath = findRegularGameInfoPath(game, settings);
        if (!gameInfoPath) throw new Error("Game configuration not found");
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
        const record = findCustomGameRecord(game, settings);
        if (!record) throw new Error("Custom game not found");
        record.gameInfo.backups = false;
        fs.writeFileSync(record.gamesFilePath, JSON.stringify(record.data, null, 2));
      } else {
        const gameInfoPath = findRegularGameInfoPath(game, settings);
        if (!gameInfoPath) throw new Error("Game configuration not found");
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
        const record = findCustomGameRecord(game, settings);
        if (!record) throw new Error("Custom game not found");
        return Boolean(record.gameInfo.backups);
      }

      const gameInfoPath = findRegularGameInfoPath(game, settings);
      if (!gameInfoPath) throw new Error("Game configuration not found");
      const gameInfo = JSON.parse(fs.readFileSync(gameInfoPath, "utf8"));
      return Boolean(gameInfo.backups);
    } catch (error) {
      console.error("Error checking if game auto backups enabled:", error);
      return false;
    }
  });
}

module.exports = {
  registerLudusaviHandlers,
};
