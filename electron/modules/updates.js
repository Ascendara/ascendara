/**
 * Updates Module
 * Handles application update checking and downloading
 */

const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const axios = require("axios");
const { spawn } = require("child_process");
const { ipcMain, BrowserWindow, app } = require("electron");
const {
  appVersion,
  isDev,
  isWindows,
  TIMESTAMP_FILE,
  LANG_DIR,
  appDirectory,
  getPythonPath,
} = require("./config");
const { updateTimestampFile } = require("./utils");
const { getSettingsManager } = require("./settings");

let isLatest = true;
let updateDownloaded = false;
let notificationShown = false;
let updateDownloadInProgress = false;
let downloadUpdatePromise = null;
let isBrokenVersion = false;

/**
 * Check if current version is broken
 */
async function checkBrokenVersion() {
  try {
    const response = await axios.get("https://api.ascendara.app/app/brokenversions");
    const brokenVersions = response.data;
    isBrokenVersion = brokenVersions.includes(appVersion);
    console.log(
      `Current version ${appVersion} is ${isBrokenVersion ? "broken" : "not broken"}`
    );
  } catch (error) {
    console.error("Error checking for broken versions:", error);
  }
}

/**
 * Get settings helper
 */
async function getSettings() {
  try {
    const filePath = path.join(app.getPath("userData"), "ascendarasettings.json");
    console.log("Reading settings from:", filePath);

    if (!fs.existsSync(filePath)) {
      console.log("Settings file does not exist");
      return { autoUpdate: true };
    }

    const data = fs.readFileSync(filePath, "utf8");
    const settings = JSON.parse(data);
    return settings;
  } catch (error) {
    console.error("Error reading settings:", error);
    return { autoUpdate: true };
  }
}

/**
 * Check version and update if needed
 */
