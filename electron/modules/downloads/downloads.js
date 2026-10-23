/**
 * Downloads Module
 * Handles game download operations
 */

const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");
const { spawn } = require("child_process");
const { ipcMain, app } = require("electron");
const {
  isDev,
  isWindows,
  TIMESTAMP_FILE,
  appDirectory,
  getPythonPath,
  getHelperPath,
} = require("../core/config");
const {
  sanitizeText,
  sanitizeGameName,
  getExtensionFromMimeType,
  updateTimestampFile,
} = require("../core/utils");
const { getSettingsManager } = require("../core/settings");
const { prepareDownloaderRuntime } = require("./downloaderRuntime");
const { startDownloadWatchdog } = require("./downloadLiveness");

const steamgrid = require("../library/steamgrid");
const gameUpdateBackup = require("./gameUpdateBackup");
const {
  sendAnalyticsEvent,
  linkProvider,
  trackDownloadOutcome,
} = require("../app/analytics");

const {
  listHelpers,
  matchingHelpers,
  stopHelpers,
  createOperationLock,
  waitForSpawn,
} = require("./downloadControl");
const withDownloadOperation = createOperationLock();
const downloadProcesses = new Map();
const retryDownloadProcesses = new Map();

/**
 * Log into qBittorrent's WebUI and remove any torrent(s) whose save path
 * matches the given game directory. This is necessary because killing the
 * AscendaraTorrentHandler process does NOT stop qBittorrent itself from
 * continuing to download/seed and hold file locks, which causes EBUSY
 * errors when the game directory is deleted afterwards.
 */
async function qbtRemoveTorrentsForDirectory(settings, gameDirectory, deleteFiles) {
  try {
    const qbHost = settings.torrentHost || "localhost";
    const qbPort = settings.torrentPort || 8080;
    const qbUser = settings.torrentUsername || "admin";
    const qbPass = settings.torrentPassword || "adminadmin";
    const baseUrl = `http://${qbHost}:${qbPort}`;

    const loginRes = await axios.post(
      `${baseUrl}/api/v2/auth/login`,
      `username=${encodeURIComponent(qbUser)}&password=${encodeURIComponent(qbPass)}`,
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        validateStatus: () => true,
        timeout: 5000,
      }
    );

    const cookie = loginRes.headers?.["set-cookie"]?.[0];
    if (!cookie || loginRes.data !== "Ok.") {
      console.warn("[qBittorrent] Could not authenticate with WebUI to clean up torrent");
      throw new Error("Could not authenticate with qBittorrent.");
    }

    const infoRes = await axios.get(`${baseUrl}/api/v2/torrents/info`, {
      headers: { Cookie: cookie },
      validateStatus: () => true,
      timeout: 5000,
    });

    if (infoRes.status !== 200 || !Array.isArray(infoRes.data))
      throw new Error("Could not read qBittorrent downloads.");
    const normalize = value =>
      isWindows ? path.resolve(value).toLowerCase() : path.resolve(value);
    const normalizedDir = normalize(gameDirectory);
    const matchingHashes = (infoRes.data || [])
      .filter(t => t.save_path && normalize(t.save_path) === normalizedDir)
      .map(t => t.hash);

    if (matchingHashes.length === 0) {
      console.log(`[qBittorrent] No matching torrents found for: ${gameDirectory}`);
      return;
    }

    const removed = await axios.post(
      `${baseUrl}/api/v2/torrents/delete`,
      `hashes=${matchingHashes.join("|")}&deleteFiles=${deleteFiles ? "true" : "false"}`,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookie,
        },
        validateStatus: () => true,
        timeout: 5000,
      }
    );
    if (removed.status !== 200)
      throw new Error("qBittorrent could not stop the torrent.");
    console.log(
      `[qBittorrent] Removed ${matchingHashes.length} torrent(s) (deleteFiles=${deleteFiles}) for: ${gameDirectory}`
    );

    // Removal is asynchronous: confirm the transfer has actually disappeared.
    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 250));
      const remaining = await axios.get(`${baseUrl}/api/v2/torrents/info`, {
        headers: { Cookie: cookie },
        validateStatus: () => true,
        timeout: 5000,
      });
      if (remaining.status !== 200 || !Array.isArray(remaining.data)) {
        throw new Error("Could not verify that qBittorrent stopped the download.");
      }
      if (!remaining.data.some(t => matchingHashes.includes(t.hash))) return;
    }
    throw new Error("qBittorrent is still stopping this download. Please try again.");
  } catch (err) {
    console.warn("[qBittorrent] Failed to clean up torrent(s):", err.message);
    throw err;
  }
}

/**
 * Register download-related IPC handlers
 */
