/**
 * Settings Manager Module
 * Handles application settings persistence and retrieval
 */

const fs = require("fs-extra");
const path = require("path");
const { app, ipcMain, safeStorage } = require("electron");
const { encrypt, decrypt } = require("./encryption");
const {
  OWNER_ONLY,
  SECRET_KINDS,
  classifySecret,
  createSecretStore,
  writeFileAtomic,
} = require("./secret-store");

// The copy made before secrets moved to safeStorage holds every old value, so it only
// stays as long as it is useful for recovering from a failed move.
const PRE_MIGRATION_BACKUP_KEEP_MS = 7 * 24 * 60 * 60 * 1000;

class SettingsManager {
  constructor() {
    this.filePath = path.join(app.getPath("userData"), "ascendarasettings.json");
    this.preMigrationBackupPath = `${this.filePath}.pre-safestorage.bak`;
    this.sensitiveKeys = [
      "twitchSecret",
      "twitchClientId",
      "torboxApiKey",
      "realDebridApiKey",
    ];
    this.secrets = createSecretStore({
      safeStorage,
      isAppReady: () => app.isReady?.(),
      legacy: { encrypt, decrypt },
    });
    this.defaultSettings = {
      downloadDirectory: "",
      additionalDirectories: [],
      watchingFolders: [],
      defaultOpenPage: "home",
      behaviorAfterDownload: "none",
      showOldDownloadLinks: false,
      seeInappropriateContent: false,
      hideOnGameLaunch: true,
      earlyReleasePreview: false,
      viewWorkshopPage: false,
      notifications: true,
      downloadHandler: false,
      torrentEnabled: false,
      torrentHost: "localhost",
      torrentPort: 8080,
      torrentUsername: "admin",
      torrentPassword: "adminadmin",
      useTorboxForTorrents: true,
      fallbackToQbittorrentOnTorboxFailure: false,
      rpcEnabled: true,
      gameSource: "steamrip",
      autoCreateShortcuts: true,
      smoothTransitions: true,
      bigPictureHomeStyle: "ascendara",
      windowControlsStyle: "icons",
      menuBarSide: "left",
      autoUpdate: true,
      endOnClose: false,
      language: "en",
      theme: "purple",
      customTheme: [],
      threadCount: 12,
      singleStream: true,
      downloadLimit: 0,
      sideScrollBar: false,
      excludeFolders: false,
      prioritizeTorboxOverSeamless: false,
      crackDirectory: "",
      twitchSecret: "",
      twitchClientId: "",
      torboxApiKey: "",
      realDebridApiKey: "",
      debridEnabled: false,
      debridProvider: "torbox",
      debridProviderOrder: [],
      debridProviderEnabled: {},
      prioritizeRealDebridOverSeamless: false,
      useRealDebridForTorrents: true,
      localIndex: "",
      blacklistIDs: ["ABSXUc", "AWBgqf", "ATaHuq"],
      usingLocalIndex: false,
      shareLocalIndex: true,
      fetchPageCount: 50,
      localRefreshWorkers: 8,
      homeSearch: true,
      backgroundIndexSync: true,
      autoRefreshEnabled: false,
      autoRefreshInterval: "7",
      autoRefreshMethod: "shared",
      bigPictureKeyboardLayout: "qwerty",
      controllerType: "xbox",
      ludusavi: {
        backupLocation: "",
        backupFormat: "zip",
        enabled: false,
        backupOptions: {
          backupsToKeep: 5,
          skipManifestCheck: false,
          compressionLevel: "default",
        },
      },
      wine: {
        wineBin: "wine",
        winePrefix: "",
      },
      proton: {
        enabled: false,
        protonBin: "",
        steamCompatDataPath: "",
      },
      // macOS: "auto" | "highball" | "wine"
      macRunner: "auto",
      highballRenderer: "auto",
      highballBottleMode: "shared",
      highballD3DMetalAccepted: false,
      // Checked by ascendara://play links from macOS game shortcuts
      shortcutLaunchToken: "",
      promptPurchaseAfter3Hours: true,
      openOnStartup: false,
      startMinimized: false,
      // Custom Sources Mode (Hydra Library) + user-imported custom lists
      customSourcesMode: false,
      customSource: null,
      customSourcesLibrary: [],
      customLists: [],
      activeCustomList: null,
      extraGameOptions: false,
    };
    this.initializeSettingsFile();
    this.settings = this.loadSettings();
    // Secrets move to safeStorage in migrateSecretStorage, which needs app ready.
  }

