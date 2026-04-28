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
  } else if (!isWindows) {
    const { linuxConfigDir } = require("./config");
    const tools = ["translator", "torrent"];
    
    // verify ludusavi
    if (fs.existsSync(path.join(linuxConfigDir, "ludusavi"))) {
      tools.push("ludusavi");
    }
    return tools;
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

    // On Linux, ludusavi downloads from GitHub in ~/.ascendara/
    if (!isWindows && tool === "ludusavi") {
      try {
        const { linuxConfigDir } = require("./config");
        const os = require("os");
        const { exec } = require("child_process");
        const ludusaviTargetPath = path.join(linuxConfigDir, "ludusavi");

        // 1. Fetch last release from GitHub
        const releaseRes = await axios.get(
          "https://api.github.com/repos/mtkennerly/ludusavi/releases/latest",
          { headers: { "User-Agent": "Ascendara-Launcher" } }
        );
        const release = releaseRes.data;

        // 2. Find Linux asset tar.gz
        const asset = release.assets.find(
          a => a.name.includes("linux") && a.name.endsWith(".tar.gz")
        );
        if (!asset) throw new Error("No Linux ludusavi tar.gz asset found in latest release");

        // 3. Download the tar.gz
        const tmpTar = path.join(os.tmpdir(), asset.name);
        const response = await axios({
          method: "get",
          url: asset.browser_download_url,
          responseType: "stream",
        });
        await new Promise((resolve, reject) => {
          const writer = fs.createWriteStream(tmpTar);
          response.data.pipe(writer);
          writer.on("finish", resolve);
          writer.on("error", reject);
        });

        // 4. Extract with tar in linuxConfigDir
        fs.ensureDirSync(linuxConfigDir);
        await new Promise((resolve, reject) => {
          exec(`tar -xzf "${tmpTar}" -C "${linuxConfigDir}"`, (err, stdout, stderr) => {
            if (err) {
              console.error("[Ludusavi] tar error:", stderr);
              reject(err);
            } else {
              resolve();
            }
          });
        });

        // 5. Make it executable and clean up
        if (fs.existsSync(ludusaviTargetPath)) {
          fs.chmodSync(ludusaviTargetPath, 0o755);
        } else {
          // Search for the binary if the tar has a subfolder
          const entries = fs.readdirSync(linuxConfigDir);
          const found = entries.find(e => e === "ludusavi" || 
            fs.existsSync(path.join(linuxConfigDir, e, "ludusavi")));
          if (!found) throw new Error(`ludusavi binary not found after extraction`);
          if (found !== "ludusavi") {
            fs.moveSync(
              path.join(linuxConfigDir, found, "ludusavi"),
              ludusaviTargetPath,
              { overwrite: true }
            );
          }
          fs.chmodSync(ludusaviTargetPath, 0o755);
        }
        fs.removeSync(tmpTar);

        console.log(`[Ludusavi] Installed successfully at ${ludusaviTargetPath}`);
        return { success: true, message: "ludusavi installed successfully" };
      } catch (error) {
        console.error("[Ludusavi] Install error:", error);
        return { success: false, message: `Failed to install ludusavi: ${error.message}` };
      }
    }

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