function registerDownloadHandlers() {
  const settingsManager = getSettingsManager();

  ipcMain.handle("extraction-recovery-action", async (_, game, requestId, action) => {
    if (!["retry", "cancel"].includes(action)) {
      return { success: false, error: "Invalid extraction recovery action." };
    }
    try {
      const settings = settingsManager.getSettings();
      const sanitizedGame = sanitizeGameName(sanitizeText(game));
      const directories = [
        settings.downloadDirectory,
        ...(settings.additionalDirectories || []),
      ].filter(Boolean);
      for (const directory of directories) {
        const gameInfoPath = path.join(
          directory,
          sanitizedGame,
          `${sanitizedGame}.ascendara.json`
        );
        if (!fs.existsSync(gameInfoPath)) continue;
        const gameInfo = JSON.parse(await fs.promises.readFile(gameInfoPath, "utf8"));
        const data = gameInfo.downloadingData;
        if (
          !data?.awaitingRecoveryAction ||
          data.recoverableError?.requestId !== requestId
        ) {
          return {
            success: false,
            error: "The extraction recovery request has expired.",
          };
        }
        data.recoveryAction = action;
        await fs.promises.writeFile(
          gameInfoPath,
          JSON.stringify(gameInfo, null, 4),
          "utf8"
        );
        return { success: true };
      }
      return { success: false, error: "Download metadata was not found." };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

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
          await gameUpdateBackup.recoverLibrary(downloadDir, withDownloadOperation);
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
              if (!gameData.downloadingData) {
                await withDownloadOperation(dir, () =>
                  gameUpdateBackup.finish(path.join(downloadDir, dir))
                );
              }

              // Check if this game has active downloadingData
              if (gameData.downloadingData) {
                const { downloadingData } = gameData;
                const isActive =
                  downloadingData.downloading ||
                  downloadingData.extracting ||
                  downloadingData.updating ||
                  downloadingData.verifying ||
                  downloadingData.stopped ||
                  downloadingData.pendingManualInstall ||
                  downloadingData.awaitingRecoveryAction ||
                  (downloadingData.verifyError &&
                    downloadingData.verifyError.length > 0) ||
                  downloadingData.error;

                if (isActive) {
                  // Parse progress - handle both "50.5%" string and numeric values
                  let progress = 0;

                  // Use extraction progress if extracting, otherwise use download progress
                  if (
                    downloadingData.extracting &&
                    downloadingData.extractionProgress?.percentComplete != null
                  ) {
                    const progressStr = String(
                      downloadingData.extractionProgress.percentComplete
                    );
                    progress = parseFloat(progressStr.replace("%", "")) || 0;
                  } else if (downloadingData.progressCompleted) {
                    const progressStr = String(downloadingData.progressCompleted);
                    progress = parseFloat(progressStr.replace("%", "")) || 0;
                  }

                  progress = Number.isFinite(progress)
                    ? Math.max(0, Math.min(100, progress))
                    : 0;
                  const rawDownloadProgress = parseFloat(
                    downloadingData.progressCompleted
                  );
                  const downloadProgress = Number.isFinite(rawDownloadProgress)
                    ? Math.max(0, Math.min(100, rawDownloadProgress))
                    : 0;
                  const status =
                    downloadingData.pendingManualInstall ||
                    downloadingData.awaitingRecoveryAction
                      ? "actionRequired"
                      : downloadingData.error || downloadingData.verifyError?.length
                        ? "error"
                        : downloadingData.paused
                          ? "paused"
                          : downloadingData.stopped
                            ? "stopped"
                            : downloadingData.verifying
                              ? "verifying"
                              : downloadingData.extracting
                                ? "extracting"
                                : downloadingData.waiting
                                  ? "queued"
                                  : downloadingData.updating
                                    ? "updating"
                                    : "downloading";
                  const transferring = status === "downloading" || status === "updating";

                  // Downloaded size is an estimate from transfer progress, never extraction progress.
                  let downloadedSize = "0 MB";
                  const totalSize = String(gameData.size || "Unknown");

                  // Calculate downloaded size if we have both progress and total size
                  // Use >= 0 instead of > 0 to handle edge cases
                  if (progress >= 0 && totalSize !== "Unknown") {
                    // Parse size (e.g., "2.2 GB" -> calculate downloaded)
                    const sizeMatch = totalSize.match(/(\d+\.?\d*)\s*(GB|MB|TB)/i);
                    if (sizeMatch) {
                      const sizeValue = parseFloat(sizeMatch[1]);
                      const sizeUnit = sizeMatch[2].toUpperCase();
                      const downloadedValue = (
                        (sizeValue * downloadProgress) /
                        100
                      ).toFixed(2);
                      downloadedSize = `${downloadedValue} ${sizeUnit}`;
                    }
                  }

                  const download = {
                    privateSource: !!gameData.privateSource,
                    id: gameData.game || dir,
                    name: gameData.game || dir,
                    progress: progress,
                    speed:
                      status === "extracting" &&
                      downloadingData.extractionProgress?.extractionSpeed
                        ? downloadingData.extractionProgress.extractionSpeed
                        : transferring
                          ? downloadingData.progressDownloadSpeeds || "0 B/s"
                          : "0 B/s",
                    eta:
                      status === "extracting" &&
                      downloadingData.extractionProgress?.currentFile
                        ? `Extracting: ${downloadingData.extractionProgress.filesExtracted}/${downloadingData.extractionProgress.totalFiles} files`
                        : transferring
                          ? downloadingData.timeUntilComplete || "Calculating..."
                          : "-",
                    status,
                    size: totalSize,
                    downloaded: downloadedSize,
                    error:
                      status === "error"
                        ? downloadingData.message ||
                          (typeof downloadingData.error === "string"
                            ? downloadingData.error
                            : "Download or verification failed")
                        : null,
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
                      pendingManualInstall: downloadingData.pendingManualInstall || false,
                      awaitingRecoveryAction:
                        downloadingData.awaitingRecoveryAction || false,
                      recoverableError: downloadingData.recoverableError || null,
                      manualInstallerPath: downloadingData.manualInstallerPath || null,
                      progressCompleted: downloadingData.progressCompleted,
                      progressDownloadSpeeds: downloadingData.progressDownloadSpeeds,
                      timeUntilComplete: downloadingData.timeUntilComplete,
                      extractionProgress: downloadingData.extractionProgress || null,
                      verifyError: downloadingData.verifyError || null,
                      error: downloadingData.error || null,
                    },
                  };
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
      gameID,
      browserDirect = false,
      browserAssetGameId,
      browserAssetLogoId
    ) => {
      // Resolves early when a torrent update's backup copy starts, so the UI is
      // not held while the operation lock stays taken for the whole copy.
      let startedInBackground;
      const backgroundStart = new Promise(resolve => (startedInBackground = resolve));
      const lockKey = sanitizeGameName(sanitizeText(game));
      const operation = withDownloadOperation(lockKey, async () => {
        if (typeof link === "string" && link.startsWith("private:")) {
          const [, sourceId, entryId] = link.split(":");
          return require("./privateSources").start(
            sourceId,
            entryId,
            additionalDirIndex || 0
          );
        }
        console.log(
          `Downloading file: ${link}, game: ${game}, online: ${online}, dlc: ${dlc}, isVr: ${isVr}, updateFlow: ${updateFlow}, version: ${version}, size: ${size}, additionalDirIndex: ${additionalDirIndex}, gameID: ${gameID}`
        );

        if (
          browserAssetGameId !== undefined &&
          browserAssetGameId !== null &&
          (!Number.isSafeInteger(browserAssetGameId) || browserAssetGameId <= 0)
        ) {
          throw new Error("Invalid artwork game selection");
        }
        if (
          browserAssetLogoId != null &&
          (!Number.isSafeInteger(browserAssetLogoId) ||
            browserAssetLogoId <= 0 ||
            !Number.isSafeInteger(browserAssetGameId) ||
            browserAssetGameId <= 0)
        ) {
          throw new Error("Invalid artwork logo selection");
        }
        if (browserDirect === true) {
          const parsed = new URL(link);
          if (
            !["http:", "https:"].includes(parsed.protocol) ||
            parsed.username ||
            parsed.password
          ) {
            throw new Error("Invalid browser download URL");
          }
        }
        const settings = settingsManager.getSettings();
        let targetDirectory;
        let gameDirectory;
        const sanitizedGame = sanitizeGameName(sanitizeText(game));
        if (!sanitizedGame || sanitizedGame === "." || sanitizedGame === "..") {
          throw new Error("Invalid game name.");
        }
        console.log(`Sanitized game name: ${sanitizedGame}`);

        // If it's an update flow, search for existing game directory
        if (updateFlow) {
          console.log(`Update flow detected - searching for existing game directory`);
          const allDirectories = [
            settings.downloadDirectory,
            ...(settings.additionalDirectories || []),
          ].filter(Boolean);

          for (let i = 0; i < allDirectories.length; i++) {
            const testPath = path.join(allDirectories[i], sanitizedGame);
            try {
              await fs.promises.access(testPath);
              targetDirectory = allDirectories[i];
              gameDirectory = testPath;
              console.log(`Found existing game directory at: ${gameDirectory}`);

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
              throw new Error(
                `Invalid additional directory index: ${additionalDirIndex}`
              );
            }
          }
          gameDirectory = path.join(targetDirectory, sanitizedGame);

          // If the destination folder already exists and wasn't created by a
          // previous Ascendara download (no tracking JSON present), it likely
          // contains files unrelated to this download (e.g. a manual install
          // with save data). Snapshot its current top-level contents so they
          // are never touched if the user later kills/deletes the download.
          const existingJsonPath = path.join(
            gameDirectory,
            `${sanitizedGame}.ascendara.json`
          );
          if (fs.existsSync(gameDirectory) && !fs.existsSync(existingJsonPath)) {
            try {
              const preexistingEntries = await fs.promises.readdir(gameDirectory);
              if (preexistingEntries.length > 0) {
                console.log(
                  `Destination folder already exists with ${preexistingEntries.length} pre-existing item(s), preserving them: ${gameDirectory}`
                );
                await fs.promises.writeFile(
                  path.join(gameDirectory, "preexisting.ascendara.json"),
                  JSON.stringify(preexistingEntries, null, 2)
                );
              }
            } catch (snapshotError) {
              console.error(
                `Failed to snapshot pre-existing directory contents: ${snapshotError}`
              );
            }
          }

          await fs.promises.mkdir(gameDirectory, { recursive: true });
        }

        const linkStr = typeof link === "string" ? link.trim().toLowerCase() : "";
        const isMagnetLink = linkStr.startsWith("magnet:");
        const isDotTorrentFile = linkStr.split("?")[0].endsWith(".torrent");
        const isTorrentLink = isMagnetLink || isDotTorrentFile;

        let updatePrepared = false;
        let previousGameInfo = null;
        try {
          if (updateFlow && isTorrentLink) {
            // Torrents write straight into the game folder, so copy it first.
            await gameUpdateBackup.prepare(gameDirectory, () =>
              startedInBackground({ success: true })
            );
            updatePrepared = true;
          } else if (updateFlow) {
            previousGameInfo = await gameUpdateBackup.beginInPlace(gameDirectory);
          }
          // Download game header image (skip if updateFlow and header already exists, or if imgID is undefined)
          let headerImagePath;
          let imageBuffer;

          // Check if header image already exists (for update flow)
          const existingHeaders = await fs.promises
            .readdir(gameDirectory)
            .catch(() => []);
          const existingHeader = existingHeaders.find(f =>
            f.startsWith("header.ascendara")
          );

          if (updateFlow && existingHeader) {
            console.log(`Update flow: keeping existing header image: ${existingHeader}`);
            headerImagePath = path.join(gameDirectory, existingHeader);
          } else if (imgID) {
            // Only try to download image if imgID is defined
            if (settings.localIndex) {
              const localImagePath = path.join(
                settings.localIndex,
                "imgs",
                `${imgID}.jpg`
              );
              if (fs.existsSync(localImagePath)) {
                imageBuffer = await fs.promises.readFile(localImagePath);
                headerImagePath = path.join(gameDirectory, `header.ascendara.jpg`);
                await fs.promises.writeFile(headerImagePath, imageBuffer);
              }
            }

            // Try SteamGridDB fallback if no local image found
            if (!headerImagePath) {
              try {
                console.log(
                  `No local header image found, trying SteamGridDB fallback for: ${game}`
                );
                const steamGridHeader = await steamgrid.fetchGameHeader(game);
                if (steamGridHeader && steamGridHeader.url) {
                  const response = await axios({
                    url: steamGridHeader.url,
                    method: "GET",
                    responseType: "arraybuffer",
                    timeout: 10000,
                  });

                  imageBuffer = Buffer.from(response.data);
                  const mimeType = response.headers["content-type"];
                  const extension = getExtensionFromMimeType(mimeType);
                  headerImagePath = path.join(
                    gameDirectory,
                    `header.ascendara${extension}`
                  );
                  await fs.promises.writeFile(headerImagePath, imageBuffer);
                  console.log(
                    `SteamGridDB header image downloaded and saved: ${headerImagePath}`
                  );
                } else {
                  console.log(`No SteamGridDB header image found for: ${game}`);
                }
              } catch (steamGridError) {
                console.warn(
                  `SteamGridDB fallback failed for ${game}:`,
                  steamGridError.message
                );
              }
            }
          } else {
            console.log(`No imgID provided, skipping header image download`);
          }

          // Download Steamgriddb assets
          console.log(
            `[Download] Starting background asset fetch for ${game} (Name Search)`
          );
          // Launch in background to not interfer with game downloading
          if (browserAssetGameId !== null) {
            steamgrid
              .fetchGameAssets(
                game,
                gameDirectory,
                browserAssetGameId,
                browserAssetLogoId
              )
              .catch(err => console.error(`[Download] Assets download failed:`, err));
          }
          let executablePath;
          let spawnCommand;

          if (isWindows) {
            executablePath = isDev
              ? path.join(
                  isTorrentLink
                    ? "./binaries/AscendaraTorrentHandler/dist/AscendaraTorrentHandler.exe"
                    : "./binaries/AscendaraDownloader/dist/AscendaraDownloader.exe"
                )
              : path.join(
                  appDirectory,
                  isTorrentLink
                    ? "/resources/AscendaraTorrentHandler.exe"
                    : "/resources/AscendaraDownloader.exe"
                );

            spawnCommand = isTorrentLink
              ? [
                  link,
                  sanitizedGame,
                  online,
                  dlc,
                  isVr,
                  updateFlow,
                  version || -1,
                  size,
                  targetDirectory,
                ]
              : [
                  link,
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
                isTorrentLink
                  ? "./binaries/AscendaraTorrentHandler/src/AscendaraTorrentHandler.py"
                  : "./binaries/AscendaraDownloader/src/AscendaraDownloader.py"
              );
              spawnCommand = isTorrentLink
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
                    targetDirectory,
                  ]
                : [
                    scriptPath,
                    link,
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
                isTorrentLink ? "AscendaraTorrentHandler" : "AscendaraDownloader"
              );
              spawnCommand = isTorrentLink
                ? [
                    link,
                    game,
                    online,
                    dlc,
                    isVr,
                    updateFlow,
                    version || -1,
                    size,
                    targetDirectory,
                  ]
                : [
                    link,
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

          if (browserDirect === true && !isTorrentLink)
            spawnCommand.push("--provider", "direct");

          // Add notification flags if enabled
          if (settings.notifications) {
            spawnCommand = spawnCommand.concat(["--withNotification", settings.theme]);
          }

          // For torrent downloads, pass the user's qBittorrent WebUI config
          if (isTorrentLink) {
            const qbHost = settings.torrentHost || "localhost";
            const qbPort = settings.torrentPort || 8080;
            const qbUser = settings.torrentUsername || "admin";
            const qbPass = settings.torrentPassword || "adminadmin";
            spawnCommand = spawnCommand.concat([
              "--qbitHost",
              String(qbHost),
              "--qbitPort",
              String(qbPort),
              "--qbitUsername",
              String(qbUser),
              "--qbitPassword",
              String(qbPass),
            ]);
          }

          // Cache download data for resume functionality
          const cacheDir = path.join(app.getPath("userData"), "downloadCache");
          await fs.promises.mkdir(cacheDir, { recursive: true });
          const cachedDataPath = path.join(cacheDir, `${sanitizedGame}.json`);
          const cacheData = {
            link: link,
            browserDirect: browserDirect === true,
            browserAssetGameId,
            game: game,
            online: online,
            dlc: dlc,
            isVr: isVr,
            version: version,
            size: size,
            gameID: gameID,
            timestamp: new Date().toISOString(),
            // Restored if this in-place update is cancelled.
            previousGameInfo,
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
          if (process.platform === "linux" && !isDev && !isTorrentLink) {
            executablePath = await prepareDownloaderRuntime(
              executablePath,
              path.join(app.getPath("userData"), "downloader-runtime")
            );
          }
          if (!isWindows && !isDev && !fs.existsSync(executablePath)) {
            const errMsg = `Binary not found: ${executablePath}`;
            console.error(errMsg);
            event.sender.send("download-error", {
              game: sanitizedGame,
              error: errMsg,
            });
            throw new Error(errMsg);
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

          await waitForSpawn(downloadProcess);
          const analyticsParams = {
            game: sanitizedGame,
            game_id: gameID,
            provider: browserDirect ? "browser" : linkProvider(link),
            update: updateFlow ? "true" : "false",
          };
          sendAnalyticsEvent("download_start", { ...analyticsParams, download_size: size });
          trackDownloadOutcome(downloadProcess, gameDirectory, analyticsParams);
          downloadProcess.once("exit", code => {
            if (code === 0 && updateFlow) {
              withDownloadOperation(sanitizedGame, () =>
                gameUpdateBackup.finish(gameDirectory)
              ).catch(error => console.error("Update backup retained:", error));
            }
          });
          downloadProcesses.set(sanitizedGame, downloadProcess);
          downloadProcess.unref();
          return { success: true };
        } catch (error) {
          if (updatePrepared) {
            await gameUpdateBackup
              .restore(gameDirectory)
              .catch(restoreError =>
                console.error(
                  "Update backup retained after startup failure:",
                  restoreError
                )
              );
          } else if (previousGameInfo && !downloadProcesses.has(sanitizedGame)) {
            await gameUpdateBackup
              .abandonInPlace(gameDirectory, previousGameInfo, true)
              .catch(restoreError =>
                console.error(
                  "Could not reset update after startup failure:",
                  restoreError
                )
              );
          }
          console.error("Error in download-file handler:", error);
          event.sender.send("download-error", {
            game: sanitizedGame,
            error: error.message,
          });
          return { success: false, error: error.message };
        }
      });
      // Failures after an early return still reach the UI via download-error.
      return Promise.race([backgroundStart, operation]);
    }
  );

  // Run a manual installer (e.g. torrent repack setup.exe) elevated via UAC
  ipcMain.handle("run-elevated-installer", async (_, installerPath) => {
    try {
      if (!installerPath || !fs.existsSync(installerPath)) {
        return { success: false, error: "Installer not found" };
      }

      await new Promise((resolve, reject) => {
        const escapedPath = installerPath.replace(/'/g, "''");
        const process = spawn("powershell.exe", [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `Start-Process -FilePath '${escapedPath}' -Verb RunAs`,
        ]);
        let stderr = "";
        process.stderr.on("data", data => (stderr += data.toString()));
        process.on("error", reject);
        process.on("exit", code => {
          if (code === 0) {
            resolve();
          } else {
            reject(
              new Error(
                `Failed to launch installer (exit code ${code}): ${stderr.trim()}`
              )
            );
          }
        });
      });

      return { success: true };
    } catch (error) {
      console.error("Error launching elevated installer:", error);
      return { success: false, error: error.message };
    }
  });

  // Called when the user confirms they've finished running a manual installer
  // (e.g. torrent repack setup.exe). Detects the resulting executable and
  // clears the pendingManualInstall state so the game shows as fully installed.
  ipcMain.handle("complete-manual-install", async (_, game) => {
    try {
      const settings = settingsManager.getSettings();
      if (!settings.downloadDirectory) {
        throw new Error("Download directory not set");
      }
      const sanitizedGame = sanitizeGameName(sanitizeText(game));
      const gameDirectory = path.join(settings.downloadDirectory, sanitizedGame);
      const gameInfoPath = path.join(gameDirectory, `${sanitizedGame}.ascendara.json`);

      if (!fs.existsSync(gameInfoPath)) {
        return { success: false, error: "Game info not found" };
      }

      const gameInfo = JSON.parse(fs.readFileSync(gameInfoPath, "utf8"));

      // Try to find the installed executable if we don't already have a valid one
      let executable = gameInfo.executable;
      if (!executable || !fs.existsSync(executable)) {
        const candidates = [];
        const walk = dir => {
          let entries = [];
          try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
          } catch {
            return;
          }
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              walk(fullPath);
            } else if (entry.name.toLowerCase().endsWith(".exe")) {
              const lower = entry.name.toLowerCase();
              if (
                lower.includes("unins") ||
                lower.includes("setup") ||
                lower.includes("redist") ||
                lower.includes("vcredist") ||
                lower.includes("directx") ||
                lower.includes("dxsetup") ||
                lower.includes("quicksfv") ||
                lower.includes("checksum") ||
                lower.includes("md5") ||
                lower.includes("readme") ||
                lower.includes("crashreport") ||
                lower.includes("crashpad")
              ) {
                continue;
              }
              try {
                candidates.push({
                  path: fullPath,
                  size: fs.statSync(fullPath).size,
                });
              } catch {}
            }
          }
        };
        walk(gameDirectory);
        candidates.sort((a, b) => b.size - a.size);
        if (candidates.length > 0) {
          executable = candidates[0].path;
        }
      }

      if (executable) {
        gameInfo.executable = executable;
      }
      delete gameInfo.downloadingData;
      fs.writeFileSync(gameInfoPath, JSON.stringify(gameInfo, null, 4));

      return { success: true, executable: executable || null };
    } catch (error) {
      console.error("Error completing manual install:", error);
      return { success: false, error: error.message };
    }
  });

  // Stop download handler
  ipcMain.handle(
    "stop-download",
    async (_, game, deleteContents = false, isKill = false) => {
      try {
        return await withDownloadOperation(
          sanitizeGameName(sanitizeText(game)),
          async () => {
            // Wait for in-process private transfers to close their streams and
            // finish writing metadata before the shared removal flow touches files.
            const privateStopped = await require("./privateSources").stop(game);
            if (privateStopped && !isKill && !deleteContents) return true;
            console.log(
              `Stopping download for game: ${game}, deleteContents: ${deleteContents}, isKill: ${isKill}`
            );
            const sanitizedGame = sanitizeGameName(sanitizeText(game));
            if (!sanitizedGame || sanitizedGame === "." || sanitizedGame === "..") {
              throw new Error("Invalid game name.");
            }
            const settings = settingsManager.getSettings();

            // Find the game directory across all possible locations
            let gameDirectory = null;
            const allDirectories = [
              settings.downloadDirectory,
              ...(settings.additionalDirectories || []),
            ];

            for (const dir of allDirectories.filter(Boolean)) {
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

            const jsonFilePath = path.join(
              gameDirectory,
              `${sanitizedGame}.ascendara.json`
            );
            const before = await fs.readJson(jsonFilePath);
            const protectedUpdate = await gameUpdateBackup.hasBackup(gameDirectory);
            const cacheFile = path.join(
              app.getPath("userData"),
              "downloadCache",
              `${sanitizedGame}.json`
            );
            const cache = await fs.readJson(cacheFile).catch(() => ({}));
            const torrentDownload = /^(magnet:)|\.torrent(?:\?|$)/i.test(
              cache.link || ""
            );
            // AscendaraDownloader updates stage everything outside the game files
            // and roll back their own install when stopped cooperatively. Not
            // keyed on downloadingData.updating: the helper's error state drops it.
            const inPlaceUpdate = Boolean(
              before.downloadingData &&
              cache.previousGameInfo &&
              !protectedUpdate &&
              !torrentDownload
            );
            const abandonUpdate = inPlaceUpdate && (isKill || deleteContents);
            if (
              deleteContents &&
              before.downloadingData?.updating &&
              !protectedUpdate &&
              !inPlaceUpdate
            ) {
              throw new Error(
                "This update has no recovery backup. Keep its files to protect the installed game."
              );
            }
            if (
              !isKill &&
              (!before.downloadingData ||
                before.downloadingData.extracting ||
                before.downloadingData.verifying ||
                before.downloadingData.pendingManualInstall ||
                before.downloadingData.awaitingRecoveryAction)
            ) {
              throw new Error("This download is no longer in a pausable stage.");
            }
            const knownPids = [
              before.downloadingData?.ownerPid,
              downloadProcesses.get(sanitizedGame)?.pid,
              retryDownloadProcesses.get(sanitizedGame)?.pid,
            ].filter(pid => Number.isInteger(pid) && pid > 0);

            try {
              // Step 1: Update JSON to mark as stopped FIRST (before killing processes)
              // This prevents the downloader from overwriting the stopped state
              const jsonFile = path.join(
                gameDirectory,
                `${sanitizedGame}.ascendara.json`
              );
              if (fs.existsSync(jsonFile)) {
                try {
                  const gameInfo = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
                  if (isKill && !protectedUpdate && !inPlaceUpdate) {
                    // Killing (even with files kept) means the user is abandoning the
                    // download, not pausing it - clear downloadingData entirely so it
                    // no longer shows up as an active/resumable download.
                    delete gameInfo.downloadingData;
                  } else {
                    gameInfo.downloadingData = {
                      ...gameInfo.downloadingData,
                      stopped: true,
                      downloading: false,
                      extracting: false,
                      verifying: false,
                      progressDownloadSpeeds: "0.00 B/s",
                      timeUntilComplete: "0s",
                    };
                  }
                  fs.writeFileSync(jsonFile, JSON.stringify(gameInfo, null, 2));
                  console.log(`Marked download as stopped in JSON: ${jsonFile}`);
                } catch (jsonError) {
                  console.error(`Error updating JSON file: ${jsonError}`);
                  throw jsonError;
                }
              }

              // Allow the HTTP worker to checkpoint its partial transfer before falling
              // back to forced termination. Verify real helper PIDs before returning.
              // Abandoned updates also stop cooperatively so the downloader can
              // roll back any files it has already replaced.
              await stopHelpers(sanitizedGame, gameDirectory, knownPids, {
                cooperative: (!isKill || abandonUpdate) && !torrentDownload,
              });
              downloadProcesses.delete(sanitizedGame);
              retryDownloadProcesses.delete(sanitizedGame);
              if (torrentDownload) {
                await qbtRemoveTorrentsForDirectory(
                  settings,
                  gameDirectory,
                  deleteContents && !protectedUpdate
                );
              }

              if (protectedUpdate && (isKill || deleteContents)) {
                await gameUpdateBackup.restore(gameDirectory);
                await fs.remove(cacheFile);
                return true;
              }
              if (abandonUpdate) {
                await gameUpdateBackup.abandonInPlace(
                  gameDirectory,
                  cache.previousGameInfo,
                  deleteContents
                );
                await fs.remove(cacheFile);
                return true;
              }

              // Step 4: Ensure JSON is in the expected state (in case downloader overwrote it)
              if (fs.existsSync(jsonFile)) {
                try {
                  const gameInfo = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
                  if (isKill && !protectedUpdate && !inPlaceUpdate) {
                    delete gameInfo.downloadingData;
                  } else {
                    gameInfo.downloadingData = {
                      ...gameInfo.downloadingData,
                      stopped: true,
                      downloading: false,
                      extracting: false,
                      verifying: false,
                      progressDownloadSpeeds: "0.00 B/s",
                      timeUntilComplete: "0s",
                    };
                  }
                  if (gameInfo.downloadingData) delete gameInfo.downloadingData.ownerPid;
                  fs.writeFileSync(jsonFile, JSON.stringify(gameInfo, null, 2));
                  console.log(`Confirmed stopped state in JSON: ${jsonFile}`);
                } catch (jsonError) {
                  console.error(`Error confirming JSON state: ${jsonError}`);
                  throw jsonError;
                }
              }

              // Step 5: Delete contents if requested
              if (deleteContents) {
                console.log(`Deleting game directory: ${gameDirectory}`);

                // Never delete items that existed in this folder before Ascendara
                // started downloading into it (e.g. a manual install with save
                // data that happened to share the same folder name).
                const preexistingMarkerPath = path.join(
                  gameDirectory,
                  "preexisting.ascendara.json"
                );
                let preexistingEntries = [];
                if (fs.existsSync(preexistingMarkerPath)) {
                  try {
                    preexistingEntries = JSON.parse(
                      fs.readFileSync(preexistingMarkerPath, "utf8")
                    );
                    console.log(
                      `Preserving ${preexistingEntries.length} pre-existing item(s) found before this download started`
                    );
                  } catch (markerError) {
                    console.error(
                      `Error reading pre-existing items marker: ${markerError}`
                    );
                  }
                }
                const preexistingSet = new Set(preexistingEntries);

                let attempts = 0;
                const maxAttempts = 5;
                while (attempts < maxAttempts) {
                  try {
                    const files = await fs.promises.readdir(gameDirectory, {
                      withFileTypes: true,
                    });
                    for (const file of files) {
                      if (preexistingSet.has(file.name)) {
                        continue;
                      }
                      const fullPath = path.join(gameDirectory, file.name);
                      await fs.promises.rm(fullPath, {
                        recursive: true,
                        force: true,
                      });
                    }
                    if (fs.existsSync(preexistingMarkerPath)) {
                      await fs.promises.rm(preexistingMarkerPath, {
                        force: true,
                      });
                    }
                    // Only remove the directory itself if nothing pre-existing is left in it
                    const remaining = await fs.promises.readdir(gameDirectory);
                    if (remaining.length === 0) {
                      await fs.promises.rmdir(gameDirectory);
                      console.log(`Successfully deleted game directory`);
                    } else {
                      console.log(
                        `Kept game directory because it still contains ${remaining.length} pre-existing item(s): ${gameDirectory}`
                      );
                    }
                    break;
                  } catch (deleteError) {
                    attempts++;
                    console.error(
                      `Delete attempt ${attempts}/${maxAttempts} failed:`,
                      deleteError
                    );
                    if (attempts === maxAttempts) {
                      console.error(
                        `Failed to delete directory after ${maxAttempts} attempts`
                      );
                      throw deleteError;
                    }
                    await new Promise(resolve => setTimeout(resolve, 2000));
                  }
                }
              }

              console.log(`Successfully stopped download for: ${sanitizedGame}`);
              return true;
            } catch (error) {
              // A failed pause must not leave a successful-looking paused card while
              // a helper or qBittorrent may still be transferring in the background.
              if (!isKill && (await fs.pathExists(jsonFilePath))) {
                const current = await fs.readJson(jsonFilePath);
                current.downloadingData = {
                  ...current.downloadingData,
                  stopped: Boolean(before.downloadingData.stopped),
                  downloading: Boolean(before.downloadingData.downloading),
                  extracting: Boolean(before.downloadingData.extracting),
                  verifying: Boolean(before.downloadingData.verifying),
                  updating: Boolean(before.downloadingData.updating),
                };
                await fs.writeJson(jsonFilePath, current, { spaces: 2 });
              }
              throw error;
            }
          }
        );
      } catch (error) {
        console.error("Error stopping download:", error);
        return false;
      }
    }
  );

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
        const normalizedPath = filePath.replace(/[/\\]/g, path.sep);
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

  // Resolve retained downloads across every configured library.
  async function extractionTarget(game) {
    const settings = settingsManager.getSettings();
    const name = sanitizeGameName(sanitizeText(game));
    if (!name || name !== game) throw new Error("Invalid game name.");
    for (const directory of [
      settings.downloadDirectory,
      ...(settings.additionalDirectories || []),
    ].filter(Boolean)) {
      const metadata = path.join(directory, name, `${name}.ascendara.json`);
      if (!(await fs.pathExists(metadata))) continue;
      const info = await fs.readJson(metadata);
      const data = info.downloadingData;
      if (
        !data ||
        !(
          data.error ||
          data.stopped ||
          data.verifyError?.length ||
          (info.privateSource &&
            data.pendingManualInstall &&
            /\.(zip|7z|rar)$/i.test(info.privateSource.package || ""))
        ) ||
        (!info.extractionSources && Number.parseFloat(data.progressCompleted) < 100) ||
        (!info.extractionSources &&
          !Number.isFinite(Number.parseFloat(data.progressCompleted)))
      ) {
        throw new Error("This download is not ready for an extraction retry.");
      }
      return { metadata, info };
    }
    throw new Error("Download metadata was not found.");
  }

  ipcMain.handle("check-retry-extract", async (_, game) => {
    try {
      await extractionTarget(game);
      return true;
    } catch {
      return false;
    }
  });

  const extractionStarts = new Set();
  const retryExtraction = async game => {
    const running = downloadProcesses.get(game);
    if (
      extractionStarts.has(game) ||
      (running &&
        running.exitCode === null &&
        running.signalCode === null &&
        !running.killed)
    ) {
      return {
        success: false,
        error: "A downloader is still running for this game. Try again after it exits.",
      };
    }
    extractionStarts.add(game);
    try {
      const { metadata, info } = await extractionTarget(game);
      let executable = isWindows
        ? isDev
          ? path.resolve("binaries/AscendaraDownloader/dist/AscendaraDownloader.exe")
          : path.join(appDirectory, "resources/AscendaraDownloader.exe")
        : isDev
          ? getPythonPath()
          : path.join(process.resourcesPath, "AscendaraDownloader");
      let args = ["--retry-extraction", metadata];
      if (info.privateSource && isDev && isWindows) {
        executable = getPythonPath();
        args.unshift(
          path.resolve("binaries/AscendaraDownloader/src/AscendaraDownloader.py")
        );
      }
      if (isDev && !isWindows)
        args.unshift(
          path.resolve("binaries/AscendaraDownloader/src/AscendaraDownloader.py")
        );
      if (process.platform === "linux" && !isDev) {
        executable = await prepareDownloaderRuntime(
          executable,
          path.join(app.getPath("userData"), "downloader-runtime")
        );
      }
      // Publish a busy state before spawning so repeated clicks cannot start a
      // second extraction. Restore the prior state if the process cannot start.
      const { ownerPid, ...previous } = info.downloadingData;
      info.downloadingData = {
        ...previous,
        error: false,
        stopped: false,
        verifyError: null,
        extracting: true,
        downloading: false,
        verifying: false,
        awaitingRecoveryAction: false,
        progressCompleted: "100.00",
        progressDownloadSpeeds: "0.00 KB/s",
        timeUntilComplete: "Preparing extraction...",
      };
      await fs.writeJson(metadata, info, { spaces: 4 });
      try {
        const child = spawn(executable, args, {
          stdio: "ignore",
          windowsHide: true,
        });
        downloadProcesses.set(game, child);
        child.once("close", async code => {
          if (downloadProcesses.get(game) === child) downloadProcesses.delete(game);
          // An incompatible or crashed binary must not leave the UI extracting forever.
          if (code !== 0) {
            try {
              const current = await fs.readJson(metadata);
              if (
                current.downloadingData &&
                !current.downloadingData.error &&
                !current.downloadingData.stopped
              ) {
                current.downloadingData = {
                  ...previous,
                  error: true,
                  extracting: false,
                  message: `Extraction process exited (code ${code}). Source files were retained. Check downloadmanager.log.`,
                };
                await fs.writeJson(metadata, current, { spaces: 4 });
              }
            } catch (error) {
              console.error("Could not record extraction exit:", error);
            }
          }
        });
        await new Promise((resolve, reject) => {
          child.once("spawn", resolve);
          child.once("error", reject);
        });
        return { success: true };
      } catch (error) {
        downloadProcesses.delete(game);
        info.downloadingData = previous;
        await fs.writeJson(metadata, info, { spaces: 4 });
        throw error;
      }
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      extractionStarts.delete(game);
    }
  };
  ipcMain.handle("retry-extract", (_, game) => retryExtraction(game));

  // Retry download handler
  ipcMain.handle("retry-download", async (_, link, game, online, dlc, version) => {
    const settings = settingsManager.getSettings();
    try {
      if (!settings.downloadDirectory) {
        throw new Error("Download directory not set. Please configure it in Settings.");
      }
      const gamesDirectory = settings.downloadDirectory;

      const executablePath = getHelperPath("AscendaraDownloader");
      const spawnCommand = [
        link,
        game,
        online,
        dlc,
        "false",
        "false",
        version,
        "0",
        gamesDirectory,
      ];

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
  const resumeDownload = async game => {
    const privateResult = await require("./privateSources").resume(game);
    if (privateResult) return privateResult;
    try {
      return await withDownloadOperation(
        sanitizeGameName(sanitizeText(game)),
        async () => {
          console.log(`Resuming download for game: ${game}`);
          const sanitizedGame = sanitizeGameName(sanitizeText(game));
          if (!sanitizedGame || sanitizedGame === "." || sanitizedGame === "..") {
            throw new Error("Invalid game name.");
          }
          const settings = settingsManager.getSettings();

          // Find the game directory across all possible locations
          let gameDirectory = null;
          const allDirectories = [
            settings.downloadDirectory,
            ...(settings.additionalDirectories || []),
          ];

          for (const dir of allDirectories.filter(Boolean)) {
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

          if (!gameInfo.downloadingData?.stopped) {
            return { success: false, error: "This download is not paused." };
          }
          const live = matchingHelpers(
            await listHelpers(),
            sanitizedGame,
            gameDirectory,
            [
              gameInfo.downloadingData.ownerPid,
              downloadProcesses.get(sanitizedGame)?.pid,
            ].filter(Number.isInteger)
          );
          if (live.length)
            return {
              success: false,
              error: "The previous downloader is still stopping. Try again shortly.",
            };

          // Check if there's cached download data with the original link
          const cachedDataPath = path.join(
            app.getPath("userData"),
            "downloadCache",
            `${sanitizedGame}.json`
          );

          let downloadLink = null;
          let browserDirect = false;
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
              browserDirect = cachedData.browserDirect === true;
              console.log(`Found cached download link: ${downloadLink}`);
            } catch (cacheError) {
              console.error(`Error reading cached download data: ${cacheError}`);
            }
          }

          if (!downloadLink) {
            console.error(`No download link found for: ${sanitizedGame}`);
            return {
              success: false,
              error: "Download link not found. Cannot resume.",
            };
          }

          const torrentDownload = /^(magnet:)|\.torrent(?:\?|$)/i.test(downloadLink);
          const helperName = torrentDownload
            ? "AscendaraTorrentHandler"
            : "AscendaraDownloader";
          let executablePath = getHelperPath(helperName);
          const targetDirectory = path.dirname(gameDirectory);
          let spawnCommand = [
            downloadLink,
            sanitizedGame,
            online,
            dlc,
            isVr,
            String(Boolean(gameInfo.downloadingData.updating)),
            version || "-1",
            String(size),
            targetDirectory,
          ];
          if (!torrentDownload) spawnCommand.push(gameID || "");
          if (!isWindows && isDev) {
            executablePath = getPythonPath();
            spawnCommand.unshift(
              path.join(`./binaries/${helperName}/src/${helperName}.py`)
            );
          }
          if (torrentDownload)
            spawnCommand.push(
              "--qbitHost",
              String(settings.torrentHost || "localhost"),
              "--qbitPort",
              String(settings.torrentPort || 8080),
              "--qbitUsername",
              String(settings.torrentUsername || "admin"),
              "--qbitPassword",
              String(settings.torrentPassword || "adminadmin")
            );

          if (browserDirect && !torrentDownload)
            spawnCommand.push("--provider", "direct");

          // Add notification flags if enabled
          if (settings.notifications) {
            spawnCommand = spawnCommand.concat(["--withNotification", settings.theme]);
          }

          if (process.platform === "linux" && !isDev && !torrentDownload) {
            executablePath = await prepareDownloaderRuntime(
              executablePath,
              path.join(app.getPath("userData"), "downloader-runtime")
            );
          }

          // Publish a starting state while retaining the last checkpoint for the UI.
          const pausedData = { ...gameInfo.downloadingData };
          gameInfo.downloadingData = {
            ...pausedData,
            stopped: false,
            downloading: true,
            error: false,
            progressDownloadSpeeds: "0.00 B/s",
            timeUntilComplete: "0s",
          };
          delete gameInfo.downloadingData.ownerPid;
          fs.writeFileSync(jsonFile, JSON.stringify(gameInfo, null, 2));
          let downloadProcess;
          try {
            downloadProcess = spawn(executablePath, spawnCommand, {
              detached: true,
              stdio: "ignore",
              windowsHide: true,
            });
            await waitForSpawn(downloadProcess);
          } catch (error) {
            gameInfo.downloadingData = pausedData;
            fs.writeFileSync(jsonFile, JSON.stringify(gameInfo, null, 2));
            throw error;
          }
          downloadProcess.on("error", error => console.error("Downloader error:", error));
          downloadProcess.once("exit", () => {
            if (downloadProcesses.get(sanitizedGame) === downloadProcess)
              downloadProcesses.delete(sanitizedGame);
          });
          const analyticsParams = { game: sanitizedGame, game_id: gameInfo.gameID };
          sendAnalyticsEvent("download_resume", analyticsParams);
          trackDownloadOutcome(downloadProcess, path.dirname(jsonFile), analyticsParams);

          downloadProcesses.set(sanitizedGame, downloadProcess);
          downloadProcess.unref();

          console.log(`Successfully resumed download for: ${sanitizedGame}`);
          return { success: true };
        }
      );
    } catch (error) {
      console.error("Error resuming download:", error);
      return { success: false, error: error.message };
    }
  };
  ipcMain.handle("resume-download", (_, game) => resumeDownload(game));

  startDownloadWatchdog({
    getDirectories: () => {
      const settings = settingsManager.getSettings();
      return [
        settings.downloadDirectory,
        ...(settings.additionalDirectories || []),
      ].filter(Boolean);
    },
    retryExtraction,
    resumeDownload,
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