  /** Names of the sensitive settings present in an object. */
  sensitiveKeysIn(settings) {
    return this.sensitiveKeys.filter(key => key in settings);
  }

  /**
   * Initialize settings file with defaults if it doesn't exist
   */
  initializeSettingsFile() {
    try {
      if (!fs.existsSync(this.filePath)) {
        console.log("Settings file not found, creating with default values");
        fs.writeFileSync(this.filePath, JSON.stringify(this.defaultSettings, null, 2));
        console.log("Settings file created successfully at:", this.filePath);
      }
    } catch (error) {
      console.error("Failed to initialize settings file:", error);
    }
  }

  /** Files written by an earlier version can still be readable by other users. */
  restrictSavedFiles() {
    for (const file of [
      this.filePath,
      this.preMigrationBackupPath,
      ...this.recoveryPointFiles(),
    ]) {
      try {
        fs.chmodSync(file, OWNER_ONLY);
      } catch {
        // Not there yet, or a file system without modes.
      }
    }
  }

  /**
   * Bring saved secrets to the best format available. Runs at app ready, once per
   * launch. A value that can not be read stays exactly as it is and counts as no
   * key, so the next launch tries again. The pre-migration file is kept next to
   * the settings file until retirePreMigrationBackup removes it, and the settings
   * file is replaced in one step.
   * @returns {boolean} Whether the file was rewritten
   */
  migrateSecretStorage() {
    if (!app.isReady?.()) return false;
    this.restrictSavedFiles();
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
    } catch (error) {
      console.error("Secret migration skipped, settings unreadable:", error?.message);
      return false;
    }

    const target = this.secrets.targetKind();
    const changes = {};
    let unreadable = 0;
    for (const key of this.sensitiveKeysIn(raw)) {
      const kind = classifySecret(raw[key]);
      const opened = this.secrets.open(raw[key]);
      if (!opened.ok) unreadable += 1;
      if (!opened.ok || kind === SECRET_KINDS.EMPTY || kind === target) continue;
      const sealed = this.secrets.seal(opened.value);
      if (sealed.ok) changes[key] = sealed.value;
    }
    if (unreadable > 0) console.error(`${unreadable} saved secrets could not be read`);
    if (Object.keys(changes).length === 0) return false;

