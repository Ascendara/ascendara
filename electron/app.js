/**
 *       =====================================
 *                    Ascendara
 *    The best way to test games before you buy them.
 *       =====================================
 *
 * This is the main process file for Ascendara, built with Electron.
 * It handles core functionality including:
 *
 * - Application lifecycle management
 * - Game installation and launching
 * - Discord Rich Presence integration
 * - Auto-updates and version management
 * - IPC (Inter-Process Communication) between main and renderer processes
 * - File system operations and game directory management
 * - Error handling and crash reporting
 * - Protocol handling for custom URL schemes
 *
 *  Start development by first setting the isDev variable to true, then run `yarn start`.
 *  Build the app from source to an executable by setting isDev to false and running `yarn dist`.
 *  Note: This will run the build_ascendara.py script to build the the index files, then build the app.
 *
 *  Learn more about developing Ascendara at https://ascendara.app/docs/developer/overview
 *
 **/

let isDev = false;
let appVersion = "8.3.5";

const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  protocol,
  screen,
  Notification,
} = require("electron");
const { Client } = require("discord-rpc");
const disk = require("diskusage");
const path = require("path");
const axios = require("axios");
const unzipper = require("unzipper");
const fs = require("fs-extra");
const os = require("os");
const ip = require("ip");
const crypto = require("crypto");
const { machineIdSync } = require("node-machine-id");
const { spawn, execSync } = require("child_process");
require("dotenv").config();

let has_launched = false;
let isLatest = true;
let updateDownloaded = false;
let notificationShown = false;
let updateDownloadInProgress = false;
let experiment = false;
let installedTools = [];
let isBrokenVersion = false;
let isWindows = os.platform().startsWith("win");
let rpc;
let config;
let electronDl;

const TIMESTAMP_FILE = !isWindows
  ? path.join(os.homedir(), "timestamp.ascendara.json")
  : path.join(process.env.USERPROFILE, "timestamp.ascendara.json");

const LANG_DIR = !isWindows
  ? path.join(app.getPath("userData"), "Ascendara", "languages")
  : path.join(os.homedir(), ".ascendara", "languages");

try {
  config = require("./config.prod.js");
} catch (e) {
  config = {};
}
const APIKEY = process.env.AUTHORIZATION || config.AUTHORIZATION;
const analyticsAPI = process.env.ASCENDARA_API_KEY || config.ASCENDARA_API_KEY;
const imageKey = process.env.IMAGE_KEY || config.IMAGE_KEY;
const clientId = process.env.DISCKEY || config.DISCKEY;

// Initialize Discord RPC
rpc = new Client({ transport: "ipc" });

rpc.on("ready", () => {
  rpc.setActivity({
    state: "Browsing Menus...",
    largeImageKey: "ascendara",
    largeImageText: "Ascendara",
  });

  console.log("Discord RPC is ready");
});

rpc.login({ clientId }).catch(console.error);

