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

const { contextBridge, ipcRenderer } = require("electron");
const https = require("https");

// Create a map to store callbacks
const callbacks = new Map();

contextBridge.exposeInMainWorld("electron", {
  ipcRenderer: {
    on: (channel, func) =>
      ipcRenderer.on(channel, (event, ...args) => func(event, ...args)),
    off: (channel, func) => ipcRenderer.off(channel, func),
    removeListener: (channel, func) => ipcRenderer.removeListener(channel, func),
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    readFile: path => ipcRenderer.invoke("read-file", path),
    writeFile: (path, content) => ipcRenderer.invoke("write-file", path, content),
  },

  // Settings and Configuration
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (options, directory) =>
    ipcRenderer.invoke("save-settings", options, directory),
  updateSetting: (key, value) => ipcRenderer.invoke("update-setting", key, value),
  toggleDiscordRPC: enabled => ipcRenderer.invoke("toggle-discord-rpc", enabled),
  getDefaultLocalIndexPath: () => ipcRenderer.invoke("get-default-local-index-path"),

  // Local Refresh
  startLocalRefresh: data => ipcRenderer.invoke("start-local-refresh", data),
  stopLocalRefresh: () => ipcRenderer.invoke("stop-local-refresh"),
  getLocalRefreshProgress: outputPath =>
    ipcRenderer.invoke("get-local-refresh-progress", outputPath),
  getLocalRefreshStatus: outputPath =>
    ipcRenderer.invoke("get-local-refresh-status", outputPath),
  onLocalRefreshProgress: callback =>
    ipcRenderer.on("local-refresh-progress", (event, data) => callback(data)),
  onLocalRefreshComplete: callback =>
    ipcRenderer.on("local-refresh-complete", (event, data) => callback(data)),
  onLocalRefreshError: callback =>
    ipcRenderer.on("local-refresh-error", (event, data) => callback(data)),
  offLocalRefreshProgress: () => ipcRenderer.removeAllListeners("local-refresh-progress"),
  offLocalRefreshComplete: () => ipcRenderer.removeAllListeners("local-refresh-complete"),
  offLocalRefreshError: () => ipcRenderer.removeAllListeners("local-refresh-error"),

  // Language Management
  downloadLanguage: langCode => ipcRenderer.invoke("download-language", langCode),
  saveLanguageFile: (langCode, content) =>
    ipcRenderer.invoke("save-language-file", langCode, content),
  getLanguageFile: langCode => ipcRenderer.invoke("get-language-file", langCode),
  startTranslation: langCode => ipcRenderer.invoke("start-translation", langCode),
  cancelTranslation: () => ipcRenderer.invoke("cancel-translation"),
  getDownloadedLanguages: () => ipcRenderer.invoke("get-downloaded-languages"),
  languageFileExists: filename => ipcRenderer.invoke("language-file-exists", filename),

  getAnalyticsKey: () => ipcRenderer.invoke("get-analytics-key"),
  getImageKey: () => ipcRenderer.invoke("get-image-key"),
  hasLaunched: () => ipcRenderer.invoke("has-launched"),
  imageSecret: () => ipcRenderer.invoke("get-image-key"),
  getDownloadHistory: () => ipcRenderer.invoke("get-download-history"),
  switchRPC: state => ipcRenderer.invoke("switch-rpc", state),

  // Game Management
  getGames: () => ipcRenderer.invoke("get-games"),
  getCustomGames: () => ipcRenderer.invoke("get-custom-games"),
  updateGameCover: (gameName, imgID, imageData) =>
    ipcRenderer.invoke("update-game-cover", gameName, imgID, imageData),
  gameRated: (game, isCustom) => ipcRenderer.invoke("game-rated", game, isCustom),
  enableGameAutoBackups: (game, isCustom) =>
    ipcRenderer.invoke("enable-game-auto-backups", game, isCustom),
  disableGameAutoBackups: (game, isCustom) =>
    ipcRenderer.invoke("disable-game-auto-backups", game, isCustom),
  isGameAutoBackupsEnabled: (game, isCustom) =>
    ipcRenderer.invoke("is-game-auto-backups-enabled", game, isCustom),
  ludusavi: (action, game) => ipcRenderer.invoke("ludusavi", action, game),
  createGameShortcut: game => ipcRenderer.invoke("create-game-shortcut", game),
  isSteamRunning: () => ipcRenderer.invoke("is-steam-running"),
  verifyGame: game => ipcRenderer.invoke("verify-game", game),
  addGame: (game, online, dlc, version, executable, imgID) =>
    ipcRenderer.invoke("save-custom-game", game, online, dlc, version, executable, imgID),
  removeCustomGame: game => ipcRenderer.invoke("remove-game", game),
  deleteGame: game => ipcRenderer.invoke("delete-game", game),
  deleteGameDirectory: game => ipcRenderer.invoke("delete-game-directory", game),
  getInstalledGames: () => ipcRenderer.invoke("get-installed-games"),
  getInstalledGamesSize: () => ipcRenderer.invoke("get-installed-games-size"),
  importSteamGames: directory => ipcRenderer.invoke("import-steam-games", directory),

  // Download Status
  onDownloadProgress: callback => {
    ipcRenderer.on("download-progress", (event, data) => {
      callback(data);
    });
    // Return a function to remove the listener
    return () => {
      ipcRenderer.removeListener("download-progress", callback);
    };
  },
  onDownloadComplete: callback => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on("download-complete", listener);
    return () => ipcRenderer.removeListener("download-complete", listener);
  },

  // Game Execution
  playGame: (game, isCustom, backupOnClose, launchWithAdmin, specificExecutable) =>
    ipcRenderer.invoke(
      "play-game",
      game,
      isCustom,
      backupOnClose,
      launchWithAdmin,
      specificExecutable
    ),
  isGameRunning: game => ipcRenderer.invoke("is-game-running", game),
  startSteam: () => ipcRenderer.invoke("start-steam"),

  // File and Directory Management
  openGameDirectory: (game, isCustom) =>
    ipcRenderer.invoke("open-game-directory", game, isCustom),
  openDirectoryDialog: () => ipcRenderer.invoke("open-directory-dialog"),
  downloadSoundtrack: (track, game) =>
    ipcRenderer.invoke("download-soundtrack", track, game),
  folderExclusion: () => ipcRenderer.invoke("folder-exclusion"),
  getInstalledTools: () => ipcRenderer.invoke("get-installed-tools"),
  installTool: tool => ipcRenderer.invoke("install-tool", tool),
  isWatchdogRunning: () => ipcRenderer.invoke("is-watchdog-running"),
  canCreateFiles: directory => ipcRenderer.invoke("can-create-files", directory),
  openFileDialog: (exePath = null) => ipcRenderer.invoke("open-file-dialog", exePath),
  isSteamCMDInstalled: () => ipcRenderer.invoke("is-steamcmd-installed"),
  installSteamCMD: () => ipcRenderer.invoke("install-steamcmd"),
  getDownloadDirectory: () => ipcRenderer.invoke("get-download-directory"),
  folderExclusion: boolean => ipcRenderer.invoke("folder-exclusion", boolean),
  getDriveSpace: path => ipcRenderer.invoke("get-drive-space", path),
  switchBuild: buildType => ipcRenderer.invoke("switch-build", buildType),
  getLocalCrackUsername: () => ipcRenderer.invoke("get-local-crack-username"),
  getLocalCrackDirectory: () => ipcRenderer.invoke("get-local-crack-directory"),
  setLocalCrackUsername: username =>
    ipcRenderer.invoke("set-local-crack-username", username),
  setLocalCrackDirectory: directory =>
    ipcRenderer.invoke("set-local-crack-directory", directory),
  onDirectorySizeStatus: callback => {
    ipcRenderer.on("directory-size-status", (_, status) => callback(status));
    return () => {
      ipcRenderer.removeListener("directory-size-status", callback);
    };
  },

  // Download and Installation
  installDependencies: () => ipcRenderer.invoke("install-dependencies"),
  installPython: () => ipcRenderer.invoke("install-python"),
  installWine: () => ipcRenderer.invoke("install-wine"),
  downloadItem: url => ipcRenderer.invoke("download-item", url),
  stopDownload: (game, deleteContents) =>
    ipcRenderer.invoke("stop-download", game, deleteContents),
  retryDownload: (link, game, online, dlc, version) =>
    ipcRenderer.invoke("retry-download", link, game, online, dlc, version),
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
    additionalDirIndex
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
      additionalDirIndex
    ),
  checkRetryExtract: game => ipcRenderer.invoke("check-retry-extract", game),
  retryExtract: (game, online, dlc, version) =>
    ipcRenderer.invoke("retry-extract", game, online, dlc, version),

  // Background and UI
  getBackgrounds: () => ipcRenderer.invoke("get-backgrounds"),
  setBackground: (color, gradient) =>
    ipcRenderer.invoke("set-background", color, gradient),
  getGameImage: game => ipcRenderer.invoke("get-game-image", game),

  // Miscellaneous
  createTimestamp: () => ipcRenderer.invoke("create-timestamp"),
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  readGameAchievements: (game, isCustom) =>
    ipcRenderer.invoke("read-game-achievements", game, isCustom),
  updateLaunchCount: () => ipcRenderer.invoke("update-launch-count"),
  reload: () => ipcRenderer.invoke("reload"),
  getLaunchCount: () => ipcRenderer.invoke("get-launch-count"),
  isBrokenVersion: () => ipcRenderer.invoke("is-broken-version"),
  isOnWindows: () => ipcRenderer.invoke("is-on-windows"),
  getFullscreenState: () => ipcRenderer.invoke("get-fullscreen-state"),
  toggleFullscreen: () => ipcRenderer.invoke("toggle-fullscreen"),
  checkGameDependencies: () => ipcRenderer.invoke("check-game-dependencies"),
  fetchSystemSpecs: () => ipcRenderer.invoke("fetch-system-specs"),
  showTestNotification: () => ipcRenderer.invoke("show-test-notification"),
  getPlatform: () => ipcRenderer.invoke("get-platform"),
  isExperiment: () => ipcRenderer.invoke("is-experiment"),
  isDownloaderRunning: () => ipcRenderer.invoke("is-downloader-running"),
  deleteInstaller: () => ipcRenderer.invoke("delete-installer"),
  updateAscendara: () => ipcRenderer.invoke("update-ascendara"),
  uninstallAscendara: () => ipcRenderer.invoke("uninstall-ascendara"),
  openURL: url => ipcRenderer.invoke("open-url", url),
  getAPIKey: () => ipcRenderer.invoke("get-api-key"),
  openReqPath: game => ipcRenderer.invoke("required-libraries", game),
  uploadProfileImage: imageBase64 =>
    ipcRenderer.invoke("upload-profile-image", imageBase64),
  getProfileImage: () => ipcRenderer.invoke("get-profile-image"),
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
  getAssetPath: filename => ipcRenderer.invoke("get-asset-path", filename),
  getAnalyticsKey: () => ipcRenderer.invoke("get-analytics-key"),
  isDev: () => ipcRenderer.invoke("is-dev"),
  checkFileExists: filePath => ipcRenderer.invoke("check-file-exists", filePath),

  // Welcome flow functions
  isNew: () => ipcRenderer.invoke("is-new"),
  isV7: () => ipcRenderer.invoke("is-v7"),
  timestampTime: () => ipcRenderer.invoke("timestamp-time"),
  hasLaunched: () => ipcRenderer.invoke("has-launched"),
  hasAdmin: () => ipcRenderer.invoke("has-admin"),

  // Callback handling
  onWelcomeComplete: callback => {
    ipcRenderer.on("welcome-complete", () => callback());
  },
  triggerWelcomeComplete: () => {
    ipcRenderer.invoke("welcome-complete");
  },
  checkV7Welcome: () => ipcRenderer.invoke("check-v7-welcome"),
  setV7: () => ipcRenderer.invoke("set-v7"),
  setTimestampValue: (key, value) =>
    ipcRenderer.invoke("set-timestamp-value", key, value),
  getTimestampValue: key => ipcRenderer.invoke("get-timestamp-value", key),
  getAssetPath: filename => ipcRenderer.invoke("get-asset-path", filename),

  // Window management
  minimizeWindow: () => ipcRenderer.invoke("minimize-window"),
  maximizeWindow: () => ipcRenderer.invoke("maximize-window"),
  closeWindow: () => ipcRenderer.invoke("close-window"),
  onWindowStateChange: callback => {
    ipcRenderer.on("window-state-changed", (_, maximized) => callback(maximized));
  },
  clearCache: () => ipcRenderer.invoke("clear-cache"),

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

          res.on("data", chunk => {
            data += chunk;
          });

          res.on("end", () => {
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              data: data,
            });
          });
        }
      );

      req.on("error", error => {
        reject(error);
      });

      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Request timed out"));
      });

      req.end();
    });
  },

  onUpdateAvailable: callback => {
    ipcRenderer.on("update-available", callback);
  },

  onUpdateReady: callback => {
    ipcRenderer.on("update-ready", callback);
  },

  removeUpdateAvailableListener: callback => {
    ipcRenderer.removeListener("update-available", callback);
  },

  removeUpdateReadyListener: callback => {
    ipcRenderer.removeListener("update-ready", callback);
  },

  updateAscendara: () => ipcRenderer.invoke("update-ascendara"),
  isUpdateDownloaded: () => ipcRenderer.invoke("is-update-downloaded"),
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  platform: ipcRenderer.invoke("get-platform"),
  getPlatform: () => process.platform,
  onSettingsChanged: callback => {
    ipcRenderer.on("settings-updated", callback);
    return () => {
      ipcRenderer.removeListener("settings-updated", callback);
    };
  },
});

// Add qBittorrent API to context bridge
contextBridge.exposeInMainWorld("qbittorrentApi", {
  login: credentials => ipcRenderer.invoke("qbittorrent:login", credentials),
  getVersion: () => ipcRenderer.invoke("qbittorrent:version"),
});

window.addEventListener("DOMContentLoaded", () => {
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector);
    if (element) element.innerText = text;
  };
  for (const type of ["chrome", "node", "electron"]) {
    replaceText(`${type}-version`, process.versions[type]);
  }
});
