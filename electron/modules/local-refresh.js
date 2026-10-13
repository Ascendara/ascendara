/**
 * Local Refresh Module
 * Keeps the local game index in sync with the one the API publishes
 */

const fs = require("fs-extra");
const path = require("path");
const { ipcMain, BrowserWindow, app } = require("electron");
const { getSettingsManager } = require("./settings");
const { syncCommunityIndex, getIndexCover } = require("./community-index");
const { getIndexStatus, runIndexRelay } = require("./index-relay");

let publicIndexDownloading = false;

function registerLocalRefreshHandlers() {
  const settingsManager = getSettingsManager();

  ipcMain.handle("get-default-local-index-path", () => {
    return path.join(app.getPath("appData"), "ascendara", "localindex");
  });

  ipcMain.handle("get-local-refresh-progress", async (_, outputPath) => {
    try {
      const progressFilePath = path.join(outputPath, "progress.json");
      if (fs.existsSync(progressFilePath)) {
        return JSON.parse(fs.readFileSync(progressFilePath, "utf8"));
      }
      return null;
    } catch (error) {
      return null;
    }
  });

  // Handler to check if public index download is in progress
  ipcMain.handle("get-public-index-download-status", async () => {
    return { isDownloading: publicIndexDownloading };
  });

  ipcMain.handle("download-shared-index", async (_, outputPath) => {
    const mainWindow = BrowserWindow.getAllWindows()[0];

    // Set downloading flag and notify renderer
    publicIndexDownloading = true;
    if (mainWindow) {
      mainWindow.webContents.send("public-index-download-started");
    }

    // Run the entire process in the background without blocking
    setImmediate(async () => {
      try {
        if (mainWindow) {
          mainWindow.webContents.send("public-index-download-progress", {
            downloaded: 0,
            total: 0,
            progress: -1,
            phase: "downloading",
          });
        }

        await syncCommunityIndex(outputPath, {
          force: true,
          blacklist: settingsManager.getSettings().blacklistIDs,
        });
        console.log("Shared index set up successfully");

        publicIndexDownloading = false;
        if (mainWindow) {
          mainWindow.webContents.send("public-index-download-progress", {
            downloaded: 100,
            total: 100,
            progress: 100,
            phase: "complete",
          });
          mainWindow.webContents.send("public-index-download-complete");
          // Dispatch index-refreshed event to reload UI
          mainWindow.webContents.executeJavaScript(`
            window.dispatchEvent(new CustomEvent("index-refreshed", {
              detail: { timestamp: Date.now() }
            }));
          `);
        }
      } catch (error) {
        console.error("Failed to download shared index:", error);
        publicIndexDownloading = false;
        if (mainWindow) {
          mainWindow.webContents.send("public-index-download-error", {
            error: error.message,
          });
        }
      }
    });

    // Return immediately so UI doesn't block
    return { success: true, message: "Download started in background" };
  });

  // Bring the local game list up to date and tell the UI if it changed
  const syncIndexQuietly = async () => {
    const { localIndex, blacklistIDs } = settingsManager.getSettings();
    if (publicIndexDownloading) {
      return { success: true, updated: false, skipped: true };
    }

    // Someone who never set an index up gets one in the default location
    const indexPath =
      localIndex || path.join(app.getPath("appData"), "ascendara", "localindex");
    if (!localIndex) {
      settingsManager.updateSetting("localIndex", indexPath);
    }

    try {
      const result = await syncCommunityIndex(indexPath, { blacklist: blacklistIDs });
      if (result.updated) {
        const mainWindow = BrowserWindow.getAllWindows()[0];
        if (mainWindow) {
          mainWindow.webContents.executeJavaScript(`
            window.dispatchEvent(new CustomEvent("index-refreshed", {
              detail: { timestamp: Date.now() }
            }));
          `);
        }
      }
      return { success: true, ...result };
    } catch (error) {
      console.error("Failed to sync community index:", error);
      return { success: false, error: error.message };
    }
  };

  ipcMain.handle("sync-community-index", syncIndexQuietly);

  ipcMain.handle("get-index-status", () => getIndexStatus());

  // Help the API refresh the index from this machine, then pick up the result
  ipcMain.handle("start-index-relay", async () => {
    const result = await runIndexRelay();
    if (result.success) {
      await syncIndexQuietly();
    }
    return result;
  });

  ipcMain.handle("get-index-cover", async (_, imgID) => {
    const indexPath = settingsManager.getSettings().localIndex;
    if (!indexPath) return null;
    try {
      return await getIndexCover(indexPath, imgID);
    } catch (error) {
      console.error("Error getting index cover:", error);
      return null;
    }
  });
}

module.exports = {
  registerLocalRefreshHandlers,
};