// Handle app ready event
app.whenReady().then(() => {
  if (isDev) {
    printDevModeIntro(appVersion, process.env.NODE_ENV || "development", isDev);
  }
  createWindow();
  axios
    .get("https://api.ascendara.app/app/brokenversions")
    .then(response => {
      const brokenVersions = response.data;
      isBrokenVersion = brokenVersions.includes(appVersion);
      console.log(
        `Current version ${appVersion} is ${isBrokenVersion ? "broken" : "not broken"}`
      );
    })
    .catch(error => {
      console.error("Error checking for broken versions:", error);
    });

  // Check for protocol URL in argv
  const protocolUrl = process.argv.find(arg => {
    console.log("Checking arg:", arg);
    return arg.startsWith("ascendara://");
  });

  if (protocolUrl) {
    console.log("Found protocol URL in argv:", protocolUrl);
    handleProtocolUrl(protocolUrl);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

const toolExecutables = {
  torrent: "AscendaraTorrentHandler.exe",
  translator: "AscendaraLanguageTranslation.exe",
  ludusavi: "ludusavi.exe",
};

function checkInstalledTools() {
  try {
    if (isDev) {
      return;
    }
    const appDirectory = path.join(path.dirname(app.getPath("exe")));
    const toolsDirectory = path.join(appDirectory, "resources");

    if (fs.existsSync(TIMESTAMP_FILE)) {
      const timestampData = JSON.parse(fs.readFileSync(TIMESTAMP_FILE, "utf8"));
      installedTools = timestampData.installedTools || [];
      console.log("Installed tools:", installedTools);

      const missingTools = installedTools.filter(
        tool => !fs.existsSync(path.join(toolsDirectory, toolExecutables[tool]))
      );

      if (missingTools.length > 0) {
        console.log("Missing tools:", missingTools);
        missingTools.forEach(tool => {
          console.log(`Redownloading ${tool}...`);
          installTool(tool);
        });
      }
    } else {
      console.log("Timestamp file not found. No installed tools recorded.");
    }
  } catch (error) {
    console.error("Error checking installed tools:", error);
  }
}

checkInstalledTools();

ipcMain.handle("get-installed-tools", async event => {
  if (isWindows && !isDev) {
    return installedTools;
  } else {
    return ["translator", "torrent", "ludusavi"];
  }
});

async function installTool(tool) {
  console.log(`Installing ${tool}`);
  const appDirectory = path.join(path.dirname(app.getPath("exe")));
  const toolUrls = {
    torrent: "https://cdn.ascendara.app/files/AscendaraTorrentHandler.exe",
    translator: "https://cdn.ascendara.app/files/AscendaraLanguageTranslation.exe",
    ludusavi: "https://cdn.ascendara.app/files/ludusavi.exe",
  };

  const toolExecutable = toolExecutables[tool];
  const toolPath = path.join(appDirectory, "resources", toolExecutable);
  try {
    const response = await axios({
      method: "get",
      url: toolUrls[tool],
      responseType: "stream",
    });

    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(toolPath);
      response.data.pipe(writer);
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    console.log(`${tool} downloaded successfully`);
    return { success: true, message: `${tool} installed successfully` };
  } catch (error) {
    console.error(`Error installing ${tool}:`, error);
    return { success: false, message: `Failed to install ${tool}: ${error.message}` };
  }
}

ipcMain.handle("install-tool", async (event, tool) => {
  console.log(`Installing ${tool}`);
  const appDirectory = path.join(path.dirname(app.getPath("exe")));
  const toolUrls = {
    torrent: "https://cdn.ascendara.app/files/AscendaraTorrentHandler.exe",
    translator: "https://cdn.ascendara.app/files/AscendaraLanguageTranslation.exe",
    ludusavi: "https://cdn.ascendara.app/files/ludusavi.exe",
  };

  const toolExecutable = toolExecutables[tool];
  const toolPath = path.join(appDirectory, "resources", toolExecutable);

  try {
    await electronDl.download(BrowserWindow.getFocusedWindow(), toolUrls[tool], {
      directory: path.dirname(toolPath),
      filename: toolExecutable,
      onProgress: progress => {
        console.log(`Downloading ${tool}: ${Math.round(progress.percent * 100)}%`);
      },
    });

    console.log(`${tool} downloaded successfully`);

    // Update installed tools list
    installedTools.push(tool);

    // Read existing timestamp data
    let existingData = {};
    try {
      if (fs.existsSync(TIMESTAMP_FILE)) {
        existingData = JSON.parse(fs.readFileSync(TIMESTAMP_FILE, "utf8"));
      }
    } catch (error) {
      console.error("Error reading timestamp file:", error);
    }

    // Merge new data with existing data
    const timestampData = {
      ...existingData,
      installedTools,
    };

    fs.writeFileSync(TIMESTAMP_FILE, JSON.stringify(timestampData), "utf8");

    return { success: true, message: `${tool} installed successfully` };
  } catch (error) {
    console.error(`Error installing ${tool}:`, error);
    return { success: false, message: `Failed to install ${tool}: ${error.message}` };
  }
});

// Check if steamCMD is installed from timestamp file
ipcMain.handle("is-steamcmd-installed", async () => {
  try {
    if (!fs.existsSync(TIMESTAMP_FILE)) {
      return false;
    }
    const timestampData = await fs.promises.readFile(TIMESTAMP_FILE, "utf8");
    const data = JSON.parse(timestampData);
    return data.steamCMD === true;
  } catch (error) {
    console.error("Error checking steamCMD installation:", error);
    return false;
  }
});

ipcMain.handle("timestamp-time", async () => {
  try {
    if (!fs.existsSync(TIMESTAMP_FILE)) return "No timestamp available";
    const data = JSON.parse(await fs.promises.readFile(TIMESTAMP_FILE, "utf8"));
    if (!data.timestamp) return "No timestamp recorded";
    return new Date(data.timestamp).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (error) {
    console.error("Error reading timestamp file:", error);
    return "Error retrieving timestamp";
  }
});

// Install steamcmd.exe from Ascendara CDN and store it in the ascendaraSteamcmd directory
ipcMain.handle("install-steamcmd", async () => {
  try {
    const steamCMDUrl = "https://cdn.ascendara.app/files/steamcmd.exe";
    const steamCMDDir = path.join(os.homedir(), "ascendaraSteamcmd");

    // Ensure the directory exists
    await fs.promises.mkdir(steamCMDDir, { recursive: true });

    // Download steamcmd.exe
    await electronDl.download(BrowserWindow.getFocusedWindow(), steamCMDUrl, {
      directory: steamCMDDir,
      filename: "steamcmd.exe",
    });

    // Run steamcmd.exe to create initial files
    const steamCMDPath = path.join(steamCMDDir, "steamcmd.exe");
    await new Promise((resolve, reject) => {
      const steamCmd = spawn(steamCMDPath, ["+quit"]);

      steamCmd.on("error", error => {
        reject(error);
      });

      steamCmd.on("close", code => {
        // Exit code 7 means installation completed successfully
        if (code === 0 || code === 7) {
          resolve();
        } else {
          reject(new Error(`SteamCMD exited with unexpected code ${code}`));
        }
      });
    });

    // Merge new data with existing data
    let existingData = {};
    try {
      if (fs.existsSync(TIMESTAMP_FILE)) {
        existingData = JSON.parse(fs.readFileSync(TIMESTAMP_FILE, "utf8"));
      }
    } catch (error) {
      console.error("Error reading timestamp file:", error);
    }

    const timestampData = {
      ...existingData,
      steamCMD: true,
    };

    fs.writeFileSync(TIMESTAMP_FILE, JSON.stringify(timestampData, null, 2));

    return { success: true, message: "SteamCMD installed and initialized successfully" };
  } catch (error) {
    console.error("Error installing or initializing SteamCMD:", error);
    return {
      success: false,
      message: `Failed to install or initialize SteamCMD: ${error.message}`,
    };
  }
});
// Download item with steamcmd
ipcMain.handle("download-item", async (event, url) => {
  try {
    // Extract the item ID from the URL
    const itemId = url.match(/id=(\d+)/)?.[1];
    if (!itemId) {
      throw new Error("Invalid Steam Workshop URL");
    }

    // Fetch item details from Steam API
    const itemDetails = await fetchWorkshopItemDetails(itemId);
    const appId = itemDetails.consumer_app_id.toString();

    if (!appId) {
      throw new Error("Could not determine app ID for workshop item");
    }
    // Construct the SteamCMD command
    const steamCMDDir = path.join(os.homedir(), "ascendaraSteamcmd");
    const steamCMDPath = path.join(steamCMDDir, "steamcmd.exe");

    return new Promise((resolve, reject) => {
      const steamProcess = spawn(steamCMDPath, [
        "+login",
        "anonymous",
        "+workshop_download_item",
        appId,
        itemId,
        "+quit",
      ]);

      let output = "";
      let errorOutput = "";
      let hasDownloadFailure = false;

      steamProcess.stdout.on("data", data => {
        const text = data.toString();
        output += text;
        console.log("SteamCMD output:", text);

        // Check for download failure in the output
        if (text.includes("ERROR! Download item") && text.includes("failed (Failure)")) {
          hasDownloadFailure = true;
        }

        // Send log to renderer
        event.sender.send("download-progress", { type: "log", message: text });
      });

      steamProcess.stderr.on("data", data => {
        const text = data.toString();
        errorOutput += text;
        console.error("SteamCMD error:", text);
        // Send error log to renderer
        event.sender.send("download-progress", { type: "error", message: text });
      });

      steamProcess.on("close", async code => {
        if (code === 0 && !hasDownloadFailure) {
          event.sender.send("download-progress", {
            type: "success",
            message: "Download completed successfully",
          });
          resolve({ success: true, message: "Item downloaded successfully" });
        } else {
          const errorMsg = hasDownloadFailure
            ? "Workshop item download failed. The item may be private, restricted, or unavailable."
            : `SteamCMD process exited with code ${code}. Error: ${errorOutput}`;

          // Clean up the workshop item directory if it exists
          try {
            const workshopDir = path.join(steamCMDDir, "steamapps", "workshop", appId);
            const itemDir = path.join(workshopDir, itemId);

            if (fs.existsSync(itemDir)) {
              await fs.promises.rm(itemDir, { recursive: true, force: true });
              console.log(`Cleaned up failed download directory: ${itemDir}`);
            }
          } catch (cleanupError) {
            console.error("Error cleaning up workshop directory:", cleanupError);
          }

          event.sender.send("download-progress", { type: "error", message: errorMsg });
          resolve({ success: false, message: errorMsg });
        }
      });

      steamProcess.on("error", error => {
        const errorMsg = `Failed to start SteamCMD: ${error.message}`;
        event.sender.send("download-progress", { type: "error", message: errorMsg });
        resolve({ success: false, message: errorMsg });
      });
    });
  } catch (error) {
    console.error("Error downloading Steam Workshop item:", error);
    return { success: false, message: error.message };
  }
});

// Fetch Steam Workshop item details
async function fetchWorkshopItemDetails(itemId) {
  try {
    const response = await fetch(
      "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `itemcount=1&publishedfileids[0]=${itemId}`,
      }
    );

    if (!response.ok) {
      throw new Error(`Steam API request failed: ${response.status}`);
    }

    const data = await response.json();
    if (!data.response?.publishedfiledetails?.[0]) {
      throw new Error("Invalid response from Steam API");
    }

    return data.response.publishedfiledetails[0];
  } catch (error) {
    console.error("Error fetching workshop item details:", error);
    throw error;
  }
}

// Encryption helpers
function generateEncryptionKey() {
  const machineId = machineIdSync(true);
  return crypto.createHash("sha256").update(machineId).digest("hex").substring(0, 32);
}

function encrypt(text) {
  if (!text) return "";
  try {
    const key = generateEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(key), iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    return `${iv.toString("hex")}:${encrypted}`;
  } catch (error) {
    console.error("Encryption error:", error);
    return text; // Return original text on error
  }
}

function decrypt(encryptedText) {
  if (!encryptedText || !encryptedText.includes(":")) return encryptedText;
  try {
    const key = generateEncryptionKey();
    const parts = encryptedText.split(":");
    const iv = Buffer.from(parts[0], "hex");
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(key), iv);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    console.error("Decryption error:", error);
    return encryptedText; // Return encrypted text on error
  }
}

class SettingsManager {
  constructor() {
    this.filePath = path.join(app.getPath("userData"), "ascendarasettings.json");
    this.sensitiveKeys = ["twitchSecret", "twitchClientId", "giantBombKey"];
    this.defaultSettings = {
      downloadDirectory: "",
      showOldDownloadLinks: false,
      seeInappropriateContent: false,
      viewWorkshopPage: false,
      notifications: true,
      downloadHandler: false,
      torrentEnabled: false,
      gameSource: "steamrip",
      autoCreateShortcuts: true,
      smoothTransitions: true,
      sendAnalytics: true,
      autoUpdate: true,
      endOnClose: false,
      language: "en",
      theme: "purple",
      threadCount: 4,
      sideScrollBar: false,
      crackDirectory: "",
      twitchSecret: "",
      twitchClientId: "",
      giantBombKey: "",
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
    this.settings = this.loadSettings();
    this.migrateToEncryption();
  }
  // Migrate existing plaintext keys to encrypted format
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
      // Ensure all default settings exist
      const mergedSettings = { ...this.defaultSettings };
      for (const [key, value] of Object.entries(settings)) {
        if (key in this.defaultSettings) {
          mergedSettings[key] = value;
        }
      }
      // Save if any default settings were missing
      if (JSON.stringify(settings) !== JSON.stringify(mergedSettings)) {
        fs.writeFileSync(this.filePath, JSON.stringify(mergedSettings, null, 2));
      }
      return mergedSettings;
    } catch (error) {
      console.error("Error loading settings:", error);
      return { ...this.defaultSettings };
    }
  }

  saveSettings(settings) {
    try {
      // Merge with existing settings to prevent overwriting
      const existingSettings = this.loadSettings();
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
      // Load current settings to ensure we have the latest
      const currentSettings = this.loadSettings();

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

  // Clean up any flat ludusavi properties (e.g., ludusavi.backupLocation)
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

const settingsManager = new SettingsManager();

// Save individual setting
ipcMain.handle("update-setting", async (event, key, value) => {
  const success = settingsManager.updateSetting(key, value);
  if (success) {
    // Notify renderer about the change
    event.sender.send("settings-changed", settingsManager.getSettings());
  }
  return success;
});

// Get individual setting
ipcMain.handle("get-setting", async (event, key) => {
  return settingsManager.getSetting(key);
});

ipcMain.handle("reload", () => {
  app.relaunch();
  app.exit();
});

// Sanitize text to handle special characters
function sanitizeText(text) {
  if (!text) return "";

  return text
    .replace(/ŌĆÖ/g, "'")
    .replace(/ŌĆō/g, "-")
    .replace(/├Č/g, "ö")
    .replace(/ŌĆ£/g, '"')
    .replace(/ŌĆØ/g, '"')
    .replace(/ŌĆ"/g, "...")
    .replace(/ŌĆś/g, "'")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\//g, "-")
    .replace(/:/g, "-")
    .replace(/[<>:"\/\\|?*]/g, "")
    .trim();
}

// Ludusavi functions
ipcMain.handle("ludusavi", async (event, action, game, backupName) => {
  try {
    if (isWindows) {
      // Windows uses custom notification helper
      const ludusaviPath = isDev
        ? path.join("./binaries/AscendaraGameHandler/dist/ludusavi.exe")
        : path.join(appDirectory, "/resources/ludusavi.exe");

      // Get ludusavi settings
      const settings = settingsManager.getSettings();
      const ludusaviSettings = settings.ludusavi || {};

      if (!fs.existsSync(ludusaviPath)) {
        return { success: false, error: "Ludusavi executable not found" };
      }

      // Prepare common arguments
      let args = [];

      switch (action) {
        case "backup":
          if (ludusaviSettings.backupOptions.skipManifestCheck) {
            args.push("--no-manifest-update");
          }
          args.push("backup");

          // Add game title if provided
          if (game) {
            args.push(game);
          }

          args.push("--force");

          // Add backup location if configured
          if (ludusaviSettings.backupLocation) {
            args.push("--path", ludusaviSettings.backupLocation);
          }

          // Add backup format if configured
          if (ludusaviSettings.backupFormat) {
            args.push("--format", ludusaviSettings.backupFormat);
          }

          // Add specific backup name if provided
          if (backupName) {
            args.push("--backup", backupName);
          }

          // Add compression options if configured
          if (ludusaviSettings.backupOptions?.compressionLevel) {
            let compressionLevel = ludusaviSettings.backupOptions.compressionLevel;
            if (compressionLevel === "default") {
              compressionLevel = "deflate";
            }
            args.push("--compression", compressionLevel);
          }

          // Add backups to keep limit
          if (ludusaviSettings.backupOptions?.backupsToKeep) {
            args.push("--full-limit", ludusaviSettings.backupOptions.backupsToKeep);
          }

          // Add API flag for machine-readable output
          args.push("--api");

          break;

        case "restore":
          args = ["restore"];

          // Add game title if provided
          if (game) {
            args.push(game);
          }

          args.push("--force");

          // Add backup location if configured
          if (ludusaviSettings.backupLocation) {
            args.push("--path", ludusaviSettings.backupLocation);
          }

          // Skip confirmations if configured
          if (ludusaviSettings.preferences?.skipConfirmations) {
            args.push("--force");
          }

          // Add API flag for machine-readable output
          args.push("--api");

          break;

        case "list-backups":
          args = ["backups"];

          // Add game title if provided
          if (game) {
            args.push(game);
          }

          // Add backup location if configured
          if (ludusaviSettings.backupLocation) {
            args.push("--path", ludusaviSettings.backupLocation);
          }

          // Add API flag for machine-readable output
          args.push("--api");

          break;

        case "find-game":
          args = ["find"];

          // Add game title if provided
          if (game) {
            args.push(game);
          }

          // Add multiple flag to find all potential matches
          args.push("--multiple");

          // Add API flag for machine-readable output
          args.push("--api");

          break;

        default:
          return { success: false, error: `Unknown action: ${action}` };
      }

      console.log(`Executing ludusavi command: ${ludusaviPath} ${args.join(" ")}`);

      // Execute the command
      const { spawn } = require("child_process");
      const process = spawn(ludusaviPath, args);

      return new Promise((resolve, reject) => {
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
              // Parse JSON output if possible
              const result = JSON.parse(stdout);
              resolve({ success: true, data: result });
            } catch (e) {
              // Return raw output if not JSON
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
          reject({ success: false, error: err.message });
        });
      });
    } else {
      return { success: false, error: "Ludusavi is only supported on Windows" };
    }
  } catch (error) {
    console.error("Error executing ludusavi command:", error);
    return { success: false, error: error.message };
  }
});

// Show test notification
ipcMain.handle("show-test-notification", async () => {
  try {
    // Read settings to get the theme
    const settings = await fs.readJson(
      path.join(app.getPath("userData"), "ascendarasettings.json")
    );
    const theme = settings.theme || "purple";

    // Check if notifications are enabled in settings
    if (!settings.notifications) {
      console.log("Notifications are disabled in settings");
      return { success: false, error: "Notifications are disabled in settings" };
    }

    if (isWindows) {
      // Windows uses custom notification helper
      const notificationHelperPath = isDev
        ? path.join(
            "./binaries/AscendaraNotificationHelper/dist/AscendaraNotificationHelper.exe"
          )
        : path.join(appDirectory, "/resources/AscendaraNotificationHelper.exe");
      const args = [
        "--theme",
        theme,
        "--title",
        "Test Notification",
        "--message",
        "This is a test notification from Ascendara!",
      ];

      // Use spawn instead of execFile and don't wait for it to complete
      const process = spawn(notificationHelperPath, args, {
        detached: true, // Run in background
        stdio: "ignore", // Don't pipe stdio
      });
      console.log("spawn command:", notificationHelperPath, args);
      // Unref the process so parent can exit independently
      process.unref();
    } else {
      // For macOS/Linux use native notifications
      console.log("Sending native notification on macOS/Linux");
      const notification = new Notification({
        title: "Test Notification",
        body: "This is a test notification from Ascendara!",
        silent: false,
        timeoutType: "default",
        urgency: "normal",
        icon: path.join(app.getAppPath(), "build", "icon.png"),
      });

      notification.on("show", () => console.log("Notification shown"));
      notification.on("click", () => console.log("Notification clicked"));
      notification.on("close", () => console.log("Notification closed"));
      notification.on("failed", error => console.error("Notification failed:", error));

      notification.show();
    }

    return { success: true };
  } catch (error) {
    console.error("Error showing test notification:", error);
    return { success: false, error: error.message };
  }
});

// Save the settings JSON file
ipcMain.handle("save-settings", async (event, options, directory) => {
  // Get current settings to preserve existing values
  const currentSettings = settingsManager.getSettings();

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

  const success = settingsManager.saveSettings(sanitizedOptions);
  if (success) {
    event.sender.send("settings-changed", sanitizedOptions);
  }
  return success;
});

// Check for updates

async function checkVersionAndUpdate() {
  try {
    const response = await axios.get("https://api.ascendara.app/");
    const latestVersion = response.data.appVer;

    isLatest = latestVersion === appVersion;
    console.log(
      `Version check: Current=${appVersion}, Latest=${latestVersion}, Is Latest=${isLatest}`
    );
    if (!isLatest) {
      const settings = await getSettings();
      if (settings.autoUpdate && !updateDownloadInProgress) {
        // Start background download
        downloadUpdatePromise = downloadUpdateInBackground();
      } else if (!settings.autoUpdate && !notificationShown) {
        // Show update available notification
        notificationShown = true; // Ensure notification is only shown once
        BrowserWindow.getAllWindows().forEach(window => {
          window.webContents.send("update-available");
        });
      }
    }
    return isLatest;
  } catch (error) {
    console.error("Error checking version:", error);
    return true;
  }
}

async function checkReferenceLanguage() {
  try {
    let timestamp = {};
    if (fs.existsSync(TIMESTAMP_FILE)) {
      timestamp = JSON.parse(fs.readFileSync(TIMESTAMP_FILE, "utf8"));
    }
    // If extraLangVer doesn't exist, no extra languages are installed, so skip check
    if (!timestamp.hasOwnProperty("extraLangVer")) {
      return;
    }
    extraLangVer = timestamp["extraLangVer"];
    const langVerResponse = await axios.get(`https://api.ascendara.app/language/version`);
    console.log(
      "Lang Version Check: Current=",
      extraLangVer,
      " Latest=",
      langVerResponse.data.version
    );
    const langVer = langVerResponse.data.version;
    if (langVer !== extraLangVer) {
      getNewLangKeys();
    }
  } catch (error) {}
}

async function getNewLangKeys() {
  try {
    // Ensure the languages directory exists in AppData Local;
    if (!fs.existsSync(LANG_DIR)) {
      fs.mkdirSync(LANG_DIR, { recursive: true });
      return; // No language files yet
    }

    // Get all language files from the languages directory in AppData Local
    const languageFiles = fs.readdirSync(LANG_DIR).filter(file => file.endsWith(".json"));

    // Fetch reference English translations from API
    const response = await fetch("https://api.ascendara.app/language/en");
    if (!response.ok) {
      throw new Error("Failed to fetch reference English translations");
    }
    const referenceTranslations = await response.json();

    // Function to get all nested keys from an object
    const getAllKeys = (obj, prefix = "") => {
      return Object.entries(obj).reduce((keys, [key, value]) => {
        const newKey = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === "object" && !Array.isArray(value)) {
          return [...keys, ...getAllKeys(value, newKey)];
        }
        return [...keys, newKey];
      }, []);
    };

    // Get all nested keys from reference
    const referenceKeys = getAllKeys(referenceTranslations);

    // Store missing keys for each language
    const missingKeys = {};

    // Compare each language file with reference
    for (const langFile of languageFiles) {
      const langCode = langFile.replace(".json", "");
      const langPath = path.join(LANG_DIR, langFile);
      let langContent = JSON.parse(fs.readFileSync(langPath, "utf8"));

      // Get all nested keys from the language file
      let langKeys = getAllKeys(langContent);

      // Find keys that exist in reference but not in language file
      let missing = referenceKeys.filter(key => !langKeys.includes(key));

      if (missing.length > 0) {
        // Run the translation script for missing keys
        try {
          let args;
          if (isWindows) {
            translatorExePath = isDev
              ? path.join(
                  "./binaries/AscendaraLanguageTranslation/dist/AscendaraLanguageTranslation.exe"
                )
              : path.join(appDirectory, "/resources/AscendaraLanguageTranslation.exe");
            args = [langCode, "--updateKeys"];
          } else {
            // For non-Windows, use python3 directly
            translatorExePath = "python3";
            // Set the script path based on environment
            const scriptPath = isDev
              ? "./binaries/AscendaraLanguageTranslation/src/debian/AscendaraLanguageTranslation.py"
              : path.join(appDirectory, "/resources/AscendaraLanguageTranslation.py");
            // Initialize args with script path and standard arguments
            args = [scriptPath, langCode, "--updateKeys"];
          }

          // Add each missing key as a separate --newKey argument
          missing.forEach(key => {
            args.push("--newKey", key);
          });

          // Start the translation process with proper configuration
          const translationProcess = spawn(translatorExePath, args, {
            stdio: ["ignore", "pipe", "pipe"],
            shell: !isWindows, // Use shell on non-Windows platforms
          });

          // Monitor process output
          translationProcess.stdout.on("data", data => {
            console.log(`Translation stdout: ${data}`);
          });

          translationProcess.stderr.on("data", data => {
            console.error(`Translation stderr: ${data}`);
          });

          // Wait for process to complete
          await new Promise((resolve, reject) => {
            translationProcess.on("close", code => {
              if (code === 0) {
                resolve();
              } else {
                reject(new Error(`Translation process exited with code ${code}`));
              }
            });
          });

          // Recheck the language file after translation
          langContent = JSON.parse(fs.readFileSync(langPath, "utf8"));
          langKeys = getAllKeys(langContent);
          missing = referenceKeys.filter(key => !langKeys.includes(key));
        } catch (error) {
          console.error(`Error running translation script for ${langCode}:`, error);
        }
      }

      if (missing.length > 0) {
        missingKeys[langCode] = missing;
      }
    }
    console.log("Missing Keys:", missingKeys);
    return missingKeys;
  } catch (error) {
    console.error("Error in getNewLangKeys:", error);
    throw error;
  }
}

async function downloadUpdateInBackground() {
  if (updateDownloadInProgress) return;
  updateDownloadInProgress = true;

  try {
    // Set downloadingUpdate to true in timestamp
    let timestamp = {};
    if (fs.existsSync(TIMESTAMP_FILE)) {
      timestamp = JSON.parse(fs.readFileSync(TIMESTAMP_FILE, "utf8"));
    }
    timestamp.downloadingUpdate = true;
    fs.writeFileSync(TIMESTAMP_FILE, JSON.stringify(timestamp, null, 2));

    // Custom headers for app identification
    const headers = {
      "X-Ascendara-Client": "app",
      "X-Ascendara-Version": appVersion,
    };

    const updateUrl = `https://lfs.ascendara.app/download?update`;
    const tempDir = path.join(os.tmpdir(), "ascendarainstaller");
    const installerPath = path.join(tempDir, "AscendaraInstaller.exe");

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }
    const mainWindow = BrowserWindow.getAllWindows()[0];

    // Create write stream for downloading
    const writer = fs.createWriteStream(installerPath);

    try {
      const response = await axios({
        url: updateUrl,
        method: "GET",
        responseType: "stream",
        headers: {
          ...headers,
          "Accept-Encoding": "gzip, deflate, br",
          Connection: "keep-alive",
          "Cache-Control": "no-cache",
        },
        maxRedirects: 5,
        timeout: 30000,
        onDownloadProgress: progressEvent => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          mainWindow.webContents.send("update-download-progress", progress);
        },
      });

      // Pipe the response data to file stream
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
      });
    } catch (error) {
      writer.end();
      console.error("Download failed:", error);
      throw error;
    }

    updateDownloaded = true;
    updateDownloadInProgress = false;

    // Set downloadingUpdate to false in timestamp
    timestamp.downloadingUpdate = false;
    fs.writeFileSync(TIMESTAMP_FILE, JSON.stringify(timestamp, null, 2));

    // Notify that update is ready
    BrowserWindow.getAllWindows().forEach(window => {
      window.webContents.send("update-ready");
    });
  } catch (error) {
    console.error("Error downloading update:", error);
    updateDownloadInProgress = false;

    // Notify about the error
    BrowserWindow.getAllWindows().forEach(window => {
      window.webContents.send("update-error", error.message);
    });
  }
}

