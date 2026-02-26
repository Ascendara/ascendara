/**
 * Configuration and Constants Module
 * Contains app configuration, API keys, and constant values
 */

const path = require("path");
const os = require("os");
const fs = require("fs");
const { app } = require("electron");

// Environment detection
const isDev = !app.isPackaged;
const isWindows = os.platform().startsWith("win");
const isMac = process.platform === "darwin";
const isLinux = process.platform === "linux";

// Linux-specific paths
const linuxConfigDir = isLinux ? path.join(os.homedir(), ".ascendara") : null;
const linuxCompatDataDir = isLinux ? path.join(linuxConfigDir, "compatdata") : null;
const linuxRunnersDir = isLinux ? path.join(linuxConfigDir, "runners") : null;

// Steam common paths for Proton detection
const STEAM_COMMON_PATHS = isLinux
  ? [
      path.join(os.homedir(), ".steam/root/steamapps/common"),
      path.join(os.homedir(), ".steam/steam/steamapps/common"),
      path.join(os.homedir(), ".local/share/Steam/steamapps/common"),
      path.join(
        os.homedir(),
        ".var/app/com.valvesoftware.Steam/data/Steam/steamapps/common"
      ),
    ]
  : [];

const STEAM_INSTALL_PATHS = isLinux
  ? [
      path.join(os.homedir(), ".steam/steam"),
      path.join(os.homedir(), ".steam/root"),
      path.join(os.homedir(), ".local/share/Steam"),
      path.join(os.homedir(), ".var/app/com.valvesoftware.Steam/data/Steam"),
    ]
  : [];

// File paths
const TIMESTAMP_FILE = !isWindows
  ? path.join(os.homedir(), "timestamp.ascendara.json")
  : path.join(process.env.USERPROFILE, "timestamp.ascendara.json");

const LANG_DIR = isWindows
  ? path.join(process.env.LOCALAPPDATA, "Ascendara", "languages")
  : path.join(os.homedir(), ".ascendara", "languages");

const appDirectory = path.join(path.dirname(app.getPath("exe")));

// Load production config
let config;
try {
  config = require("../config.prod.js");
} catch (e) {
  config = {};
}

// API Keys
// NOTE: Sensitive keys have been moved to backend (api.ascendara.app)
// These are kept for backward compatibility but will be null/undefined
const APIKEY = process.env.REACT_APP_AUTHORIZATION || config.AUTHORIZATION || null;
const analyticsAPI =
  process.env.REACT_APP_ASCENDARA_API_KEY || config.ASCENDARA_API_KEY || null;
const steamWebApiKey = null; // Now handled by backend proxy
const steamGridDbApiKey = null; // Now handled by backend proxy
const imageKey = process.env.REACT_APP_IMAGE_KEY || config.IMAGE_KEY || null;
const clientId = process.env.REACT_APP_DISCKEY || config.DISCKEY;

// Returns the Python interpreter path: venv if set up, otherwise system python3
function getPythonPath() {
  if (isWindows) return "python";
  const venvPython = path.join(os.homedir(), ".ascendara", "venv", "bin", "python3");
  return fs.existsSync(venvPython) ? venvPython : "python3";
}

// Tool executables mapping
const toolExecutables = {
  torrent: "AscendaraTorrentHandler.exe",
  translator: "AscendaraLanguageTranslation.exe",
  ludusavi: "ludusavi.exe",
};

// Dependency registry paths for Windows
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

// ============================================================================
// APP VERSION IDENTIFIERS - DO NOT MODIFY MANUALLY
// ============================================================================
// These values are CRITICAL to app functionality and update system.
// Modifying these values manually WILL cause:
//   - Update system failures and broken version detection
//   - Branch switching to malfunction
//   - Potential data corruption or app crashes
//   - Users stuck on wrong branches unable to update
//
// These values should ONLY be changed by:
//   1. Automated build scripts for production releases
//   2. Branch-specific build processes (experimental/public-testing)
//
// In development mode, appBranch MUST remain "live" to prevent conflicts.
// ============================================================================

const appBranch = "live";
const appVersion = "10.2.2";
const testingVersion = "";

module.exports = {
  appVersion,
  appBranch,
  testingVersion,
  isDev,
  isWindows,
  TIMESTAMP_FILE,
  LANG_DIR,
  appDirectory,
  config,
  APIKEY,
  analyticsAPI,
  steamWebApiKey,
  steamGridDbApiKey,
  imageKey,
  clientId,
  toolExecutables,
  DEPENDENCY_REGISTRY_PATHS,
  getPythonPath,
  isLinux,
  isMac,
  linuxConfigDir,
  linuxCompatDataDir,
  linuxRunnersDir,
  STEAM_COMMON_PATHS,
  STEAM_INSTALL_PATHS,
};
