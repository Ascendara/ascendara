/**
 * Local Refresh Module
 * Handles local index refresh operations
 */

const fs = require("fs-extra");
const path = require("path");
const { spawn } = require("child_process");
const { ipcMain, BrowserWindow, Notification, app } = require("electron");
const { isDev, isWindows, appDirectory, APIKEY } = require("./config");
const { getSettingsManager } = require("./settings");
const archiver = require("archiver");
const https = require("https");
const http = require("http");

let localRefreshProcess = null;
let localRefreshProgressInterval = null;
let localRefreshShouldMonitor = false;
let localRefreshStarting = false;

/**
 * Create a zip file containing the local index data (JSON + images)
 * Uses chunked upload to bypass Cloudflare's 100MB limit
 * @param {string} indexPath - Path to the local index directory
 * @returns {Promise<string>} - Path to the created zip file
 */
async function createIndexZip(indexPath) {
  const zipPath = path.join(indexPath, "shared_index.zip");
  const gamesJsonPath = path.join(indexPath, "ascendara_games.json");
  const imgsDir = path.join(indexPath, "imgs");

  // Remove existing zip if present
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    // Use good compression to minimize size
    const archive = archiver("zip", { zlib: { level: 6 } });

    output.on("close", () => {
      console.log(`Index zip created: ${archive.pointer()} bytes`);
      resolve(zipPath);
    });

    archive.on("error", err => {
      reject(err);
    });

    archive.pipe(output);

    // Add the games JSON file
    if (fs.existsSync(gamesJsonPath)) {
      archive.file(gamesJsonPath, { name: "ascendara_games.json" });
    } else {
      reject(new Error("ascendara_games.json not found"));
      return;
    }

    // Add the imgs directory if it exists
    if (fs.existsSync(imgsDir)) {
      archive.directory(imgsDir, "imgs");
    }

    archive.finalize();
  });
}

/**
 * Get an auth token from the API
 * @returns {Promise<string>} - The auth token
 */
async function getAuthToken() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.ascendara.app",
      port: 443,
      path: "/auth/token",
      method: "GET",
      headers: {
        Authorization: APIKEY,
      },
    };

    const req = https.request(options, res => {
      let data = "";
      res.on("data", chunk => {
        data += chunk;
      });
      res.on("end", () => {
        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed.token);
          } catch (e) {
            reject(new Error("Failed to parse auth token response"));
          }
        } else {
          reject(new Error(`Failed to get auth token: ${res.statusCode}`));
        }
      });
    });

    req.on("error", err => {
      reject(err);
    });

    req.end();
  });
}

/**
 * Upload a single chunk to the API
 * @param {Buffer} chunkBuffer - The chunk data
 * @param {string} sessionId - Upload session ID
 * @param {number} chunkIndex - Index of this chunk
 * @param {number} totalChunks - Total number of chunks
 * @param {string} authToken - Auth token
 * @returns {Promise<object>} - Response from server
 */