(async () => {
  electronDl = await import("electron-dl");
})();
const downloadProcesses = new Map();
const goFileProcesses = new Map();
const retryDownloadProcesses = new Map();
const runGameProcesses = new Map();
const appDirectory = path.join(path.dirname(app.getPath("exe")));
console.log(appDirectory);

let apiKeyOverride = null;

ipcMain.handle("override-api-key", (event, newApiKey) => {
  apiKeyOverride = newApiKey;
  console.log("API Key overridden:", apiKeyOverride);
});

ipcMain.handle("get-api-key", () => {
  return apiKeyOverride || APIKEY;
});

// Handle external urls
ipcMain.handle("open-url", async (event, url) => {
  shell.openExternal(url);
});

// Check if any game is downloading
ipcMain.handle("is-downloader-running", async () => {
  try {
    // Get settings to find download directory
    const filePath = path.join(app.getPath("userData"), "ascendarasettings.json");
    const data = fs.readFileSync(filePath, "utf8");
    const settings = JSON.parse(data);
    if (!settings.downloadDirectory) return false;

    // Read games data
    const gamesFilePath = path.join(settings.downloadDirectory, "games.json");
    const gamesData = JSON.parse(fs.readFileSync(gamesFilePath, "utf8"));

    // Simply check if any game has downloadingData key
    return Object.values(gamesData).some(game => game.downloadingData);
  } catch (error) {
    console.error("Error checking downloader status:", error);
    return false;
  }
});

ipcMain.handle("is-broken-version", () => {
  return isBrokenVersion;
});
ipcMain.handle("enable-game-auto-backups", async (event, game, isCustom) => {
  const filePath = path.join(app.getPath("userData"), "ascendarasettings.json");
  try {
    const data = fs.readFileSync(filePath, "utf8");
    const settings = JSON.parse(data);
    if (!settings.downloadDirectory) {
      throw new Error("Download directory not set");
    }

    let gameInfoPath;
    if (isCustom) {
      const gamesFilePath = path.join(settings.downloadDirectory, "games.json");
      const gamesData = JSON.parse(fs.readFileSync(gamesFilePath, "utf8"));
      const gameInfo = gamesData.games.find(g => g.game === game);
      if (!gameInfo) throw new Error("Custom game not found");
      gameInfo.backups = true;
      fs.writeFileSync(gamesFilePath, JSON.stringify(gamesData, null, 2));
    } else {
      const gameDirectory = path.join(settings.downloadDirectory, game);
      gameInfoPath = path.join(gameDirectory, `${game}.ascendara.json`);
      const gameInfoData = fs.readFileSync(gameInfoPath, "utf8");
      const gameInfo = JSON.parse(gameInfoData);
      gameInfo.backups = true;
      fs.writeFileSync(gameInfoPath, JSON.stringify(gameInfo, null, 2));
    }
    return true;
  } catch (error) {
    console.error("Error enabling game auto backups:", error);
    return false;
  }
});

ipcMain.handle("disable-game-auto-backups", async (event, game, isCustom) => {
  const filePath = path.join(app.getPath("userData"), "ascendarasettings.json");
  try {
    const data = fs.readFileSync(filePath, "utf8");
    const settings = JSON.parse(data);
    if (!settings.downloadDirectory) {
      throw new Error("Download directory not set");
    }

    let gameInfoPath;
    if (isCustom) {
      const gamesFilePath = path.join(settings.downloadDirectory, "games.json");
      const gamesData = JSON.parse(fs.readFileSync(gamesFilePath, "utf8"));
      const gameInfo = gamesData.games.find(g => g.game === game);
      if (!gameInfo) throw new Error("Custom game not found");
      gameInfo.backups = false;
      fs.writeFileSync(gamesFilePath, JSON.stringify(gamesData, null, 2));
    } else {
      const gameDirectory = path.join(settings.downloadDirectory, game);
      gameInfoPath = path.join(gameDirectory, `${game}.ascendara.json`);
      const gameInfoData = fs.readFileSync(gameInfoPath, "utf8");
      const gameInfo = JSON.parse(gameInfoData);
      gameInfo.backups = false;
      fs.writeFileSync(gameInfoPath, JSON.stringify(gameInfo, null, 2));
    }
    return true;
  } catch (error) {
    console.error("Error disabling game auto backups:", error);
    return false;
  }
});

ipcMain.handle("game-rated", async (event, game, isCustom) => {
  const filePath = path.join(app.getPath("userData"), "ascendarasettings.json");
  try {
    const data = fs.readFileSync(filePath, "utf8");
    const settings = JSON.parse(data);
    if (!settings.downloadDirectory) {
      throw new Error("Download directory not set");
    }

    if (isCustom) {
      const gamesFilePath = path.join(settings.downloadDirectory, "games.json");
      const gamesData = JSON.parse(fs.readFileSync(gamesFilePath, "utf8"));
      const gameInfo = gamesData.games.find(g => g.game === game);
      if (!gameInfo) throw new Error("Custom game not found");
      gameInfo.hasRated = true;
      fs.writeFileSync(gamesFilePath, JSON.stringify(gamesData, null, 2));
    } else {
      const gameDirectory = path.join(settings.downloadDirectory, game);
      const gameInfoPath = path.join(gameDirectory, `${game}.ascendara.json`);
      const gameInfoData = fs.readFileSync(gameInfoPath, "utf8");
      const gameInfo = JSON.parse(gameInfoData);
      gameInfo.hasRated = true;
      fs.writeFileSync(gameInfoPath, JSON.stringify(gameInfo, null, 2));
    }
    return true;
  } catch (error) {
    console.error("Error setting game as rated:", error);
    return false;
  }
});

ipcMain.handle("delete-game-directory", async (event, game) => {
  try {
    const filePath = path.join(app.getPath("userData"), "ascendarasettings.json");
    try {
      const data = fs.readFileSync(filePath, "utf8");
      const settings = JSON.parse(data);
      if (!settings.downloadDirectory) {
        console.error("Download directory not set");
        return;
      }
      const downloadDirectory = settings.downloadDirectory;
      const gameDirectory = path.join(downloadDirectory, game);

      try {
        // First ensure all file handles are closed by attempting to read the directory
        const files = await fs.promises.readdir(gameDirectory, { withFileTypes: true });

        // Delete all contents first
        for (const file of files) {
          const fullPath = path.join(gameDirectory, file.name);
          await fs.promises.rm(fullPath, { recursive: true, force: true });
        }

        // Then remove the empty directory itself
        await fs.promises.rmdir(gameDirectory);
        console.log("Game directory and files deleted successfully");
      } catch (error) {
        console.error("Error deleting the game directory:", error);
        throw error; // Propagate the error to handle it in the caller
      }
    } catch (error) {
      console.error("Error reading the settings file:", error);
    }
  } catch (error) {
    console.error("Error deleting the game directory:", error);
  }
});

ipcMain.handle("verify-game", async (event, game) => {
  try {
    const filePath = path.join(app.getPath("userData"), "ascendarasettings.json");
    const data = fs.readFileSync(filePath, "utf8");
    const settings = JSON.parse(data);
    if (!settings.downloadDirectory) {
      throw new Error("Download directory not set");
    }
    const gameDirectory = path.join(settings.downloadDirectory, game);
    const filemapPath = path.join(gameDirectory, "filemap.ascendara.json");
    const gameInfoPath = path.join(gameDirectory, `${game}.ascendara.json`);

    const filemapData = fs.readFileSync(filemapPath, "utf8");
    const filemap = JSON.parse(filemapData);
    const gameInfoData = fs.readFileSync(gameInfoPath, "utf8");
    let gameInfo = JSON.parse(gameInfoData);

    const verifyErrors = [];
    for (const filePath in filemap) {
      // Normalize path separators to match OS and convert to lowercase on Windows
      const normalizedPath = filePath.replace(/[\/\\]/g, path.sep);
      const fullPath = path.join(gameDirectory, normalizedPath);

      // On Windows, do case-insensitive path existence check
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

ipcMain.handle("stop-download", async (event, game) => {
  try {
    if (isWindows) {
      // Windows: Use taskkill to terminate processes
      const processNames = [
        "AscendaraDownloader.exe",
        "AscendaraGofileHelper.exe",
        "AscendaraTorrentHandler.exe",
      ];
      for (const processName of processNames) {
        const killProcess = spawn("taskkill", ["/f", "/im", processName]);
        await new Promise(resolve => killProcess.on("close", resolve));
      }
    } else {
      // Unix-like systems: Find and kill Python processes for this game
      const pythonScripts = [
        "AscendaraDownloader.py",
        "AscendaraGofileHelper.py",
        "AscendaraTorrentHandler.py",
      ];

      for (const script of pythonScripts) {
        // Use pgrep to find Python processes running our scripts
        const findProcess = spawn("pgrep", ["-f", script]);
        const pids = await new Promise(resolve => {
          let output = "";
          findProcess.stdout.on("data", data => (output += data));
          findProcess.on("close", () =>
            resolve(output.trim().split("\n").filter(Boolean))
          );
        });

        // Kill each found process
        for (const pid of pids) {
          if (pid) {
            const killProcess = spawn("kill", ["-9", pid]);
            await new Promise(resolve => killProcess.on("close", resolve));
          }
        }
      }
    }

    // Wait for processes to fully terminate and release file handles
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Try to delete directory multiple times in case file handles are still being released
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        await deleteGameDirectory(game);
        return true;
      } catch (deleteError) {
        attempts++;
        if (attempts === maxAttempts) {
          throw deleteError;
        }
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  } catch (error) {
    console.error("Error stopping download:", error);
    return false;
  }
});

const deleteGameDirectory = async game => {
  const filePath = path.join(app.getPath("userData"), "ascendarasettings.json");
  try {
    const data = fs.readFileSync(filePath, "utf8");
    const settings = JSON.parse(data);
    if (!settings.downloadDirectory) {
      console.error("Download directory not set");
      return;
    }
    const downloadDirectory = settings.downloadDirectory;
    const gameDirectory = path.join(downloadDirectory, game);

    try {
      // First ensure all file handles are closed by attempting to read the directory
      const files = await fs.promises.readdir(gameDirectory, { withFileTypes: true });

      // Delete all contents first
      for (const file of files) {
        const fullPath = path.join(gameDirectory, file.name);
        await fs.promises.rm(fullPath, { recursive: true, force: true });
      }

      // Then remove the empty directory itself
      await fs.promises.rmdir(gameDirectory);
      console.log("Game directory and files deleted successfully");
    } catch (error) {
      console.error("Error deleting the game directory:", error);
      throw error; // Propagate the error to handle it in the caller
    }
  } catch (error) {
    console.error("Error reading the settings file:", error);
  }
};

ipcMain.handle("get-game-image", async (event, game) => {
  const settings = settingsManager.getSettings();
  try {
    if (!settings.downloadDirectory) {
      console.error("Download directory not set");
      return null;
    }

    const downloadDirectory = settings.downloadDirectory;
    const gamesDirectory = path.join(downloadDirectory, "games");

    // Ensure the games directory exists
    if (!fs.existsSync(gamesDirectory)) {
      fs.mkdirSync(gamesDirectory, { recursive: true });
    }

    // Check for game image with different possible extensions
    const possibleExtensions = [".jpg", ".jpeg", ".png"];

    for (const ext of possibleExtensions) {
      const imagePath = path.join(gamesDirectory, `${game}.ascendara${ext}`);
      if (fs.existsSync(imagePath)) {
        const imageBuffer = fs.readFileSync(imagePath);
        return imageBuffer.toString("base64");
      }
    }

    // Fallback to check the old location (individual game directory) for backward compatibility
    const gameDirectory = path.join(downloadDirectory, game);
    if (fs.existsSync(gameDirectory)) {
      const imageFiles = fs.readdirSync(gameDirectory);

      for (const file of imageFiles) {
        if (
          file === "header.ascendara.jpg" ||
          file === "header.ascendara.png" ||
          file === "header.jpeg"
        ) {
          const imagePath = path.join(gameDirectory, file);
          const imageBuffer = fs.readFileSync(imagePath);
          return imageBuffer.toString("base64");
        }
      }
    }

    return null;
  } catch (error) {
    console.error("Error reading game image:", error);
    return null;
  }
});

ipcMain.handle("can-create-files", async (event, directory) => {
  try {
    const filePath = path.join(directory, "test.txt");
    fs.writeFileSync(filePath, "test");
    fs.unlinkSync(filePath);
    return true;
  } catch (error) {
    return false;
  }
});

// Download the file
ipcMain.handle(
  "download-file",
  async (event, link, game, online, dlc, isVr, version, imgID, size) => {
    console.log(
      `Downloading file: ${link}, game: ${game}, online: ${online}, dlc: ${dlc}, isVr: ${isVr}, version: ${version}, size: ${size}`
    );

    try {
      // Get download directory from settings
      const data = await fs.promises.readFile(
        path.join(app.getPath("userData"), "ascendarasettings.json"),
        "utf8"
      );
      const settings = JSON.parse(data);

      if (!settings.downloadDirectory) {
        console.error("Download directory not set");
        return;
      }
      originalGame = game;
      game = sanitizeText(game);
      // Create game directory
      const gameDirectory = path.join(settings.downloadDirectory, game);
      await fs.promises.mkdir(gameDirectory, { recursive: true });

      // Download game header image
      const imageLink =
        settings.gameSource === "fitgirl"
          ? `https://api.ascendara.app/v2/fitgirl/image/${imgID}`
          : `https://api.ascendara.app/v2/image/${imgID}`;

      const response = await axios({
        url: imageLink,
        method: "GET",
        responseType: "arraybuffer",
      });

      // Save the image
      const imageBuffer = Buffer.from(response.data);
      const mimeType = response.headers["content-type"];
      const extension = getExtensionFromMimeType(mimeType);
      await fs.promises.writeFile(
        path.join(gameDirectory, `header.ascendara${extension}`),
        imageBuffer
      );

      // Launch the appropriate Python script based on the link type and source
      const executablePath = isDev
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

      const spawnCommand =
        settings.gameSource === "fitgirl"
          ? [link, game, online, dlc, version, size, settings.downloadDirectory].concat(
              settings.notifications ? [`--withNotification`, settings.theme] : []
            )
          : [
              link.includes("gofile.io") ? "https://" + link : link,
              game,
              online,
              dlc,
              isVr,
              version,
              size,
              settings.downloadDirectory,
            ].concat(
              settings.notifications ? [`--withNotification`, settings.theme] : []
            );

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
        game,
        timestamp: new Date().toISOString(),
      });
      await fs.promises.writeFile(TIMESTAMP_FILE, JSON.stringify(timestampData, null, 2));

      const downloadProcess = spawn(executablePath, spawnCommand, {
        detached: true,
        stdio: "ignore",
        windowsHide: false,
      });

      downloadProcess.on("error", err => {
        console.error(`Failed to start download process: ${err}`);
        event.sender.send("download-error", { game, error: err.message });
      });

      downloadProcesses.set(game, downloadProcess);
      downloadProcess.unref();
    } catch (error) {
      console.error("Error in download-file handler:", error);
      event.sender.send("download-error", { game, error: error.message });
    }
  }
);

function getExtensionFromMimeType(mimeType) {
  switch (mimeType) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    default:
      return "";
  }
}

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

ipcMain.handle("check-retry-extract", async (event, game) => {
  const filePath = path.join(app.getPath("userData"), "ascendarasettings.json");
  try {
    const data = fs.readFileSync(filePath, "utf8");
    const settings = JSON.parse(data);
    if (!settings.downloadDirectory) {
      console.error("Download directory not set");
      return;
    }
    const downloadDirectory = settings.downloadDirectory;
    const gameDirectory = path.join(downloadDirectory, game);
    const files = await fs.promises.readdir(gameDirectory);
    const jsonFile = `${game}.ascendara.json`;
    if (files.length === 1 && files[0] === jsonFile) {
      return false;
    }
    return files.length > 1;
  } catch (error) {
    console.error("Error reading the settings file:", error);
    return;
  }
});

ipcMain.handle("retry-extract", async (event, game, online, dlc, version) => {
  console.log(`Retrying extract: ${game}`);
  const result = await dialog.showOpenDialog({
    properties: ["openFile", "openDirectory"],
  });

  if (result.canceled) {
    return null;
  } else {
    console.log(`Selected paths: ${result.filePaths}`);
    const filePath = path.join(app.getPath("userData"), "ascendarasettings.json");
    try {
      const data = fs.readFileSync(filePath, "utf8");
      const settings = JSON.parse(data);
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
        console.log(
          `Calling ${executablePath} with arguments: ${selectedPath}, ${game}, ${online}, ${dlc}, ${version}, ${gameDirectory}, ${itemName}`
        );
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

        // Store the download process
        downloadProcesses.set(game, downloadProcess);
      });

      return; // Return after setting the downloadProcess
    } catch (error) {
      console.error("Error reading the settings file:", error);
    }
  }
});

