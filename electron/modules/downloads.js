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
const { isDev, isWindows, TIMESTAMP_FILE, appDirectory, imageKey, getPythonPath } = require("./config");
const {
  sanitizeText,
  sanitizeGameName,
  getExtensionFromMimeType,
  updateTimestampFile,
} = require("./utils");
const { getSettingsManager } = require("./settings");

const steamgrid = require("./steamgrid");

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

  // Get current downloads
  ipcMain.handle("get-downloads", async () => {
    try {
      const settings = settingsManager.getSettings();

      if (!settings.downloadDirectory) {
        return [];
      }

      const allDownloadDirectories = [
        settings.downloadDirectory,
        ...(settings.additionalDirectories || []),
      ].filter(Boolean);

      const downloads = [];

      for (const downloadDir of allDownloadDirectories) {
        try {
          const subdirectories = await fs.promises.readdir(downloadDir, {
            withFileTypes: true,
          });
          const gameDirectories = subdirectories
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

          for (const dir of gameDirectories) {
            const gameInfoPath = path.join(downloadDir, dir, `${dir}.ascendara.json`);
            try {
              const gameInfoData = await fs.promises.readFile(gameInfoPath, "utf8");
              const gameData = JSON.parse(gameInfoData);

              // Check if this game has active downloadingData
              if (gameData.downloadingData) {
                const { downloadingData } = gameData;
                const isActive =
                  downloadingData.downloading ||
                  downloadingData.extracting ||
                  downloadingData.updating ||
                  downloadingData.verifying ||
                  downloadingData.stopped ||
                  (downloadingData.verifyError &&
                    downloadingData.verifyError.length > 0) ||
                  downloadingData.error;

                if (isActive) {
                  // Parse progress - handle both "50.5%" string and numeric values
                  let progress = 0;

                  // Use extraction progress if extracting, otherwise use download progress
                  if (
                    downloadingData.extracting &&
                    downloadingData.extractionProgress?.percentComplete
                  ) {
                    const progressStr = String(
                      downloadingData.extractionProgress.percentComplete
                    );
                    progress = parseFloat(progressStr.replace("%", "")) || 0;
                  } else if (downloadingData.progressCompleted) {
                    const progressStr = String(downloadingData.progressCompleted);
                    progress = parseFloat(progressStr.replace("%", "")) || 0;
                  }

                  // Calculate downloaded size from progress if available
                  let downloadedSize = "0 MB";
                  const totalSize = gameData.size || "Unknown";

                  // Calculate downloaded size if we have both progress and total size
                  // Use >= 0 instead of > 0 to handle edge cases
                  if (progress >= 0 && totalSize !== "Unknown") {
                    // Parse size (e.g., "2.2 GB" -> calculate downloaded)
                    const sizeMatch = totalSize.match(/(\d+\.?\d*)\s*(GB|MB|TB)/i);
                    if (sizeMatch) {
                      const sizeValue = parseFloat(sizeMatch[1]);
                      const sizeUnit = sizeMatch[2].toUpperCase();
                      const downloadedValue = ((sizeValue * progress) / 100).toFixed(2);
                      downloadedSize = `${downloadedValue} ${sizeUnit}`;
                    }
                  }

                  const download = {
                    id: gameData.game || dir,
                    name: gameData.game || dir,
                    progress: progress,
                    speed:
                      downloadingData.extracting &&
                      downloadingData.extractionProgress?.extractionSpeed
                        ? downloadingData.extractionProgress.extractionSpeed
                        : downloadingData.progressDownloadSpeeds || "0 B/s",
                    eta:
                      downloadingData.extracting &&
                      downloadingData.extractionProgress?.currentFile
                        ? `Extracting: ${downloadingData.extractionProgress.filesExtracted}/${downloadingData.extractionProgress.totalFiles} files`
                        : downloadingData.timeUntilComplete || "Calculating...",
                    status: downloadingData.paused
                      ? "paused"
                      : downloadingData.extracting
                        ? "extracting"
                        : downloadingData.verifying
                          ? "verifying"
                          : downloadingData.stopped
                            ? "stopped"
                            : "downloading",
                    size: totalSize,
                    downloaded: downloadedSize,
                    error: downloadingData.error || null,
                    paused: downloadingData.paused || false,
                    stopped: downloadingData.stopped || false,
                    // Include all downloadingData fields for frontend
                    downloadingData: {
                      downloading: downloadingData.downloading || false,
                      extracting: downloadingData.extracting || false,
                      verifying: downloadingData.verifying || false,
                      updating: downloadingData.updating || false,
                      stopped: downloadingData.stopped || false,
                      paused: downloadingData.paused || false,
                      waiting: downloadingData.waiting || false,
                      progressCompleted: downloadingData.progressCompleted,
                      progressDownloadSpeeds: downloadingData.progressDownloadSpeeds,
                      timeUntilComplete: downloadingData.timeUntilComplete,
                      extractionProgress: downloadingData.extractionProgress || null,
                      verifyError: downloadingData.verifyError || null,
                      error: downloadingData.error || null,
                    },
                  };
                  console.log("[get-downloads] Found active download:", download.name);
                  console.log(
                    "[get-downloads]   Progress:",
                    progress,
                    "Status:",
                    download.status
                  );
                  console.log(
                    "[get-downloads]   Total size:",
                    totalSize,
                    "Downloaded:",
                    downloadedSize
                  );
                  console.log(
                    "[get-downloads]   Speed:",
                    download.speed,
                    "Paused:",
                    downloadingData.paused
                  );
                  downloads.push(download);
                }
              }
            } catch (error) {
              // Silently skip games without .ascendara.json files
            }
          }
        } catch (error) {
          console.error(`[get-downloads] Error reading directory ${downloadDir}:`, error);
        }
      }
      return downloads;
    } catch (error) {
      console.error("[get-downloads] Error getting downloads:", error);
      return [];
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

            // Delete all contents except .ascendara.json and header.ascendara files
            const files = await fs.promises.readdir(gameDirectory);
            for (const file of files) {
              // Preserve the game's ascendara.json file and header image
              if (
                file.endsWith(".ascendara.json") ||
                file.startsWith("header.ascendara")
              ) {
                console.log(`Update flow: preserving file: ${file}`);
                continue;
              }
              const filePath = path.join(gameDirectory, file);
              const stat = await fs.promises.stat(filePath);
              if (stat.isDirectory()) {
                await fs.promises.rm(filePath, { recursive: true });
              } else {
                await fs.promises.unlink(filePath);
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
        // Download game header image (skip if updateFlow and header already exists, or if imgID is undefined)
        let headerImagePath;
        let imageBuffer;

        // Check if header image already exists (for update flow)
        const existingHeaders = await fs.promises.readdir(gameDirectory).catch(() => []);
        const existingHeader = existingHeaders.find(f =>
          f.startsWith("header.ascendara")
        );

        if (updateFlow && existingHeader) {
          console.log(`Update flow: keeping existing header image: ${existingHeader}`);
          headerImagePath = path.join(gameDirectory, existingHeader);
        } else if (imgID) {
          // Only try to download image if imgID is defined
          if (settings.usingLocalIndex && settings.localIndex) {
            const localImagePath = path.join(settings.localIndex, "imgs", `${imgID}.jpg`);
            if (fs.existsSync(localImagePath)) {
              imageBuffer = await fs.promises.readFile(localImagePath);
              headerImagePath = path.join(gameDirectory, `header.ascendara.jpg`);
              await fs.promises.writeFile(headerImagePath, imageBuffer);
            }
          }

          if (!headerImagePath && imageKey) {
            const imageLink =
              settings.gameSource === "fitgirl"
                ? `https://api.ascendara.app/v2/fitgirl/image/${imgID}`
                : `https://api.ascendara.app/v2/image/${imgID}`;

            const timestamp = Math.floor(Date.now() / 1000);
            const signature = crypto
              .createHmac("sha256", imageKey)
              .update(timestamp.toString())
              .digest("hex");

            try {
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
            } catch (imgError) {
              console.error(`Failed to download header image: ${imgError.message}`);
              // Continue without header image
            }
          } else if (!headerImagePath) {
            console.log(`Skipping header image download: imageKey not available`);
          }
        } else {
          console.log(`No imgID provided, skipping header image download`);
        }

        // Download Steamgriddb assets
        console.log(
          `[Download] Starting background asset fetch for ${game} (Name Search)`
        );
        // Launch in background to not interfer with game downloading
        steamgrid
          .fetchGameAssets(game, gameDirectory)
          .catch(err => console.error(`[Download] Assets download failed:`, err));
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
          if (isDev) {
            executablePath = getPythonPath();
            const scriptPath = path.join(
              settings.gameSource === "fitgirl"
                ? "./binaries/AscendaraTorrentHandler/src/AscendaraTorrentHandler.py"
                : link.includes("gofile.io")
                  ? "./binaries/AscendaraDownloader/src/AscendaraGofileHelper.py"
                  : "./binaries/AscendaraDownloader/src/AscendaraDownloader.py"
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
          } else {
            executablePath = path.join(
              process.resourcesPath,
              settings.gameSource === "fitgirl"
                ? "AscendaraTorrentHandler"
                : link.includes("gofile.io")
                  ? "AscendaraGofileHelper"
                  : "AscendaraDownloader"
            );
            spawnCommand =
              settings.gameSource === "fitgirl"
                ? [
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
        }

        // Add notification flags if enabled
        if (settings.notifications) {
          spawnCommand = spawnCommand.concat(["--withNotification", settings.theme]);
        }

        // Cache download data for resume functionality
        const cacheDir = path.join(app.getPath("userData"), "downloadCache");
        await fs.promises.mkdir(cacheDir, { recursive: true });
        const cachedDataPath = path.join(cacheDir, `${sanitizedGame}.json`);
        const cacheData = {
          link: link,
          game: game,
          online: online,
          dlc: dlc,
          isVr: isVr,
          version: version,
          size: size,
          gameID: gameID,
          timestamp: new Date().toISOString(),
        };
        await fs.promises.writeFile(cachedDataPath, JSON.stringify(cacheData, null, 2));
        console.log(`Cached download data for resume: ${cachedDataPath}`);

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

        console.log(`Spawning executable: ${executablePath}`);
        if (!isWindows && !isDev && !fs.existsSync(executablePath)) {
          const errMsg = `Binary not found: ${executablePath}`;
          console.error(errMsg);
          event.sender.send("download-error", { game: sanitizedGame, error: errMsg });
          return;
        }

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
      const settings = settingsManager.getSettings();

      // Find the game directory across all possible locations
      let gameDirectory = null;
      const allDirectories = [
        settings.downloadDirectory,
        ...(settings.additionalDirectories || []),
      ];

      for (const dir of allDirectories) {
        const testPath = path.join(dir, sanitizedGame);
        if (fs.existsSync(testPath)) {
          gameDirectory = testPath;
          console.log(`Found game directory at: ${gameDirectory}`);
          break;
        }
      }

      if (!gameDirectory) {
        console.error(`Game directory not found for: ${sanitizedGame}`);
        return false;
      }

      // Step 1: Update JSON to mark as stopped FIRST (before killing processes)
      // This prevents the downloader from overwriting the stopped state
      const jsonFile = path.join(gameDirectory, `${sanitizedGame}.ascendara.json`);
      if (fs.existsSync(jsonFile)) {
        try {
          const gameInfo = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
          gameInfo.downloadingData = { stopped: true };
          fs.writeFileSync(jsonFile, JSON.stringify(gameInfo, null, 2));
          console.log(`Marked download as stopped in JSON: ${jsonFile}`);
        } catch (jsonError) {
          console.error(`Error updating JSON file: ${jsonError}`);
          // Continue with process termination even if JSON update fails
        }
      }

      // Step 2: Kill all downloader processes
      let killedProcesses = 0;

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

            console.log(`Found ${pids.length} ${exe} processes for ${sanitizedGame}`);

            for (const pid of pids) {
              try {
                const killProcess = spawn("taskkill", ["/F", "/T", "/PID", pid]);
                await new Promise(resolve => killProcess.on("close", resolve));
                killedProcesses++;
                console.log(`Killed process ${exe} with PID ${pid}`);
              } catch (killErr) {
                console.error(`Failed to kill PID ${pid}:`, killErr);
              }
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

            console.log(`Found ${pids.length} ${script} processes for ${sanitizedGame}`);

            for (const pid of pids) {
              if (pid) {
                try {
                  const killProcess = spawn("kill", ["-9", pid]);
                  await new Promise(resolve => killProcess.on("close", resolve));
                  killedProcesses++;
                  console.log(`Killed process ${script} with PID ${pid}`);
                } catch (killErr) {
                  console.error(`Failed to kill PID ${pid}:`, killErr);
                }
              }
            }
          } catch (err) {
            console.error(`Error finding/killing ${script} processes:`, err);
          }
        }
      }

      downloadProcesses.delete(sanitizedGame);
      console.log(`Total processes killed: ${killedProcesses}`);

      // Step 3: Wait for processes to fully terminate and release file locks
      // Use exponential backoff to verify processes are gone
      let waitTime = 1000;
      for (let i = 0; i < 3; i++) {
        await new Promise(resolve => setTimeout(resolve, waitTime));

        // Verify processes are actually gone
        if (isWindows) {
          const verifyCommand = `Get-Process | Where-Object { $_.Name -match 'Ascendara(Downloader|GofileHelper|TorrentHandler)' -and $_.CommandLine -like '*${sanitizedGame}*' } | Measure-Object | Select-Object -ExpandProperty Count`;
          const verifyProcess = spawn("powershell", [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            verifyCommand,
          ]);

          const stillRunning = await new Promise(resolve => {
            let output = "";
            verifyProcess.stdout.on("data", data => (output += data.toString()));
            verifyProcess.on("close", () => {
              const count = parseInt(output.trim()) || 0;
              resolve(count > 0);
            });
          });

          if (!stillRunning) {
            console.log(`All processes terminated after ${waitTime * (i + 1)}ms`);
            break;
          }
        }

        waitTime *= 2; // Exponential backoff
      }

      // Step 4: Ensure JSON is in stopped state (in case downloader overwrote it)
      if (fs.existsSync(jsonFile)) {
        try {
          const gameInfo = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
          gameInfo.downloadingData = { stopped: true };
          fs.writeFileSync(jsonFile, JSON.stringify(gameInfo, null, 2));
          console.log(`Confirmed stopped state in JSON: ${jsonFile}`);
        } catch (jsonError) {
          console.error(`Error confirming JSON state: ${jsonError}`);
        }
      }

      // Step 5: Delete contents if requested
      if (deleteContents) {
        console.log(`Deleting game directory: ${gameDirectory}`);
        let attempts = 0;
        const maxAttempts = 5;
        while (attempts < maxAttempts) {
          try {
            const files = await fs.promises.readdir(gameDirectory, {
              withFileTypes: true,
            });
            for (const file of files) {
              const fullPath = path.join(gameDirectory, file.name);
              await fs.promises.rm(fullPath, { recursive: true, force: true });
            }
            await fs.promises.rmdir(gameDirectory);
            console.log(`Successfully deleted game directory`);
            break;
          } catch (deleteError) {
            attempts++;
            console.error(
              `Delete attempt ${attempts}/${maxAttempts} failed:`,
              deleteError
            );
            if (attempts === maxAttempts) {
              console.error(`Failed to delete directory after ${maxAttempts} attempts`);
              throw deleteError;
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }

      console.log(`Successfully stopped download for: ${sanitizedGame}`);
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
        throw new Error("Download directory not set. Please configure it in Settings.");
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
        throw new Error("Download directory not set. Please configure it in Settings.");
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

  // Resume download handler
  ipcMain.handle("resume-download", async (_, game) => {
    try {
      console.log(`Resuming download for game: ${game}`);
      const sanitizedGame = sanitizeText(game);
      const settings = settingsManager.getSettings();

      // Find the game directory across all possible locations
      let gameDirectory = null;
      const allDirectories = [
        settings.downloadDirectory,
        ...(settings.additionalDirectories || []),
      ];

      for (const dir of allDirectories) {
        const testPath = path.join(dir, sanitizedGame);
        if (fs.existsSync(testPath)) {
          gameDirectory = testPath;
          console.log(`Found game directory at: ${gameDirectory}`);
          break;
        }
      }

      if (!gameDirectory) {
        console.error(`Game directory not found for: ${sanitizedGame}`);
        return { success: false, error: "Game directory not found" };
      }

      // Read the game info JSON to get download details
      const jsonFile = path.join(gameDirectory, `${sanitizedGame}.ascendara.json`);
      if (!fs.existsSync(jsonFile)) {
        console.error(`Game info JSON not found: ${jsonFile}`);
        return { success: false, error: "Game info not found" };
      }

      let gameInfo;
      try {
        gameInfo = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
      } catch (jsonError) {
        console.error(`Error reading game info JSON: ${jsonError}`);
        return { success: false, error: "Failed to read game info" };
      }

      // Check if there's cached download data with the original link
      const cachedDataPath = path.join(
        app.getPath("userData"),
        "downloadCache",
        `${sanitizedGame}.json`
      );

      let downloadLink = null;
      let online = gameInfo.online || "false";
      let dlc = gameInfo.dlc || "false";
      let isVr = gameInfo.isVr || "false";
      let version = gameInfo.version || "";
      let size = gameInfo.size || "";
      let gameID = gameInfo.gameID || "";

      if (fs.existsSync(cachedDataPath)) {
        try {
          const cachedData = JSON.parse(fs.readFileSync(cachedDataPath, "utf8"));
          downloadLink = cachedData.link;
          console.log(`Found cached download link: ${downloadLink}`);
        } catch (cacheError) {
          console.error(`Error reading cached download data: ${cacheError}`);
        }
      }

      if (!downloadLink) {
        console.error(`No download link found for: ${sanitizedGame}`);
        return { success: false, error: "Download link not found. Cannot resume." };
      }

      // Determine which downloader to use
      let executablePath;
      let spawnCommand;
      const targetDirectory = path.dirname(gameDirectory);

      if (isWindows) {
        executablePath = isDev
          ? path.join(
              downloadLink.includes("gofile.io")
                ? "./binaries/AscendaraDownloader/dist/AscendaraGofileHelper.exe"
                : "./binaries/AscendaraDownloader/dist/AscendaraDownloader.exe"
            )
          : path.join(
              appDirectory,
              downloadLink.includes("gofile.io")
                ? "/resources/AscendaraGofileHelper.exe"
                : "/resources/AscendaraDownloader.exe"
            );

        spawnCommand = [
          downloadLink.includes("gofile.io") ? "https://" + downloadLink : downloadLink,
          sanitizedGame,
          online,
          dlc,
          isVr,
          "false", // updateFlow
          version || "-1",
          size,
          targetDirectory,
          gameID || "",
        ];
      } else {
        if (isDev) {
          executablePath = getPythonPath();
          const scriptPath = path.join(
            downloadLink.includes("gofile.io")
              ? "./binaries/AscendaraDownloader/src/AscendaraGofileHelper.py"
              : "./binaries/AscendaraDownloader/src/AscendaraDownloader.py"
          );
          spawnCommand = [
            scriptPath,
            downloadLink.includes("gofile.io") ? "https://" + downloadLink : downloadLink,
            game,
            online,
            dlc,
            isVr,
            "false", // updateFlow
            version || "-1",
            size,
            targetDirectory,
            gameID || "",
          ];
        } else {
          executablePath = path.join(
            process.resourcesPath,
            downloadLink.includes("gofile.io")
              ? "AscendaraGofileHelper"
              : "AscendaraDownloader"
          );
          spawnCommand = [
            downloadLink.includes("gofile.io") ? "https://" + downloadLink : downloadLink,
            game,
            online,
            dlc,
            isVr,
            "false", // updateFlow
            version || "-1",
            size,
            targetDirectory,
            gameID || "",
          ];
        }
      }

      // Add notification flags if enabled
      if (settings.notifications) {
        spawnCommand = spawnCommand.concat(["--withNotification", settings.theme]);
      }

      // Clear the stopped state from JSON
      gameInfo.downloadingData = {
        downloading: false,
        verifying: false,
        extracting: false,
        updating: false,
        progressCompleted: "0.00",
        progressDownloadSpeeds: "0.00 KB/s",
        timeUntilComplete: "0s",
      };
      fs.writeFileSync(jsonFile, JSON.stringify(gameInfo, null, 2));
      console.log(`Cleared stopped state from JSON: ${jsonFile}`);

      // Start the download process
      const downloadProcess = spawn(executablePath, spawnCommand, {
        detached: true,
        stdio: "ignore",
        windowsHide: false,
      });

      downloadProcess.on("error", err => {
        console.error(`Failed to start resume process: ${err}`);
        return { success: false, error: err.message };
      });

      downloadProcesses.set(sanitizedGame, downloadProcess);
      downloadProcess.unref();

      console.log(`Successfully resumed download for: ${sanitizedGame}`);
      return { success: true };
    } catch (error) {
      console.error("Error resuming download:", error);
      return { success: false, error: error.message };
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