    try {
      if (!fs.existsSync(this.preMigrationBackupPath)) {
        // Holds the old values, so never with the settings file's wider mode. A new
        // file also means its age counts from now.
        writeFileAtomic(
          this.preMigrationBackupPath,
          fs.readFileSync(this.filePath, "utf8"),
          {
            durable: true,
          }
        );
      }
      writeFileAtomic(this.filePath, JSON.stringify({ ...raw, ...changes }, null, 2), {
        durable: true,
      });
    } catch (error) {
      console.error("Secret migration not written:", error?.message);
      return false;
    }
    this.settings = { ...this.settings, ...changes };
    const where = target === SECRET_KINDS.SAFE ? "OS-backed" : "machine-key";
    console.log(`Moved ${Object.keys(changes).length} saved secrets to ${where} storage`);
    return true;
  }

  /**
   * Remove the pre-migration copy once it is old enough, or right away with `force`.
   * Never while any saved secret fails to open or the settings file can not be read:
   * that copy may be the only way back.
   * @returns {boolean} Whether it was removed
   */
  retirePreMigrationBackup({ force = false, now = Date.now() } = {}) {
    try {
      if (!fs.existsSync(this.preMigrationBackupPath)) return false;
      const raw = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      if (this.sensitiveKeysIn(raw).some(key => !this.secrets.open(raw[key]).ok))
        return false;
      const age = now - fs.statSync(this.preMigrationBackupPath).mtimeMs;
      if (!force && age < PRE_MIGRATION_BACKUP_KEEP_MS) return false;
      fs.rmSync(this.preMigrationBackupPath, { force: true });
      return true;
    } catch (error) {
      console.error("Could not retire the settings backup:", error?.message);
      return false;
    }
  }

  /**
   * A removed or replaced secret must not live on in the old copy. When the copy has to
   * stay for a secret that does not open, only those values leave it. Its date stays,
   * so the 7 days still count from the move.
   */
  dropFromPreMigrationBackup(keys) {
    if (this.retirePreMigrationBackup({ force: true })) return;
    try {
      if (!fs.existsSync(this.preMigrationBackupPath)) return;
      const { mtime } = fs.statSync(this.preMigrationBackupPath);
      const backup = JSON.parse(fs.readFileSync(this.preMigrationBackupPath, "utf8"));
      for (const key of keys) delete backup[key];
      writeFileAtomic(this.preMigrationBackupPath, JSON.stringify(backup, null, 2), {
        durable: true,
      });
      fs.utimesSync(this.preMigrationBackupPath, mtime, mtime);
    } catch (error) {
      console.error("Could not clean the settings backup:", error?.message);
    }
  }

  recoveryPointFiles() {
    const directory = path.join(path.dirname(this.filePath), "recovery-points");
    try {
      return fs
        .readdirSync(directory)
        .filter(name => name.endsWith(".json"))
        .map(name => path.join(directory, name));
    } catch {
      return []; // None made yet.
    }
  }

  /**
   * The same for settings recovery points. A restore merges over the current
   * settings, so a point without a secret leaves the current one as it is, and a removed
   * key can not come back from one.
   */
  dropFromRecoveryPoints(keys) {
    for (const file of this.recoveryPointFiles()) {
      try {
        const point = JSON.parse(fs.readFileSync(file, "utf8"));
        if (!keys.some(key => key in (point?.settings ?? {}))) continue;
        for (const key of keys) delete point.settings[key];
        writeFileAtomic(file, JSON.stringify(point, null, 2), { durable: true });
      } catch (error) {
        console.error("Could not clean a settings recovery point:", error?.message);
      }
    }
  }

  /** Whether a stored secret now says something else, or nothing. */
  secretChanged(stored, value) {
    if (!stored) return false;
    const before = this.secrets.open(stored);
    if (!before.ok) return value !== stored;
    const after = this.secrets.open(value);
    return !after.ok || after.value !== before.value;
  }

  /** The secret behind a stored value, or "" when it can not be read. */
  readSecret(stored) {
    const opened = this.secrets.open(stored);
    return opened.ok ? opened.value : "";
  }

  loadSettings() {
    try {
      let settings = {};
      if (fs.existsSync(this.filePath)) {
        settings = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      }
      // Ensure all default settings exist, but preserve arrays like customTheme
      const mergedSettings = { ...this.defaultSettings };
      for (const [key, value] of Object.entries(settings)) {
        if (key in this.defaultSettings) {
          // For arrays, only use default if the saved value doesn't exist
          // Don't replace a populated array with an empty default
          if (Array.isArray(this.defaultSettings[key]) && Array.isArray(value)) {
            mergedSettings[key] = value;
          } else {
            mergedSettings[key] = value;
          }
        }
      }
      // Keep TorBox working for users who configured it before the debrid toggle existed
      if (!("debridEnabled" in settings) && settings.torboxApiKey) {
        mergedSettings.debridEnabled = true;
      }
      // Only return the merged settings without writing to disk
      return mergedSettings;
    } catch (error) {
      console.error("Error loading settings:", error);
      return { ...this.defaultSettings };
    }
  }

  /**
   * Merge into the settings file. A failure to protect a secret keeps the old
   * stored value, never plain text, and makes this return false.
   * @param {Object} settings - Changes. Secrets may be plain or already in a stored form.
   * @param {Object} [options]
   * @param {string[]} [options.clears] - Secrets the caller really means to empty.
   *   Without this an empty value never erases one that could not be read: a
   *   settings snapshot shows those as empty.
   */
  saveSettings(settings, { clears = [] } = {}) {
    try {
      // Read existing settings directly from file to avoid loadSettings() side effects
      let existingSettings = {};
      if (fs.existsSync(this.filePath)) {
        existingSettings = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      }

      const mergedSettings = {
        ...existingSettings,
        ...settings,
      };

      let protectedAll = true;
      for (const key of this.sensitiveKeysIn(mergedSettings)) {
        const stored = existingSettings[key];
        const value = mergedSettings[key];
        const kind = classifySecret(value);
        if (value === stored) continue;
        if (kind === SECRET_KINDS.EMPTY) {
          if (stored && !clears.includes(key) && !this.secrets.open(stored).ok) {
            mergedSettings[key] = stored;
          }
          continue;
        }
        if (kind !== SECRET_KINDS.PLAIN) continue;

        const current = this.secrets.open(stored);
        if (stored && current.ok && current.value === value) {
          mergedSettings[key] = stored;
          continue;
        }
        const sealed = this.secrets.seal(value);
        if (sealed.ok) {
          mergedSettings[key] = sealed.value;
        } else {
          if (stored === undefined) delete mergedSettings[key];
          else mergedSettings[key] = stored;
          protectedAll = false;
        }
      }

      const changedSecrets = this.sensitiveKeysIn(existingSettings).filter(key =>
        this.secretChanged(existingSettings[key], mergedSettings[key])
      );

      // Other settings can be written again. A lost key may mean finding it again.
      this.writeSettingsFile(mergedSettings, {
        durable: this.sensitiveKeysIn(mergedSettings).some(
          key => mergedSettings[key] !== existingSettings[key]
        ),
      });
      this.settings = mergedSettings;
      if (changedSecrets.length > 0) {
        this.secrets.forget();
        this.dropFromPreMigrationBackup(changedSecrets);
        this.dropFromRecoveryPoints(changedSecrets);
      }
      return protectedAll;
    } catch (error) {
      console.error("Failed to save settings:", error);
      return false;
    }
  }

  /** Write in one step. Falls back to a direct write if the OS refuses the rename. */
  writeSettingsFile(settings, options) {
    const text = JSON.stringify(settings, null, 2);
    try {
      writeFileAtomic(this.filePath, text, options);
    } catch {
      fs.writeFileSync(this.filePath, text);
    }
  }

  updateSetting(key, value) {
    try {
      // Read current settings directly from file to avoid loadSettings() side effects
      let currentSettings = {};
      if (fs.existsSync(this.filePath)) {
        currentSettings = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      }

      // Encrypt value if it's a sensitive key
      let processedValue = value;
      if (this.sensitiveKeys.includes(key)) {
        const sealed = value ? this.secrets.seal(value) : { ok: true, value: "" };
        if (!sealed.ok) return false;
        processedValue = sealed.value;
      }

      const updatedSettings = {
        ...currentSettings,
        [key]: processedValue,
      };

      // Clean up any flat ludusavi properties if we're updating the ludusavi object
      if (key === "ludusavi") {
        this.cleanupFlatLudusaviProperties(updatedSettings);
      }

      const success = this.saveSettings(updatedSettings, { clears: [key] });
      if (success) {
        ipcMain.emit("settings-updated", updatedSettings);
      }
      return success;
    } catch (error) {
      console.error("Failed to update setting:", error);
      return false;
    }
  }

  getSetting(key) {
    const value = this.settings[key];

    // Decrypt value if it's a sensitive key
    return this.sensitiveKeys.includes(key) && value ? this.readSecret(value) : value;
  }

  getSettings() {
    // Create a copy of settings with decrypted sensitive values
    const decryptedSettings = { ...this.settings };

    for (const key of this.sensitiveKeysIn(decryptedSettings)) {
      if (decryptedSettings[key])
        decryptedSettings[key] = this.readSecret(decryptedSettings[key]);
    }

    return decryptedSettings;
  }

  /**
   * Clean up any flat ludusavi properties (e.g., ludusavi.backupLocation)
   */
  cleanupFlatLudusaviProperties(settings) {
    const keysToRemove = [];
    for (const key in settings) {
      if (key.startsWith("ludusavi.")) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(key => {
      delete settings[key];
    });

    return settings;
  }
}

