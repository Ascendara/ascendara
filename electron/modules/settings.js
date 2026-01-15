/**
 * Settings Manager Module
 * Handles application settings persistence and retrieval
 */

const fs = require("fs-extra");
const path = require("path");
const { app, ipcMain } = require("electron");
const { encrypt, decrypt } = require("./encryption");

class SettingsManager {
  constructor() {
    this.filePath = path.join(app.getPath("userData"), "ascendarasettings.json");
    this.sensitiveKeys = ["twitchSecret", "twitchClientId", "torboxApiKey"];
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
      rpcEnabled: true,
      gameSource: "steamrip",
      autoCreateShortcuts: true,
      smoothTransitions: true,
      sendAnalytics: true,
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
      localIndex: "",
      blacklistIDs: ["ABSXUc", "AWBgqf", "ATaHuq"],
      usingLocalIndex: false,
      shareLocalIndex: true,
      fetchPageCount: 50,
      localRefreshWorkers: 8,
      homeSearch: true,
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
    };
    this.initializeSettingsFile();
    this.settings = this.loadSettings();
    this.migrateToEncryption();
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

  /**
   * Migrate existing plaintext keys to encrypted format
   */
  migrateToEncryption() {
    let needsSave = false;

    for (const key of this.sensitiveKeys) {
      if (this.settings[key] && !this.settings[key].includes(":")) {
        // Key exists and is not encrypted yet
        this.settings[key] = encrypt(this.settings[key]);
        needsSave = true;
      }
    }

    if (needsSave) {
      this.saveSettings(this.settings);
      console.log("Migrated sensitive settings to encrypted format");
    }
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
      // Only return the merged settings without writing to disk
      return mergedSettings;
    } catch (error) {
      console.error("Error loading settings:", error);
      return { ...this.defaultSettings };
    }
  }

  saveSettings(settings) {
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

      // Ensure sensitive keys are encrypted before saving
      for (const key of this.sensitiveKeys) {
        if (mergedSettings[key] && !mergedSettings[key].includes(":")) {
          mergedSettings[key] = encrypt(mergedSettings[key]);
        }
      }

      fs.writeFileSync(this.filePath, JSON.stringify(mergedSettings, null, 2));
      this.settings = mergedSettings;
      return true;
    } catch (error) {
      console.error("Failed to save settings:", error);
      return false;
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
      const processedValue = this.sensitiveKeys.includes(key) ? encrypt(value) : value;

      const updatedSettings = {
        ...currentSettings,
        [key]: processedValue,
      };

      // Clean up any flat ludusavi properties if we're updating the ludusavi object
      if (key === "ludusavi") {
        this.cleanupFlatLudusaviProperties(updatedSettings);
      }

      const success = this.saveSettings(updatedSettings);
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
    if (this.sensitiveKeys.includes(key) && value && value.includes(":")) {
      return decrypt(value);
    }

    return value;
  }

  getSettings() {
    // Create a copy of settings with decrypted sensitive values
    const decryptedSettings = { ...this.settings };

    for (const key of this.sensitiveKeys) {
      if (decryptedSettings[key] && decryptedSettings[key].includes(":")) {
        decryptedSettings[key] = decrypt(decryptedSettings[key]);
      }
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
 * Register settings-related IPC handlers
 */
function registerSettingsHandlers() {
  const manager = getSettingsManager();

  // Save individual setting
  ipcMain.handle("update-setting", async (event, key, value) => {
    const success = manager.updateSetting(key, value);
    if (success) {
      // Notify renderer about the change
      event.sender.send("settings-changed", manager.getSettings());
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
      event.sender.send("settings-changed", sanitizedOptions);
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
};
