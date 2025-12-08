/**
 * Local Refresh Module
 * Handles local index refresh operations
 */

const fs = require("fs-extra");
const path = require("path");
const { spawn } = require("child_process");
const { ipcMain, BrowserWindow, Notification, app } = require("electron");
const { isDev, isWindows, appDirectory } = require("./config");
const { getSettingsManager } = require("./settings");

let localRefreshProcess = null;
let localRefreshProgressInterval = null;
let localRefreshShouldMonitor = false;
let localRefreshStarting = false;

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

        localRefreshProcess.on("close", code => {
          console.log(`LocalRefresh process exited with code ${code}`);
          localRefreshProcess = null;
          localRefreshStarting = false;

          if (localRefreshProgressInterval) {
            clearInterval(localRefreshProgressInterval);
            localRefreshProgressInterval = null;
          }

          const mainWindow = BrowserWindow.getAllWindows().find(win => win);
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
}

module.exports = {
  registerLocalRefreshHandlers,
};