// Return dev status
ipcMain.handle("is-dev", () => {
  return isDev;
});

// Retry the game download
ipcMain.handle("retry-download", async (event, link, game, online, dlc, version) => {
  const filePath = path.join(app.getPath("userData"), "ascendarasettings.json");
  try {
    const data = fs.readFileSync(filePath, "utf8");
    const settings = JSON.parse(data);
    if (!settings.downloadDirectory) {
      console.error("Download directory not set");
      return;
    }
    const gamesDirectory = settings.downloadDirectory;
    const gameDirectory = path.join(gamesDirectory, game);

    let executablePath;
    let spawnCommand;

    if (link.includes("gofile.io")) {
      executablePath = isDev
        ? path.join(
            appDirectory,
            "/binaries/AscendaraGofileHelper/dist/AscendaraGofileHelper.exe"
          )
        : path.join(appDirectory, "/resources/AscendaraGofileHelper.exe");
      spawnCommand = ["https://" + link, game, online, dlc, version, "0", gamesDirectory];
    } else {
      executablePath = isDev
        ? path.join(
            appDirectory,
            "/binaries/AscendaraDownloader/dist/AscendaraDownloader.exe"
          )
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

ipcMain.handle("is-new", () => {
  const filePath = TIMESTAMP_FILE;
  try {
    fs.accessSync(filePath);
    return false; // File exists, not new
  } catch (error) {
    return true; // File does not exist, is new
  }
});

ipcMain.handle("is-v7", () => {
  try {
    const data = fs.readFileSync(TIMESTAMP_FILE, "utf8");
    const timestamp = JSON.parse(data);
    return timestamp.hasOwnProperty("v7") && timestamp.v7 === true;
  } catch (error) {
    return false; // If there's an error, assume not v7
  }
});

ipcMain.handle("set-v7", () => {
  try {
    let timestamp = {
      timestamp: Date.now(),
      v7: true,
    };

    // If file exists, update it while preserving the original timestamp
    if (fs.existsSync(TIMESTAMP_FILE)) {
      const existingData = JSON.parse(fs.readFileSync(TIMESTAMP_FILE, "utf8"));
      timestamp.timestamp = existingData.timestamp;
    }

    fs.writeFileSync(TIMESTAMP_FILE, JSON.stringify(timestamp, null, 2));
    return true;
  } catch (error) {
    console.error("Error setting v7:", error);
    return false;
  }
});

ipcMain.handle("create-timestamp", () => {
  const timestamp = {
    timestamp: Date.now(),
    v7: true,
  };
  console.log(timestamp);
  fs.writeFileSync(TIMESTAMP_FILE, JSON.stringify(timestamp, null, 2));
});

ipcMain.handle("has-launched", () => {
  const result = has_launched;
  if (!has_launched) {
    has_launched = true;
  }
  return result;
});

ipcMain.handle("update-launch-count", () => {
  try {
    let timestamp = {};

    if (fs.existsSync(TIMESTAMP_FILE)) {
      timestamp = JSON.parse(fs.readFileSync(TIMESTAMP_FILE, "utf8"));
    }

    timestamp.launchCount = (timestamp.launchCount || 0) + 1;
    fs.writeFileSync(TIMESTAMP_FILE, JSON.stringify(timestamp, null, 2));

    return timestamp.launchCount;
  } catch (error) {
    console.error("Error updating launch count:", error);
    return 1;
  }
});

ipcMain.handle("is-on-windows", () => {
  return isWindows;
});

ipcMain.handle("delete-installer", () => {
  // check ascnedarainstaller tempfile and delete if exists
  const filePath = path.join(app.getPath("temp"), "ascendarainstaller.exe");
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    console.error(error);
  }
});

ipcMain.handle("get-analytics-key", () => {
  return analyticsAPI;
});

ipcMain.handle("get-image-key", () => {
  return imageKey;
});

ipcMain.handle("set-timestamp-value", async (event, key, value) => {
  try {
    let timestamp = {};
    if (fs.existsSync(TIMESTAMP_FILE)) {
      timestamp = JSON.parse(fs.readFileSync(TIMESTAMP_FILE, "utf8"));
    }
    timestamp[key] = value;
    fs.writeFileSync(TIMESTAMP_FILE, JSON.stringify(timestamp, null, 2));
  } catch (error) {
    console.error("Error setting timestamp value:", error);
  }
});

ipcMain.handle("get-timestamp-value", async (event, key) => {
  try {
    let timestamp = {};
    if (fs.existsSync(TIMESTAMP_FILE)) {
      timestamp = JSON.parse(fs.readFileSync(TIMESTAMP_FILE, "utf8"));
    }
    return timestamp[key];
  } catch (error) {
    console.error("Error getting timestamp value:", error);
    return null;
  }
});

// Add a getter for settings
ipcMain.handle("get-settings", () => {
  return settingsManager.getSettings();
});

let isInstalling = false;

ipcMain.handle("install-dependencies", async event => {
  if (isInstalling) {
    return { success: false, message: "Installation already in progress" };
  }

  isInstalling = true;

  try {
    const tempDir = path.join(os.tmpdir(), "ascendaradependencies");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }

    const zipUrl = "https://cdn.ascendara.app/files/deps.zip";
    const zipPath = path.join(tempDir, "deps.zip");
    const res = await fetch(zipUrl);
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(zipPath, buffer);

    await fs
      .createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: tempDir }))
      .promise();

    const files = fs.readdirSync(tempDir);
    const executables = files.filter(file => path.extname(file) === ".exe");
    const msis = files.filter(file => path.extname(file) === ".msi");

    for (const executable of executables) {
      const exePath = path.join(tempDir, executable);

      // Notify the renderer that installation has started
      event.sender.send("dependency-installation-status", {
        name: executable,
        status: "starting",
      });

      // Check if the file is executable
      fs.chmodSync(exePath, "755");

      // Run the executable with elevated privileges
      await new Promise((resolve, reject) => {
        console.log(`Starting installation of: ${executable}`);
        const process = spawn(
          "powershell.exe",
          ["-Command", `Start-Process -FilePath "${exePath}" -Verb RunAs -Wait`],
          { shell: true }
        );
        process.on("error", error => {
          reject(error);
        });
        process.on("exit", code => {
          if (code === 0) {
            console.log(`Finished installing: ${executable}`);
            // Notify the renderer that installation has finished
            event.sender.send("dependency-installation-status", {
              name: executable,
              status: "finished",
            });
            resolve();
          } else {
            console.error(`Failed to install: ${executable}`);
            // Notify the renderer that installation has failed
            event.sender.send("dependency-installation-status", {
              name: executable,
              status: "failed",
            });
            reject(new Error(`Process exited with code ${code}`));
          }
        });
      });
    }

    // Handle .msi files
    for (const msi of msis) {
      const msiPath = path.join(tempDir, msi);
      // Notify the renderer that installation has started
      event.sender.send("dependency-installation-status", {
        name: msi,
        status: "starting",
      });

      await new Promise((resolve, reject) => {
        console.log(`Starting installation of: ${msi}`);
        const process = spawn(msiPath, [], {
          detached: true,
          shell: true,
          stdio: "ignore", // Ignore stdio to prevent output
          windowsHide: true, // Hide the command prompt window
        });
        process.on("error", error => {
          reject(error);
        });
        process.on("exit", code => {
          if (code === 0) {
            console.log(`Finished installing: ${msi}`);
            // Notify the renderer that installation has finished
            event.sender.send("dependency-installation-status", {
              name: msi,
              status: "finished",
            });
            resolve();
          } else {
            console.error(`Failed to install: ${msi}`);
            // Notify the renderer that installation has failed
            event.sender.send("dependency-installation-status", {
              name: msi,
              status: "failed",
            });
            reject(new Error(`Process exited with code ${code}`));
          }
        });
      });
    }

    // Clean up
    fs.rm(tempDir, { recursive: true, force: true }, err => {
      if (err) {
        console.error("Error removing temp directory:", err);
      } else {
        console.log("Temp directory removed successfully");
      }
    });

    console.log("All installations complete");
    return { success: true, message: "All dependencies installed successfully" };
  } catch (error) {
    console.error("An error occurred:", error);
    return { success: false, message: error.message };
  } finally {
    isInstalling = false;
  }
});

ipcMain.handle("install-python", async () => {
  if (process.platform === "win32") {
    return {
      success: false,
      message: "Windows installation not supported in this handler",
    };
  }

  try {
    const { exec } = require("child_process");
    const { BrowserWindow } = require("electron");
    const resourcePath =
      process.env.NODE_ENV === "development"
        ? path.join(app.getAppPath(), "binaries")
        : path.join(process.resourcesPath, "binaries");

    await new Promise((resolve, reject) => {
      const chmodCommand = [
        `chmod +x "${isDev ? "./binaries/AscendaraCrashReporter/src/AscendaraCrashReporter.py" : path.join(resourcePath, "/resources/AscendaraCrashReporter.py")}"`,
        `chmod +x "${isDev ? "./binaries/AscendaraDownloader/src/AscendaraDownloader.py" : path.join(resourcePath, "/resources/AscendaraDownloader.py")}"`,
        `chmod +x "${isDev ? "./binaries/AscendaraDownloader/src/AscendaraGofileHelper.py" : path.join(resourcePath, "/resources/AscendaraGofileHelper.py")}"`,
        `chmod +x "${isDev ? "./binaries/AscendaraGameHandler/src/AscendaraGameHandler.py" : path.join(resourcePath, "/resources/AscendaraGameHandler.py")}"`,
        `chmod +x "${isDev ? "./binaries/AscendaraLanguageTranslation/src/AscendaraLanguageTranslation.py" : path.join(resourcePath, "/resources/AscendaraLanguageTranslation.py")}"`,
      ].join(" && ");

      exec(chmodCommand, error => {
        if (error) {
          console.error("Error making Python files executable:", error);
          reject(error);
        } else {
          resolve();
        }
      });
    });

    const installWindow = new BrowserWindow({
      width: 500,
      height: 300,
      frame: false,
      transparent: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    // Create HTML content for the window
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
              background: rgba(30, 30, 30, 0.95);
              color: white;
              border-radius: 10px;
              padding: 20px;
              margin: 0;
              height: 100vh;
              display: flex;
              flex-direction: column;
              justify-content: center;
              align-items: center;
              box-sizing: border-box;
            }
            .spinner {
              width: 50px;
              height: 50px;
              border: 5px solid #f3f3f3;
              border-top: 5px solid #3498db;
              border-radius: 50%;
              animation: spin 1s linear infinite;
              margin-bottom: 20px;
            }
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            .status {
              margin-top: 15px;
              text-align: center;
              max-width: 400px;
              word-wrap: break-word;
            }
            .progress-bar {
              width: 300px;
              height: 4px;
              background: #2c2c2c;
              border-radius: 2px;
              margin-top: 15px;
              overflow: hidden;
            }
            .progress {
              width: 0%;
              height: 100%;
              background: #3498db;
              transition: width 0.3s ease;
            }
          </style>
        </head>
        <body>
          <div class="spinner"></div>
          <h2>Installing Python</h2>
          <div class="status">Initializing installation...</div>
          <div class="progress-bar">
            <div class="progress"></div>
          </div>
        </body>
      </html>
    `;

    // Load the HTML content
    installWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`
    );

    const command =
      process.platform === "darwin"
        ? "brew install python"
        : "sudo apt-get update && sudo apt-get install -y python3";

    await new Promise((resolve, reject) => {
      const updateStatus = message => {
        installWindow.webContents.executeJavaScript(`
          document.querySelector('.status').textContent = ${JSON.stringify(message)};
        `);
      };

      const updateProgress = percent => {
        installWindow.webContents.executeJavaScript(`
          document.querySelector('.progress').style.width = '${percent}%';
        `);
      };

      const process = exec(command, async (error, stdout, stderr) => {
        if (error) {
          updateStatus(`Error: ${error.message}`);
          setTimeout(() => {
            installWindow.close();
            reject(error);
          }, 3000);
        } else {
          updateStatus("Python installed successfully! Installing required packages...");
          updateProgress(40);

          // Install pip packages
          const packages = ["requests", "psutil", "pypresence", "patool"];

          try {
            const pipCommand = process.platform === "darwin" ? "pip3" : "pip3";

            for (let i = 0; i < packages.length; i++) {
              const pkg = packages[i];
              const progress = 40 + Math.floor(((i + 1) / packages.length) * 60);

              updateStatus(`Installing package: ${pkg}`);
              updateProgress(progress);

              await new Promise((resolvePackage, rejectPackage) => {
                exec(`${pipCommand} install --user ${pkg}`, (err, stdout, stderr) => {
                  if (err) {
                    console.error(`Error installing ${pkg}:`, err);
                    rejectPackage(err);
                  } else {
                    resolvePackage();
                  }
                });
              });
            }

            updateStatus("All dependencies installed successfully!");
            updateProgress(100);
            setTimeout(() => {
              installWindow.close();
              resolve();
            }, 2000);
          } catch (pipError) {
            updateStatus(`Package installation error: ${pipError.message}`);
            setTimeout(() => {
              installWindow.close();
              reject(pipError);
            }, 3000);
          }
        }
      });

      // Update progress based on output
      let progress = 0;
      process.stdout.on("data", data => {
        progress = Math.min(progress + 10, 90);
        updateProgress(progress);
        updateStatus(data.toString().trim());
      });

      process.stderr.on("data", data => {
        updateStatus(data.toString().trim());
      });
    });

    return { success: true, message: "Python installed successfully" };
  } catch (error) {
    console.error("An error occurred during Python installation:", error);
    return { success: false, message: error.message };
  }
});

