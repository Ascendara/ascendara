/**
 * Games Module
 * Handles game management, launching, and related operations
 */

const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const axios = require("axios");
const { spawn, execSync } = require("child_process");
const { ipcMain, shell, dialog, app, BrowserWindow } = require("electron");
const { isDev, isWindows, appDirectory } = require("./config");
const { sanitizeText, getExtensionFromMimeType, shouldLogError } = require("./utils");
const { getSettingsManager } = require("./settings");
const {
  setPlayingActivity,
  updateDiscordRPCToLibrary,
  getRPC,
} = require("./discord-rpc");
const { hideWindow, showWindow } = require("./window");

const runGameProcesses = new Map();

/**
 * Validate game executable
 */
async function validateGameExecutable(gameData) {
  if (!gameData || !gameData.executable) {
    throw new Error("Game executable not found");
  }

  if (!fs.existsSync(gameData.executable)) {
    throw new Error("Game executable file does not exist");
  }

  const stats = await fs.promises.stat(gameData.executable);
  if (!stats.isFile()) {
    throw new Error("Game executable path is not a file");
  }
}

/**
 * Create game shortcut on desktop
 */
async function createGameShortcut(game) {
  try {
    console.log("Creating shortcut for game:", game);
    const shortcutPath = path.join(
      os.homedir(),
      "Desktop",
      `${game.game || game.name}.lnk`
    );

    const exePath = game.executable;
    const gameName = game.game || game.name;
    const isCustom = !!game.custom;

    if (!exePath || !fs.existsSync(exePath)) {
      throw new Error(`Game executable not found: ${exePath}`);
    }

    const handlerPath = path.join(appDirectory, "/resources/AscendaraGameHandler.exe");

    if (!fs.existsSync(handlerPath)) {
      throw new Error(`Game handler not found at: ${handlerPath}`);
    }

    const psScript = `
      $WScriptShell = New-Object -ComObject WScript.Shell
      $Shortcut = $WScriptShell.CreateShortcut("${shortcutPath}")
      $Shortcut.TargetPath = "${handlerPath}"
      $Shortcut.Arguments = '"${exePath}" ${isCustom ? 1 : 0} "--shortcut"'
      $Shortcut.WorkingDirectory = "${path.dirname(handlerPath)}"
      $Shortcut.IconLocation = "${exePath},0"
      $Shortcut.Save()
    `;

    const psPath = path.join(os.tmpdir(), "createShortcut.ps1");
    fs.writeFileSync(psPath, psScript);

    await new Promise((resolve, reject) => {
      const process = spawn(
        "powershell.exe",
        ["-ExecutionPolicy", "Bypass", "-File", psPath],
        {
          windowsHide: true,
        }
      );

      process.on("error", reject);
      process.on("exit", code => {
        fs.unlinkSync(psPath);
        if (code === 0) resolve();
        else reject(new Error(`Process exited with code ${code}`));
      });
    });

    return true;
  } catch (error) {
    console.error("Error creating shortcut:", error);
    return false;
  }
}

/**
 * Register game-related IPC handlers
 */