async function checkVersionAndUpdate() {
  try {
    const settings = await getSettings();
    const currentBranch = settings.appBranch || "live";

    let latestVersion;

    if (currentBranch === "live") {
      const response = await axios.get("https://api.ascendara.app/");
      latestVersion = response.data.appVer;
    } else {
      // For public-testing and experimental, check branch-specific versions
      // If the branch no longer exists or version matches live, treat as up-to-date
      try {
        const response = await axios.get("https://api.ascendara.app/branch-versions");
        const branchData = response.data;
        latestVersion = branchData[currentBranch] || branchData.live || appVersion;
      } catch {
        // Fallback to live API if branch-versions endpoint fails
        const response = await axios.get("https://api.ascendara.app/");
        latestVersion = response.data.appVer;
      }
    }

    isLatest = latestVersion === appVersion;
    console.log(
      `Version check [${currentBranch}]: Current=${appVersion}, Latest=${latestVersion}, Is Latest=${isLatest}`
    );
    if (!isLatest) {
      if (settings.autoUpdate && !updateDownloadInProgress) {
        // Start background download
        downloadUpdatePromise = downloadUpdateInBackground();
      } else if (!settings.autoUpdate && !notificationShown) {
        // Show update available notification
        notificationShown = true;
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

/**
 * Check reference language version
 */
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
    const extraLangVer = timestamp["extraLangVer"];
    const langVerResponse = await axios.get(`https://api.ascendara.app/language/version`);
    console.log(
      "Lang Version Check: Current=",
      extraLangVer,
      " Latest=",
      langVerResponse.data.version
    );
    const langVer = langVerResponse.data.version;
    if (langVer !== extraLangVer) {
      await getNewLangKeys();
    }
  } catch (error) {
    console.error("Error checking reference language:", error);
  }
}

/**
 * Get new language keys and translate
 */
async function getNewLangKeys() {
  try {
    // Ensure the languages directory exists in AppData Local
    if (!fs.existsSync(LANG_DIR)) {
      fs.mkdirSync(LANG_DIR, { recursive: true });
      return;
    }

    // Get all language files from the languages directory
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
          let translatorExePath;
          let args;
          if (isWindows) {
            translatorExePath = isDev
              ? path.join(
                  "./binaries/AscendaraLanguageTranslation/dist/AscendaraLanguageTranslation.exe"
                )
              : path.join(appDirectory, "/resources/AscendaraLanguageTranslation.exe");
            args = [langCode, "--updateKeys"];
          } else if (isDev) {
            translatorExePath = getPythonPath();
            args = [
              "./binaries/AscendaraLanguageTranslation/src/AscendaraLanguageTranslation.py",
              langCode,
              "--updateKeys",
            ];
          } else {
            translatorExePath = path.join(
              appDirectory,
              "/resources/AscendaraLanguageTranslation"
            );
            args = [langCode, "--updateKeys"];
          }

          // Add each missing key as a separate --newKey argument
          missing.forEach(key => {
            args.push("--newKey", key);
          });

          // Start the translation process
          const translationProcess = spawn(translatorExePath, args, {
            stdio: ["ignore", "pipe", "pipe"],
            shell: !isWindows,
          });

          translationProcess.stdout.on("data", data => {
            console.log(`Translation stdout: ${data}`);
          });

          translationProcess.stderr.on("data", data => {
            console.error(`Translation stderr: ${data}`);
          });

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

/**
 * Download update in background
 */
async function downloadUpdateInBackground() {
  if (updateDownloadInProgress) return;
  updateDownloadInProgress = true;

  try {
    // Set downloadingUpdate to true in timestamp
    updateTimestampFile({
      downloadingUpdate: true,
    });

    // Custom headers for app identification
    const headers = {
      "X-Ascendara-Client": "app",
      "X-Ascendara-Version": appVersion,
      "X-Ascendara-Platform": isWindows ? "windows" : "linux",
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
      });

      // Get total size from content-length header
      const totalSize = parseInt(response.headers["content-length"], 10) || 0;
      let downloadedSize = 0;

      // Track progress from the stream
      response.data.on("data", chunk => {
        downloadedSize += chunk.length;
        if (totalSize > 0) {
          const progress = Math.round((downloadedSize * 100) / totalSize);
          mainWindow.webContents.send("update-download-progress", progress);
        }
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
    updateTimestampFile({
      downloadingUpdate: false,
    });

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

/**
 * Register update-related IPC handlers
 */
function registerUpdateHandlers() {
  ipcMain.handle("check-for-updates", async () => {
    if (isDev) return true;
    try {
      await checkReferenceLanguage();
      return await checkVersionAndUpdate();
    } catch (error) {
      console.error("Error checking for updates:", error);
      return true;
    }
  });

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

  ipcMain.handle("is-update-downloaded", () => {
    return updateDownloaded;
  });

  ipcMain.handle("is-broken-version", () => {
    return isBrokenVersion;
  });

  ipcMain.handle("switch-branch", async (_, branch) => {
    const branchUrls = {
      live: "https://lfs.ascendara.app/download?update",
      "public-testing": "https://lfs.ascendara.app/download?branch=public-testing",
      experimental: "https://lfs.ascendara.app/download?branch=experimental",
    };

    const url = branchUrls[branch];
    if (!url) return { success: false, error: "Unknown branch" };

    try {
      const headers = {
        "X-Ascendara-Client": "app",
        "X-Ascendara-Version": appVersion,
        "X-Ascendara-Platform": isWindows ? "windows" : "linux",
      };

      const tempDir = path.join(os.tmpdir(), "ascendarainstaller");
      const installerPath = path.join(tempDir, "AscendaraBranchInstaller.exe");

      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
      }

      const mainWindow = BrowserWindow.getAllWindows()[0];

      const writer = fs.createWriteStream(installerPath);

      const response = await axios({
        url,
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
      });

      const totalSize = parseInt(response.headers["content-length"], 10) || 0;
      let downloadedSize = 0;

      response.data.on("data", chunk => {
        downloadedSize += chunk.length;
        if (totalSize > 0) {
          const progress = Math.round((downloadedSize * 100) / totalSize);
          mainWindow?.webContents.send("branch-switch-progress", progress);
        }
      });

      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
      });

      const installerProcess = spawn(installerPath, [], {
        detached: true,
        stdio: "ignore",
        shell: true,
      });

      installerProcess.unref();

      const settingsManager = getSettingsManager();
      if (settingsManager) {
        const currentSettings = settingsManager.getSettings();
        settingsManager.saveSettings({ ...currentSettings, appBranch: branch });
      }

      app.quit();

      return { success: true };
    } catch (error) {
      console.error("Error switching branch:", error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = {
  checkBrokenVersion,
  checkVersionAndUpdate,
  checkReferenceLanguage,
  downloadUpdateInBackground,
  registerUpdateHandlers,
  getIsLatest: () => isLatest,
  getUpdateDownloaded: () => updateDownloaded,
};