/**
 * Check if a file exists using PowerShell
 * @param {string} filePath - The file path to check
 * @returns {Promise<boolean>} - Whether the file exists
 */
async function checkFileExists(filePath) {
  return new Promise(resolve => {
    const { exec } = require("child_process");
    const command = `powershell -Command "Test-Path '${filePath}'"`;

    exec(command, (error, stdout) => {
      if (error) {
        console.error("Error checking file:", error);
        resolve(false);
        return;
      }
      resolve(stdout.trim().toLowerCase() === "true");
    });
  });
}

/**
 * Check if a dependency is installed by looking up its registry key
 * @param {string} registryKey - The registry key to check
 * @param {string} valueName - The value name to look for
 * @returns {Promise<boolean>} - Whether the dependency is installed
 */
async function checkRegistryKey(registryKey, valueName) {
  return new Promise(resolve => {
    try {
      const Registry = require("winreg");
      const regKey = new Registry({
        hive: Registry.HKLM,
        key: registryKey.replace("HKLM\\", "\\"),
      });

      regKey.valueExists(valueName, (err, exists) => {
        if (err || !exists) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    } catch (error) {
      console.error("Error checking registry:", error);
      resolve(false);
    }
  });
}

// Registry paths for dependencies
const DEPENDENCY_REGISTRY_PATHS = {
  "dotNetFx40_Full_x86_x64.exe": {
    key: "HKLM\\SOFTWARE\\Microsoft\\NET Framework Setup\\NDP\\v4\\Full",
    value: "Install",
    name: ".NET Framework 4.0",
    checkType: "registry",
  },
  "dxwebsetup.exe": {
    key: "HKLM\\SOFTWARE\\Microsoft\\DirectX",
    value: "Version",
    name: "DirectX",
    checkType: "registry",
  },
  "oalinst.exe": {
    filePath: "C:\\Windows\\System32\\OpenAL32.dll",
    name: "OpenAL",
    checkType: "file",
  },
  "VC_redist.x64.exe": {
    key: "HKLM\\SOFTWARE\\Microsoft\\DevDiv\\VC\\Servicing\\14.0\\RuntimeMinimum",
    value: "Install",
    name: "Visual C++ Redistributable",
    checkType: "registry",
  },
  "xnafx40_redist.msi": {
    key: "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\XNA\\Framework\\v4.0",
    value: "Installed",
    name: "XNA Framework",
    checkType: "registry",
  },
};

/**
 * Check if a dependency is installed
 * @param {Object} depInfo - Dependency information
 * @returns {Promise<boolean>} - Whether the dependency is installed
 */
async function checkDependencyInstalled(depInfo) {
  let isInstalled;
  if (depInfo.checkType === "file") {
    isInstalled = await checkFileExists(depInfo.filePath);
    console.log(
      `File check for ${depInfo.name}: ${isInstalled ? "Found" : "Not found"} at ${depInfo.filePath}`
    );
  } else {
    isInstalled = await checkRegistryKey(depInfo.key, depInfo.value);
    console.log(
      `Registry check for ${depInfo.name}: ${isInstalled ? "Found" : "Not found"} at ${depInfo.key}`
    );
  }
  return isInstalled;
}

/**
 * Check the installation status of all game dependencies
 * @returns {Promise<Array>} Array of dependency status objects
 */
async function checkGameDependencies() {
  const results = [];

  for (const [file, info] of Object.entries(DEPENDENCY_REGISTRY_PATHS)) {
    const isInstalled = await checkDependencyInstalled(info);
    results.push({
      name: info.name,
      file: file,
      installed: isInstalled,
    });
  }

  return results;
}

// Handle IPC call to check dependencies
ipcMain.handle("check-game-dependencies", async () => {
  return await checkGameDependencies();
});

ipcMain.handle("get-games", async () => {
  const settings = settingsManager.getSettings();
  try {
    if (!settings.downloadDirectory) {
      console.error("Download directory not set");
      return;
    }
    const downloadDirectory = settings.downloadDirectory;
    // Get all subdirectories in the download directory
    const subdirectories = await fs.promises.readdir(downloadDirectory, {
      withFileTypes: true,
    });
    const gameDirectories = subdirectories
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    // Read {game}.ascendara.json from each subdirectory
    const games = await Promise.all(
      gameDirectories.map(async dir => {
        const gameInfoPath = path.join(downloadDirectory, dir, `${dir}.ascendara.json`);
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
    return games.filter(game => game !== null);
  } catch (error) {
    console.error("Error reading the settings file:", error);
    return [];
  }
});

async function getSettings() {
  try {
    const filePath = path.join(app.getPath("userData"), "ascendarasettings.json");
    console.log("Reading settings from:", filePath);

    if (!fs.existsSync(filePath)) {
      console.log("Settings file does not exist");
      return { autoUpdate: true };
    }

    const data = fs.readFileSync(filePath, "utf8");
    console.log("Raw settings data:", data);

    const settings = JSON.parse(data);
    console.log("Parsed settings:", settings);
    return settings;
  } catch (error) {
    console.error("Error reading settings:", error);
    return { autoUpdate: true }; // Default settings if there's an error
  }
}

ipcMain.handle("update-ascendara", async () => {
  if (isLatest) return;

  if (!updateDownloaded) {
    try {
      if (downloadUpdatePromise) {
        await downloadUpdatePromise;
      } else {
        await downloadUpdateInBackground();
      }
    } catch (error) {
      console.error("Error during update download:", error);
      return;
    }
  }

  if (updateDownloaded) {
    const tempDir = path.join(os.tmpdir(), "ascendarainstaller");
    const installerPath = path.join(tempDir, "AscendaraInstaller.exe");

    if (!fs.existsSync(installerPath)) {
      console.error("Installer not found at:", installerPath);
      return;
    }

    const installerProcess = spawn(installerPath, [], {
      detached: true,
      stdio: "ignore",
      shell: true,
    });

    installerProcess.unref();
    app.quit();
  }
});

ipcMain.handle("check-for-updates", async () => {
  if (isDev || experiment) return true;
  try {
    await checkReferenceLanguage();
    return await checkVersionAndUpdate();
  } catch (error) {
    console.error("Error checking for updates:", error);
    return true;
  }
});

ipcMain.handle("is-experiment", () => {
  return experiment;
});

ipcMain.handle("uninstall-ascendara", async () => {
  const executablePath = process.execPath;
  const executableDir = path.dirname(executablePath);
  const uninstallerPath = path.join(executableDir + "\\Uninstall Ascendara.exe");
  const timestampFilePath = path.join(
    process.env.USERPROFILE,
    "timestamp.ascendara.json"
  );
  try {
    fs.unlinkSync(timestampFilePath);
  } catch (error) {
    console.error("Error deleting timestamp file:", error);
  }
  const settingsFilePath = path.join(app.getPath("userData"), "ascendarasettings.json");
  try {
    fs.unlinkSync(settingsFilePath);
  } catch (error) {
    console.error("Error deleting settings file:", error);
  }
  shell.openExternal("https://ascendara.app/uninstall");
  const process = spawn(
    "powershell.exe",
    ["-Command", `Start-Process -FilePath "${uninstallerPath}" -Verb RunAs -Wait`],
    { shell: true }
  );
  process.on("error", error => {
    reject(error);
  });
});

// Save the custom game
ipcMain.handle(
  "save-custom-game",
  async (event, game, online, dlc, version, executable, imgID) => {
    const settings = settingsManager.getSettings();
    try {
      if (!settings.downloadDirectory) {
        console.error("Download directory not set");
        return;
      }
      const downloadDirectory = settings.downloadDirectory;
      const gamesFilePath = path.join(downloadDirectory, "games.json");
      const gamesDirectory = path.join(downloadDirectory, "games");

      // Create games directory if it doesn't exist
      if (!fs.existsSync(gamesDirectory)) {
        fs.mkdirSync(gamesDirectory, { recursive: true });
      }

      // Download and save the cover image if imgID is provided
      if (imgID) {
        const imageLink =
          settings.gameSource === "fitgirl"
            ? `https://api.ascendara.app/v2/fitgirl/image/${imgID}`
            : `https://api.ascendara.app/v2/image/${imgID}`;

        const response = await axios({
          url: imageLink,
          method: "GET",
          responseType: "arraybuffer",
        });

        // Save the image in the games directory
        const imageBuffer = Buffer.from(response.data);
        const mimeType = response.headers["content-type"];
        const extension = getExtensionFromMimeType(mimeType);
        await fs.promises.writeFile(
          path.join(gamesDirectory, `${game}.ascendara${extension}`),
          imageBuffer
        );
      }

      try {
        await fs.promises.access(gamesFilePath, fs.constants.F_OK);
      } catch (error) {
        await fs.promises.mkdir(downloadDirectory, { recursive: true });
        await fs.promises.writeFile(
          gamesFilePath,
          JSON.stringify({ games: [] }, null, 2)
        );
      }
      const gamesData = JSON.parse(await fs.promises.readFile(gamesFilePath, "utf8"));
      const newGame = {
        game: game,
        online: online,
        dlc: dlc,
        version: version,
        executable: executable,
        isRunning: false,
      };
      gamesData.games.push(newGame);
      await fs.promises.writeFile(gamesFilePath, JSON.stringify(gamesData, null, 2));
    } catch (error) {
      console.error("Error reading the settings file:", error);
    }
  }
);

ipcMain.handle("get-custom-games", () => {
  const settings = settingsManager.getSettings();
  try {
    if (!settings.downloadDirectory) {
      console.error("Download directory not set");
      return [];
    }
    const downloadDirectory = settings.downloadDirectory;
    const gamesFilePath = path.join(downloadDirectory, "games.json");
    const gamesDirectory = path.join(downloadDirectory, "games");

    try {
      const gamesData = JSON.parse(fs.readFileSync(gamesFilePath, "utf8"));

      // Add image path to each game
      const gamesWithImagePaths = gamesData.games.map(game => {
        const possibleExtensions = [".jpg", ".jpeg", ".png"];
        let imagePath = null;

        for (const ext of possibleExtensions) {
          const potentialPath = path.join(gamesDirectory, `${game.game}.ascendara${ext}`);
          if (fs.existsSync(potentialPath)) {
            imagePath = potentialPath;
            break;
          }
        }

        return {
          ...game,
          imagePath: imagePath,
        };
      });

      return gamesWithImagePaths;
    } catch (error) {
      if (error.code === "ENOENT") {
        return [];
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error("Error reading the settings file:", error);
    return [];
  }
});

ipcMain.handle("open-directory-dialog", async event => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
  });

  if (result.canceled) {
    return null;
  } else {
    return result.filePaths[0];
  }
});
// Open the file dialog in the download directory
ipcMain.handle("open-file-dialog", async (event, exePath = null) => {
  const settings = settingsManager.getSettings();
  let defaultPath = settings.downloadDirectory || app.getPath("downloads");

  if (exePath) {
    defaultPath = path.dirname(exePath);
  }

  const result = await dialog.showOpenDialog({
    defaultPath: defaultPath,
    properties: ["openFile"],
    filters: [{ name: "Executable Files", extensions: ["exe"] }],
  });

  return result.canceled ? null : result.filePaths[0];
});

// Get the download directory
ipcMain.handle("get-download-directory", () => {
  const filePath = path.join(app.getPath("userData"), "ascendarasettings.json");
  try {
    const data = fs.readFileSync(filePath, "utf8");
    const settings = JSON.parse(data);
    return settings.downloadDirectory;
  } catch (error) {
    console.error("Error reading the settings file:", error);
    return "";
  }
});

ipcMain.handle("open-game-directory", (event, game, isCustom) => {
  if (game === "local") {
    const executablePath = process.execPath;
    const executableDir = path.dirname(executablePath);
    shell.openPath(executableDir);
  }
  if (game === "workshop") {
    const steamCMDDir = path.join(os.homedir(), "ascendaraSteamcmd");
    const workshopContentPath = path.join(steamCMDDir, "steamapps/workshop/content");
    shell.openPath(workshopContentPath);
  }
  if (game === "backupDir") {
    const filePath = path.join(app.getPath("userData"), "ascendarasettings.json");
    try {
      const data = fs.readFileSync(filePath, "utf8");
      const settings = JSON.parse(data);
      if (!settings.ludusavi.backupLocation) {
        console.error("Backup directory not set");
        return;
      }
      shell.openPath(settings.ludusavi.backupLocation);
    } catch (error) {
      console.error("Error reading the settings file:", error);
    }
  } else {
    if (!isCustom) {
      const filePath = path.join(app.getPath("userData"), "ascendarasettings.json");
      try {
        const data = fs.readFileSync(filePath, "utf8");
        const settings = JSON.parse(data);
        if (!settings.downloadDirectory) {
          console.error("Download directory not set");
          return;
        }
        const downloadDirectory = settings.downloadDirectory;
        const gameDirectory = path.join(downloadDirectory, game);
        shell.openPath(gameDirectory);
      } catch (error) {
        console.error("Error reading the settings file:", error);
      }
    } else {
      const filePath = path.join(app.getPath("userData"), "ascendarasettings.json");
      try {
        const data = fs.readFileSync(filePath, "utf8");
        const settings = JSON.parse(data);
        if (!settings.downloadDirectory) {
          console.error("Download directory not set");
          return;
        }
        const downloadDirectory = settings.downloadDirectory;
        const gamesFilePath = path.join(downloadDirectory, "games.json");
        const gamesData = JSON.parse(fs.readFileSync(gamesFilePath, "utf8"));
        const gameInfo = gamesData.games.find(g => g.game === game);
        if (gameInfo) {
          const executablePath = gameInfo.executable;
          const executableDir = path.dirname(executablePath);
          shell.openPath(executableDir);
        } else {
          console.error(`Game not found in games.json: ${game}`);
        }
      } catch (error) {
        console.error("Error reading the settings file:", error);
      }
    }
  }
});

// Modify the game executable
ipcMain.handle("modify-game-executable", (event, game, executable) => {
  const filePath = path.join(app.getPath("userData"), "ascendarasettings.json");
  try {
    const data = fs.readFileSync(filePath, "utf8");
    const settings = JSON.parse(data);
    if (!settings.downloadDirectory) {
      console.error("Download directory not set");
      return;
    }
    const downloadDirectory = settings.downloadDirectory;
    const gameDirectory = path.join(downloadDirectory, game);
    const gameInfoPath = path.join(gameDirectory, `${game}.ascendara.json`);
    const gameInfoData = fs.readFileSync(gameInfoPath, "utf8");
    const gameInfo = JSON.parse(gameInfoData);
    gameInfo.executable = executable;
    fs.writeFileSync(gameInfoPath, JSON.stringify(gameInfo, null, 2));
  } catch (error) {
    console.error("Error reading the settings file:", error);
  }
});

ipcMain.handle("is-steam-running", () => {
  try {
    const processes = execSync('tasklist /fi "imagename eq steam.exe" /fo csv /nh', {
      encoding: "utf8",
    });
    return processes.toLowerCase().includes("steam.exe");
  } catch (error) {
    console.error("Error checking if Steam is running:", error);
    return false;
  }
});

ipcMain.handle(
  "play-game",
  async (event, game, isCustom = false, backupOnClose = false) => {
    try {
      const filePath = path.join(app.getPath("userData"), "ascendarasettings.json");
      const data = fs.readFileSync(filePath, "utf8");
      const settings = JSON.parse(data);

      if (!settings.downloadDirectory) {
        throw new Error("Download directory not set");
      }

      let executable;
      let gameDirectory;

      if (!isCustom) {
        gameDirectory = path.join(settings.downloadDirectory, game);
        const gameInfoPath = path.join(gameDirectory, `${game}.ascendara.json`);

        if (!fs.existsSync(gameInfoPath)) {
          throw new Error(`Game info file not found: ${gameInfoPath}`);
        }

        const gameInfoData = fs.readFileSync(gameInfoPath, "utf8");
        const gameInfo = JSON.parse(gameInfoData);

        if (!gameInfo.executable) {
          throw new Error("Executable path not found in game info");
        }

        // Check if the executable path is already absolute
        if (path.isAbsolute(gameInfo.executable)) {
          executable = gameInfo.executable;
        } else {
          executable = path.join(gameDirectory, gameInfo.executable);
        }
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

        executable = gameInfo.executable; // Custom games should already have absolute paths
        gameDirectory = path.dirname(executable);
      }

      // Validate paths
      if (!fs.existsSync(executable)) {
        throw new Error(`Game executable not found: ${executable}`);
      }

      // Check if game is already running
      if (runGameProcesses.has(game)) {
        throw new Error("Game is already running");
      }

      let handlerPath;

      if (isWindows) {
        handlerPath = path.join(appDirectory, "/resources/AscendaraGameHandler.exe");
      } else {
        // For non-Windows, we need to use python3 to execute the script
        handlerPath = "python3";
        executable = `${path.join(appDirectory, "/resources/AscendaraGameHandler.py")} ${executable}`;
      }

      if (!fs.existsSync(handlerPath)) {
        throw new Error("Game handler not found");
      }

      console.log("Launching game:", {
        handlerPath,
        executable,
        isCustom: isCustom.toString(),
        gameDirectory,
      });

      const spawnArgs = isWindows
        ? [executable, isCustom.toString(), ...(backupOnClose ? ["--ludusavi"] : [])]
        : [
            "-c",
            executable,
            isCustom.toString(),
            ...(backupOnClose ? ["--ludusavi"] : []),
          ];

      const runGame = spawn(handlerPath, spawnArgs, {
        detached: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        cwd: gameDirectory,
        shell: !isWindows, // Use shell on non-Windows platforms
      });

      // Log any output for debugging
      runGame.stdout.on("data", data => {
        console.log(`Game handler output: ${data}`);
      });

      runGame.stderr.on("data", data => {
        console.error(`Game handler error: ${data}`);
      });

      runGameProcesses.set(game, runGame);

      // Update game status to running in JSON files
      try {
        // Update settings.json
        if (!settings.runningGames) settings.runningGames = {};
        settings.runningGames[game] = true;
        fs.writeFileSync(filePath, JSON.stringify(settings, null, 2));

        // Update games.json
        const gamesPath = path.join(settings.downloadDirectory, "games.json");
        if (fs.existsSync(gamesPath)) {
          const games = JSON.parse(fs.readFileSync(gamesPath, "utf8"));
          if (games[game]) {
            games[game].running = true;
            fs.writeFileSync(gamesPath, JSON.stringify(games, null, 2));
          }
        }
      } catch (error) {
        console.error("Error updating game running status:", error);
      }

      // Set up error handler
      runGame.on("error", error => {
        console.error(`Failed to start game ${game}:`, error);
        event.sender.send("game-launch-error", { game, error: error.message });
        runGameProcesses.delete(game);
        showWindow();
      });

      // Wait a short moment to catch immediate launch errors
      await new Promise(resolve => setTimeout(resolve, 500));

      // If no immediate errors, consider it a success
      event.sender.send("game-launch-success", { game });
      hideWindow();

      // Create shortcut and mark game as launched if it's the first time
      if (!isCustom) {
        const gameInfoPath = path.join(gameDirectory, `${game}.ascendara.json`);
        const gameInfo = JSON.parse(fs.readFileSync(gameInfoPath, "utf8"));
        if (!gameInfo.hasBeenLaunched && settings.autoCreateShortcuts) {
          await createGameShortcut({
            game: game,
            name: game,
            executable: executable,
            custom: false,
          });
          gameInfo.hasBeenLaunched = true;
          fs.writeFileSync(gameInfoPath, JSON.stringify(gameInfo, null, 2));
        }
      }

      // Update Discord Rich Presence
      rpc.setActivity({
        details: "Playing a Game",
        state: `${game}`,
        startTimestamp: new Date(),
        largeImageKey: "ascendara",
        largeImageText: "Ascendara",
        buttons: [
          {
            label: "Play on Ascendara",
            url: "https://ascendara.app/",
          },
        ],
      });

      runGame.on("exit", code => {
        console.log(`Game ${game} exited with code ${code}`);

        // Update game status to not running in JSON files
        try {
          // Update settings.json
          const settings = JSON.parse(fs.readFileSync(filePath, "utf8"));
          if (settings.runningGames) {
            delete settings.runningGames[game];
            fs.writeFileSync(filePath, JSON.stringify(settings, null, 2));
          }

          // Update games.json
          const gamesPath = path.join(settings.downloadDirectory, "games.json");
          if (fs.existsSync(gamesPath)) {
            const games = JSON.parse(fs.readFileSync(gamesPath, "utf8"));
            if (games[game]) {
              games[game].running = false;
              fs.writeFileSync(gamesPath, JSON.stringify(games, null, 2));
            }
          }
        } catch (error) {
          console.error("Error updating game running status:", error);
        }

        runGameProcesses.delete(game);
        showWindow();

        // Update Discord RPC
        rpc.setActivity({
          state: "Browsing Menus...",
          largeImageKey: "ascendara",
          largeImageText: "Ascendara",
        });

        // Notify renderer that game has closed
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

// Stop the game
ipcMain.handle("stop-game", (event, game) => {
  const runGame = runGameProcesses.get(game);
  if (runGame) {
    runGame.kill();

    rpc.setActivity({
      state: "Browsing Menus...",
      largeImageKey: "ascendara",
      largeImageText: "Ascendara",
    });
  }
});

// Check if the game is running
ipcMain.handle("is-game-running", async (event, game) => {
  const runGame = runGameProcesses.get(game);
  return runGame ? true : false;
});

// Get the required libraries
ipcMain.handle("required-libraries", async (event, game) => {
  const filePath = path.join(app.getPath("userData"), "ascendarasettings.json");
  try {
    const data = fs.readFileSync(filePath, "utf8");
    const settings = JSON.parse(data);
    if (!settings.downloadDirectory) {
      console.error("Download directory not set");
      return;
    }
    const downloadDirectory = settings.downloadDirectory;
    const gameDirectory = path.join(downloadDirectory, game);
    const gameLibsPath = path.join(gameDirectory, `_CommonRedist`);
    shell.openPath(gameLibsPath);
  } catch (error) {
    console.error("Error reading the settings file:", error);
  }
});

// Delete the game
ipcMain.handle("delete-game", async (event, game) => {
  const filePath = path.join(app.getPath("userData"), "ascendarasettings.json");
  try {
    if (game === "local") {
      const timestampFilePath = path.join(
        process.env.USERPROFILE,
        "timestamp.ascendara.json"
      );
      fs.unlinkSync(timestampFilePath);
      return;
    }

    const data = fs.readFileSync(filePath, "utf8");
    const settings = JSON.parse(data);
    if (!settings.downloadDirectory) {
      console.error("Download directory not set");
      return;
    }
    const downloadDirectory = settings.downloadDirectory;
    const gameDirectory = path.join(downloadDirectory, game);
    fs.rmSync(gameDirectory, { recursive: true, force: true });
  } catch (error) {
    console.error("Error reading the settings file:", error);
  }
});

// Remove the game
ipcMain.handle("remove-game", async (event, game) => {
  const filePath = path.join(app.getPath("userData"), "ascendarasettings.json");
  try {
    const data = fs.readFileSync(filePath, "utf8");
    const settings = JSON.parse(data);
    if (!settings.downloadDirectory) {
      console.error("Download directory not set");
      return;
    }
    const downloadDirectory = settings.downloadDirectory;
    const gamesFilePath = path.join(downloadDirectory, "games.json");
    const gamesDirectory = path.join(downloadDirectory, "games");

    // Remove the game from games.json
    const gamesData = JSON.parse(fs.readFileSync(gamesFilePath, "utf8"));
    const gameIndex = gamesData.games.findIndex(g => g.game === game);
    if (gameIndex !== -1) {
      gamesData.games.splice(gameIndex, 1);
      fs.writeFileSync(gamesFilePath, JSON.stringify(gamesData, null, 2));

      // Remove the associated image file if it exists
      const possibleExtensions = [".jpg", ".jpeg", ".png"];
      for (const ext of possibleExtensions) {
        const imagePath = path.join(gamesDirectory, `${game}.ascendara${ext}`);
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
          console.log(`Removed image file: ${imagePath}`);
          break;
        }
      }
    }
  } catch (error) {
    console.error("Error reading the settings file:", error);
  }
});

// Download finished
ipcMain.handle("download-finished", async (event, game) => {
  const meiFolders = await fs.readdir(gameDirectory);
  for (const folder of meiFolders) {
    if (folder.startsWith("_MEI")) {
      const meiFolderPath = path.join(gameDirectory, folder);
      await fs.remove(meiFolderPath);
    }
  }
});

// Minimize the window
ipcMain.handle("minimize-window", () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.minimize();
});

// Maximize the window
ipcMain.handle("maximize-window", () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }
});

// Handle fullscreen toggle
ipcMain.handle("toggle-fullscreen", () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) {
    win.setFullScreen(!win.isFullScreen());
    return win.isFullScreen();
  }
  return false;
});

ipcMain.handle("get-fullscreen-state", () => {
  const win = BrowserWindow.getFocusedWindow();
  return win ? win.isFullScreen() : false;
});

const ERROR_COUNTS_FILE = path.join(app.getPath("userData"), "error-counts.json");

function getErrorCounts() {
  try {
    if (fs.existsSync(ERROR_COUNTS_FILE)) {
      const data = fs.readFileSync(ERROR_COUNTS_FILE, "utf8");
      return new Map(Object.entries(JSON.parse(data)));
    }
  } catch (error) {
    console.error("Error reading error counts:", error);
  }
  return new Map();
}

function saveErrorCounts(counts) {
  try {
    fs.writeFileSync(
      ERROR_COUNTS_FILE,
      JSON.stringify(Object.fromEntries(counts)),
      "utf8"
    );
  } catch (error) {
    console.error("Error saving error counts:", error);
  }
}

function shouldLogError(errorKey) {
  const MAX_ERROR_LOGS = 2;
  const counts = getErrorCounts();
  const count = counts.get(errorKey) || 0;
  if (count < MAX_ERROR_LOGS) {
    counts.set(errorKey, count + 1);
    saveErrorCounts(counts);
    return true;
  }
  return false;
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  // If screen height is less than 900px, likely a laptop
  const isLaptop = screenHeight < 900;

  const windowWidth = isLaptop ? Math.min(1500, screenWidth * 0.9) : 1600;
  const windowHeight = isLaptop ? Math.min(700, screenHeight * 0.9) : 800;

  const mainWindow = new BrowserWindow({
    title: "Ascendara",
    icon: path.join(__dirname, "icon.ico"),
    width: windowWidth,
    height: windowHeight,
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: true,
      contextIsolation: true,
    },
  });
  // Width, Height
  mainWindow.setMinimumSize(600, 400);

  // Only show the window when it's ready to be displayed
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindowHidden = false;
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "index.html"));
  }

  mainWindow.webContents.setWindowOpenHandler(info => {
    return { action: "deny" };
  });

  // Add window event listeners
  mainWindow.on("hide", () => {
    mainWindowHidden = true;
    console.log("Window hidden event fired");
  });

  mainWindow.on("show", () => {
    mainWindowHidden = false;
    console.log("Window shown event fired");
  });

  mainWindow.on("close", () => {
    console.log("Window close event fired");
  });

  return mainWindow;
}
// Window visibility control functions
let isHandlingProtocolUrl = false;