function registerGameHandlers() {
  const settingsManager = getSettingsManager();

  // Get all games
  ipcMain.handle("get-games", async () => {
    const settings = settingsManager.getSettings();
    try {
      if (!settings.downloadDirectory) {
        console.error("Download directory not set");
        return;
      }

      const allDownloadDirectories = [
        settings.downloadDirectory,
        ...(settings.additionalDirectories || []),
      ].filter(Boolean);

      const allGamesPromises = allDownloadDirectories.map(async downloadDir => {
        try {
          const subdirectories = await fs.promises.readdir(downloadDir, {
            withFileTypes: true,
          });
          const gameDirectories = subdirectories
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

          const dirGames = await Promise.all(
            gameDirectories.map(async dir => {
              const gameInfoPath = path.join(downloadDir, dir, `${dir}.ascendara.json`);
              try {
                const gameInfoData = await fs.promises.readFile(gameInfoPath, "utf8");
                return JSON.parse(gameInfoData);
              } catch (error) {
                const errorKey = `${dir}_${error.code}`;
                if (shouldLogError(errorKey)) {
                  console.error(`Error reading game info file for ${dir}:`, error);
                }
                return null;
              }
            })
          );
          return dirGames;
        } catch (error) {
          console.error(`Error reading directory ${downloadDir}:`, error);
          return [];
        }
      });

      const allGames = (await Promise.all(allGamesPromises))
        .flat()
        .filter(game => game !== null);
      return allGames;
    } catch (error) {
      console.error("Error reading the settings file:", error);
      return [];
    }
  });

  // Get custom games
  ipcMain.handle("get-custom-games", () => {
    const settings = settingsManager.getSettings();
    try {
      if (!settings.downloadDirectory) return [];

      const gamesFilePath = path.join(settings.downloadDirectory, "games.json");
      const gamesDirectory = path.join(settings.downloadDirectory, "games");

      try {
        const gamesData = JSON.parse(fs.readFileSync(gamesFilePath, "utf8"));

        const gamesWithImagePaths = gamesData.games.map(game => {
          const possibleExtensions = [".jpg", ".jpeg", ".png"];
          let imagePath = null;

          for (const ext of possibleExtensions) {
            const potentialPath = path.join(
              gamesDirectory,
              `${game.game}.ascendara${ext}`
            );
            if (fs.existsSync(potentialPath)) {
              imagePath = potentialPath;
              break;
            }
          }

          return { ...game, imagePath };
        });

        return gamesWithImagePaths;
      } catch (error) {
        if (error.code === "ENOENT") return [];
        throw error;
      }
    } catch (error) {
      console.error("Error reading the settings file:", error);
      return [];
    }
  });

  // Play game
  ipcMain.handle(
    "play-game",
    async (
      event,
      game,
      isCustom = false,
      backupOnClose = false,
      launchWithAdmin = false,
      specificExecutable = null,
      launchWithTrainer = false
    ) => {
      try {
        const settings = settingsManager.getSettings();
        if (!settings.downloadDirectory || !settings.additionalDirectories) {
          throw new Error("Download directories not properly configured");
        }

        let executable;
        let gameDirectory;
        const allDirectories = [
          settings.downloadDirectory,
          ...settings.additionalDirectories,
        ];
        let launchCommands = null;

        if (!isCustom) {
          const sanitizedGame = sanitizeText(game);
          let gameInfoPath;

          for (const directory of allDirectories) {
            const testGameDir = path.join(directory, sanitizedGame);
            const testGameInfoPath = path.join(
              testGameDir,
              `${sanitizedGame}.ascendara.json`
            );

            if (fs.existsSync(testGameInfoPath)) {
              gameDirectory = testGameDir;
              gameInfoPath = testGameInfoPath;
              break;
            }
          }

          if (!gameInfoPath) {
            throw new Error(`Game info file not found for ${game}`);
          }

          const gameInfo = JSON.parse(fs.readFileSync(gameInfoPath, "utf8"));

          if (!gameInfo.executable) {
            throw new Error("Executable path not found in game info");
          }

          if (gameInfo.launchCommands) {
            launchCommands = gameInfo.launchCommands;
          }

          const executableToUse = specificExecutable || gameInfo.executable;
          executable = path.isAbsolute(executableToUse)
            ? executableToUse
            : path.join(gameDirectory, executableToUse);
        } else {
          const gamesPath = path.join(settings.downloadDirectory, "games.json");
          if (!fs.existsSync(gamesPath)) {
            throw new Error("Custom games file not found");
          }

          const gamesData = JSON.parse(fs.readFileSync(gamesPath, "utf8"));
          const gameInfo = gamesData.games.find(g => g.game === game);

          if (!gameInfo || !gameInfo.executable) {
            throw new Error(`Game not found in games.json: ${game}`);
          }

          if (gameInfo.launchCommands) {
            launchCommands = gameInfo.launchCommands;
          }

          executable = specificExecutable || gameInfo.executable;
          gameDirectory = path.dirname(executable);
        }

        if (!fs.existsSync(executable)) {
          throw new Error(`Game executable not found: ${executable}`);
        }

        if (runGameProcesses.has(game)) {
          throw new Error("Game is already running");
        }

        let executablePath;
        let handlerScript;

        if (isWindows) {
          executablePath = path.join(appDirectory, "/resources/AscendaraGameHandler.exe");
        } else {
          executablePath = "python3";
          handlerScript = isDev
            ? "binaries/AscendaraGameHandler/src/AscendaraGameHandler.py"
            : path.join(appDirectory, "..", "resources/AscendaraGameHandler.py");
        }

        if (isWindows && !fs.existsSync(executablePath)) {
          throw new Error("Game handler not found");
        }

        const spawnArgs = isWindows
          ? [
              executable,
              isCustom.toString(),
              launchWithAdmin.toString(),
              ...(backupOnClose ? ["--ludusavi"] : []),
              ...(launchWithTrainer ? ["--trainer"] : []),
              ...(launchCommands ? ["--gameLaunchCmd", launchCommands] : []),
            ]
          : [
              handlerScript,
              executable,
              isCustom.toString(),
              launchWithAdmin.toString(),
              ...(backupOnClose ? ["--ludusavi"] : []),
              ...(launchWithTrainer ? ["--trainer"] : []),
              ...(launchCommands ? ["--gameLaunchCmd", launchCommands] : []),
            ];

        const runGame = spawn(executablePath, spawnArgs, {
          detached: false,
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        });

        runGame.stdout.on("data", data => {
          console.log(`Game handler output: ${data}`);
        });

        runGame.stderr.on("data", data => {
          console.error(`Game handler error: ${data}`);
        });

        runGameProcesses.set(game, runGame);

        runGame.on("error", error => {
          console.error(`Failed to start game ${game}:`, error);
          event.sender.send("game-launch-error", { game, error: error.message });
          runGameProcesses.delete(game);
          showWindow();
        });

        await new Promise(resolve => setTimeout(resolve, 500));
        event.sender.send("game-launch-success", { game });

        if (settings.hideOnGameLaunch !== false) {
          hideWindow();
        }

        // Create shortcut on first launch
        if (!isCustom) {
          const gameInfoPath = path.join(gameDirectory, `${game}.ascendara.json`);
          const gameInfo = JSON.parse(fs.readFileSync(gameInfoPath, "utf8"));
          if (!gameInfo.hasBeenLaunched && settings.autoCreateShortcuts) {
            await createGameShortcut({ game, name: game, executable, custom: false });
            gameInfo.hasBeenLaunched = true;
            fs.writeFileSync(gameInfoPath, JSON.stringify(gameInfo, null, 2));
          }
        }

        // Update Discord RPC
        const rpc = getRPC();
        if (rpc) {
          setPlayingActivity(game);
        }

        runGame.on("exit", code => {
          console.log(`Game ${game} exited with code ${code}`);
          runGameProcesses.delete(game);
          if (settings.hideOnGameLaunch !== false) {
            showWindow();
          }
          setTimeout(updateDiscordRPCToLibrary, 1000);
          event.sender.send("game-closed", { game });
        });

        return true;
      } catch (error) {
        console.error("Error launching game:", error);
        event.sender.send("game-launch-error", { game, error: error.message });
        return false;
      }
    }
  );

  // Stop game
  ipcMain.handle("stop-game", (_, game) => {
    const runGame = runGameProcesses.get(game);
    if (runGame) {
      runGame.kill();
      setTimeout(updateDiscordRPCToLibrary, 1000);
    }
  });

  // Check if game is running
  ipcMain.handle("is-game-running", async (_, game) => {
    return runGameProcesses.has(game);
  });

  // Delete game
  ipcMain.handle("delete-game", async (_, game) => {
    try {
      if (game === "local") {
        const timestampFilePath = path.join(
          process.env.USERPROFILE,
          "timestamp.ascendara.json"
        );
        fs.unlinkSync(timestampFilePath);
        return;
      }

      const settings = settingsManager.getSettings();
      if (!settings.downloadDirectory || !settings.additionalDirectories) return;

      const allDirectories = [
        settings.downloadDirectory,
        ...settings.additionalDirectories,
      ];

      for (const directory of allDirectories) {
        const gameDirectory = path.join(directory, game);
        if (fs.existsSync(gameDirectory)) {
          fs.rmSync(gameDirectory, { recursive: true, force: true });
          console.log(`Deleted game from directory: ${gameDirectory}`);
          return;
        }
      }

      console.error(`Game directory not found for ${game}`);
    } catch (error) {
      console.error("Error deleting game:", error);
    }
  });

  // Remove custom game
  ipcMain.handle("remove-game", async (_, game) => {
    const settings = settingsManager.getSettings();
    try {
      if (!settings.downloadDirectory) return;

      const gamesFilePath = path.join(settings.downloadDirectory, "games.json");
      const gamesDirectory = path.join(settings.downloadDirectory, "games");

      const gamesData = JSON.parse(fs.readFileSync(gamesFilePath, "utf8"));
      const gameIndex = gamesData.games.findIndex(g => g.game === game);
      if (gameIndex !== -1) {
        gamesData.games.splice(gameIndex, 1);
        fs.writeFileSync(gamesFilePath, JSON.stringify(gamesData, null, 2));

        const possibleExtensions = [".jpg", ".jpeg", ".png"];
        for (const ext of possibleExtensions) {
          const imagePath = path.join(gamesDirectory, `${game}.ascendara${ext}`);
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
            break;
          }
        }
      }
    } catch (error) {
      console.error("Error removing game:", error);
    }
  });

  // Open game directory
  ipcMain.handle("open-game-directory", (_, game, isCustom) => {
    if (game === "local") {
      shell.openPath(path.dirname(process.execPath));
      return;
    }

    if (game === "debuglog") {
      shell.openPath(path.join(process.env.APPDATA, "Ascendara by tagoWorks"));
      return;
    }

    if (game === "workshop") {
      shell.openPath(
        path.join(os.homedir(), "ascendaraSteamcmd", "steamapps/workshop/content")
      );
      return;
    }

    if (game === "backupDir") {
      const settings = settingsManager.getSettings();
      if (settings.ludusavi?.backupLocation) {
        shell.openPath(settings.ludusavi.backupLocation);
      }
      return;
    }

    const settings = settingsManager.getSettings();
    if (!settings.downloadDirectory || !settings.additionalDirectories) return;

    const allDirectories = [
      settings.downloadDirectory,
      ...settings.additionalDirectories,
    ];

    if (!isCustom) {
      for (const directory of allDirectories) {
        const gameDirectory = path.join(directory, game);
        if (fs.existsSync(gameDirectory)) {
          shell.openPath(gameDirectory);
          return;
        }
      }
    } else {
      try {
        const gamesFilePath = path.join(settings.downloadDirectory, "games.json");
        const gamesData = JSON.parse(fs.readFileSync(gamesFilePath, "utf8"));
        const gameInfo = gamesData.games.find(g => g.game === game);
        if (gameInfo) {
          shell.openPath(path.dirname(gameInfo.executable));
        }
      } catch (error) {
        console.error("Error reading games.json:", error);
      }
    }
  });

  // Get game image
  ipcMain.handle("get-game-image", async (_, game) => {
    const settings = settingsManager.getSettings();
    try {
      if (!settings.downloadDirectory || !settings.additionalDirectories) return null;

      const allDirectories = [
        settings.downloadDirectory,
        ...settings.additionalDirectories,
      ];
      const possibleExtensions = [".jpg", ".jpeg", ".png"];

      for (const directory of allDirectories) {
        const gamesDirectory = path.join(directory, "games");
        if (fs.existsSync(gamesDirectory)) {
          for (const ext of possibleExtensions) {
            const imagePath = path.join(gamesDirectory, `${game}.ascendara${ext}`);
            if (fs.existsSync(imagePath)) {
              return fs.readFileSync(imagePath).toString("base64");
            }
          }
        }

        const gameDirectory = path.join(directory, game);
        if (fs.existsSync(gameDirectory)) {
          const imageFiles = fs.readdirSync(gameDirectory);
          for (const file of imageFiles) {
            if (
              ["header.ascendara.jpg", "header.ascendara.png", "header.jpeg"].includes(
                file
              )
            ) {
              return fs.readFileSync(path.join(gameDirectory, file)).toString("base64");
            }
          }
        }
      }

      return null;
    } catch (error) {
      console.error("Error reading game image:", error);
      return null;
    }
  });

  // Create game shortcut handler
  ipcMain.handle("create-game-shortcut", async (_, game) => {
    if (isWindows) {
      return await createGameShortcut(game);
    }
    return false;
  });

  // Get/Set game executables
  ipcMain.handle("get-game-executables", (_, game, isCustom = false) => {
    const settings = settingsManager.getSettings();
    try {
      if (!settings.downloadDirectory) return [];

      if (isCustom) {
        const gamesPath = path.join(settings.downloadDirectory, "games.json");
        if (!fs.existsSync(gamesPath)) return [];
        const gamesData = JSON.parse(fs.readFileSync(gamesPath, "utf8"));
        const gameInfo = gamesData.games.find(g => g.game === game);
        if (!gameInfo) return [];
        return gameInfo.executables || (gameInfo.executable ? [gameInfo.executable] : []);
      }

      const allDirectories = [
        settings.downloadDirectory,
        ...(settings.additionalDirectories || []),
      ];
      for (const directory of allDirectories) {
        const gameInfoPath = path.join(directory, game, `${game}.ascendara.json`);
        if (fs.existsSync(gameInfoPath)) {
          const gameInfo = JSON.parse(fs.readFileSync(gameInfoPath, "utf8"));
          return (
            gameInfo.executables || (gameInfo.executable ? [gameInfo.executable] : [])
          );
        }
      }

      return [];
    } catch (error) {
      console.error("Error getting game executables:", error);
      return [];
    }
  });

  ipcMain.handle("set-game-executables", (_, game, executables, isCustom = false) => {
    const settings = settingsManager.getSettings();
    try {
      if (
        !settings.downloadDirectory ||
        !Array.isArray(executables) ||
        executables.length === 0
      ) {
        return false;
      }

      if (isCustom) {
        const gamesPath = path.join(settings.downloadDirectory, "games.json");
        if (!fs.existsSync(gamesPath)) return false;
        const gamesData = JSON.parse(fs.readFileSync(gamesPath, "utf8"));
        const gameIndex = gamesData.games.findIndex(g => g.game === game);
        if (gameIndex === -1) return false;
        gamesData.games[gameIndex].executable = executables[0];
        gamesData.games[gameIndex].executables = executables;
        fs.writeFileSync(gamesPath, JSON.stringify(gamesData, null, 2));
        return true;
      }

      const allDirectories = [
        settings.downloadDirectory,
        ...(settings.additionalDirectories || []),
      ];
      for (const directory of allDirectories) {
        const gameInfoPath = path.join(directory, game, `${game}.ascendara.json`);
        if (fs.existsSync(gameInfoPath)) {
          const gameInfo = JSON.parse(fs.readFileSync(gameInfoPath, "utf8"));
          gameInfo.executable = executables[0];
          gameInfo.executables = executables;
          fs.writeFileSync(gameInfoPath, JSON.stringify(gameInfo, null, 2));
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error("Error setting game executables:", error);
      return false;
    }
  });

  // Launch commands
  ipcMain.handle("get-launch-commands", (_, game, isCustom = false) => {
    const settings = settingsManager.getSettings();
    try {
      if (!settings.downloadDirectory) return null;

      if (isCustom) {
        const gamesPath = path.join(settings.downloadDirectory, "games.json");
        if (!fs.existsSync(gamesPath)) return null;
        const gamesData = JSON.parse(fs.readFileSync(gamesPath, "utf8"));
        const gameInfo = gamesData.games.find(g => g.game === game);
        return gameInfo?.launchCommands || null;
      }

      const allDirectories = [
        settings.downloadDirectory,
        ...(settings.additionalDirectories || []),
      ];
      const sanitizedGame = sanitizeText(game);

      for (const directory of allDirectories) {
        const gameInfoPath = path.join(
          directory,
          sanitizedGame,
          `${sanitizedGame}.ascendara.json`
        );
        if (fs.existsSync(gameInfoPath)) {
          const gameInfo = JSON.parse(fs.readFileSync(gameInfoPath, "utf8"));
          return gameInfo.launchCommands || null;
        }
      }

      return null;
    } catch (error) {
      console.error("Error getting launch commands:", error);
      return null;
    }
  });

  ipcMain.handle("save-launch-commands", (_, game, launchCommands, isCustom = false) => {
    const settings = settingsManager.getSettings();
    try {
      if (!settings.downloadDirectory) return false;

      if (isCustom) {
        const gamesPath = path.join(settings.downloadDirectory, "games.json");
        if (!fs.existsSync(gamesPath)) return false;
        const gamesData = JSON.parse(fs.readFileSync(gamesPath, "utf8"));
        const gameIndex = gamesData.games.findIndex(g => g.game === game);
        if (gameIndex === -1) return false;
        gamesData.games[gameIndex].launchCommands = launchCommands;
        fs.writeFileSync(gamesPath, JSON.stringify(gamesData, null, 2));
        return true;
      }

      const allDirectories = [
        settings.downloadDirectory,
        ...(settings.additionalDirectories || []),
      ];
      const sanitizedGame = sanitizeText(game);

      for (const directory of allDirectories) {
        const gameInfoPath = path.join(
          directory,
          sanitizedGame,
          `${sanitizedGame}.ascendara.json`
        );
        if (fs.existsSync(gameInfoPath)) {
          const gameInfo = JSON.parse(fs.readFileSync(gameInfoPath, "utf8"));
          gameInfo.launchCommands = launchCommands;
          fs.writeFileSync(gameInfoPath, JSON.stringify(gameInfo, null, 2));
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error("Error saving launch commands:", error);
      return false;
    }
  });

  // Required libraries
  ipcMain.handle("required-libraries", async (_, game) => {
    const settings = settingsManager.getSettings();
    if (!settings.downloadDirectory) return;
    const gameLibsPath = path.join(settings.downloadDirectory, game, "_CommonRedist");
    shell.openPath(gameLibsPath);
  });

  // Check file exists
  ipcMain.handle("check-file-exists", async (_, execPath) => {
    try {
      const settings = settingsManager.getSettings();
      if (!settings.downloadDirectory) return false;

      const executable = path.isAbsolute(execPath)
        ? execPath
        : path.join(settings.downloadDirectory, execPath);

      return fs.existsSync(executable);
    } catch (error) {
      console.error("Error checking executable:", error);
      return false;
    }
  });

  // Is Steam running
  ipcMain.handle("is-steam-running", () => {
    try {
      const processes = execSync('tasklist /fi "imagename eq steam.exe" /fo csv /nh', {
        encoding: "utf8",
      });
      return processes.toLowerCase().includes("steam.exe");
    } catch (error) {
      return false;
    }
  });

  // Launch game (legacy handler)
  ipcMain.handle("launch-game", async (_, game) => {
    const settings = settingsManager.getSettings();
    try {
      const gameData = settings.games?.[game];

      await validateGameExecutable(gameData);

      const gameProcess = spawn(gameData.executable, [], {
        cwd: path.dirname(gameData.executable),
      });

      let hasError = false;

      gameProcess.on("error", async error => {
        hasError = true;
        await dialog.showMessageBox(BrowserWindow.getFocusedWindow(), {
          type: "error",
          title: "Game Launch Error",
          message: `Failed to launch game: ${error.message}`,
          buttons: ["OK"],
        });
        console.error("Game process error:", error);
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      if (!hasError) {
        hideWindow();

        gameProcess.on("close", code => {
          showWindow();
          if (code !== 0) {
            console.log(`Game process exited with code ${code}`);
          }
        });
      }

      return true;
    } catch (error) {
      await dialog.showMessageBox(BrowserWindow.getFocusedWindow(), {
        type: "error",
        title: "Game Launch Error",
        message: `Failed to launch game: ${error.message}`,
        buttons: ["OK"],
      });
      console.error("Error launching game:", error);
      return false;
    }
  });

  // Restore cloud game data (playTime, launchCount, etc.) to a game's JSON file
  ipcMain.handle("restore-cloud-game-data", async (_, gameName, cloudData) => {
    const settings = settingsManager.getSettings();
    try {
      if (!settings.downloadDirectory) {
        return { success: false, error: "Download directory not set" };
      }

      const sanitizedGame = sanitizeText(gameName);
      const allDirectories = [
        settings.downloadDirectory,
        ...(settings.additionalDirectories || []),
      ];

      // First, try to find the game in regular game folders
      let gameInfoPath = null;
      for (const directory of allDirectories) {
        // Try with sanitized name
        let testPath = path.join(
          directory,
          sanitizedGame,
          `${sanitizedGame}.ascendara.json`
        );
        if (fs.existsSync(testPath)) {
          gameInfoPath = testPath;
          break;
        }
        // Also try with original name (in case folder name wasn't sanitized)
        testPath = path.join(directory, gameName, `${gameName}.ascendara.json`);
        if (fs.existsSync(testPath)) {
          gameInfoPath = testPath;
          break;
        }
      }

      // If found in regular games, update the JSON file
      if (gameInfoPath) {
        const gameData = JSON.parse(await fs.promises.readFile(gameInfoPath, "utf8"));

        if (cloudData.playTime !== undefined) {
          gameData.playTime = cloudData.playTime;
        }
        if (cloudData.launchCount !== undefined) {
          gameData.launchCount = cloudData.launchCount;
        }
        if (cloudData.lastPlayed !== undefined) {
          gameData.lastPlayed = cloudData.lastPlayed;
        }
        if (cloudData.favorite !== undefined) {
          gameData.favorite = cloudData.favorite;
        }

        await fs.promises.writeFile(
          gameInfoPath,
          JSON.stringify(gameData, null, 4),
          "utf8"
        );

        console.log(`Restored cloud data for ${gameName} (regular game):`, {
          playTime: cloudData.playTime,
          launchCount: cloudData.launchCount,
        });

        return { success: true };
      }

      // If not found in regular games, check custom games in games.json
      const gamesFilePath = path.join(settings.downloadDirectory, "games.json");
      if (fs.existsSync(gamesFilePath)) {
        const gamesData = JSON.parse(await fs.promises.readFile(gamesFilePath, "utf8"));

        // Find the game by name (case-insensitive)
        const gameIndex = gamesData.games?.findIndex(
          g => g.game?.toLowerCase() === gameName.toLowerCase()
        );

        if (gameIndex !== -1) {
          // Update the custom game data
          if (cloudData.playTime !== undefined) {
            gamesData.games[gameIndex].playTime = cloudData.playTime;
          }
          if (cloudData.launchCount !== undefined) {
            gamesData.games[gameIndex].launchCount = cloudData.launchCount;
          }
          if (cloudData.lastPlayed !== undefined) {
            gamesData.games[gameIndex].lastPlayed = cloudData.lastPlayed;
          }
          if (cloudData.favorite !== undefined) {
            gamesData.games[gameIndex].favorite = cloudData.favorite;
          }

          await fs.promises.writeFile(
            gamesFilePath,
            JSON.stringify(gamesData, null, 4),
            "utf8"
          );

          console.log(`Restored cloud data for ${gameName} (custom game):`, {
            playTime: cloudData.playTime,
            launchCount: cloudData.launchCount,
          });

          return { success: true };
        }
      }

      return { success: false, error: "Game not found" };
    } catch (error) {
      console.error("Error restoring cloud game data:", error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = {
  registerGameHandlers,
  createGameShortcut,
  validateGameExecutable,
};
