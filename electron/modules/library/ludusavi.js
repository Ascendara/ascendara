/**
 * Ludusavi Module
 * Handles game save backup and restore operations
 */

const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const { ipcMain, app, dialog } = require("electron");
const {
  isDev,
  isWindows,
  isLinux,
  appDirectory,
  getLudusaviPath,
} = require("../core/config");
const { getSettingsManager } = require("../core/settings");
const { sanitizeGameName } = require("../core/utils");

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
  const cloudUserDir = isWindows ? "C:\\Users\\ascendara_user" : "/home/ascendara_user";

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
    ...(Array.isArray(settings.additionalDirectories)
      ? settings.additionalDirectories
      : []),
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

// Saves the paths and rewrites config.yaml so Ludusavi picks them up at once
function saveCustomSavePaths(gameName, isCustomGame, paths) {
  const settings = getSettingsManager().getSettings();
  const cleaned = [...new Set((paths || []).map(p => String(p).trim()).filter(Boolean))];
  writeCustomSavePaths(gameName, isCustomGame, settings, cleaned);
  writeLudusaviConfig(ludusaviConfigDir(), collectAllCustomGames(settings));
  return cleaned;
}

const ludusaviConfigDir = () =>
  path.join(app.getPath("userData"), "ludusavi-cloud-config");

function resolveLudusaviPath() {
  if (!isWindows) return getLudusaviPath();
  return isDev
    ? path.join("./binaries/AscendaraGameHandler/dist/ludusavi.exe")
    : path.join(appDirectory, "/resources/ludusavi.exe");
}

// Linux games run in their own wine prefix; without custom paths Ludusavi
// has to be pointed at it to find anything.
function linuxWinePrefixArgs(game, settings) {
  if (!isLinux || !game) return [];
  const hasCustomPaths =
    readCustomSavePaths(game, false, settings).length +
      readCustomSavePaths(game, true, settings).length >
    0;
  if (hasCustomPaths) return [];
  const { sanitizeGameSlug } = require("../compat/proton");
  const { linuxCompatDataDir } = require("../core/config");
  const pfxPath = path.join(linuxCompatDataDir, sanitizeGameSlug(game), "pfx");
  if (fs.existsSync(pfxPath)) {
    console.log(`[Ludusavi] Linux: using wine prefix at ${pfxPath}`);
    return ["--wine-prefix", pfxPath];
  }
  console.warn(
    `[Ludusavi] Linux: wine prefix not found at ${pfxPath}, backup may find nothing`
  );
  return [];
}

// Folders that hold many games' saves. A save folder is never one of these.
function sharedSaveRoots() {
  const home = os.homedir();
  return [
    home,
    path.join(home, "Documents"),
    path.join(home, "Documents", "My Games"),
    path.join(home, "Saved Games"),
    path.join(home, "AppData"),
    path.join(home, "AppData", "Roaming"),
    path.join(home, "AppData", "Local"),
    path.join(home, "AppData", "LocalLow"),
    path.join(home, "Library", "Application Support"),
    path.join(home, "Library", "Preferences"),
    path.join(home, ".config"),
    path.join(home, ".local", "share"),
  ];
}

/**
 * Turn the save files Ludusavi found into the folders that hold them. Folders
 * inside another are dropped, and sibling folders (save slots) fold into their
 * parent unless that parent is shared by many games, like AppData\Roaming.
 */
function saveFoldersFromFiles(files, sharedRoots = sharedSaveRoots()) {
  const key = folder => (isWindows ? folder.toLowerCase() : folder);
  const shared = new Set(sharedRoots.map(root => key(path.resolve(root))));
  const isInside = (folder, parent) =>
    key(folder).startsWith(key(parent).replace(/[\\/]+$/, "") + path.sep);
  const outermost = folders =>
    [...folders]
      .sort((a, b) => a.length - b.length)
      .reduce(
        (kept, folder) =>
          kept.some(parent => isInside(folder, parent)) ? kept : [...kept, folder],
        []
      );

  let folders = outermost(new Set(files.map(file => path.dirname(path.resolve(file)))));
  for (;;) {
    const byParent = new Map();
    for (const folder of folders) {
      const parent = path.dirname(folder);
      if (parent === folder || shared.has(key(parent))) continue;
      byParent.set(parent, (byParent.get(parent) || 0) + 1);
    }
    const parent = [...byParent].find(([, count]) => count > 1)?.[0];
    if (!parent) return folders;
    folders = outermost([...folders, parent]);
  }
}

/**
 * Folders where Ludusavi's manifest (save locations from PCGamingWiki) finds
 * this game's saves on disk. Empty when Ludusavi isn't installed or the game
 * isn't in the manifest.
 */