function hideWindow() {
  // Don't hide window if handling protocol URL
  if (isHandlingProtocolUrl) {
    console.log("Skipping window hide during protocol URL handling");
    return;
  }

  const windows = BrowserWindow.getAllWindows();
  if (windows.length > 0) {
    mainWindowHidden = true;
    windows.forEach(window => {
      window.hide();
    });
  }
}

function showWindow() {
  const windows = BrowserWindow.getAllWindows();
  if (windows.length > 0) {
    const mainWindow = windows[0];
    if (!mainWindow.isVisible()) {
      console.log("Showing window from showWindow function");
      mainWindow.show();
      mainWindowHidden = false;
    }

    // Add these lines to ensure the window is brought to the front
    if (mainWindow.isMinimized()) {
      console.log("Restoring minimized window");
      mainWindow.restore();
    }

    // Add setAlwaysOnTop temporarily to force focus
    mainWindow.setAlwaysOnTop(true);
    mainWindow.focus();
    // Remove the always on top flag after focusing
    setTimeout(() => {
      mainWindow.setAlwaysOnTop(false);
    }, 100);
  } else {
    console.log("Creating new window from showWindow function");
    createWindow();
  }
}

// Close the window
ipcMain.handle("close-window", async () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) {
    const settings = await getSettings();
    if (!settings.endOnClose) {
      mainWindowHidden = true;
      win.hide();
      console.log("Window hidden instead of closed");
    } else {
      win.close();
      // If endOnClose is true, we should make sure the app fully quits
      if (process.platform !== "darwin") {
        app.quit();
      }
    }
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    // Force quit the app to ensure all processes are terminated
    app.exit(0);
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle("welcome-complete", event => {
  // Notify all windows
  BrowserWindow.getAllWindows().forEach(window => {
    window.webContents.send("welcome-complete");
  });
});

ipcMain.handle("check-v7-welcome", async () => {
  try {
    const v7Path = path.join(app.getPath("userData"), "v7.json");
    return !fs.existsSync(v7Path);
  } catch (error) {
    console.error("Error checking v7 welcome:", error);
    return false;
  }
});

ipcMain.handle("get-asset-path", (event, filename) => {
  let assetPath;
  if (!app.isPackaged) {
    // In development
    assetPath = path.join(__dirname, "../src/public", filename);
  } else {
    // In production
    assetPath = path.join(process.resourcesPath, "public", filename);
  }

  if (!fs.existsSync(assetPath)) {
    console.error(`Asset not found: ${assetPath}`);
    return null;
  }

  // Return the raw file data as base64
  const imageBuffer = fs.readFileSync(assetPath);
  return `data:image/png;base64,${imageBuffer.toString("base64")}`;
});

ipcMain.handle("clear-cache", async () => {
  try {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      // Clear all browser data including cache, cookies, storage etc.
      await mainWindow.webContents.session.clearStorageData({
        storages: [
          "appcache",
          "cookies",
          "filesystem",
          "indexdb",
          "localstorage",
          "shadercache",
          "websql",
          "serviceworkers",
          "cachestorage",
        ],
      });

      // Clear HTTP cache specifically
      await mainWindow.webContents.session.clearCache();

      return true;
    }
    return false;
  } catch (error) {
    console.error("Error clearing cache:", error);
    return false;
  }
});

