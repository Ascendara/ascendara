/**
 * SteamCMD Module
 * Handles SteamCMD installation and Steam Workshop downloads
 */

const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const { spawn, execFile } = require("child_process");
const { ipcMain } = require("electron");
const { downloadFile } = require("../core/download-file");
const { isWindows, isMac, TIMESTAMP_FILE } = require("../core/config");
const { updateTimestampFile } = require("../core/utils");

const STEAMCMD_DIR = path.join(os.homedir(), "ascendaraSteamcmd");
const STEAMCMD_EXECUTABLE = path.join(
  STEAMCMD_DIR,
  isWindows ? "steamcmd.exe" : "steamcmd.sh"
);
// Official Valve builds for Linux and macOS
const STEAMCMD_UNIX_URL = isMac
  ? "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_osx.tar.gz"
  : "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz";

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
 * Download and extract the official SteamCMD tarball (Linux/macOS)
 * @param {Function} sendProgress - Progress message callback
 */
async function downloadUnixSteamCMD(sendProgress) {
  sendProgress("Downloading SteamCMD from Valve...");
  const response = await fetch(STEAMCMD_UNIX_URL);
  if (!response.ok) {
    throw new Error(`SteamCMD download failed: ${response.status}`);
  }
  const archivePath = path.join(STEAMCMD_DIR, path.basename(STEAMCMD_UNIX_URL));
  await fs.promises.writeFile(archivePath, Buffer.from(await response.arrayBuffer()));

  sendProgress("Extracting SteamCMD...");
  await new Promise((resolve, reject) => {
    execFile("tar", ["-xzf", archivePath, "-C", STEAMCMD_DIR], error =>
      error
        ? reject(new Error(`Failed to extract SteamCMD: ${error.message}`))
        : resolve()
    );
  });
  await fs.promises.rm(archivePath, { force: true });
  await fs.promises.chmod(STEAMCMD_EXECUTABLE, 0o755);
}

/**
 * Translate common Linux/macOS SteamCMD startup failures into actionable hints
 * @param {string} output - Combined SteamCMD output
 * @param {number} code - Exit code
 * @returns {string|null} - Hint message, if a known failure was detected
 */
function getUnixSteamCMDHint(output, code) {
  if (isWindows) return null;
  if (isMac && /bad cpu type/i.test(output)) {
    return "SteamCMD requires Rosetta 2 on Apple Silicon. Install it with: softwareupdate --install-rosetta";
  }
  if (
    !isMac &&
    (code === 127 || /linux32\/steamcmd: (No such file|cannot execute)/i.test(output))
  ) {
    return "SteamCMD needs 32-bit libraries. Install lib32gcc-s1 (Debian/Ubuntu), glibc.i686 libstdc++.i686 (Fedora) or lib32-gcc-libs (Arch), then try again.";
  }
  return null;
}

/**
 * Register SteamCMD-related IPC handlers
 */
function registerSteamCMDHandlers() {
  // Check if steamCMD is installed from timestamp file
  ipcMain.handle("is-steamcmd-installed", async () => {
    try {
      if (!fs.existsSync(TIMESTAMP_FILE)) {
        return false;
      }
      const timestampData = await fs.promises.readFile(TIMESTAMP_FILE, "utf8");
      const data = JSON.parse(timestampData);
      return data.steamCMD === true && fs.existsSync(STEAMCMD_EXECUTABLE);
    } catch (error) {
      console.error("Error checking steamCMD installation:", error);
      return false;
    }
  });

  // Install SteamCMD (Ascendara CDN on Windows, Valve tarball on Linux/macOS)
  ipcMain.handle("install-steamcmd", async event => {
    try {
      const steamCMDUrl = "https://cdn.ascendara.app/files/steamcmd.exe";
      const steamCMDDir = STEAMCMD_DIR;

      event.sender.send("install-progress", {
        message: "Creating installation directory...",
      });

      // Ensure the directory exists
      await fs.promises.mkdir(steamCMDDir, { recursive: true });

      if (isWindows) {
        event.sender.send("install-progress", {
          message: "Downloading SteamCMD from CDN...",
        });

        // Download steamcmd.exe
        await downloadFile(steamCMDUrl, {
          directory: steamCMDDir,
          filename: "steamcmd.exe",
        });
      } else {
        await downloadUnixSteamCMD(message =>
          event.sender.send("install-progress", { message })
        );
      }

      event.sender.send("install-progress", {
        message: "Download complete. Initializing SteamCMD...",
      });

      // Run SteamCMD once so it can self-update and create its initial files
      await new Promise((resolve, reject) => {
        const steamCmd = spawn(STEAMCMD_EXECUTABLE, ["+quit"], { cwd: steamCMDDir });
        let output = "";

        steamCmd.stdout.on("data", data => {
          const text = data.toString().trim();
          output += text + "\n";
          if (text) {
            event.sender.send("install-progress", { message: text });
          }
        });

        steamCmd.stderr.on("data", data => {
          const text = data.toString().trim();
          output += text + "\n";
          if (text) {
            event.sender.send("install-progress", { message: text });
          }
        });

        steamCmd.on("error", error => {
          reject(error);
        });

        steamCmd.on("close", code => {
          // Exit code 7 means installation completed successfully
          if (code === 0 || code === 7) {
            resolve();
          } else {
            reject(
              new Error(
                getUnixSteamCMDHint(output, code) ||
                  `SteamCMD exited with unexpected code ${code}`
              )
            );
          }
        });
      });

      event.sender.send("install-progress", { message: "Finalizing installation..." });

      updateTimestampFile({
        steamCMD: true,
      });

      event.sender.send("install-progress", {
        message: "Installation completed successfully!",
      });

      return {
        success: true,
        message: "SteamCMD installed and initialized successfully",
      };
    } catch (error) {
      console.error("Error installing or initializing SteamCMD:", error);
      event.sender.send("install-progress", { message: `Error: ${error.message}` });
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
      const steamCMDDir = STEAMCMD_DIR;
      // Linux/macOS builds otherwise default to ~/Steam or ~/Library/Application Support/Steam
      const installDirArgs = isWindows ? [] : ["+force_install_dir", steamCMDDir];

      return new Promise((resolve, reject) => {
        const steamProcess = spawn(
          STEAMCMD_EXECUTABLE,
          [
            ...installDirArgs,
            "+login",
            "anonymous",
            "+workshop_download_item",
            appId,
            itemId,
            "+quit",
          ],
          { cwd: steamCMDDir }
        );

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
              : getUnixSteamCMDHint(output + errorOutput, code) ||
                `SteamCMD process exited with code ${code}. Error: ${errorOutput}`;

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
