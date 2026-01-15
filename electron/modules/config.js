/**
 * Configuration and Constants Module
 * Contains app configuration, API keys, and constant values
 */

const path = require("path");
const os = require("os");
const { app } = require("electron");

// Current app version
// Do not change this value
const appVersion = "9.7.4";

// Environment detection
const isDev = !app.isPackaged;
const isWindows = os.platform().startsWith("win");

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
const APIKEY = process.env.REACT_APP_AUTHORIZATION || config.AUTHORIZATION;
const analyticsAPI = process.env.REACT_APP_ASCENDARA_API_KEY || config.ASCENDARA_API_KEY;
const steamWebApiKey =
  process.env.REACT_APP_STEAM_WEB_API_KEY || config.ASCENDARA_STEAM_WEB_API_KEY;
const imageKey = process.env.REACT_APP_IMAGE_KEY || config.IMAGE_KEY;
const clientId = process.env.REACT_APP_DISCKEY || config.DISCKEY;

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

module.exports = {
  appVersion,
  isDev,
  isWindows,
  TIMESTAMP_FILE,
  LANG_DIR,
  appDirectory,
  config,
  APIKEY,
  analyticsAPI,
  steamWebApiKey,
  imageKey,
  clientId,
  toolExecutables,
  DEPENDENCY_REGISTRY_PATHS,
};