let driveSpaceCache = {
  freeSpace: 0,
  totalSpace: 0,
  lastCalculated: 0,
};

ipcMain.handle("get-drive-space", async (event, directory) => {
  try {
    // Check if we have a recent cache (less than 5 minutes old)
    const now = Date.now();
    if (driveSpaceCache.lastCalculated > now - 5 * 60 * 1000) {
      return {
        freeSpace: driveSpaceCache.freeSpace,
        totalSpace: driveSpaceCache.totalSpace,
      };
    }

    const { available, total } = await disk.check(directory);
    console.log(`Drive space for ${directory}: ${available}/${total} bytes`);

    // Update cache
    driveSpaceCache = {
      freeSpace: available,
      totalSpace: total,
      lastCalculated: now,
    };

    return { freeSpace: available, totalSpace: total };
  } catch (error) {
    console.error("Error getting drive space:", error);
    return { freeSpace: 0, totalSpace: 0 };
  }
});

// Function to pre-fetch drive space
async function fetchDriveSpace(directory) {
  try {
    const { available, total } = await disk.check(directory);
    driveSpaceCache = {
      freeSpace: available,
      totalSpace: total,
      lastCalculated: Date.now(),
    };
    return { freeSpace: available, totalSpace: total };
  } catch (error) {
    console.error("Error pre-fetching drive space:", error);
    return { freeSpace: 0, totalSpace: 0 };
  }
}

ipcMain.handle("get-platform", () => process.platform);

ipcMain.on("settings-changed", () => {
  BrowserWindow.getAllWindows().forEach(window => {
    window.webContents.send("settings-updated");
  });
});

ipcMain.handle("is-update-downloaded", () => {
  return updateDownloaded;
});

ipcMain.handle("read-file", async (event, filePath) => {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    console.error("Error reading file:", error);
    throw error;
  }
});

ipcMain.handle("write-file", async (event, filePath, content) => {
  try {
    fs.writeFileSync(filePath, content);
    return true;
  } catch (error) {
    console.error("Error writing file:", error);
    throw error;
  }
});

ipcMain.handle("launch-game", async (event, game) => {
  const filePath = path.join(app.getPath("userData"), "ascendarasettings.json");
  try {
    const data = fs.readFileSync(filePath, "utf8");
    const settings = JSON.parse(data);
    const gameData = settings.games[game];

    // Validate executable before attempting to launch
    await validateGameExecutable(gameData);

    const gameProcess = spawn(gameData.executable, [], {
      cwd: path.dirname(gameData.executable),
    });

    let hasError = false;

    gameProcess.on("error", async error => {
      hasError = true;
      await showErrorDialog(
        "Game Launch Error",
        `Failed to launch game: ${error.message}`
      );
      console.error("Game process error:", error);
    });

    // Wait a short moment to catch immediate launch errors
    await new Promise(resolve => setTimeout(resolve, 500));

    // Only hide if no immediate errors occurred
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
    await showErrorDialog("Game Launch Error", `Failed to launch game: ${error.message}`);
    console.error("Error launching game:", error);
    return false;
  }
});

async function showErrorDialog(title, message) {
  const window = BrowserWindow.getFocusedWindow();
  if (window) {
    await dialog.showMessageBox(window, {
      type: "error",
      title: title,
      message: message,
      buttons: ["OK"],
    });
  }
}

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

