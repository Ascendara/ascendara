/**
 * SteamCMD Module
 * Handles SteamCMD installation and Steam Workshop downloads
 */

const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const { ipcMain, BrowserWindow } = require("electron");
const { isWindows, TIMESTAMP_FILE } = require("./config");
const { updateTimestampFile } = require("./utils");

let electronDl = null;

// Initialize electron-dl
(async () => {
  electronDl = await import("electron-dl");
})();

/**
 * Fetch Steam Workshop item details
 * @param {string} itemId - Workshop item ID
 * @returns {Object} - Item details
 */
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

/**
 * Register SteamCMD-related IPC handlers
 */
function registerSteamCMDHandlers() {
  // Check if steamCMD is installed from timestamp file
  ipcMain.handle("is-steamcmd-installed", async () => {
    if (isWindows) {
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
    } else {
      return { message: `not_on_windows` };
    }
  });

  // Install steamcmd.exe from Ascendara CDN
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

      updateTimestampFile({
        steamCMD: true,
      });

      return {
        success: true,
        message: "SteamCMD installed and initialized successfully",
      };
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
          if (
            text.includes("ERROR! Download item") &&
            text.includes("failed (Failure)")
          ) {
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
}

module.exports = {
  fetchWorkshopItemDetails,
  registerSteamCMDHandlers,
};
