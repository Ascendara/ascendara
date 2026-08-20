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
const { createPreloadIpcTransport } = require("./modules/preload-bridge");

// Keep listener wrappers private so the page never receives Electron event objects.
const preloadIpc = createPreloadIpcTransport(ipcRenderer);

//=============================================================================
// MAIN ELECTRON API
//=============================================================================
contextBridge.exposeInMainWorld("electron", {
  //===========================================================================
  // IPC RENDERER (Legacy low-level access)
  //===========================================================================
  // Older renderer code still uses this object, so keep it while those callers migrate.
  ipcRenderer: preloadIpc.legacy,

  //===========================================================================
  // WINDOW MANAGEMENT
  //===========================================================================
  minimizeWindow: () => ipcRenderer.invoke("minimize-window"),
  maximizeWindow: () => ipcRenderer.invoke("maximize-window"),
  closeWindow: forceQuit => ipcRenderer.invoke("close-window", forceQuit),
  toggleFullscreen: () => ipcRenderer.invoke("toggle-fullscreen"),
  isWindowMaximized: () => ipcRenderer.invoke("is-window-maximized"),
  getFullscreenState: () => ipcRenderer.invoke("get-fullscreen-state"),
  clearCache: () => ipcRenderer.invoke("clear-cache"),
  openDevTools: () => ipcRenderer.invoke("open-devtools"),
  reload: () => ipcRenderer.invoke("reload"),
  onWindowStateChange: callback =>
    preloadIpc.subscribe("window-state-changed", callback, {
      selectArgs: args => [args[0]],
    }),
  onAppClose: callback =>
    preloadIpc.subscribe("app-closing", callback, {
      selectArgs: () => [],
    }),
  onAppHidden: callback =>
    preloadIpc.subscribe("app-hidden", callback, {
      selectArgs: () => [],
    }),
  onAppShown: callback =>
    preloadIpc.subscribe("app-shown", callback, {
      selectArgs: () => [],
    }),

  //===========================================================================
  // SETTINGS & CONFIGURATION
  //===========================================================================
  // Linux/Proton
  getRunners: () => ipcRenderer.invoke("get-runners"),
  detectProton: () => ipcRenderer.invoke("detect-proton"),
  downloadProtonGE: () => ipcRenderer.invoke("download-proton-ge"),
  deleteGamePrefix: gameName => ipcRenderer.invoke("delete-game-prefix", gameName),
  getPrefixSize: gameName => ipcRenderer.invoke("get-prefix-size", gameName),
  resolveRunner: override => ipcRenderer.invoke("resolve-runner", override),
  openPrefixFolder: gameName => ipcRenderer.invoke("open-prefix-folder", gameName),
  getProtonGEInfo: () => ipcRenderer.invoke("get-proton-ge-info"),
  selectCustomRunner: () => ipcRenderer.invoke("select-custom-runner"),
  checkProtonGEUpdate: () => ipcRenderer.invoke("check-proton-ge-update"),
  cleanupOldProtonGE: keepVersion =>
    ipcRenderer.invoke("cleanup-old-proton-ge", keepVersion),

  downloadProtonCachyOS: () => ipcRenderer.invoke("download-proton-cachyos"),
  getProtonCachyOSInfo: () => ipcRenderer.invoke("get-proton-cachyos-info"),
  checkProtonCachyOSUpdate: () => ipcRenderer.invoke("check-proton-cachyos-update"),
  cleanupOldProtonCachyOS: keepVersion =>
    ipcRenderer.invoke("cleanup-old-proton-cachyos", keepVersion),

  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (options, directory) =>
    ipcRenderer.invoke("save-settings", options, directory),
  updateSetting: (key, value) => ipcRenderer.invoke("update-setting", key, value),
  getDefaultLocalIndexPath: () => ipcRenderer.invoke("get-default-local-index-path"),
  getDownloadDirectory: () => ipcRenderer.invoke("get-download-directory"),
  getSteamApiKey: () => ipcRenderer.invoke("get-steam-api-key"),
  onSettingsChanged: callback =>
    preloadIpc.subscribe("settings-updated", callback, {
      // Keep the old (event, data) callback shape without exposing the Electron event.
      includeEventPlaceholder: true,
    }),

  // UMU Launcher
  isUmuInstalled: () => ipcRenderer.invoke("is-umu-installed"),
  downloadUmuLauncher: () => ipcRenderer.invoke("download-umu-launcher"),
  downloadUmuProton: () => ipcRenderer.invoke("download-umu-proton"),
  getUmuProtonInfo: () => ipcRenderer.invoke("get-umu-proton-info"),
  checkUmuProtonUpdate: () => ipcRenderer.invoke("check-umu-proton-update"),
  cleanupOldUmuProton: keepVersion =>
    ipcRenderer.invoke("cleanup-old-umu-proton", keepVersion),

  // UMU Database
  umuRefreshDatabase: () => ipcRenderer.invoke("umu-refresh-database"),
  umuFindId: gameName => ipcRenderer.invoke("umu-find-id", gameName),
  umuGetGameId: gameName => ipcRenderer.invoke("umu-get-game-id", gameName),
  umuSetGameId: (gameName, umuId) =>
    ipcRenderer.invoke("umu-set-game-id", gameName, umuId),
  umuAutoDetect: gameName => ipcRenderer.invoke("umu-auto-detect", gameName),

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

  // External Source JSON (user-provided bucket JSON stored in <localIndex>/external-sources)
  getExternalSourcesDirectory: () =>
    ipcRenderer.invoke("get-external-sources-directory"),
  setExternalSourceJson: (sourceId, data) =>
    ipcRenderer.invoke("set-external-source-json", sourceId, data),
  getExternalSourceJson: sourceId =>
    ipcRenderer.invoke("get-external-source-json", sourceId),
  removeExternalSourceJson: sourceId =>
    ipcRenderer.invoke("remove-external-source-json", sourceId),

  // Custom Lists (user-imported JSON sources stored in Documents/Ascendara/CustomLists)
  getCustomListsDirectory: () => ipcRenderer.invoke("get-custom-lists-directory"),
  setCustomListData: (listId, data) =>
    ipcRenderer.invoke("set-custom-list-data", listId, data),
  getCustomListData: listId => ipcRenderer.invoke("get-custom-list-data", listId),
  getCustomListFilePath: listId =>
    ipcRenderer.invoke("get-custom-list-file-path", listId),
  removeCustomListData: listId => ipcRenderer.invoke("remove-custom-list-data", listId),
  openCustomListFile: listId => ipcRenderer.invoke("open-custom-list-file", listId),
  showCustomListInFolder: listId =>
    ipcRenderer.invoke("show-custom-list-in-folder", listId),

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
  onWelcomeComplete: callback =>
    preloadIpc.subscribe("welcome-complete", callback, {
      selectArgs: () => [],
    }),
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
  // Steam API (bypasses CORS)
  //===========================================================================
  steamRequest: url => ipcRenderer.invoke("steam-request", { url }),

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
  onTranslationProgress: callback =>
    preloadIpc.subscribe("translation-progress", callback, {
      selectArgs: args => [args[0]],
    }),

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
    preloadIpc.subscribe("local-refresh-progress", callback, {
      selectArgs: args => [args[0]],
    }),
  onLocalRefreshComplete: callback =>
    preloadIpc.subscribe("local-refresh-complete", callback, {
      selectArgs: args => [args[0]],
    }),
  onLocalRefreshError: callback =>
    preloadIpc.subscribe("local-refresh-error", callback, {
      selectArgs: args => [args[0]],
    }),
  onLocalRefreshCookieNeeded: callback =>
    preloadIpc.subscribe("local-refresh-cookie-needed", callback, {
      selectArgs: () => [],
    }),
  onSteamripCookieReceived: callback =>
    preloadIpc.subscribe("steamrip-cookie-received", callback, {
      selectArgs: args => [args[0]],
    }),
  offLocalRefreshProgress: () =>
    preloadIpc.removeAllListeners("local-refresh-progress"),
  offLocalRefreshComplete: () =>
    preloadIpc.removeAllListeners("local-refresh-complete"),
  offLocalRefreshError: () => preloadIpc.removeAllListeners("local-refresh-error"),
  offLocalRefreshCookieNeeded: () =>
    preloadIpc.removeAllListeners("local-refresh-cookie-needed"),
  downloadSharedIndex: outputPath =>
    ipcRenderer.invoke("download-shared-index", outputPath),
  getPublicIndexDownloadStatus: () =>
    ipcRenderer.invoke("get-public-index-download-status"),
  onPublicIndexDownloadStarted: callback =>
    preloadIpc.subscribe("public-index-download-started", callback, {
      selectArgs: () => [],
    }),
  onPublicIndexDownloadComplete: callback =>
    preloadIpc.subscribe("public-index-download-complete", callback, {
      selectArgs: () => [],
    }),
  onPublicIndexDownloadError: callback =>
    preloadIpc.subscribe("public-index-download-error", callback, {
      selectArgs: args => [args[0]],
    }),
  onPublicIndexDownloadProgress: callback =>
    preloadIpc.subscribe("public-index-download-progress", callback, {
      selectArgs: args => [args[0]],
    }),
  offPublicIndexDownloadStarted: () =>
    preloadIpc.removeAllListeners("public-index-download-started"),
  offPublicIndexDownloadComplete: () =>
    preloadIpc.removeAllListeners("public-index-download-complete"),
  offPublicIndexDownloadError: () =>
    preloadIpc.removeAllListeners("public-index-download-error"),
  offPublicIndexDownloadProgress: () =>
    preloadIpc.removeAllListeners("public-index-download-progress"),

  //===========================================================================
  // GAME MANAGEMENT
  //===========================================================================
  getGames: () => ipcRenderer.invoke("get-games"),
  getCustomGames: () => ipcRenderer.invoke("get-custom-games"),
  getInstalledGames: () => ipcRenderer.invoke("get-installed-games"),
  getInstalledGamesSize: () => ipcRenderer.invoke("get-installed-games-size"),
  addGame: (game, online, dlc, version, executable, imageUrl) =>
    ipcRenderer.invoke(
      "save-custom-game",
      game,
      online,
      dlc,
      version,
      executable,
      imageUrl
    ),
  removeCustomGame: game => ipcRenderer.invoke("remove-game", game),
  deleteGame: game => ipcRenderer.invoke("delete-game", game),
  saveDeletedGameData: game => ipcRenderer.invoke("save-deleted-game-data", game),
  restoreDeletedGameData: game => ipcRenderer.invoke("restore-deleted-game-data", game),
  discardDeletedGameData: game => ipcRenderer.invoke("discard-deleted-game-data", game),
  deleteGameDirectory: game => ipcRenderer.invoke("delete-game-directory", game),
  verifyGame: game => ipcRenderer.invoke("verify-game", game),
  importSteamGames: directory => ipcRenderer.invoke("import-steam-games", directory),

  // Game Cover/Image
  updateGameCover: (gameName, imgID, imageData) =>
    ipcRenderer.invoke("update-game-cover", gameName, imgID, imageData),
  getGameImage: (game, type) => ipcRenderer.invoke("get-game-image", game, type),
  repairGameImage: game => ipcRenderer.invoke("repair-game-image", game),
  getLocalImageUrl: imagePath => ipcRenderer.invoke("get-local-image-url", imagePath),
  saveGameAsset: (gameName, filename, dataUrl) =>
    ipcRenderer.invoke("save-game-asset", gameName, filename, dataUrl),

  // Game Rating & Backups
  gameRated: (game, isCustom) => ipcRenderer.invoke("game-rated", game, isCustom),
  enableGameAutoBackups: (game, isCustom) =>
    ipcRenderer.invoke("enable-game-auto-backups", game, isCustom),
  disableGameAutoBackups: (game, isCustom) =>
    ipcRenderer.invoke("disable-game-auto-backups", game, isCustom),
  isGameAutoBackupsEnabled: (game, isCustom) =>
    ipcRenderer.invoke("is-game-auto-backups-enabled", game, isCustom),
  ludusavi: (action, game, backupName) =>
    ipcRenderer.invoke("ludusavi", action, game, backupName),
  listBackupFiles: dirPath => ipcRenderer.invoke("listBackupFiles", dirPath),
  readBackupFile: filePath => ipcRenderer.invoke("readBackupFile", filePath),
  getTempPath: () => ipcRenderer.invoke("getTempPath"),
  writeFile: (filePath, buffer) => ipcRenderer.invoke("writeFile", filePath, buffer),
  deleteFile: filePath => ipcRenderer.invoke("deleteFile", filePath),

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
  readGameEntry: (game, isCustom) =>
    ipcRenderer.invoke("read-game-entry", game, isCustom),
  writeGameEntry: (game, updatedData, isCustom) =>
    ipcRenderer.invoke("write-game-entry", game, updatedData, isCustom),
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
  runElevatedInstaller: installerPath =>
    ipcRenderer.invoke("run-elevated-installer", installerPath),
  completeManualInstall: game => ipcRenderer.invoke("complete-manual-install", game),
  resumeDownload: game => ipcRenderer.invoke("resume-download", game),
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
  getDownloads: () => ipcRenderer.invoke("get-downloads"),

  // Download Events
  onDownloadProgress: callback =>
    preloadIpc.subscribe("download-progress", callback, {
      selectArgs: args => [args[0]],
    }),
  onDownloadComplete: callback =>
    preloadIpc.subscribe("download-complete", callback, {
      selectArgs: args => [args[0]],
    }),
  onDownloadError: callback =>
    preloadIpc.subscribe("download-error", callback, {
      selectArgs: args => [args[0]],
    }),

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
  onDirectorySizeStatus: callback =>
    preloadIpc.subscribe("directory-size-status", callback, {
      selectArgs: args => [args[0]],
    }),
  getCustomSavePaths: (gameName, isCustomGame) =>
    ipcRenderer.invoke("get-custom-save-paths", gameName, isCustomGame),
  setCustomSavePaths: (gameName, isCustomGame, paths) =>
    ipcRenderer.invoke("set-custom-save-paths", gameName, isCustomGame, paths),
  openFolderDialog: () => ipcRenderer.invoke("open-folder-dialog"),
  getDrives: () => ipcRenderer.invoke("get-drives"),
  listDirectory: dirPath => ipcRenderer.invoke("list-directory", dirPath),

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
  onInstallProgress: callback =>
    preloadIpc.subscribe("install-progress", callback, {
      selectArgs: args => [args[0]],
    }),
  checkGameDependencies: () => ipcRenderer.invoke("check-game-dependencies"),
  openReqPath: game => ipcRenderer.invoke("required-libraries", game),
  folderExclusion: boolean => ipcRenderer.invoke("folder-exclusion", boolean),
  isWatchdogRunning: () => ipcRenderer.invoke("is-watchdog-running"),

  //===========================================================================
  // UPDATES
  //===========================================================================
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  downloadUpdate: () => ipcRenderer.invoke("download-update"),
  updateAscendara: () => ipcRenderer.invoke("update-ascendara"),
  isUpdateDownloaded: () => ipcRenderer.invoke("is-update-downloaded"),
  isBrokenVersion: () => ipcRenderer.invoke("is-broken-version"),
  deleteInstaller: () => ipcRenderer.invoke("delete-installer"),
  uninstallAscendara: () => ipcRenderer.invoke("uninstall-ascendara"),
  switchBranch: branch => ipcRenderer.invoke("switch-branch", branch),
  onUpdateAvailable: callback =>
    preloadIpc.subscribe("update-available", callback, {
      includeEventPlaceholder: true,
    }),
  onUpdateReady: callback =>
    preloadIpc.subscribe("update-ready", callback, {
      includeEventPlaceholder: true,
    }),
  onUpdateDownloadProgress: callback =>
    preloadIpc.subscribe("update-download-progress", callback, {
      selectArgs: args => [args[0]],
    }),
  removeUpdateAvailableListener: callback =>
    preloadIpc.unsubscribe("update-available", callback),
  removeUpdateReadyListener: callback =>
    preloadIpc.unsubscribe("update-ready", callback),
  onBranchSwitchProgress: callback =>
    preloadIpc.subscribe("branch-switch-progress", callback, {
      selectArgs: args => [args[0]],
    }),
  removeBranchSwitchProgressListener: callback =>
    preloadIpc.unsubscribe("branch-switch-progress", callback),

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
  isOnLinux: () => ipcRenderer.invoke("is-on-linux"),
  fetchSystemSpecs: () => ipcRenderer.invoke("fetch-system-specs"),
  isDev: () => ipcRenderer.invoke("is-dev"),
  isExperiment: () => ipcRenderer.invoke("is-experiment"),
  getTestingVersion: () => ipcRenderer.invoke("get-testing-version"),
  switchBuild: buildType => ipcRenderer.invoke("switch-build", buildType),
  getBranch: () => ipcRenderer.invoke("get-branch"),
  showTestNotification: () => ipcRenderer.invoke("show-test-notification"),

  //===========================================================================
  // API & NETWORKING
  //===========================================================================
  getAPIKey: () => ipcRenderer.invoke("get-api-key"), // Deprecated
  getAuthHeaders: () => ipcRenderer.invoke("get-auth-headers"), // Use this instead
  getAnalyticsKey: () => ipcRenderer.invoke("get-analytics-key"),
  getImageKey: () => ipcRenderer.invoke("get-image-key"),
  openURL: (url, options) => ipcRenderer.invoke("open-url", url, options),
  onExternalWindowBlocked: callback =>
    preloadIpc.subscribe("external-window-blocked", callback, {
      selectArgs: args => [args[0]],
    }),
  fetchApiImage: (endpoint, imgID, timestamp, signature) =>
    ipcRenderer.invoke("fetch-api-image", endpoint, imgID, timestamp, signature),
  getSteamGridUrls: gameName => ipcRenderer.invoke("steamgrid-get-urls", gameName),
  getSteamGridHeader: gameName => ipcRenderer.invoke("steamgrid-get-header", gameName),

  // Service status checks use the restricted request handler.
  requestAscendaraService: (url, options) =>
    ipcRenderer.invoke("request-ascendara-service", url, options),

  // External Sources keep the same HTTPS URL support as the existing source flow.
  fetchCustomSource: url => ipcRenderer.invoke("fetch-custom-source", url),

  // Older callers still use request(), so keep it as an alias for the shared dispatcher.
  request: (url, options) =>
    ipcRenderer.invoke("request-ascendara-service", url, options),

  //===========================================================================
  // SUPPORT & PROFILE
  //===========================================================================
  uploadSupportLogs: (sessionToken, appToken) =>
    ipcRenderer.invoke("upload-support-logs", sessionToken, appToken),
  uploadProfileImage: imageBase64 =>
    ipcRenderer.invoke("upload-profile-image", imageBase64),
  getProfileImage: () => ipcRenderer.invoke("get-profile-image"),

  //===========================================================================
  // QR CODE GENERATION
  //===========================================================================
  generateWebappQRCode: code => ipcRenderer.invoke("generate-webapp-qrcode", { code }),
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