// Create game shortcut
async function createGameShortcut(game) {
  try {
    console.log("Creating shortcut for game:", game);
    const shortcutPath = path.join(
      os.homedir(),
      "Desktop",
      `${game.game || game.name}.lnk`
    );

    // Get game executable path
    const exePath = game.executable;
    const gameName = game.game || game.name;
    const isCustom = !!game.custom;

    if (!exePath || !fs.existsSync(exePath)) {
      throw new Error(`Game executable not found: ${exePath}`);
    }

    // Get game handler path
    const handlerPath = path.join(appDirectory, "/resources/AscendaraGameHandler.exe");
    console.log("Handler path:", handlerPath);

    if (!fs.existsSync(handlerPath)) {
      throw new Error("Game handler not found at: ${handlerPath}");
    }

    console.log("Launching game:", {
      handlerPath,
      executable: exePath,
      isCustom: isCustom.toString(),
      gameDirectory: path.dirname(handlerPath),
    });

    // PowerShell script to create shortcut
    const psScript = `
      $WScriptShell = New-Object -ComObject WScript.Shell
      $Shortcut = $WScriptShell.CreateShortcut("${shortcutPath}")
      $Shortcut.TargetPath = "${handlerPath}"
      $Shortcut.Arguments = '"${exePath}" ${isCustom ? 1 : 0} "--shortcut"'
      $Shortcut.WorkingDirectory = "${path.dirname(handlerPath)}"
      $Shortcut.IconLocation = "${exePath},0"
      $Shortcut.Save()
    `;

    // Save PowerShell script to temp file
    const psPath = path.join(os.tmpdir(), "createShortcut.ps1");
    fs.writeFileSync(psPath, psScript);

    // Execute PowerShell script
    await new Promise((resolve, reject) => {
      const process = spawn(
        "powershell.exe",
        ["-ExecutionPolicy", "Bypass", "-File", psPath],
        { windowsHide: true }
      );

      process.on("error", error => {
        reject(error);
      });
      process.on("exit", code => {
        fs.unlinkSync(psPath); // Clean up temp file
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

// Handle shortcut creation request
ipcMain.handle("create-game-shortcut", async (event, game) => {
  if (isWindows) {
    return await createGameShortcut(game);
  } else {
    console.error("Shortcut creation not supported on this platform");
    return false;
  }
});

ipcMain.handle("check-file-exists", async (event, execPath) => {
  try {
    const filePath = path.join(app.getPath("userData"), "ascendarasettings.json");
    const data = fs.readFileSync(filePath, "utf8");
    const settings = JSON.parse(data);

    if (!settings.downloadDirectory) {
      return false;
    }

    let executable;
    if (path.isAbsolute(execPath)) {
      executable = execPath;
    } else {
      executable = path.join(settings.downloadDirectory, execPath);
    }

    return fs.existsSync(executable);
  } catch (error) {
    console.error("Error checking executable:", error);
    return false;
  }
});

function launchCrashReporter(errorCode, errorMessage) {
  try {
    const crashReporterPath = path.join(".", "AscendaraCrashReporter.exe");
    if (fs.existsSync(crashReporterPath)) {
      spawn(crashReporterPath, ["mainapp", errorCode.toString(), errorMessage], {
        detached: true,
        stdio: "ignore",
      }).unref();
    } else {
      console.error(`Crash reporter not found at: ${crashReporterPath}`);
    }
  } catch (error) {
    console.error("Failed to launch crash reporter:", error);
  }
}

process.on("uncaughtException", error => {
  console.error("Uncaught Exception:", error);
  launchCrashReporter(1000, error.message || "Unknown error occurred");
  app.quit();
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  launchCrashReporter(1002, reason?.message || "Unhandled promise rejection");
  app.quit();
});

// Handle the protocol URL
let lastHandledUrl = null;
let lastHandleTime = 0;
let pendingUrls = new Set();
const URL_DEBOUNCE_TIME = 2000; // 2 seconds

function handleProtocolUrl(url) {
  if (!url) return;

  // Ensure proper URL format
  const cleanUrl = url.trim();
  if (!cleanUrl.startsWith("ascendara://")) return;

  // Get all windows and find Ascendara window
  const existingWindow = BrowserWindow.getAllWindows().find(win => win);

  // If no window exists, store URL and create window
  if (!existingWindow) {
    pendingUrls.add(cleanUrl);
    createWindow();
    return;
  }

  // Show and focus window
  if (existingWindow.isMinimized()) existingWindow.restore();
  existingWindow.focus();

  try {
    // Set flag to prevent window hiding
    isHandlingProtocolUrl = true;

    // Only send if it's a new URL or enough time has passed
    const currentTime = Date.now();
    if (cleanUrl !== lastHandledUrl || currentTime - lastHandleTime > URL_DEBOUNCE_TIME) {
      lastHandledUrl = cleanUrl;
      lastHandleTime = currentTime;

      // Check if this is a game URL
      if (cleanUrl.includes("game")) {
        try {
          // Extract the ID, removing any query parameters
          const imageId = cleanUrl.split("?").pop().replace("/", "");
          if (imageId) {
            console.log("Sending game URL to renderer with imageId:", imageId);
            existingWindow.webContents.send("protocol-game-url", { imageId });
          }
        } catch (error) {
          console.error("Error parsing game URL:", error);
        }
      } else {
        // Handle existing download protocol
        console.log("Sending download URL to renderer:", cleanUrl);
        existingWindow.webContents.send("protocol-download-url", cleanUrl);
      }
    }

    // Reset flag after a delay
    setTimeout(() => {
      isHandlingProtocolUrl = false;
    }, 1000);
  } catch (error) {
    console.error("Error handling protocol URL:", error);
    isHandlingProtocolUrl = false;
  }

  // Clear pending URLs since we've handled this one
  pendingUrls.clear();
}

// Register IPC handler for renderer to request pending URLs
ipcMain.handle("get-pending-urls", () => {
  const urls = Array.from(pendingUrls);
  pendingUrls.clear();
  return urls;
});

// Single instance lock check
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log("Another instance is running, quitting this instance");
  app.exit(0);
} else {
  // Register protocol handler
  if (process.defaultApp || isDev) {
    app.setAsDefaultProtocolClient("ascendara", process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  } else {
    app.setAsDefaultProtocolClient("ascendara");
  }

  // Handle second instance
  app.on("second-instance", (event, commandLine, workingDirectory) => {
    console.log("Second instance detected with args:", commandLine);

    // Check for protocol URL
    const protocolUrl = commandLine.find(arg => arg.startsWith("ascendara://"));

    if (protocolUrl) {
      handleProtocolUrl(protocolUrl);
    }

    // Find all windows
    const windows = BrowserWindow.getAllWindows();

    if (windows.length > 0) {
      const mainWindow = windows[0];

      // Force show the window regardless of its current state
      mainWindowHidden = false;

      // If the window is hidden, show it
      if (!mainWindow.isVisible()) {
        mainWindow.show();
      }

      // If minimized, restore
      if (mainWindow.isMinimized()) {
        console.log("Restoring minimized window");
        mainWindow.restore();
      }

      // Force focus by temporarily setting alwaysOnTop
      mainWindow.setAlwaysOnTop(true);
      mainWindow.focus();
      mainWindow.center(); // Center the window on screen
      setTimeout(() => {
        mainWindow.setAlwaysOnTop(false);
      }, 100);

      // Emit an event to the renderer process to notify it that the window was shown due to a second instance
      mainWindow.webContents.send("second-instance-detected");
    } else {
      // No windows found, create a new one
      console.log("No windows found, creating new window");
      createWindow();
    }
  });

  // Handle protocol URLs
  app.on("open-url", (event, url) => {
    event.preventDefault();
    handleProtocolUrl(url);
  });

  // Setup on app ready
  app.whenReady().then(() => {
    // Register protocol handler
    if (process.platform === "darwin") {
      app.setAsDefaultProtocolClient("ascendara");
    } else {
      protocol.registerHttpProtocol("ascendara", (request, callback) => {
        handleProtocolUrl(request.url);
      });
      // Handle macOS protocol activation
      app.on("open-url", (event, url) => {
        event.preventDefault();
        handleProtocolUrl(url);
      });
    }

    // Check first instance protocol URL
    const protocolUrl = process.argv.find(arg => arg.startsWith("ascendara://"));
    if (protocolUrl) {
      handleProtocolUrl(protocolUrl);
    }
  });

  // Cleanup on app quit
  app.on("window-all-closed", () => {
    pendingUrls.clear();
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  // Handle activation
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}

ipcMain.handle("get-launch-count", () => {
  try {
    if (fs.existsSync(TIMESTAMP_FILE)) {
      const timestamp = JSON.parse(fs.readFileSync(TIMESTAMP_FILE, "utf8"));
      return timestamp.launchCount || 0;
    }
    return 0;
  } catch (error) {
    console.error("Error reading launch count:", error);
    return 0;
  }
});

ipcMain.handle("get-local-crack-directory", () => {
  const filePath = path.join(app.getPath("userData"), "ascendarasettings.json");
  const steamEmuPathGoldberg = path.join(
    os.homedir(),
    "AppData",
    "Roaming",
    "Goldberg SteamEmu Saves",
    "settings"
  );

  let settings;
  try {
    const data = fs.readFileSync(filePath, "utf8");
    settings = JSON.parse(data);
  } catch (error) {
    console.error("Error reading local crack settings:", error);
    settings = {};
  }

  if (!settings.crackDirectory) {
    settings.crackDirectory = steamEmuPathGoldberg;
  }

  try {
    fs.writeFileSync(filePath, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error("Error writing local crack settings:", error);
    return null;
  }

  return settings.crackDirectory;
});

ipcMain.handle("get-system-username", () => {
  try {
    return os.userInfo().username;
  } catch (error) {
    console.error("Error getting system username:", error);
    return null;
  }
});

ipcMain.handle("set-local-crack-directory", (event, directory) => {
  const filePath = path.join(app.getPath("userData"), "ascendarasettings.json");
  try {
    let settings = {};
    if (fs.existsSync(filePath)) {
      settings = JSON.parse(fs.readFileSync(filePath, "utf8"));
    }
    settings.crackDirectory = directory;
    fs.writeFileSync(filePath, JSON.stringify(settings, null, 2));
    return true;
  } catch (error) {
    console.error("Error setting crack directory:", error);
    return false;
  }
});

ipcMain.handle("get-local-crack-username", () => {
  const filePath = path.join(app.getPath("userData"), "ascendarasettings.json");
  const settings = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const steamEmuPathGoldberg = settings.crackDirectory;

  try {
    if (fs.existsSync(steamEmuPathGoldberg)) {
      const accountNamePath = path.join(steamEmuPathGoldberg, "account_name.txt");
      if (fs.existsSync(accountNamePath)) {
        const accountName = fs.readFileSync(accountNamePath, "utf8").trim();
        return accountName;
      }
    }
  } catch (error) {
    console.error("Error reading local crack username:", error);
  }
  return null;
});

ipcMain.handle("set-local-crack-username", (event, username) => {
  const filePath = path.join(app.getPath("userData"), "ascendarasettings.json");
  try {
    const settings = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const steamEmuPathGoldberg = settings.crackDirectory;

    if (!fs.existsSync(steamEmuPathGoldberg)) {
      fs.mkdirSync(steamEmuPathGoldberg, { recursive: true });
    }

    const accountNamePath = path.join(steamEmuPathGoldberg, "account_name.txt");
    fs.writeFileSync(accountNamePath, username);
    return true;
  } catch (error) {
    console.error("Error setting crack username:", error);
    return false;
  }
});

// Translation process management
let currentTranslationProcess = null;
const TRANSLATION_PROGRESS_FILE = path.join(
  os.homedir(),
  "translation_progress.ascendara.json"
);

// Handle translation start
ipcMain.handle("start-translation", async (event, langCode) => {
  try {
    // Don't start a new translation if one is in progress
    if (currentTranslationProcess) {
      throw new Error("A translation is already in progress");
    }

    // Ensure the progress file exists with initial state
    await fs.writeJson(TRANSLATION_PROGRESS_FILE, {
      languageCode: langCode,
      phase: "starting",
      progress: 0,
      timestamp: Date.now(),
    });

    const translationExePath = isDev
      ? path.join(
          "./binaries/AscendaraLanguageTranslation/dist/AscendaraLanguageTranslation.exe"
        )
      : path.join(appDirectory, "/resources/AscendaraLanguageTranslation.exe");

    if (!fs.existsSync(translationExePath)) {
      console.error("Translation executable not found at:", translationExePath);
      event.sender.send("translation-progress", {
        languageCode: langCode,
        phase: "error",
        progress: 0,
        error: "Translation executable not found",
        timestamp: Date.now(),
      });
      return false;
    }

    console.log("Starting translation process with executable:", translationExePath);

    // Start the translation process
    currentTranslationProcess = spawn(translationExePath, [langCode], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Monitor process output
    currentTranslationProcess.stdout.on("data", data => {
      console.log(`Translation stdout: ${data}`);
    });

    currentTranslationProcess.stderr.on("data", data => {
      console.error(`Translation stderr: ${data}`);
    });

    // Set up progress monitoring
    const progressInterval = setInterval(async () => {
      try {
        if (fs.existsSync(TRANSLATION_PROGRESS_FILE)) {
          const progress = await fs.readJson(TRANSLATION_PROGRESS_FILE);
          event.sender.send("translation-progress", progress);

          // Clean up if completed or error
          if (progress.phase === "completed" || progress.phase === "error") {
            clearInterval(progressInterval);
            currentTranslationProcess = null;
          }
        }
      } catch (error) {
        console.error("Error reading translation progress:", error);
      }
    }, 100);

    // Handle process completion
    currentTranslationProcess.on("close", code => {
      console.log(`Translation process exited with code ${code}`);
      clearInterval(progressInterval);

      if (code === 0) {
        event.sender.send("translation-progress", {
          languageCode: langCode,
          phase: "completed",
          progress: 1,
          timestamp: Date.now(),
        });
      } else {
        event.sender.send("translation-progress", {
          languageCode: langCode,
          phase: "error",
          progress: 0,
          timestamp: Date.now(),
        });
      }

      currentTranslationProcess = null;
    });

    return true;
  } catch (error) {
    console.error("Failed to start translation:", error);
    event.sender.send("translation-progress", {
      languageCode: langCode,
      phase: "error",
      progress: 0,
      error: error.message,
      timestamp: Date.now(),
    });
    return false;
  }
});

// Handle translation cancellation
ipcMain.handle("cancel-translation", async () => {
  if (currentTranslationProcess) {
    currentTranslationProcess.kill();
    currentTranslationProcess = null;
    return true;
  }
  return false;
});

// Get language file
ipcMain.handle("get-language-file", async (event, languageCode) => {
  try {
    const filePath = path.join(LANG_DIR, `${languageCode}.json`);
    if (await fs.pathExists(filePath)) {
      return await fs.readJson(filePath);
    }
    return null;
  } catch (error) {
    console.error("Error reading language file:", error);
    throw error;
  }
});

ipcMain.handle("get-downloaded-languages", async () => {
  try {
    if (!(await fs.pathExists(LANG_DIR))) {
      await fs.ensureDir(LANG_DIR);
      return [];
    }

    const files = await fs.readdir(LANG_DIR);
    return files
      .filter(file => file.endsWith(".json"))
      .map(file => file.replace(".json", ""));
  } catch (error) {
    console.error("Error getting downloaded languages:", error);
    return [];
  }
});

ipcMain.handle("language-file-exists", async (event, filename) => {
  try {
    const filePath = path.join(LANG_DIR, filename);
    return await fs.pathExists(filePath);
  } catch (error) {
    console.error("Error checking language file:", error);
    return false;
  }
});

// Translation progress file watcher
let translationWatcher = null;

function startTranslationWatcher(window) {
  if (translationWatcher) {
    translationWatcher.close();
  }

  // Ensure the directory exists before watching
  const dir = path.dirname(TRANSLATION_PROGRESS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  try {
    translationWatcher = fs.watch(dir, (eventType, filename) => {
      if (filename === "translation_progress.ascendara.json") {
        try {
          if (fs.existsSync(TRANSLATION_PROGRESS_FILE)) {
            const progress = JSON.parse(
              fs.readFileSync(TRANSLATION_PROGRESS_FILE, "utf8")
            );
            window.webContents.send("translation-progress", progress);
          }
        } catch (error) {
          console.error("Error reading translation progress:", error);
        }
      }
    });
  } catch (error) {
    console.error("Error setting up translation progress watcher:", error);
  }
}

// IPC handlers for translation watcher
ipcMain.handle("start-translation-watcher", event => {
  startTranslationWatcher(BrowserWindow.fromWebContents(event.sender));
});

ipcMain.handle("stop-translation-watcher", () => {
  if (translationWatcher) {
    translationWatcher.close();
    translationWatcher = null;
  }
});

// Add qBittorrent IPC handlers
const qbittorrentClient = axios.create({
  baseURL: "http://localhost:8080/api/v2",
  withCredentials: true,
});

let qbittorrentSID = null;

ipcMain.handle("qbittorrent:login", async (event, { username, password }) => {
  try {
    console.log("[qbitMain] Attempting login...");
    const response = await qbittorrentClient.post(
      "/auth/login",
      `username=${username}&password=${password}`,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: "http://localhost:8080",
          Origin: "http://localhost:8080",
        },
      }
    );

    console.log("[qbitMain] Login response status:", response.status);
    console.log("[qbitMain] Login response data:", response.data);
    console.log("[qbitMain] Login response headers:", response.headers);

    // Extract and store the SID cookie
    const setCookie = response.headers["set-cookie"];
    if (setCookie && setCookie[0]) {
      const match = setCookie[0].match(/SID=([^;]+)/);
      if (match) {
        qbittorrentSID = match[1];
        console.log("[qbitMain] Extracted SID:", qbittorrentSID);
      }
    }

    return { success: true, data: response.data };
  } catch (error) {
    console.error("[qbitMain] Login error:", error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data || error.message,
    };
  }
});

ipcMain.handle("qbittorrent:version", async () => {
  try {
    console.log("[qbitMain] Fetching version...");
    if (!qbittorrentSID) {
      throw new Error("No SID available - please login first");
    }

    const response = await qbittorrentClient.get("/app/version", {
      headers: {
        Referer: "http://localhost:8080",
        Origin: "http://localhost:8080",
        Cookie: `SID=${qbittorrentSID}`,
      },
    });

    console.log("[qbitMain] Version response status:", response.status);
    console.log("[qbitMain] Version response data:", response.data);

    return { success: true, version: response.data.replace(/['"]+/g, "") };
  } catch (error) {
    console.error("[qbitMain] Version error:", error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data || error.message,
    };
  }
});

// Cache for directory sizes
let dirSizeCache = {
  size: 0,
  lastCalculated: 0,
  calculating: false,
};

// Calculate directory size with improved performance
async function calculateDirSize(dirPath) {
  let totalSize = 0;

  // Use a stack-based approach instead of recursion to prevent stack overflow
  const pendingDirs = [dirPath];

  while (pendingDirs.length > 0) {
    const currentDir = pendingDirs.pop();

    try {
      const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        try {
          if (entry.isDirectory()) {
            pendingDirs.push(fullPath);
          } else if (entry.isFile()) {
            const stats = await fs.promises.stat(fullPath);
            totalSize += stats.size;
          }
        } catch (err) {
          // Skip files with permission issues
          console.warn(`Error accessing ${fullPath}: ${err.message}`);
        }
      }

      // Yield to event loop to prevent blocking
      await new Promise(resolve => setImmediate(resolve));
    } catch (err) {
      console.warn(`Error reading directory ${currentDir}: ${err.message}`);
    }
  }

  return totalSize;
}

// Get total size of installed games from actual directory sizes
ipcMain.handle("get-installed-games-size", async event => {
  try {
    const settings = settingsManager.getSettings();
    const downloadDirectory = settings.downloadDirectory;

    if (!downloadDirectory || !fs.existsSync(downloadDirectory)) {
      return { success: false, error: "Download directory not found" };
    }

    // If we're already calculating, return a special status
    if (dirSizeCache.calculating) {
      return { success: true, calculating: true };
    }

    // Use cache if it's recent (last 5 minutes)
    const cacheAge = Date.now() - dirSizeCache.lastCalculated;
    if (dirSizeCache.lastCalculated > 0 && cacheAge < 5 * 60 * 1000) {
      return { success: true, totalSize: dirSizeCache.size, calculating: false };
    }

    // Start calculation in background
    dirSizeCache.calculating = true;
    event.sender.send("directory-size-status", { calculating: true });

    // Use setImmediate to not block the main thread
    setImmediate(async () => {
      try {
        const totalSize = await calculateDirSize(downloadDirectory);

        // Update cache
        dirSizeCache = {
          size: totalSize,
          lastCalculated: Date.now(),
          calculating: false,
        };

        event.sender.send("directory-size-status", { calculating: false });
        console.log(`Actual download directory size: ${totalSize} bytes`);
      } catch (error) {
        dirSizeCache.calculating = false;
        event.sender.send("directory-size-status", { calculating: false });
        console.error("Error calculating directory size:", error);
      }
    });

    return { success: true, calculating: true };
  } catch (error) {
    dirSizeCache.calculating = false;
    event.sender.send("directory-size-status", { calculating: false });
    console.error("Error getting installed games size:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Prints a stylish intro in the terminal when starting the development build
 * @param {string} appVersion - The current version of the application
 * @param {string} nodeEnv - The current Node environment
 * @param {boolean} isDev - Whether the app is running in development mode
 */
function printDevModeIntro(appVersion, nodeEnv, isDev = true) {
  // Clear the console
  console.clear();

  const hostname = os.hostname();
  const platform = os.platform();
  const release = os.release();
  const arch = os.arch();
  const localIp = ip.address();

  // ANSI color codes for simple coloring
  const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    underscore: "\x1b[4m",
    blink: "\x1b[5m",
    reverse: "\x1b[7m",
    hidden: "\x1b[8m",

    black: "\x1b[30m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",

    bgBlack: "\x1b[40m",
    bgRed: "\x1b[41m",
    bgGreen: "\x1b[42m",
    bgYellow: "\x1b[43m",
    bgBlue: "\x1b[44m",
    bgMagenta: "\x1b[45m",
    bgCyan: "\x1b[46m",
    bgWhite: "\x1b[47m",
  };

  // Title with decoration
  console.log("");
  console.log(
    `${colors.cyan}${colors.bright}  ╔═══════════════════════════════════════════╗${colors.reset}`
  );
  console.log(
    `${colors.cyan}${colors.bright}  ║           ASCENDARA DEVELOPER MODE        ║${colors.reset}`
  );
  console.log(
    `${colors.cyan}${colors.bright}  ║           Version: ${appVersion} (${nodeEnv})${" ".repeat(Math.max(0, 15 - appVersion.length - nodeEnv.length))}    ║${colors.reset}`
  );
  console.log(
    `${colors.cyan}${colors.bright}  ╚═══════════════════════════════════════════╝${colors.reset}`
  );
  console.log("");

  // System Information
  console.log(`${colors.green}  💻 SYSTEM INFORMATION${colors.reset}`);
  console.log(`    OS: ${platform} ${release} (${arch})`);
  console.log(`    Hostname: ${hostname}`);
  console.log("");

  // Network Information
  console.log(`${colors.blue}  🌐 NETWORK INFORMATION${colors.reset}`);
  console.log(`    Local IP: ${localIp}`);
  console.log(`    Connect: http://${localIp}`);
  console.log("");

  // Developer Tools
  console.log(`${colors.magenta}  🛠️  DEVELOPER TOOLS${colors.reset}`);
  console.log("    • Press Ctrl+C to exit developer mode");
  console.log("    • View logs in console for debugging");
  console.log("");

  // Documentation
  console.log(`${colors.yellow}  📚 DOCUMENTATION${colors.reset}`);
  console.log("    • Docs: https://ascendara.app/docs");
  console.log("");

  // Warning if not in dev mode (at the bottom)
  if (!isDev) {
    console.log("");
    console.log(
      `${colors.yellow}${colors.bright}  ⚠️  WARNING: NOT RUNNING IN DEVELOPER MODE ⚠️${colors.reset}`
    );
    console.log(
      `${colors.yellow}${colors.bright}  The app will not load correctly unless isDev is set to true.${colors.reset}`
    );
    console.log(
      `${colors.yellow}${colors.bright}  Please restart the application in developer mode.${colors.reset}`
    );
    console.log("");
  }
}
