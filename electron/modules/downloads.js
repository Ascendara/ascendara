/**
 * Downloads Module
 * Handles game download operations
 */

const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { ipcMain, BrowserWindow, app } = require("electron");
const { isDev, isWindows, TIMESTAMP_FILE, appDirectory, imageKey } = require("./config");
const {
  sanitizeText,
  sanitizeGameName,
  getExtensionFromMimeType,
  updateTimestampFile,
} = require("./utils");
const { getSettingsManager } = require("./settings");

const downloadProcesses = new Map();
const goFileProcesses = new Map();
const retryDownloadProcesses = new Map();

/**
 * Register download-related IPC handlers
 */
function registerDownloadHandlers() {
  const settingsManager = getSettingsManager();

  // Check if any game is downloading
  ipcMain.handle("is-downloader-running", async () => {
    try {
      const settings = settingsManager.getSettings();
      if (!settings.downloadDirectory) return false;

      const gamesFilePath = path.join(settings.downloadDirectory, "games.json");
      const gamesData = JSON.parse(fs.readFileSync(gamesFilePath, "utf8"));

      return Object.values(gamesData).some(game => game.downloadingData);
    } catch (error) {
      console.error("Error checking downloader status:", error);
      return false;
    }
  });

  // Get download history
  ipcMain.handle("get-download-history", async () => {
    try {
      const data = await fs.promises.readFile(TIMESTAMP_FILE, "utf8");
      const timestamp = JSON.parse(data);
      return timestamp.downloadedHistory || [];
    } catch (error) {
      console.error("Error reading download history:", error);
      return [];
    }
  });

  // Download file handler
  ipcMain.handle(
    "download-file",
    async (
      event,
      link,
      game,
      online,
      dlc,
      isVr,
      updateFlow,
      version,
      imgID,
      size,
      additionalDirIndex,
      gameID
    ) => {
      console.log(
        `Downloading file: ${link}, game: ${game}, online: ${online}, dlc: ${dlc}, isVr: ${isVr}, updateFlow: ${updateFlow}, version: ${version}, size: ${size}, additionalDirIndex: ${additionalDirIndex}, gameID: ${gameID}`
      );

      const settings = settingsManager.getSettings();
      let targetDirectory;
      let gameDirectory;
      const sanitizedGame = sanitizeGameName(sanitizeText(game));
      console.log(`Sanitized game name: ${sanitizedGame}`);

      // If it's an update flow, search for existing game directory
      if (updateFlow) {
        console.log(`Update flow detected - searching for existing game directory`);
        const allDirectories = [
          settings.downloadDirectory,
          ...(settings.additionalDirectories || []),
        ];

        for (let i = 0; i < allDirectories.length; i++) {
          const testPath = path.join(allDirectories[i], sanitizedGame);
          try {
            await fs.promises.access(testPath);
            targetDirectory = allDirectories[i];
            gameDirectory = testPath;
            console.log(`Found existing game directory at: ${gameDirectory}`);

            // Delete all contents except game.ascendara.json
            const files = await fs.promises.readdir(gameDirectory);
            for (const file of files) {
              if (file !== `${sanitizedGame}.ascendara.json`) {
                const filePath = path.join(gameDirectory, file);
                const stat = await fs.promises.stat(filePath);
                if (stat.isDirectory()) {
                  await fs.promises.rm(filePath, { recursive: true });
                } else {
                  await fs.promises.unlink(filePath);
                }
              }
            }
            break;
          } catch (err) {
            continue;
          }
        }

        if (!targetDirectory) {
          throw new Error(
            `Could not find existing game directory for update: ${sanitizedGame}`
          );
        }
      } else {
        if (additionalDirIndex === 0) {
          targetDirectory = settings.downloadDirectory;
        } else {
          const additionalDirectories = settings.additionalDirectories || [];
          targetDirectory = additionalDirectories[additionalDirIndex - 1];
          if (!targetDirectory) {
            throw new Error(`Invalid additional directory index: ${additionalDirIndex}`);
          }
        }
        gameDirectory = path.join(targetDirectory, sanitizedGame);
        await fs.promises.mkdir(gameDirectory, { recursive: true });
      }

      try {
        if (!settings.downloadDirectory) {
          console.error("Download directory not set");
          return;
        }

        // Download game header image
        let headerImagePath;
        let imageBuffer;

        if (settings.usingLocalIndex && settings.localIndex && imgID) {
          const localImagePath = path.join(settings.localIndex, "imgs", `${imgID}.jpg`);
          if (fs.existsSync(localImagePath)) {
            imageBuffer = await fs.promises.readFile(localImagePath);
            headerImagePath = path.join(gameDirectory, `header.ascendara.jpg`);
            await fs.promises.writeFile(headerImagePath, imageBuffer);
          }
        }

        if (!headerImagePath) {
          const imageLink =
            settings.gameSource === "fitgirl"
              ? `https://api.ascendara.app/v2/fitgirl/image/${imgID}`
              : `https://api.ascendara.app/v2/image/${imgID}`;

          const timestamp = Math.floor(Date.now() / 1000);
          const signature = crypto
            .createHmac("sha256", imageKey)
            .update(timestamp.toString())
            .digest("hex");

          const response = await axios({
            url: imageLink,
            method: "GET",
            responseType: "arraybuffer",
            headers: {
              "X-Timestamp": timestamp.toString(),
              "X-Signature": signature,
              "Cache-Control": "no-store",
            },
          });

          imageBuffer = Buffer.from(response.data);
          const mimeType = response.headers["content-type"];
          const extension = getExtensionFromMimeType(mimeType);
          headerImagePath = path.join(gameDirectory, `header.ascendara${extension}`);
          await fs.promises.writeFile(headerImagePath, imageBuffer);
        }

        let executablePath;
        let spawnCommand;

        if (isWindows) {
          executablePath = isDev
            ? path.join(
                settings.gameSource === "fitgirl"
                  ? "./binaries/AscendaraTorrentHandler/dist/AscendaraTorrentHandler.exe"
                  : link.includes("gofile.io")
                    ? "./binaries/AscendaraDownloader/dist/AscendaraGofileHelper.exe"
                    : "./binaries/AscendaraDownloader/dist/AscendaraDownloader.exe"
              )
            : path.join(
                appDirectory,
                settings.gameSource === "fitgirl"
                  ? "/resources/AscendaraTorrentHandler.exe"
                  : link.includes("gofile.io")
                    ? "/resources/AscendaraGofileHelper.exe"
                    : "/resources/AscendaraDownloader.exe"
              );

          spawnCommand =
            settings.gameSource === "fitgirl"
              ? [
                  link,
                  sanitizedGame,
                  online,
                  dlc,
                  isVr,
                  updateFlow,
                  version || -1,
                  size,
                  settings.downloadDirectory,
                ]
              : [
                  link.includes("gofile.io") ? "https://" + link : link,
                  sanitizedGame,
                  online,
                  dlc,
                  isVr,
                  updateFlow,
                  version || -1,
                  size,
                  targetDirectory,
                  gameID || "",
                ];
        } else {
          executablePath = "python3";
          const scriptPath = isDev
            ? path.join(
                settings.gameSource === "fitgirl"
                  ? "./binaries/AscendaraTorrentHandler/src/AscendaraTorrentHandler.py"
                  : link.includes("gofile.io")
                    ? "./binaries/AscendaraDownloader/src/AscendaraGofileHelper.py"
                    : "./binaries/AscendaraDownloader/src/AscendaraDownloader.py"
              )
            : path.join(
                appDirectory,
                "..",
                settings.gameSource === "fitgirl"
                  ? "/resources/AscendaraTorrentHandler.py"
                  : link.includes("gofile.io")
                    ? "/resources/AscendaraGofileHelper.py"
                    : "/resources/AscendaraDownloader.py"
              );

          spawnCommand =
            settings.gameSource === "fitgirl"
              ? [
                  scriptPath,
                  link,
                  game,
                  online,
                  dlc,
                  isVr,
                  updateFlow,
                  version || -1,
                  size,
                  settings.downloadDirectory,
                ]
              : [
                  scriptPath,
                  link.includes("gofile.io") ? "https://" + link : link,
                  game,
                  online,
                  dlc,
                  isVr,
                  updateFlow,
                  version || -1,
                  size,
                  targetDirectory,
                  gameID || "",
                ];
        }

        // Add notification flags if enabled
        if (settings.notifications) {
          spawnCommand = spawnCommand.concat(["--withNotification", settings.theme]);
        }

        // Update download history
        let timestampData = {};
        try {
          const data = await fs.promises.readFile(TIMESTAMP_FILE, "utf8");
          timestampData = JSON.parse(data);
        } catch (error) {
          console.error("Error reading timestamp file:", error);
        }
        if (!timestampData.downloadedHistory) {
          timestampData.downloadedHistory = [];
        }
        timestampData.downloadedHistory.push({
          game: sanitizedGame,
          timestamp: new Date().toISOString(),
        });
        await updateTimestampFile(timestampData);

        const downloadProcess = spawn(executablePath, spawnCommand, {
          detached: true,
          stdio: "ignore",
          windowsHide: false,
        });

        downloadProcess.on("error", err => {
          console.error(`Failed to start download process: ${err}`);
          event.sender.send("download-error", {
            game: sanitizedGame,
            error: err.message,
          });
        });

        downloadProcesses.set(sanitizedGame, downloadProcess);
        downloadProcess.unref();
      } catch (error) {
        console.error("Error in download-file handler:", error);
        event.sender.send("download-error", {
          game: sanitizedGame,
          error: error.message,
        });
      }
    }
  );

  // Stop download handler
  ipcMain.handle("stop-download", async (_, game, deleteContents = false) => {
    try {
      console.log(
        `Stopping download for game: ${game}, deleteContents: ${deleteContents}`
      );
      const sanitizedGame = sanitizeText(game);

      if (isWindows) {
        const downloaderExes = [
          "AscendaraDownloader.exe",
          "AscendaraGofileHelper.exe",
          "AscendaraTorrentHandler.exe",
        ];

        for (const exe of downloaderExes) {
          try {
            const psCommand = `Get-CimInstance Win32_Process | Where-Object { $_.Name -eq '${exe}' -and $_.CommandLine -like '*${sanitizedGame}*' } | Select-Object -ExpandProperty ProcessId`;
            const findProcess = spawn("powershell", [
              "-NoProfile",
              "-NonInteractive",
              "-Command",
              psCommand,
            ]);

            const pids = await new Promise(resolve => {
              let output = "";
              findProcess.stdout.on("data", data => (output += data.toString()));
              findProcess.on("close", () => {
                const pids = output
                  .split("\n")
                  .map(line => line.trim())
                  .filter(line => /^\d+$/.test(line));
                resolve(pids);
              });
            });

            for (const pid of pids) {
              const killProcess = spawn("taskkill", ["/F", "/T", "/PID", pid]);
              await new Promise(resolve => killProcess.on("close", resolve));
            }
          } catch (err) {
            console.error(`Error finding/killing ${exe} processes:`, err);
          }
        }
      } else {
        const pythonScripts = [
          "AscendaraDownloader.py",
          "AscendaraGofileHelper.py",
          "AscendaraTorrentHandler.py",
        ];

        for (const script of pythonScripts) {
          try {
            const findProcess = spawn("pgrep", ["-f", `${script}.*${sanitizedGame}`]);
            const pids = await new Promise(resolve => {
              let output = "";
              findProcess.stdout.on("data", data => (output += data));
              findProcess.on("close", () =>
                resolve(output.trim().split("\n").filter(Boolean))
              );
            });

            for (const pid of pids) {
              if (pid) {
                const killProcess = spawn("kill", ["-9", pid]);
                await new Promise(resolve => killProcess.on("close", resolve));
              }
            }
          } catch (err) {
            console.error(`Error finding/killing ${script} processes:`, err);
          }
        }
      }

      downloadProcesses.delete(sanitizedGame);

      // Wait for processes to terminate
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Update the JSON
      const settings = settingsManager.getSettings();
      if (settings.downloadDirectory) {
        const gameDirectory = path.join(settings.downloadDirectory, sanitizedGame);
        const jsonFile = path.join(gameDirectory, `${sanitizedGame}.ascendara.json`);
        if (fs.existsSync(jsonFile)) {
          const gameInfo = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
          gameInfo.downloadingData = { stopped: true };
          fs.writeFileSync(jsonFile, JSON.stringify(gameInfo, null, 2));
        }
      }

      // Delete contents if requested
      if (deleteContents) {
        let attempts = 0;
        const maxAttempts = 5;
        while (attempts < maxAttempts) {
          try {
            const gameDirectory = path.join(settings.downloadDirectory, sanitizedGame);
            const files = await fs.promises.readdir(gameDirectory, {
              withFileTypes: true,
            });
            for (const file of files) {
              const fullPath = path.join(gameDirectory, file.name);
              await fs.promises.rm(fullPath, { recursive: true, force: true });
            }
            await fs.promises.rmdir(gameDirectory);
            break;
          } catch (deleteError) {
            attempts++;
            if (attempts === maxAttempts) throw deleteError;
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        }
      }

      return true;
    } catch (error) {
      console.error("Error stopping download:", error);
      return false;
    }
  });

  // Verify game handler
  ipcMain.handle("verify-game", async (_, game) => {
    try {
      const settings = settingsManager.getSettings();
      if (!settings.downloadDirectory) {
        throw new Error("Download directory not set");
      }
      const gameDirectory = path.join(settings.downloadDirectory, game);
      const filemapPath = path.join(gameDirectory, "filemap.ascendara.json");
      const gameInfoPath = path.join(gameDirectory, `${game}.ascendara.json`);

      const filemap = JSON.parse(fs.readFileSync(filemapPath, "utf8"));
      let gameInfo = JSON.parse(fs.readFileSync(gameInfoPath, "utf8"));

      const verifyErrors = [];
      for (const filePath in filemap) {
        const normalizedPath = filePath.replace(/[\/\\]/g, path.sep);
        const fullPath = path.join(gameDirectory, normalizedPath);

        const pathExists =
          process.platform === "win32"
            ? fs.existsSync(fullPath.toLowerCase()) ||
              fs.existsSync(fullPath.toUpperCase()) ||
              fs.existsSync(fullPath)
            : fs.existsSync(fullPath);

        if (!pathExists) {
          verifyErrors.push({
            file: filePath,
            error: "File not found",
            expected_size: filemap[filePath].size,
          });
        }
      }

      if (verifyErrors.length > 0) {
        gameInfo.downloadingData = {
          downloading: false,
          verifying: false,
          extracting: false,
          updating: false,
          progressCompleted: "100.00",
          progressDownloadSpeeds: "0.00 B/s",
          timeUntilComplete: "0s",
          verifyError: verifyErrors,
        };
        fs.writeFileSync(gameInfoPath, JSON.stringify(gameInfo, null, 4));
        return {
          success: false,
          error: `${verifyErrors.length} files failed verification`,
        };
      } else {
        delete gameInfo.downloadingData;
        fs.writeFileSync(gameInfoPath, JSON.stringify(gameInfo, null, 4));
        return { success: true };
      }
    } catch (error) {
      console.error("Error verifying game:", error);
      return { success: false, error: error.message };
    }
  });

  // Check retry extract
  ipcMain.handle("check-retry-extract", async (_, game) => {
    try {
      const settings = settingsManager.getSettings();
      if (!settings.downloadDirectory) return;

      const gameDirectory = path.join(settings.downloadDirectory, game);
      const files = await fs.promises.readdir(gameDirectory);
      const jsonFile = `${game}.ascendara.json`;
      if (files.length === 1 && files[0] === jsonFile) {
        return false;
      }
      return files.length > 1;
    } catch (error) {
      console.error("Error checking retry extract:", error);
      return;
    }
  });

  // Retry extract handler
  ipcMain.handle("retry-extract", async (_, game, online, dlc, version) => {
    const { dialog } = require("electron");
    console.log(`Retrying extract: ${game}`);
    const result = await dialog.showOpenDialog({
      properties: ["openFile", "openDirectory"],
    });

    if (result.canceled) {
      return null;
    } else {
      const settings = settingsManager.getSettings();
      if (!settings.downloadDirectory) {
        console.error("Download directory not set");
        return;
      }
      const downloadDirectory = settings.downloadDirectory;
      const gameDirectory = path.join(downloadDirectory, game);
      const selectedPaths = result.filePaths;

      selectedPaths.forEach(selectedPath => {
        const itemName = path.basename(selectedPath);
        const executablePath = isDev
          ? path.join("./binaries/AscendaraDownloader/dist/AscendaraDownloader.exe")
          : path.join(appDirectory, "/resources/AscendaraDownloader.exe");

        const downloadProcess = spawn(executablePath, [
          "retryfolder",
          game,
          online,
          dlc,
          version,
          gameDirectory,
          itemName,
        ]);

        downloadProcesses.set(game, downloadProcess);

        downloadProcess.stdout.on("data", data => {
          console.log(`stdout: ${data}`);
        });

        downloadProcess.stderr.on("data", data => {
          console.error(`stderr: ${data}`);
        });

        downloadProcess.on("close", code => {
          console.log(`child process exited with code ${code}`);
        });
      });

      return;
    }
  });

  // Retry download handler
  ipcMain.handle("retry-download", async (_, link, game, online, dlc, version) => {
    const settings = settingsManager.getSettings();
    try {
      if (!settings.downloadDirectory) {
        console.error("Download directory not set");
        return;
      }
      const gamesDirectory = settings.downloadDirectory;

      let executablePath;
      let spawnCommand;

      if (link.includes("gofile.io")) {
        executablePath = isDev
          ? path.join("./binaries/AscendaraDownloader/dist/AscendaraGofileHelper.exe")
          : path.join(appDirectory, "/resources/AscendaraGofileHelper.exe");
        spawnCommand = [
          "https://" + link,
          game,
          online,
          dlc,
          version,
          "0",
          gamesDirectory,
        ];
      } else {
        executablePath = isDev
          ? path.join("./binaries/AscendaraDownloader/dist/AscendaraDownloader.exe")
          : path.join(appDirectory, "/resources/AscendaraDownloader.exe");
        spawnCommand = [link, game, online, dlc, version, "0", gamesDirectory];
      }

      const downloadProcess = spawn(executablePath, spawnCommand);
      retryDownloadProcesses.set(game, downloadProcess);

      downloadProcess.stdout.on("data", data => {
        console.log(`stdout: ${data}`);
      });

      downloadProcess.stderr.on("data", data => {
        console.error(`stderr: ${data}`);
      });

      downloadProcess.on("close", code => {
        console.log(`Download process exited with code ${code}`);
        retryDownloadProcesses.delete(game);
      });

      return true;
    } catch (error) {
      console.error("Error retrying download:", error);
      return false;
    }
  });

  // Download soundtrack
  ipcMain.handle("download-soundtrack", async (_, soundtracklink, game = "none") => {
    try {
      const os = require("os");
      const desktopDir = path.join(os.homedir(), "Desktop");
      let targetDir = desktopDir;
      if (game && game !== "none") {
        const safeGame = game.replace(/[<>:"/\\|?*]+/g, "").trim();
        targetDir = path.join(desktopDir, safeGame);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
      }
      let fileName = path.basename(soundtracklink.split("?")[0]);
      fileName = decodeURIComponent(fileName);
      const filePath = path.join(targetDir, fileName);

      const response = await axios({
        method: "get",
        url: soundtracklink,
        responseType: "stream",
      });

      await new Promise((resolve, reject) => {
        const file = fs.createWriteStream(filePath);
        response.data.pipe(file);
        file.on("finish", () => file.close(resolve));
        file.on("error", err => {
          fs.unlink(filePath, () => reject(err));
        });
      });
      return { success: true, filePath };
    } catch (error) {
      console.error("Error downloading soundtrack:", error);
      return { success: false, error: error.message };
    }
  });
}

/**
 * Get download processes map
 */
function getDownloadProcesses() {
  return downloadProcesses;
}

module.exports = {
  registerDownloadHandlers,
  getDownloadProcesses,
};
