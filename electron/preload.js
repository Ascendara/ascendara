//=============================================================================
// Ascendara Preload Script
//=============================================================================
// This script acts as a secure bridge between Electron's main and renderer processes.
// It exposes specific main process functionality to the renderer process through
// contextBridge, ensuring safe IPC (Inter-Process Communication).
//
// Note: This file is crucial for security as it controls what main process
// functionality is available to the frontend.
//
// Learn more about Developing Ascendara at https://ascendara.app/docs/developer/overview
//=============================================================================

const { contextBridge, ipcRenderer } = require("electron");
const https = require("https");

//=============================================================================
// MAIN ELECTRON API
//=============================================================================
contextBridge.exposeInMainWorld("electron", {
  //===========================================================================
  // IPC RENDERER (Low-level IPC access)
  //===========================================================================
  ipcRenderer: {
    on: (channel, func) =>
      ipcRenderer.on(channel, (event, ...args) => func(event, ...args)),
    off: (channel, func) => ipcRenderer.off(channel, func),
    removeListener: (channel, func) => ipcRenderer.removeListener(channel, func),
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    readFile: path => ipcRenderer.invoke("read-local-file", path),
    writeFile: (path, content) => ipcRenderer.invoke("write-file", path, content),
  },

  //===========================================================================
  // WINDOW MANAGEMENT
  //===========================================================================
  minimizeWindow: () => ipcRenderer.invoke("minimize-window"),
  maximizeWindow: () => ipcRenderer.invoke("maximize-window"),
  closeWindow: () => ipcRenderer.invoke("close-window"),
  toggleFullscreen: () => ipcRenderer.invoke("toggle-fullscreen"),
  getFullscreenState: () => ipcRenderer.invoke("get-fullscreen-state"),
  clearCache: () => ipcRenderer.invoke("clear-cache"),
  reload: () => ipcRenderer.invoke("reload"),
  onWindowStateChange: callback => {
    ipcRenderer.on("window-state-changed", (_, maximized) => callback(maximized));
  },
  onAppClose: callback => {
    ipcRenderer.on("app-closing", () => callback());
  },
  onAppHidden: callback => {
    ipcRenderer.on("app-hidden", () => callback());
  },
  onAppShown: callback => {
    ipcRenderer.on("app-shown", () => callback());
  },

  //===========================================================================
  // SETTINGS & CONFIGURATION
  //===========================================================================
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (options, directory) =>
    ipcRenderer.invoke("save-settings", options, directory),
  updateSetting: (key, value) => ipcRenderer.invoke("update-setting", key, value),
  getDefaultLocalIndexPath: () => ipcRenderer.invoke("get-default-local-index-path"),
  getDownloadDirectory: () => ipcRenderer.invoke("get-download-directory"),
  onSettingsChanged: callback => {
    ipcRenderer.on("settings-updated", callback);
    return () => ipcRenderer.removeListener("settings-updated", callback);
  },

  // Crack/Emulator Settings
  getLocalCrackUsername: () => ipcRenderer.invoke("get-local-crack-username"),
  getLocalCrackDirectory: () => ipcRenderer.invoke("get-local-crack-directory"),
  setLocalCrackUsername: username =>
    ipcRenderer.invoke("set-local-crack-username", username),
  setLocalCrackDirectory: directory =>
    ipcRenderer.invoke("set-local-crack-directory", directory),

  // Timestamp/State Management
  createTimestamp: () => ipcRenderer.invoke("create-timestamp"),
  setTimestampValue: (key, value) =>
    ipcRenderer.invoke("set-timestamp-value", key, value),
  getTimestampValue: key => ipcRenderer.invoke("get-timestamp-value", key),
  timestampTime: () => ipcRenderer.invoke("timestamp-time"),

  //===========================================================================
  // WELCOME FLOW & APP STATE
  //===========================================================================
  isNew: () => ipcRenderer.invoke("is-new"),
  isV7: () => ipcRenderer.invoke("is-v7"),
  setV7: () => ipcRenderer.invoke("set-v7"),
  checkV7Welcome: () => ipcRenderer.invoke("check-v7-welcome"),
  hasLaunched: () => ipcRenderer.invoke("has-launched"),
  hasAdmin: () => ipcRenderer.invoke("has-admin"),
  updateLaunchCount: () => ipcRenderer.invoke("update-launch-count"),
  getLaunchCount: () => ipcRenderer.invoke("get-launch-count"),
  onWelcomeComplete: callback => ipcRenderer.on("welcome-complete", () => callback()),
  triggerWelcomeComplete: () => ipcRenderer.invoke("welcome-complete"),

  //===========================================================================
  // HARDWARE ID (for trial verification)
  //===========================================================================
  getHardwareId: () => ipcRenderer.invoke("get-hardware-id"),

  //===========================================================================
  // DISCORD RPC
  //===========================================================================
  toggleDiscordRPC: enabled => ipcRenderer.invoke("toggle-discord-rpc", enabled),

  //===========================================================================
  // IGDB API (bypasses CORS)
  //===========================================================================
  igdbRequest: (endpoint, body, clientId, accessToken) =>
    ipcRenderer.invoke("igdb-request", { endpoint, body, clientId, accessToken }),

  //===========================================================================
  // GiantBomb API (bypasses CORS)
  //===========================================================================
  giantbombRequest: (url, apiKey) =>
    ipcRenderer.invoke("giantbomb-request", { url, apiKey }),

  switchRPC: state => ipcRenderer.invoke("switch-rpc", state),

  //===========================================================================
  // LANGUAGE & TRANSLATIONS
  //===========================================================================
  downloadLanguage: langCode => ipcRenderer.invoke("download-language", langCode),
  saveLanguageFile: (langCode, content) =>
    ipcRenderer.invoke("save-language-file", langCode, content),
  getLanguageFile: langCode => ipcRenderer.invoke("get-language-file", langCode),
  startTranslation: langCode => ipcRenderer.invoke("start-translation", langCode),
  cancelTranslation: () => ipcRenderer.invoke("cancel-translation"),
  getDownloadedLanguages: () => ipcRenderer.invoke("get-downloaded-languages"),
  languageFileExists: filename => ipcRenderer.invoke("language-file-exists", filename),

  //===========================================================================
  // LOCAL INDEX REFRESH
  //===========================================================================
  startLocalRefresh: data => ipcRenderer.invoke("start-local-refresh", data),
  stopLocalRefresh: outputPath => ipcRenderer.invoke("stop-local-refresh", outputPath),
  sendLocalRefreshCookie: cookie =>
    ipcRenderer.invoke("send-local-refresh-cookie", cookie),
  getLocalRefreshProgress: outputPath =>
    ipcRenderer.invoke("get-local-refresh-progress", outputPath),
  getLocalRefreshStatus: outputPath =>
    ipcRenderer.invoke("get-local-refresh-status", outputPath),
  onLocalRefreshProgress: callback =>
    ipcRenderer.on("local-refresh-progress", (_, data) => callback(data)),
  onLocalRefreshComplete: callback =>
    ipcRenderer.on("local-refresh-complete", (_, data) => callback(data)),
  onLocalRefreshError: callback =>
    ipcRenderer.on("local-refresh-error", (_, data) => callback(data)),
  onLocalRefreshCookieNeeded: callback =>
    ipcRenderer.on("local-refresh-cookie-needed", () => callback()),
  offLocalRefreshProgress: () => ipcRenderer.removeAllListeners("local-refresh-progress"),
  offLocalRefreshComplete: () => ipcRenderer.removeAllListeners("local-refresh-complete"),
  offLocalRefreshError: () => ipcRenderer.removeAllListeners("local-refresh-error"),
  offLocalRefreshCookieNeeded: () =>
    ipcRenderer.removeAllListeners("local-refresh-cookie-needed"),
  downloadSharedIndex: outputPath =>
    ipcRenderer.invoke("download-shared-index", outputPath),
  getPublicIndexDownloadStatus: () =>
    ipcRenderer.invoke("get-public-index-download-status"),
  onPublicIndexDownloadStarted: callback =>
    ipcRenderer.on("public-index-download-started", () => callback()),
  onPublicIndexDownloadComplete: callback =>
    ipcRenderer.on("public-index-download-complete", () => callback()),
  onPublicIndexDownloadError: callback =>
    ipcRenderer.on("public-index-download-error", (_, data) => callback(data)),
  onPublicIndexDownloadProgress: callback =>
    ipcRenderer.on("public-index-download-progress", (_, data) => callback(data)),
  offPublicIndexDownloadStarted: () =>
    ipcRenderer.removeAllListeners("public-index-download-started"),
  offPublicIndexDownloadComplete: () =>
    ipcRenderer.removeAllListeners("public-index-download-complete"),
  offPublicIndexDownloadError: () =>
    ipcRenderer.removeAllListeners("public-index-download-error"),
  offPublicIndexDownloadProgress: () =>
    ipcRenderer.removeAllListeners("public-index-download-progress"),

  //===========================================================================
  // GAME MANAGEMENT
  //===========================================================================
  getGames: () => ipcRenderer.invoke("get-games"),
  getCustomGames: () => ipcRenderer.invoke("get-custom-games"),
  getInstalledGames: () => ipcRenderer.invoke("get-installed-games"),
  getInstalledGamesSize: () => ipcRenderer.invoke("get-installed-games-size"),
  addGame: (game, online, dlc, version, executable, imgID) =>
    ipcRenderer.invoke("save-custom-game", game, online, dlc, version, executable, imgID),
  removeCustomGame: game => ipcRenderer.invoke("remove-game", game),
  deleteGame: game => ipcRenderer.invoke("delete-game", game),
  deleteGameDirectory: game => ipcRenderer.invoke("delete-game-directory", game),
  verifyGame: game => ipcRenderer.invoke("verify-game", game),
  importSteamGames: directory => ipcRenderer.invoke("import-steam-games", directory),

  // Game Cover/Image
  updateGameCover: (gameName, imgID, imageData) =>
    ipcRenderer.invoke("update-game-cover", gameName, imgID, imageData),
  getGameImage: game => ipcRenderer.invoke("get-game-image", game),
  getLocalImageUrl: imagePath => ipcRenderer.invoke("get-local-image-url", imagePath),

  // Game Rating & Backups
  gameRated: (game, isCustom) => ipcRenderer.invoke("game-rated", game, isCustom),
  enableGameAutoBackups: (game, isCustom) =>
    ipcRenderer.invoke("enable-game-auto-backups", game, isCustom),
  disableGameAutoBackups: (game, isCustom) =>
    ipcRenderer.invoke("disable-game-auto-backups", game, isCustom),
  isGameAutoBackupsEnabled: (game, isCustom) =>
    ipcRenderer.invoke("is-game-auto-backups-enabled", game, isCustom),
  ludusavi: (action, game) => ipcRenderer.invoke("ludusavi", action, game),

  // Game Shortcuts & Executables
  createGameShortcut: game => ipcRenderer.invoke("create-game-shortcut", game),
  modifyGameExecutable: (game, executable) =>
    ipcRenderer.invoke("modify-game-executable", game, executable),
  getGameExecutables: (game, isCustom) =>
    ipcRenderer.invoke("get-game-executables", game, isCustom),
  setGameExecutables: (game, executables, isCustom) =>
    ipcRenderer.invoke("set-game-executables", game, executables, isCustom),
  saveLaunchCommands: (game, launchCommands, isCustom) =>
    ipcRenderer.invoke("save-launch-commands", game, launchCommands, isCustom),
  getLaunchCommands: (game, isCustom) =>
    ipcRenderer.invoke("get-launch-commands", game, isCustom),
  readGameAchievements: (game, isCustom) =>
    ipcRenderer.invoke("read-game-achievements", game, isCustom),
  getAchievementsLeaderboard: (games, options) =>
    ipcRenderer.invoke("get-achievements-leaderboard", games, options),
  writeGameAchievements: (gameName, achievements) =>
    ipcRenderer.invoke("write-game-achievements", gameName, achievements),
  restoreCloudGameData: (gameName, cloudData) =>
    ipcRenderer.invoke("restore-cloud-game-data", gameName, cloudData),

  //===========================================================================
  // GAME EXECUTION
  //===========================================================================
  playGame: (
    game,
    isCustom,
    backupOnClose,
    launchWithAdmin,
    specificExecutable,
    launchWithTrainer
  ) =>
    ipcRenderer.invoke(
      "play-game",
      game,
      isCustom,
      backupOnClose,
      launchWithAdmin,
      specificExecutable,
      launchWithTrainer
    ),
  checkTrainerExists: (gameName, isCustom) =>
    ipcRenderer.invoke("check-trainer-exists", gameName, isCustom),
  isGameRunning: game => ipcRenderer.invoke("is-game-running", game),
  startSteam: () => ipcRenderer.invoke("start-steam"),
  isSteamRunning: () => ipcRenderer.invoke("is-steam-running"),

  //===========================================================================
  // DOWNLOADS
  //===========================================================================
  downloadFile: (
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
  ) =>
    ipcRenderer.invoke(
      "download-file",
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
    ),
  stopDownload: (game, deleteContents) =>
    ipcRenderer.invoke("stop-download", game, deleteContents),
  retryDownload: (link, game, online, dlc, version) =>
    ipcRenderer.invoke("retry-download", link, game, online, dlc, version),
  checkRetryExtract: game => ipcRenderer.invoke("check-retry-extract", game),
  retryExtract: (game, online, dlc, version) =>
    ipcRenderer.invoke("retry-extract", game, online, dlc, version),
  downloadItem: url => ipcRenderer.invoke("download-item", url),
  downloadSoundtrack: (track, game) =>
    ipcRenderer.invoke("download-soundtrack", track, game),
  downloadTrainerToGame: (downloadUrl, gameName, isCustom) =>
    ipcRenderer.invoke("download-trainer-to-game", downloadUrl, gameName, isCustom),
  isDownloaderRunning: () => ipcRenderer.invoke("is-downloader-running"),
  getDownloadHistory: () => ipcRenderer.invoke("get-download-history"),

  // Download Events
  onDownloadProgress: callback => {
    ipcRenderer.on("download-progress", (_, data) => callback(data));
    return () => ipcRenderer.removeListener("download-progress", callback);
  },
  onDownloadComplete: callback => {
    const listener = (_, data) => callback(data);
    ipcRenderer.on("download-complete", listener);
    return () => ipcRenderer.removeListener("download-complete", listener);
  },

  //===========================================================================
  // FILE & DIRECTORY MANAGEMENT
  //===========================================================================
  openGameDirectory: (game, isCustom) =>
    ipcRenderer.invoke("open-game-directory", game, isCustom),
  openDirectoryDialog: () => ipcRenderer.invoke("open-directory-dialog"),
  openFileDialog: (exePath = null) => ipcRenderer.invoke("open-file-dialog", exePath),
  canCreateFiles: directory => ipcRenderer.invoke("can-create-files", directory),
  checkFileExists: filePath => ipcRenderer.invoke("check-file-exists", filePath),
  getDriveSpace: path => ipcRenderer.invoke("get-drive-space", path),
  getAssetPath: filename => ipcRenderer.invoke("get-asset-path", filename),
  getAudioAsset: filename => ipcRenderer.invoke("get-audio-asset", filename),
  onDirectorySizeStatus: callback => {
    ipcRenderer.on("directory-size-status", (_, status) => callback(status));
    return () => ipcRenderer.removeListener("directory-size-status", callback);
  },

  //===========================================================================
  // TOOLS & DEPENDENCIES
  //===========================================================================
  getInstalledTools: () => ipcRenderer.invoke("get-installed-tools"),
  installTool: tool => ipcRenderer.invoke("install-tool", tool),
  installDependencies: () => ipcRenderer.invoke("install-dependencies"),
  installPython: () => ipcRenderer.invoke("install-python"),
  installWine: () => ipcRenderer.invoke("install-wine"),
  isSteamCMDInstalled: () => ipcRenderer.invoke("is-steamcmd-installed"),
  installSteamCMD: () => ipcRenderer.invoke("install-steamcmd"),
  checkGameDependencies: () => ipcRenderer.invoke("check-game-dependencies"),
  openReqPath: game => ipcRenderer.invoke("required-libraries", game),
  folderExclusion: boolean => ipcRenderer.invoke("folder-exclusion", boolean),
  isWatchdogRunning: () => ipcRenderer.invoke("is-watchdog-running"),

  //===========================================================================
  // UPDATES
  //===========================================================================
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  updateAscendara: () => ipcRenderer.invoke("update-ascendara"),
  isUpdateDownloaded: () => ipcRenderer.invoke("is-update-downloaded"),
  isBrokenVersion: () => ipcRenderer.invoke("is-broken-version"),
  deleteInstaller: () => ipcRenderer.invoke("delete-installer"),
  uninstallAscendara: () => ipcRenderer.invoke("uninstall-ascendara"),
  onUpdateAvailable: callback => ipcRenderer.on("update-available", callback),
  onUpdateReady: callback => ipcRenderer.on("update-ready", callback),
  removeUpdateAvailableListener: callback =>
    ipcRenderer.removeListener("update-available", callback),
  removeUpdateReadyListener: callback =>
    ipcRenderer.removeListener("update-ready", callback),

  //===========================================================================
  // THEMES & UI
  //===========================================================================
  getBackgrounds: () => ipcRenderer.invoke("get-backgrounds"),
  setBackground: (color, gradient) =>
    ipcRenderer.invoke("set-background", color, gradient),
  saveCustomThemeColors: customTheme =>
    ipcRenderer.invoke("save-custom-theme-colors", customTheme),
  exportCustomTheme: customTheme =>
    ipcRenderer.invoke("export-custom-theme", customTheme),
  importCustomTheme: () => ipcRenderer.invoke("import-custom-theme"),

  //===========================================================================
  // SYSTEM & PLATFORM
  //===========================================================================
  getPlatform: () => process.platform,
  isOnWindows: () => ipcRenderer.invoke("is-on-windows"),
  fetchSystemSpecs: () => ipcRenderer.invoke("fetch-system-specs"),
  isDev: () => ipcRenderer.invoke("is-dev"),
  isExperiment: () => ipcRenderer.invoke("is-experiment"),
  switchBuild: buildType => ipcRenderer.invoke("switch-build", buildType),
  showTestNotification: () => ipcRenderer.invoke("show-test-notification"),

  //===========================================================================
  // API & NETWORKING
  //===========================================================================
  getAPIKey: () => ipcRenderer.invoke("get-api-key"),
  getAnalyticsKey: () => ipcRenderer.invoke("get-analytics-key"),
  getImageKey: () => ipcRenderer.invoke("get-image-key"),
  openURL: url => ipcRenderer.invoke("open-url", url),
  fetchApiImage: (endpoint, imgID, timestamp, signature) =>
    ipcRenderer.invoke("fetch-api-image", endpoint, imgID, timestamp, signature),

  // HTTPS Request Helper
  request: (url, options) => {
    return new Promise((resolve, reject) => {
      const req = https.request(
        url,
        {
          method: options.method,
          headers: options.headers,
          timeout: options.timeout,
        },
        res => {
          let data = "";
          res.on("data", chunk => (data += chunk));
          res.on("end", () => {
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              data: data,
            });
          });
        }
      );
      req.on("error", error => reject(error));
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Request timed out"));
      });
      req.end();
    });
  },

  //===========================================================================
  // SUPPORT & PROFILE
  //===========================================================================
  uploadSupportLogs: (sessionToken, appToken) =>
    ipcRenderer.invoke("upload-support-logs", sessionToken, appToken),
  uploadProfileImage: imageBase64 =>
    ipcRenderer.invoke("upload-profile-image", imageBase64),
  getProfileImage: () => ipcRenderer.invoke("get-profile-image"),
});

//=============================================================================
// QBITTORRENT API
//=============================================================================
contextBridge.exposeInMainWorld("qbittorrentApi", {
  login: credentials => ipcRenderer.invoke("qbittorrent:login", credentials),
  getVersion: () => ipcRenderer.invoke("qbittorrent:version"),
});

//=============================================================================
// DOM CONTENT LOADED
//=============================================================================
window.addEventListener("DOMContentLoaded", () => {
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector);
    if (element) element.innerText = text;
  };
  for (const type of ["chrome", "node", "electron"]) {
    replaceText(`${type}-version`, process.versions[type]);
  }
});