async function findLudusaviSaveFolders(gameName) {
  const ludusaviPath = resolveLudusaviPath();
  if (!gameName || !ludusaviPath || !fs.existsSync(ludusaviPath)) return [];
  const settings = getSettingsManager().getSettings();
  const configDir = ludusaviConfigDir();
  writeLudusaviConfig(configDir, collectAllCustomGames(settings));
  const title = await resolveLudusaviGameName(
    ludusaviPath,
    configDir,
    gameName,
    "backup"
  );
  const preview = await runLudusaviJson(
    ludusaviPath,
    [
      "--config",
      configDir,
      "backup",
      "--preview",
      ...linuxWinePrefixArgs(gameName, settings),
      "--api",
      title,
    ],
    30000
  );
  const files = Object.entries(preview?.games?.[title]?.files || {})
    .filter(([, file]) => !file.failed && !file.ignored)
    .map(([file]) => file);
  return saveFoldersFromFiles(files).filter(folder => fs.existsSync(folder));
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
 * Run a ludusavi command and parse its --api JSON output.
 * Resolves to `null` instead of rejecting when the process exits non-zero,
 * since that's how ludusavi reports "no match found".
 */
function runLudusaviJson(ludusaviPath, args, timeoutMs = 0) {
  return new Promise(resolve => {
    let child;
    try {
      child = spawn(ludusaviPath, args);
    } catch {
      resolve(null);
      return;
    }

    const timer = timeoutMs ? setTimeout(() => child.kill(), timeoutMs) : null;
    let stdout = "";
    child.stdout.on("data", data => {
      stdout += data.toString();
    });
    child.on("error", () => resolve(null));
    child.on("close", () => {
      if (timer) clearTimeout(timer);
      try {
        resolve(JSON.parse(stdout));
      } catch {
        resolve(null);
      }
    });
  });
}

/**
 * Minimum fuzzy-match confidence required before we trust a resolved title.
 * Ludusavi's fuzzy matcher always returns its best guess, even for
 * completely unrelated games, so a threshold is needed to avoid
 * backing up/restoring the wrong game.
 */
const LUDUSAVI_FUZZY_MATCH_THRESHOLD = 0.9;

// Must match the prefix restoreCloudSave.js uses for its temp staging folder.
const CLOUD_RESTORE_PREFIX = "ascendara-cloud-restore-";

/**
 * Resolve a game name to the exact title Ludusavi's manifest expects.
 *
 * Many repack/scene sources strip punctuation from game titles (e.g.
 * "Papers Please" instead of "Papers, Please"), which causes Ludusavi's
 * exact-name lookup to fail with "not found" even though the game is
 * supported. This tries, in order: the name as-is, a normalized lookup
 * (ignores case/edition/year suffixes), then a fuzzy lookup restricted to
 * high-confidence matches. Falls back to the original name if nothing
 * matches, so the caller gets Ludusavi's normal "not found" error.
 *
 * @param {string} ludusaviPath
 * @param {string} configDir
 * @param {string} game
 * @param {"backup"|"restore"} context
 * @param {string} [backupPath] - where restore-context lookups find backups
 */
async function resolveLudusaviGameName(
  ludusaviPath,
  configDir,
  game,
  context,
  backupPath
) {
  if (!game) return game;

  const contextFlag = context === "restore" ? "--restore" : "--backup";
  const baseArgs = ["--config", configDir, "find", "--api", contextFlag];
  // Without --path, restore lookups search Ludusavi's default folder, not ours.
  if (context === "restore" && backupPath) baseArgs.push("--path", backupPath);

  // 1. Exact match (cheapest, and avoids any risk of a fuzzy mismatch).
  const exact = await runLudusaviJson(ludusaviPath, [...baseArgs, game]);
  const exactMatch = Object.keys(exact?.games || {})[0];
  if (exactMatch) return exactMatch;

  // 2. Normalized match (case/edition/year/symbol-insensitive).
  const normalized = await runLudusaviJson(ludusaviPath, [
    ...baseArgs,
    "--normalized",
    game,
  ]);
  const normalizedMatch = Object.keys(normalized?.games || {})[0];
  if (normalizedMatch) return normalizedMatch;

  // 3. Fuzzy match, only trusted above a high confidence threshold.
  const fuzzy = await runLudusaviJson(ludusaviPath, [
    ...baseArgs,
    "--normalized",
    "--fuzzy",
    game,
  ]);
  const [fuzzyMatch, fuzzyInfo] = Object.entries(fuzzy?.games || {})[0] || [];
  if (fuzzyMatch && (fuzzyInfo?.score || 0) >= LUDUSAVI_FUZZY_MATCH_THRESHOLD) {
    console.log(
      `[Ludusavi] Resolved "${game}" to "${fuzzyMatch}" (fuzzy match, score ${fuzzyInfo.score})`
    );
    return fuzzyMatch;
  }

  return game;
}

/**
 * Register Ludusavi IPC handlers
 */
function registerLudusaviHandlers() {
  const settingsManager = getSettingsManager();

  ipcMain.handle("ludusavi", async (_, action, game, backupName, options = {}) => {
    // A cloud restore runs from a temp staging folder so the local backup
    // folder (and its mapping.yaml history) is never overwritten.
    const stagingDir =
      action === "restore" && typeof options?.stagingDir === "string"
        ? path.resolve(options.stagingDir)
        : null;
    if (
      stagingDir &&
      (!stagingDir.startsWith(path.join(os.tmpdir(), CLOUD_RESTORE_PREFIX)) ||
        !fs.existsSync(stagingDir))
    ) {
      return { success: false, error: "Invalid restore staging folder" };
    }
    try {
      // Unix: downloaded in ~/.ascendara/ (or installed on PATH on macOS)
      const ludusaviPath = resolveLudusaviPath();

      if (!ludusaviPath || !fs.existsSync(ludusaviPath)) {
        console.error(`[Ludusavi] Executable not found at: ${ludusaviPath}`);
        return {
          success: false,
          error: `Ludusavi executable not found at ${ludusaviPath}. Please install it from the Components page.`,
        };
      }

      const settings = settingsManager.getSettings();
      const ludusaviSettings = settings.ludusavi || {};
      const backupRoot = stagingDir || ludusaviSettings.backupLocation;

      if (!ludusaviPath || !fs.existsSync(ludusaviPath)) {
        return { success: false, error: "Ludusavi executable not found" };
      }

      // Always regenerate config.yaml with up-to-date customGames before any command
      const configDir = ludusaviConfigDir();
      writeLudusaviConfig(configDir, collectAllCustomGames(settings));

      let args = [];
      args.push("--config", configDir);

      // Ludusavi requires an exact title match. Many game sources strip
      // punctuation (e.g. "Papers Please" vs. "Papers, Please"), so resolve
      // to the manifest's canonical title before backup/restore/list, while
      // keeping `game` (Ascendara's own name) for everything else below.
      let resolvedGame = game;
      if (
        game &&
        (action === "backup" || action === "restore" || action === "list-backups")
      ) {
        resolvedGame = await resolveLudusaviGameName(
          ludusaviPath,
          configDir,
          game,
          action === "restore" ? "restore" : "backup",
          backupRoot
        );
        if (resolvedGame !== game) {
          console.log(`[Ludusavi] Resolved game name "${game}" -> "${resolvedGame}"`);
        }
      }

      switch (action) {
        case "backup":
          if (ludusaviSettings.backupOptions?.skipManifestCheck) {
            args.push("--no-manifest-update");
          }
          args.push("backup");

          if (resolvedGame) args.push(resolvedGame);
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

          args.push(...linuxWinePrefixArgs(game, settings));

          args.push("--api");
          break;

        case "restore":
          args.push("restore");
          if (resolvedGame) args.push(resolvedGame);
          args.push("--force");

          if (backupName) {
            args.push("--backup", backupName);
          }

          if (backupRoot) {
            args.push("--path", backupRoot);
          }

          if (ludusaviSettings.preferences?.skipConfirmations) {
            args.push("--force");
          }

          args.push("--api");
          break;

        case "list-backups":
          args.push("backups");
          if (resolvedGame) args.push(resolvedGame);

          if (ludusaviSettings.backupLocation) {
            args.push("--path", ludusaviSettings.backupLocation);
          }

          args.push("--api");
          break;

        case "find-game":
          args.push("find");
          if (game) args.push(game);
          args.push("--normalized");
          args.push("--fuzzy");
          args.push("--multiple");
          args.push("--api");
          break;

        default:
          return { success: false, error: `Unknown action: ${action}` };
      }

      console.log(`Executing ludusavi command: ${ludusaviPath} ${args.join(" ")}`);

      const process = spawn(ludusaviPath, args);

      return await new Promise((resolve, reject) => {
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
          resolve({ success: false, error: err.message });
        });
      });
    } catch (error) {
      console.error("Error executing ludusavi command:", error);
      return { success: false, error: error.message };
    } finally {
      if (stagingDir) await fs.remove(stagingDir).catch(() => {});
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
      return { success: true, paths: saveCustomSavePaths(gameName, isCustomGame, paths) };
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

const getCustomSavePaths = (gameName, isCustomGame) =>
  readCustomSavePaths(gameName, isCustomGame, getSettingsManager().getSettings());

module.exports = {
  registerLudusaviHandlers,
  getCustomSavePaths,
  saveCustomSavePaths,
  findLudusaviSaveFolders,
  saveFoldersFromFiles,
};