// Create singleton instance
let settingsManager = null;

function getSettingsManager() {
  if (!settingsManager) {
    settingsManager = new SettingsManager();
  }
  return settingsManager;
}

/**
 * Sync the OS login item (auto-launch) settings with the app's saved settings.
 * Uses a `--hidden` launch argument (checked in window.js at startup) since
 * `openAsHidden`/`wasOpenedAtLogin` are unreliable or unsupported on Windows.
 */
function applyLoginItemSettings() {
  const manager = getSettingsManager();
  const currentSettings = manager.getSettings();
  const openAtLogin = !!currentSettings.openOnStartup;
  const openAsHidden = openAtLogin && !!currentSettings.startMinimized;

  app.setLoginItemSettings({
    openAtLogin,
    openAsHidden,
    args: openAsHidden ? ["--hidden"] : [],
  });
}

/**
 * Register settings-related IPC handlers
 */
function registerSettingsHandlers() {
  const manager = getSettingsManager();

  // Save individual setting
  ipcMain.handle("update-setting", async (event, key, value) => {
    const success = manager.updateSetting(key, value);
    if (success) {
      // Notify renderer about the change
      event.sender.send("settings-updated", manager.getSettings());
      // Handle Discord RPC toggle immediately
      if (key === "rpcEnabled") {
        const { initializeDiscordRPC, destroyDiscordRPC } = require("../app/discord-rpc");

        if (value) {
          initializeDiscordRPC();
        } else {
          destroyDiscordRPC();
        }
      }
      // Handle startup toggle immediately
      if (key === "openOnStartup" || key === "startMinimized") {
        applyLoginItemSettings();
      }
    }
    return success;
  });

  // Get individual setting
  ipcMain.handle("get-setting", async (_, key) => {
    return manager.getSetting(key);
  });

  // Get all settings
  ipcMain.handle("get-settings", () => {
    return manager.getSettings();
  });

  // Save settings JSON file
  ipcMain.handle("save-settings", async (event, options, directory) => {
    // Get current settings to preserve existing values
    const currentSettings = manager.getSettings();

    // Ensure all settings values are properly typed
    const sanitizedOptions = {
      ...currentSettings,
      ...options,
    };

    // Bulk saves may contain an uninitialized renderer default. Clearing the
    // index path must be explicit via update-setting, not a stale snapshot.
    if (!options.localIndex && currentSettings.localIndex) {
      sanitizedOptions.localIndex = currentSettings.localIndex;
    }

    // Handle downloadDirectory separately to ensure it's not lost
    if (directory) {
      sanitizedOptions.downloadDirectory = directory;
    } else if (options.downloadDirectory) {
      sanitizedOptions.downloadDirectory = options.downloadDirectory;
    }

    // Ensure language is properly typed
    if (options.language) {
      sanitizedOptions.language = String(options.language);
    }

    const success = manager.saveSettings(sanitizedOptions);
    if (success) {
      event.sender.send("settings-updated", sanitizedOptions);
    }
    return success;
  });

  // Get download directory
  ipcMain.handle("get-download-directory", () => {
    return manager.getSetting("downloadDirectory");
  });
}

module.exports = {
  SettingsManager,
  getSettingsManager,
  registerSettingsHandlers,
  applyLoginItemSettings,
};