async function uploadChunk(chunkBuffer, sessionId, chunkIndex, totalChunks, authToken) {
  const boundary = "----AscendaraChunk" + Date.now();

  const header = `--${boundary}\r\nContent-Disposition: form-data; name="chunk"; filename="chunk_${chunkIndex}.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`;
  const footer = `\r\n--${boundary}--\r\n`;

  const bodyBuffer = Buffer.concat([
    Buffer.from(header),
    chunkBuffer,
    Buffer.from(footer),
  ]);

  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.ascendara.app",
      port: 443,
      path: `/localindex/upload-chunk?sessionId=${sessionId}&chunkIndex=${chunkIndex}&totalChunks=${totalChunks}`,
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": bodyBuffer.length,
        Authorization: `Bearer ${authToken}`,
      },
    };

    const req = https.request(options, res => {
      let data = "";
      res.on("data", chunk => {
        data += chunk;
      });
      res.on("end", () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve({ success: true });
          }
        } else {
          reject(new Error(`Chunk upload failed with status ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on("error", err => {
      reject(err);
    });

    req.write(bodyBuffer);
    req.end();
  });
}

/**
 * Upload the local index zip to the API using chunked uploads
 * @param {string} indexPath - Path to the local index directory
 */
async function uploadLocalIndex(indexPath) {
  const CHUNK_SIZE = 50 * 1024 * 1024; // 50MB chunks (under Cloudflare's 100MB limit)

  // Get auth token first
  const authToken = await getAuthToken();

  // Create the zip file (with images)
  const zipPath = await createIndexZip(indexPath);

  // Read the zip file
  const zipBuffer = fs.readFileSync(zipPath);
  const totalSize = zipBuffer.length;
  const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);

  console.log(`Uploading ${totalSize} bytes in ${totalChunks} chunks...`);

  // Generate a unique session ID for this upload
  const sessionId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    // Upload chunks in parallel (3 at a time for speed while not overwhelming the server)
    const PARALLEL_UPLOADS = 3;
    const chunks = [];

    // Prepare all chunks
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, totalSize);
      chunks.push({
        index: i,
        buffer: zipBuffer.slice(start, end),
      });
    }

    // Upload in batches
    let assembled = false;
    for (let batchStart = 0; batchStart < totalChunks; batchStart += PARALLEL_UPLOADS) {
      const batch = chunks.slice(batchStart, batchStart + PARALLEL_UPLOADS);

      console.log(
        `Uploading batch: chunks ${batchStart + 1}-${Math.min(batchStart + PARALLEL_UPLOADS, totalChunks)} of ${totalChunks}...`
      );

      const results = await Promise.all(
        batch.map(chunk => {
          console.log(
            `  Uploading chunk ${chunk.index + 1}/${totalChunks} (${chunk.buffer.length} bytes)...`
          );
          return uploadChunk(
            chunk.buffer,
            sessionId,
            chunk.index,
            totalChunks,
            authToken
          );
        })
      );

      // Check if any result indicates assembly complete
      for (const result of results) {
        if (result.assembled) {
          assembled = true;
          console.log("All chunks assembled successfully!");
        }
      }
    }

    if (!assembled) {
      console.log("All chunks uploaded, waiting for assembly confirmation...");
    }

    // Clean up the zip file
    try {
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
      }
    } catch (e) {
      console.error("Failed to clean up zip file:", e);
    }

    console.log("Index uploaded successfully!");
    return { success: true };
  } catch (error) {
    // Clean up the zip file on error
    try {
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
      }
    } catch (e) {
      console.error("Failed to clean up zip file:", e);
    }
    throw error;
  }
}

/**
 * Register local refresh IPC handlers
 */
function registerLocalRefreshHandlers() {
  const settingsManager = getSettingsManager();

  ipcMain.handle("get-default-local-index-path", () => {
    return path.join(app.getPath("appData"), "ascendara", "localindex");
  });

  ipcMain.handle(
    "start-local-refresh",
    async (event, { outputPath, cfClearance, perPage, workers, userAgent }) => {
      if (localRefreshStarting) {
        return { success: true, message: "Refresh already starting" };
      }

      if (localRefreshProcess && !localRefreshProcess.killed) {
        return { success: true, message: "Refresh already running" };
      }

      localRefreshStarting = true;

      try {
        localRefreshShouldMonitor = false;
        if (localRefreshProgressInterval) {
          clearInterval(localRefreshProgressInterval);
          localRefreshProgressInterval = null;
        }

        // Kill existing processes
        if (isWindows) {
          try {
            require("child_process").execSync(
              "taskkill /IM AscendaraLocalRefresh.exe /F",
              {
                stdio: "ignore",
              }
            );
          } catch (e) {}
        }

        if (localRefreshProcess) {
          if (isWindows) {
            try {
              require("child_process").execSync(
                `taskkill /pid ${localRefreshProcess.pid} /T /F`,
                { stdio: "ignore" }
              );
            } catch (e) {}
          } else {
            localRefreshProcess.kill("SIGKILL");
          }
          localRefreshProcess = null;
        }

        await new Promise(resolve => setTimeout(resolve, 500));

        if (!fs.existsSync(outputPath)) {
          fs.mkdirSync(outputPath, { recursive: true });
        }

        const progressFilePath = path.join(outputPath, "progress.json");
        if (fs.existsSync(progressFilePath)) {
          fs.unlinkSync(progressFilePath);
        }

        let executablePath;
        let args;
        const fetchPerPage = perPage || 50;
        const workerCount = workers || 8;

        if (isWindows) {
          if (isDev) {
            executablePath = "python";
            args = [
              "./binaries/AscendaraLocalRefresh/src/AscendaraLocalRefresh.py",
              "--output",
              outputPath,
              "--cookie",
              cfClearance,
              "--per-page",
              String(fetchPerPage),
              "--workers",
              String(workerCount),
              "--view-workers",
              "4",
            ];
          } else {
            executablePath = path.join(
              appDirectory,
              "/resources/AscendaraLocalRefresh.exe"
            );
            args = [
              "--output",
              outputPath,
              "--cookie",
              cfClearance,
              "--per-page",
              String(fetchPerPage),
              "--workers",
              String(workerCount),
              "--view-workers",
              "4",
            ];
          }
          if (userAgent) args.push("--user-agent", userAgent);
        } else {
          executablePath = "python3";
          const scriptPath = isDev
            ? "./binaries/AscendaraLocalRefresh/src/AscendaraLocalRefresh.py"
            : path.join(appDirectory, "/resources/AscendaraLocalRefresh.py");
          args = [
            scriptPath,
            "--output",
            outputPath,
            "--cookie",
            cfClearance,
            "--per-page",
            String(fetchPerPage),
            "--workers",
            String(workerCount),
            "--view-workers",
            "32",
          ];
          if (userAgent) args.push("--user-agent", userAgent);
        }

        localRefreshProcess = spawn(executablePath, args, {
          stdio: ["pipe", "pipe", "pipe"],
        });

        localRefreshProcess.stdout.on("data", async data => {
          const output = data.toString();
          console.log(`LocalRefresh stdout: ${output}`);

          if (output.includes("COOKIE_REFRESH_NEEDED")) {
            const mainWindow = BrowserWindow.getAllWindows().find(win => win);
            if (mainWindow) {
              mainWindow.webContents.send("local-refresh-cookie-needed");
            }

            try {
              const settings = settingsManager.getSettings();
              if (settings.notifications) {
                const theme = settings.theme || "purple";

                if (isWindows) {
                  const notificationHelperPath = isDev
                    ? "./binaries/AscendaraNotificationHelper/dist/AscendaraNotificationHelper.exe"
                    : path.join(
                        appDirectory,
                        "/resources/AscendaraNotificationHelper.exe"
                      );
                  const notifProcess = spawn(
                    notificationHelperPath,
                    [
                      "--theme",
                      theme,
                      "--title",
                      "Cookie Expired",
                      "--message",
                      "The Cloudflare cookie has expired. Please provide a new cookie to continue the refresh.",
                    ],
                    { detached: true, stdio: "ignore" }
                  );
                  notifProcess.unref();
                } else {
                  const notification = new Notification({
                    title: "Cookie Expired",
                    body: "The Cloudflare cookie has expired. Please provide a new cookie to continue the refresh.",
                    silent: false,
                    urgency: "critical",
                  });
                  notification.show();
                }
              }
            } catch (notifError) {
              console.error("Failed to send cookie refresh notification:", notifError);
            }
          }
        });

        localRefreshProcess.stderr.on("data", data => {
          console.error(`LocalRefresh stderr: ${data}`);
        });

        localRefreshProcess.on("close", async code => {
          console.log(`LocalRefresh process exited with code ${code}`);
          localRefreshProcess = null;
          localRefreshStarting = false;

          if (localRefreshProgressInterval) {
            clearInterval(localRefreshProgressInterval);
            localRefreshProgressInterval = null;
          }

          const mainWindow = BrowserWindow.getAllWindows().find(win => win);

          // If successful (code 0), check if we should upload the index
          if (code === 0) {
            try {
              const currentSettings = settingsManager.getSettings();
              console.log(
                "Checking shareLocalIndex setting:",
                currentSettings.shareLocalIndex
              );
              if (currentSettings.shareLocalIndex) {
                console.log(
                  "ShareLocalIndex is enabled, uploading index to:",
                  outputPath
                );
                if (mainWindow) {
                  mainWindow.webContents.send("local-refresh-uploading");
                }
                try {
                  await uploadLocalIndex(outputPath);
                  console.log("Index upload completed successfully");
                  if (mainWindow) {
                    mainWindow.webContents.send("local-refresh-upload-complete");
                  }
                } catch (uploadErr) {
                  console.error("Upload function error:", uploadErr);
                  throw uploadErr;
                }
              } else {
                console.log("ShareLocalIndex is disabled, skipping upload");
              }
            } catch (uploadError) {
              console.error("Failed to upload local index:", uploadError);
              if (mainWindow) {
                mainWindow.webContents.send("local-refresh-upload-error", {
                  error: uploadError.message,
                });
              }
            }
          }

          if (mainWindow) {
            mainWindow.webContents.send("local-refresh-complete", { code });
          }
        });

        localRefreshProcess.on("error", err => {
          console.error(`LocalRefresh process error: ${err}`);
          localRefreshStarting = false;
          const mainWindow = BrowserWindow.getAllWindows().find(win => win);
          if (mainWindow) {
            mainWindow.webContents.send("local-refresh-error", { error: err.message });
          }
        });

        localRefreshStarting = false;

        // Start monitoring progress
        localRefreshShouldMonitor = true;
        setTimeout(() => {
          if (!localRefreshShouldMonitor) return;

          const intervalId = setInterval(() => {
            if (!localRefreshShouldMonitor) {
              clearInterval(intervalId);
              if (localRefreshProgressInterval === intervalId) {
                localRefreshProgressInterval = null;
              }
              return;
            }
            try {
              if (fs.existsSync(progressFilePath)) {
                const progressData = JSON.parse(
                  fs.readFileSync(progressFilePath, "utf8")
                );
                const mainWindow = BrowserWindow.getAllWindows().find(win => win);
                if (mainWindow) {
                  mainWindow.webContents.send("local-refresh-progress", progressData);
                }
                // Check if completed/failed and stop monitoring
                if (
                  progressData.status === "completed" ||
                  progressData.status === "failed"
                ) {
                  console.log(
                    `Progress shows status: ${progressData.status}, stopping monitor`
                  );
                  localRefreshShouldMonitor = false;
                  clearInterval(intervalId);
                  if (localRefreshProgressInterval === intervalId) {
                    localRefreshProgressInterval = null;
                  }
                }
              }
            } catch (err) {}
          }, 500);
          localRefreshProgressInterval = intervalId;
        }, 1000);

        return { success: true };
      } catch (error) {
        console.error("Failed to start local refresh:", error);
        localRefreshStarting = false;
        return { success: false, error: error.message };
      }
    }
  );

  ipcMain.handle("send-local-refresh-cookie", async (_, newCookie) => {
    try {
      if (
        localRefreshProcess &&
        localRefreshProcess.stdin &&
        !localRefreshProcess.killed
      ) {
        localRefreshProcess.stdin.write(newCookie + "\n");
        return { success: true };
      }
      return { success: false, error: "Process not running" };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("stop-local-refresh", async (_, outputPath) => {
    try {
      localRefreshShouldMonitor = false;
      if (localRefreshProgressInterval) {
        clearInterval(localRefreshProgressInterval);
        localRefreshProgressInterval = null;
      }

      if (localRefreshProcess) {
        const pid = localRefreshProcess.pid;
        if (isWindows) {
          try {
            require("child_process").execSync(`taskkill /pid ${pid} /T /F`, {
              stdio: "ignore",
            });
          } catch (e) {}
        } else {
          localRefreshProcess.kill("SIGKILL");
        }
        localRefreshProcess = null;
      }

      if (isWindows) {
        try {
          require("child_process").execSync("taskkill /IM AscendaraLocalRefresh.exe /F", {
            stdio: "ignore",
          });
        } catch (e) {}
      }

      // Restore backups
      let localIndexPath = outputPath;
      if (!localIndexPath) {
        const settings = settingsManager.getSettings();
        localIndexPath = settings.localIndex;
      }

      if (localIndexPath) {
        const imgsDir = path.join(localIndexPath, "imgs");
        const imgsBackupDir = path.join(localIndexPath, "imgs_backup");
        const gamesFile = path.join(localIndexPath, "ascendara_games.json");
        const gamesBackupFile = path.join(localIndexPath, "ascendara_games_backup.json");

        if (fs.existsSync(imgsBackupDir)) {
          try {
            if (fs.existsSync(imgsDir))
              fs.rmSync(imgsDir, { recursive: true, force: true });
            fs.renameSync(imgsBackupDir, imgsDir);
          } catch (e) {}
        }

        if (fs.existsSync(gamesBackupFile)) {
          try {
            if (fs.existsSync(gamesFile)) fs.unlinkSync(gamesFile);
            fs.renameSync(gamesBackupFile, gamesFile);
          } catch (e) {}
        }
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
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

  ipcMain.handle("get-local-refresh-status", async (_, outputPath) => {
    try {
      let isRunning = localRefreshProcess !== null && localRefreshShouldMonitor;
      let progressData = null;

      if (outputPath) {
        const progressFilePath = path.join(outputPath, "progress.json");
        if (fs.existsSync(progressFilePath)) {
          progressData = JSON.parse(fs.readFileSync(progressFilePath, "utf8"));
        }
      }

      if (!isRunning && progressData && progressData.status === "running") {
        try {
          if (isWindows) {
            const result = require("child_process").execSync(
              'tasklist /FI "IMAGENAME eq AscendaraLocalRefresh.exe" /FO CSV /NH',
              { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }
            );
            isRunning = result.toLowerCase().includes("ascendaralocalrefresh.exe");
          } else {
            try {
              require("child_process").execSync("pgrep -f AscendaraLocalRefresh", {
                stdio: "ignore",
              });
              isRunning = true;
            } catch (e) {
              isRunning = false;
            }
          }

          if (isRunning && !localRefreshProgressInterval && outputPath) {
            localRefreshShouldMonitor = true;
            localRefreshProgressInterval = setInterval(() => {
              if (!localRefreshShouldMonitor) {
                clearInterval(localRefreshProgressInterval);
                localRefreshProgressInterval = null;
                return;
              }
              try {
                const progressFilePath = path.join(outputPath, "progress.json");
                if (fs.existsSync(progressFilePath)) {
                  const data = JSON.parse(fs.readFileSync(progressFilePath, "utf8"));
                  const mainWindow = BrowserWindow.getAllWindows().find(win => win);
                  if (mainWindow) {
                    mainWindow.webContents.send("local-refresh-progress", data);
                  }
                  if (data.status === "completed" || data.status === "failed") {
                    localRefreshShouldMonitor = false;
                    clearInterval(localRefreshProgressInterval);
                    localRefreshProgressInterval = null;
                    if (mainWindow) {
                      mainWindow.webContents.send("local-refresh-complete", {
                        code: data.status === "completed" ? 0 : 1,
                      });
                    }
                  }
                }
              } catch (e) {}
            }, 1000);
          } else if (!isRunning) {
            if (outputPath) {
              const progressFilePath = path.join(outputPath, "progress.json");
              if (fs.existsSync(progressFilePath)) {
                progressData.status = "failed";
                progressData.phase = "done";
                if (!progressData.errors) progressData.errors = [];
                progressData.errors.push({
                  message: "Process terminated unexpectedly",
                  timestamp: Date.now() / 1000,
                });
                fs.writeFileSync(progressFilePath, JSON.stringify(progressData, null, 2));
              }
            }
          }
        } catch (e) {}
      }

      return { isRunning, progress: progressData };
    } catch (error) {
      return { isRunning: false, progress: null };
    }
  });

  ipcMain.handle("download-shared-index", async (_, outputPath) => {
    try {
      const AdmZip = require("adm-zip");

      // Ensure output directory exists
      if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath, { recursive: true });
      }

      const zipPath = path.join(outputPath, "downloaded_index.zip");

      // Get auth token first
      console.log("Getting auth token for download...");
      const authToken = await getAuthToken();

      // Download the latest shared index with auth
      console.log("Downloading shared index from API...");

      await new Promise((resolve, reject) => {
        const file = fs.createWriteStream(zipPath);

        const options = {
          hostname: "api.ascendara.app",
          port: 443,
          path: "/localindex/latest",
          method: "GET",
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        };

        const req = https.request(options, response => {
          if (response.statusCode === 302 || response.statusCode === 301) {
            // Handle redirect (follow with auth header)
            const redirectOptions = {
              ...require("url").parse(response.headers.location),
              headers: { Authorization: `Bearer ${authToken}` },
            };
            https
              .get(redirectOptions, redirectResponse => {
                redirectResponse.pipe(file);
                file.on("finish", () => {
                  file.close();
                  resolve();
                });
              })
              .on("error", err => {
                fs.unlink(zipPath, () => {});
                reject(err);
              });
          } else if (response.statusCode === 200) {
            response.pipe(file);
            file.on("finish", () => {
              file.close();
              resolve();
            });
          } else if (response.statusCode === 429) {
            reject(
              new Error("Rate limit exceeded. You can only download once per hour.")
            );
          } else if (response.statusCode === 401 || response.statusCode === 403) {
            reject(new Error("Authentication failed. Please try again."));
          } else {
            reject(new Error(`Failed to download: ${response.statusCode}`));
          }
        });

        req.on("error", err => {
          fs.unlink(zipPath, () => {});
          reject(err);
        });

        req.end();
      });

      console.log("Download complete, extracting...");

      // Backup existing files
      const gamesFile = path.join(outputPath, "ascendara_games.json");
      const imgsDir = path.join(outputPath, "imgs");
      const gamesBackup = path.join(outputPath, "ascendara_games_backup.json");
      const imgsBackup = path.join(outputPath, "imgs_backup");

      if (fs.existsSync(gamesFile)) {
        fs.copyFileSync(gamesFile, gamesBackup);
      }
      if (fs.existsSync(imgsDir)) {
        if (fs.existsSync(imgsBackup)) {
          fs.rmSync(imgsBackup, { recursive: true, force: true });
        }
        fs.cpSync(imgsDir, imgsBackup, { recursive: true });
      }

      // Extract the zip
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(outputPath, true);

      // Clean up
      fs.unlinkSync(zipPath);
      if (fs.existsSync(gamesBackup)) {
        fs.unlinkSync(gamesBackup);
      }
      if (fs.existsSync(imgsBackup)) {
        fs.rmSync(imgsBackup, { recursive: true, force: true });
      }

      console.log("Shared index set up successfully");
      return { success: true };
    } catch (error) {
      console.error("Failed to download shared index:", error);
      return { success: false, error: error.message };
    }
  });

  // Debug handler to manually trigger upload (for testing)
  ipcMain.handle("debug-upload-local-index", async (_, outputPath) => {
    try {
      console.log("Manual upload triggered for path:", outputPath);
      const currentSettings = settingsManager.getSettings();
      console.log("Current shareLocalIndex setting:", currentSettings.shareLocalIndex);

      await uploadLocalIndex(outputPath);
      console.log("Manual upload completed successfully");
      return { success: true };
    } catch (error) {
      console.error("Manual upload failed:", error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = {
  registerLocalRefreshHandlers,
};
