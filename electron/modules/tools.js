/**
 * Tools Module
 * Handles tool installation and management
 */

const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");
const { ipcMain, BrowserWindow } = require("electron");
const { app } = require("electron");
const {
  isDev,
  isWindows,
  TIMESTAMP_FILE,
  toolExecutables,
  appDirectory,
} = require("./config");
const { updateTimestampFile } = require("./utils");

let installedTools = [];
let electronDl = null;

// Initialize electron-dl
(async () => {
  electronDl = await import("electron-dl");
})();

/**
 * Check which tools are installed
 */
function checkInstalledTools() {
  try {
    if (isDev) {
      return;
    }
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

/**
 * Install a tool
 * @param {string} tool - Tool name to install
 */
async function installTool(tool) {
  console.log(`Installing ${tool}`);
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

/**
 * Get list of installed tools
 * @returns {string[]} - Array of installed tool names
 */
function getInstalledTools() {
  if (isWindows && !isDev) {
    return installedTools;
  } else {
    return ["translator", "torrent", "ludusavi"];
  }
}

/**
 * Register tool-related IPC handlers
 */
function registerToolHandlers() {
  ipcMain.handle("get-installed-tools", async () => {
    return getInstalledTools();
  });

  ipcMain.handle("install-tool", async (_, tool) => {
    console.log(`Installing ${tool}`);
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

      updateTimestampFile({
        installedTools,
      });

      return { success: true, message: `${tool} installed successfully` };
    } catch (error) {
      console.error(`Error installing ${tool}:`, error);
      return { success: false, message: `Failed to install ${tool}: ${error.message}` };
    }
  });
}

module.exports = {
  checkInstalledTools,
  installTool,
  getInstalledTools,
  registerToolHandlers,
};
