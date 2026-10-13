/**
 * Local Refresh Module
 * Handles local index refresh operations
 */

const fs = require("fs-extra");
const path = require("path");
const { spawn } = require("child_process");
const { ipcMain, BrowserWindow, Notification, app } = require("electron");
const { isDev, isWindows, appDirectory, getPythonPath } = require("./config");
const { getSettingsManager } = require("./settings");
const { checkVersionAndUpdate } = require("./updates");
const https = require("https");
const { syncCommunityIndex, getIndexCover } = require("./community-index");

let localRefreshProcess = null;
let localRefreshProgressInterval = null;
let localRefreshShouldMonitor = false;
let localRefreshStarting = false;
let publicIndexDownloading = false;

/**
 * Get an auth token from the API using time-based authentication
 * @returns {Promise<string>} - The auth token
 */
async function getAuthToken() {
  const authHelper = require("./auth-helper");

  return new Promise((resolve, reject) => {
    const authHeaders = authHelper.generateAuthHeaders();

    const options = {
      hostname: "api.ascendara.app",
      port: 443,
      path: "/auth/token",
      method: "GET",
      headers: authHeaders,
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
 * Share the local index: send the game list, then only the covers the
 * server doesn't already have
 * @param {string} indexPath - Path to the local index directory
 */
async function uploadLocalIndex(indexPath) {
  const API_URL = "https://api.ascendara.app";
  const COVER_BATCH_SIZE = 25;

  const authToken = await getAuthToken();
  const headers = { Authorization: `Bearer ${authToken}` };

  const gamesJson = await fs.readFile(
    path.join(indexPath, "ascendara_games.json"),
    "utf8"
  );
  const submitResponse = await fetch(`${API_URL}/localindex/v2/submit`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: gamesJson,
  });
  const submission = await submitResponse.json().catch(() => ({}));
  if (!submitResponse.ok || !submission.success) {
    throw new Error(
      submission.error || `Index submission failed with status ${submitResponse.status}`
    );
  }

  const missing = submission.missing || [];
  console.log(`Index submitted, ${missing.length} covers to upload...`);

  for (let start = 0; start < missing.length; start += COVER_BATCH_SIZE) {
    const form = new FormData();
    let count = 0;
    for (const imgID of missing.slice(start, start + COVER_BATCH_SIZE)) {
      const coverPath = path.join(indexPath, "imgs", `${imgID}.jpg`);
      if (!(await fs.pathExists(coverPath))) continue;
      form.append(imgID, new Blob([await fs.readFile(coverPath)]), `${imgID}.jpg`);
      count++;
    }
    if (count === 0) continue;

    const coversResponse = await fetch(
      `${API_URL}/localindex/v2/covers/${submission.submissionId}`,
      { method: "POST", headers, body: form }
    );
    if (!coversResponse.ok) {
      throw new Error(`Cover upload failed with status ${coversResponse.status}`);
    }
  }

  const commitResponse = await fetch(
    `${API_URL}/localindex/v2/commit/${submission.submissionId}`,
    { method: "POST", headers }
  );
  const commit = await commitResponse.json().catch(() => ({}));
  if (!commitResponse.ok || !commit.success) {
    throw new Error(
      commit.error || `Index commit failed with status ${commitResponse.status}`
    );
  }

  console.log("Index uploaded successfully!");
  return { success: true };
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
    async (event, { outputPath, cfClearance, perPage, workers, userAgent, source }) => {
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
        const sourceToUse = source || "steamrip";

        if (isWindows) {
          if (isDev) {
            executablePath = "python";
            args = [
              "./binaries/AscendaraLocalRefresh/src/AscendaraLocalRefresh.py",
              "--output",
              outputPath,
              "--source",
              sourceToUse,
              "--per-page",
              String(fetchPerPage),
              "--workers",
              String(workerCount),
            ];
            // Only add cookie if provided (CF protection may not be active)
            if (cfClearance) {
              args.push("--cookie", cfClearance);
            }
          } else {
            executablePath = path.join(
              appDirectory,
              "/resources/AscendaraLocalRefresh.exe"
            );
            args = [
              "--output",
              outputPath,
              "--source",
              sourceToUse,
              "--per-page",
              String(fetchPerPage),
              "--workers",
              String(workerCount),
            ];
            // Only add cookie if provided (CF protection may not be active)
            if (cfClearance) {
              args.push("--cookie", cfClearance);
            }
          }
          if (userAgent) args.push("--user-agent", userAgent);
        } else {
          if (isDev) {
            executablePath = getPythonPath();
            args = [
              "./binaries/AscendaraLocalRefresh/src/AscendaraLocalRefresh.py",
              "--output",
              outputPath,
              "--source",
              sourceToUse,
              "--per-page",
              String(fetchPerPage),
              "--workers",
              String(workerCount),
            ];
          } else {
            executablePath = path.join(process.resourcesPath, "AscendaraLocalRefresh");
            args = [
              "--output",
              outputPath,
              "--source",
              sourceToUse,
              "--per-page",
              String(fetchPerPage),
              "--workers",
              String(workerCount),
            ];
          }
          // Only add cookie if provided (CF protection may not be active)
          if (cfClearance) {
            args.push("--cookie", cfClearance);
          }
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
                // Don't upload if app is outdated - require latest version
                const isLatestVersion = await checkVersionAndUpdate().catch(() => true);
                if (!isLatestVersion) {
                  console.log(
                    "App is outdated, skipping upload to shared index - update Ascendara to the latest version to share your index"
                  );
                  if (mainWindow) {
                    mainWindow.webContents.send("local-refresh-upload-error", {
                      error:
                        "Update required: Please update Ascendara to the latest version to share your index.",
                    });
                  }
                } else {
                  // Don't upload GOG-Games indexes (experimental source)
                  const usedSource = currentSettings.localRefreshSource || "steamrip";
                  if (usedSource !== "steamrip") {
                    console.log(
                      `Source '${usedSource}' is experimental, skipping upload to shared index`
                    );
                  } else {
                    // Check if user has custom blacklisted games (only allow upload if blacklist is default or empty)
                    const DEFAULT_BLACKLIST_IDS = ["ABSXUc", "AWBgqf", "ATaHuq"];
                    const userBlacklist = currentSettings.blacklistIDs || [];
                    const hasCustomBlacklist = userBlacklist.some(
                      id => !DEFAULT_BLACKLIST_IDS.includes(id)
                    );

                    if (hasCustomBlacklist) {
                      console.log(
                        "User has custom blacklisted games, skipping upload to preserve index completeness"
                      );
                    } else {
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
                    }
                  }
                } // end isLatestVersion check
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

  ipcMain.handle("send-local-refresh-cookie", async (_, newCookie, userAgent) => {
    try {
      if (
        localRefreshProcess &&
        localRefreshProcess.stdin &&
        !localRefreshProcess.killed
      ) {
        // cf_clearance is tied to the browser that solved the challenge, so pass
        // its User-Agent along when the extension provided one
        const line = userAgent
          ? JSON.stringify({ cookie: newCookie, userAgent })
          : newCookie;
        localRefreshProcess.stdin.write(line + "\n");
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

        await syncCommunityIndex(outputPath, { force: true });
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

  // Quietly bring the shared game list up to date (no progress UI)
  ipcMain.handle("sync-community-index", async () => {
    const indexPath = settingsManager.getSettings().localIndex;
    if (
      !indexPath ||
      localRefreshProcess ||
      localRefreshStarting ||
      publicIndexDownloading
    ) {
      return { success: true, updated: false, skipped: true };
    }

    try {
      const result = await syncCommunityIndex(indexPath);
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
