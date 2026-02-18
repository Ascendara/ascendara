/**
 * System Module
 * Handles system-related operations (drive space, specs, dependencies, etc.)
 */

const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const disk = require("diskusage");
const crypto = require("crypto");
const { machineIdSync } = require("node-machine-id");
const { exec, spawn } = require("child_process");
const { ipcMain, app, dialog, shell, BrowserWindow, Notification } = require("electron");
const unzipper = require("unzipper");
const {
  isDev,
  isWindows,
  TIMESTAMP_FILE,
  appDirectory,
  DEPENDENCY_REGISTRY_PATHS,
} = require("./config");
const { updateTimestampFile } = require("./utils");
const { getSettingsManager } = require("./settings");

// Cache for drive space
const driveSpaceCache = new Map();
const DEBOUNCE_TIME = 10000;
let debouncedUpdate = null;

// Cache for installed games size
const gamesSizeCache = {
  totalSize: 0,
  lastCalculated: 0,
  directorySizes: [],
};

/**
 * Calculate size of directory recursively
 */
async function getDirectorySize(directoryPath) {
  let totalSize = 0;
  try {
    const files = await fs.readdir(directoryPath);

    for (const file of files) {
      const filePath = path.join(directoryPath, file);
      const stats = await fs.stat(filePath);

      if (stats.isDirectory()) {
        totalSize += await getDirectorySize(filePath);
      } else {
        totalSize += stats.size;
      }
    }

    return totalSize;
  } catch (error) {
    console.error(`Error calculating size for ${directoryPath}:`, error);
    return 0;
  }
}

/**
 * Check if a file exists using PowerShell
 */
async function checkFileExists(filePath) {
  return new Promise(resolve => {
    const command = `powershell -Command "Test-Path '${filePath}'"`;
    exec(command, (error, stdout) => {
      if (error) {
        resolve(false);
        return;
      }
      resolve(stdout.trim().toLowerCase() === "true");
    });
  });
}

/**
 * Check if a dependency is installed by looking up its registry key
 */
async function checkRegistryKey(registryKey, valueName) {
  return new Promise(resolve => {
    try {
      const Registry = require("winreg");
      const regKey = new Registry({
        hive: Registry.HKLM,
        key: registryKey.replace("HKLM\\", "\\"),
      });

      regKey.valueExists(valueName, (err, exists) => {
        resolve(!err && exists);
      });
    } catch (error) {
      console.error("Error checking registry:", error);
      resolve(false);
    }
  });
}

/**
 * Check if a dependency is installed
 */
async function checkDependencyInstalled(depInfo) {
  let isInstalled;
  if (depInfo.checkType === "file") {
    isInstalled = await checkFileExists(depInfo.filePath);
  } else {
    isInstalled = await checkRegistryKey(depInfo.key, depInfo.value);
  }
  return isInstalled;
}

/**
 * Check the installation status of all game dependencies
 */
async function checkGameDependencies() {
  const results = [];

  for (const [file, info] of Object.entries(DEPENDENCY_REGISTRY_PATHS)) {
    const isInstalled = await checkDependencyInstalled(info);
    results.push({
      name: info.name,
      file: file,
      installed: isInstalled,
    });
  }

  return results;
}

/**
 * Get hardware ID for trial lock
 * Returns a hashed machine ID that's consistent for the same hardware
 */
function getHardwareId() {
  try {
    const machineId = machineIdSync(true);
    // Hash it for privacy - same hardware always produces same hash
    return crypto.createHash("sha256").update(machineId).digest("hex");
  } catch (error) {
    console.error("Failed to get hardware ID:", error);
    return null;
  }
}

/**
 * Register system-related IPC handlers
 */
function registerSystemHandlers() {
  const settingsManager = getSettingsManager();

  // Get hardware ID for trial verification
  ipcMain.handle("get-hardware-id", async () => {
    return getHardwareId();
  });

  // Get drive space
  ipcMain.handle("get-drive-space", async (_, directory) => {
    try {
      const settings = settingsManager.getSettings();
      const directories = [];

      if (directory) directories.push(directory);

      if (
        settings.additionalDirectories &&
        Array.isArray(settings.additionalDirectories)
      ) {
        directories.push(
          ...settings.additionalDirectories.filter(dir => dir && dir.trim() !== "")
        );
      }

      if (directories.length === 0) {
        return { directories: [], freeSpace: 0, totalSpace: 0 };
      }

      const now = Date.now();
      const result = { directories: [] };
      let totalFreeSpace = 0;
      let totalSpace = 0;

      for (const dir of directories) {
        try {
          const cache = driveSpaceCache.get(dir);
          let dirInfo;

          if (cache && cache.lastCalculated > now - 5 * 60 * 1000) {
            dirInfo = {
              path: dir,
              freeSpace: cache.freeSpace,
              totalSpace: cache.totalSpace,
            };
          } else {
            if (!debouncedUpdate) {
              debouncedUpdate = setTimeout(async () => {
                try {
                  for (const directory of directories) {
                    try {
                      const { available, total } = await disk.check(directory);
                      driveSpaceCache.set(directory, {
                        freeSpace: available,
                        totalSpace: total,
                        lastCalculated: Date.now(),
                      });
                    } catch (err) {}
                  }
                  debouncedUpdate = null;
                } catch (error) {}
              }, DEBOUNCE_TIME);
            }

            if (cache) {
              dirInfo = {
                path: dir,
                freeSpace: cache.freeSpace,
                totalSpace: cache.totalSpace,
              };
            } else {
              try {
                const { available, total } = await disk.check(dir);
                driveSpaceCache.set(dir, {
                  freeSpace: available,
                  totalSpace: total,
                  lastCalculated: now,
                });
                dirInfo = { path: dir, freeSpace: available, totalSpace: total };
              } catch (err) {
                dirInfo = { path: dir, freeSpace: 0, totalSpace: 0, error: err.message };
              }
            }
          }

          result.directories.push(dirInfo);
          totalFreeSpace += dirInfo.freeSpace;
          totalSpace += dirInfo.totalSpace;
        } catch (dirError) {
          result.directories.push({
            path: dir,
            freeSpace: 0,
            totalSpace: 0,
            error: dirError.message,
          });
        }
      }

      result.freeSpace = totalFreeSpace;
      result.totalSpace = totalSpace;

      return result;
    } catch (error) {
      console.error("Error getting drive space:", error);
      return { directories: [], freeSpace: 0, totalSpace: 0, error: error.message };
    }
  });

  // Get installed games size
  ipcMain.handle("get-installed-games-size", async () => {
    const settings = settingsManager.getSettings();
    try {
      const now = Date.now();

      if (gamesSizeCache.lastCalculated > now - 5 * 60 * 1000) {
        return {
          success: true,
          calculating: false,
          totalSize: gamesSizeCache.totalSize,
          directorySizes: gamesSizeCache.directorySizes,
        };
      }

      const directories = [];
      if (settings.downloadDirectory && settings.downloadDirectory.trim() !== "") {
        directories.push(settings.downloadDirectory);
      }

      if (
        settings.additionalDirectories &&
        Array.isArray(settings.additionalDirectories)
      ) {
        directories.push(
          ...settings.additionalDirectories.filter(dir => dir && dir.trim() !== "")
        );
      }

      if (directories.length === 0) {
        return { success: false, calculating: false, totalSize: 0, directorySizes: [] };
      }

      let totalSize = 0;
      const directorySizes = [];

      for (const dir of directories) {
        try {
          const size = await getDirectorySize(dir);
          directorySizes.push({ path: dir, size });
          totalSize += size;
        } catch (err) {
          directorySizes.push({ path: dir, size: 0, error: err.message });
        }
      }

      gamesSizeCache.totalSize = totalSize;
      gamesSizeCache.directorySizes = directorySizes;
      gamesSizeCache.lastCalculated = now;

      return { success: true, calculating: false, totalSize, directorySizes };
    } catch (error) {
      console.error("Error getting installed games size:", error);
      return {
        success: false,
        calculating: false,
        totalSize: 0,
        directorySizes: [],
        error: error.message,
      };
    }
  });

  // Fetch system specs
  ipcMain.handle("fetch-system-specs", async () => {
    const specs = {
      os: `${os.type()} ${os.release()}`,
      cpu: os.cpus()[0]?.model || "Unknown",
      ram: `${Math.round(os.totalmem() / (1024 * 1024 * 1024))} GB`,
      gpu: "Unknown",
      directx: "Unknown",
    };

    if (process.platform === "win32") {
      try {
        const gpuResult = await new Promise(resolve => {
          exec("wmic path win32_VideoController get name", (error, stdout) => {
            if (!error && stdout) {
              const lines = stdout
                .split("\n")
                .map(line => line.trim())
                .filter(line => line && line !== "Name");
              const virtualKeywords = [
                "virtual",
                "basic",
                "microsoft",
                "remote",
                "vnc",
                "rdp",
              ];
              const realGpu = lines.find(
                line =>
                  !virtualKeywords.some(keyword => line.toLowerCase().includes(keyword))
              );
              resolve(realGpu || lines[0] || "Unknown");
            } else {
              resolve("Unknown");
            }
          });
        });
        specs.gpu = gpuResult;

        const dxResult = await new Promise(resolve => {
          exec(
            'reg query "HKLM\\SOFTWARE\\Microsoft\\DirectX" /v Version',
            (error, stdout) => {
              if (!error && stdout) {
                const match = stdout.match(/Version\s+REG_SZ\s+(\S+)/);
                if (match) {
                  const version = match[1];
                  if (version.startsWith("4.09")) resolve("Version 12");
                  else resolve(`Version ${version}`);
                } else {
                  resolve("Unknown");
                }
              } else {
                resolve("Unknown");
              }
            }
          );
        });
        specs.directx = dxResult;
      } catch (err) {}
    }

    return specs;
  });

  // Check game dependencies
  ipcMain.handle("check-game-dependencies", async () => {
    return await checkGameDependencies();
  });

  // Get platform
  ipcMain.handle("get-platform", () => process.platform);

  // Is on Windows
  ipcMain.handle("is-on-windows", () => isWindows);

  // Get system username
  ipcMain.handle("get-system-username", () => {
    try {
      return os.userInfo().username;
    } catch (error) {
      return null;
    }
  });

  // Can create files
  ipcMain.handle("can-create-files", async (_, directory) => {
    try {
      const filePath = path.join(directory, "test.txt");
      fs.writeFileSync(filePath, "test");
      fs.unlinkSync(filePath);
      return true;
    } catch (error) {
      return false;
    }
  });

  // Folder exclusion (Windows Defender)
  ipcMain.handle("folder-exclusion", async (_, boolean) => {
    try {
      const checkDefender = await new Promise(resolve => {
        exec(
          'powershell -Command "Get-MpPreference | Select-Object -ExpandProperty ExclusionPath"',
          (error, stdout, stderr) => {
            if (error) {
              resolve({ defenderActive: false, error: stderr || error.message });
            } else {
              resolve({ defenderActive: true, exclusions: stdout });
            }
          }
        );
      });

      if (!checkDefender.defenderActive) {
        return {
          success: false,
          error: "Windows Defender is not active or another antivirus is in use.",
        };
      }

      const settings = settingsManager.getSettings();
      const downloadDir = settings.downloadDirectory;
      const additionalDirs = Array.isArray(settings.additionalDirectories)
        ? settings.additionalDirectories
        : [];

      if (!downloadDir && additionalDirs.length === 0) {
        return { success: false, error: "No directories configured for exclusion." };
      }

      const commandType = boolean ? "Add-MpPreference" : "Remove-MpPreference";
      let psCommands = [];
      if (downloadDir) psCommands.push(`${commandType} -ExclusionPath "${downloadDir}"`);
      for (const dir of additionalDirs) {
        if (dir) psCommands.push(`${commandType} -ExclusionPath "${dir}"`);
      }

      if (psCommands.length === 0) {
        return { success: false, error: "No valid directories for exclusion." };
      }

      const joinedCommands = psCommands.join("; ");
      const fullPS = `Start-Process powershell -Verb runAs -ArgumentList '${joinedCommands}'`;

      return await new Promise(resolve => {
        exec(`powershell -Command "${fullPS}"`, (error, stdout, stderr) => {
          if (error) {
            resolve({ success: false, error: stderr || error.message });
          } else {
            resolve({ success: true });
          }
        });
      });
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Install dependencies
  ipcMain.handle("install-dependencies", async event => {
    let isInstalling = false;
    if (isInstalling) {
      return { success: false, message: "Installation already in progress" };
    }

    isInstalling = true;

    try {
      const tempDir = path.join(os.tmpdir(), "ascendaradependencies");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
      }

      const zipUrl = "https://cdn.ascendara.app/files/deps.zip";
      const zipPath = path.join(tempDir, "deps.zip");
      const res = await fetch(zipUrl);
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      fs.writeFileSync(zipPath, buffer);

      await fs
        .createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: tempDir }))
        .promise();

      const files = fs.readdirSync(tempDir);
      const executables = files.filter(file => path.extname(file) === ".exe");
      const msis = files.filter(file => path.extname(file) === ".msi");

      for (const executable of executables) {
        const exePath = path.join(tempDir, executable);
        event.sender.send("dependency-installation-status", {
          name: executable,
          status: "starting",
        });
        fs.chmodSync(exePath, "755");

        await new Promise((resolve, reject) => {
          const process = spawn(
            "powershell.exe",
            ["-Command", `Start-Process -FilePath "${exePath}" -Verb RunAs -Wait`],
            { shell: true }
          );
          process.on("error", reject);
          process.on("exit", code => {
            if (code === 0) {
              event.sender.send("dependency-installation-status", {
                name: executable,
                status: "finished",
              });
              resolve();
            } else {
              event.sender.send("dependency-installation-status", {
                name: executable,
                status: "failed",
              });
              reject(new Error(`Process exited with code ${code}`));
            }
          });
        });
      }

      for (const msi of msis) {
        const msiPath = path.join(tempDir, msi);
        event.sender.send("dependency-installation-status", {
          name: msi,
          status: "starting",
        });

        await new Promise((resolve, reject) => {
          const process = spawn(msiPath, [], {
            detached: true,
            shell: true,
            stdio: "ignore",
            windowsHide: true,
          });
          process.on("error", reject);
          process.on("exit", code => {
            if (code === 0) {
              event.sender.send("dependency-installation-status", {
                name: msi,
                status: "finished",
              });
              resolve();
            } else {
              event.sender.send("dependency-installation-status", {
                name: msi,
                status: "failed",
              });
              reject(new Error(`Process exited with code ${code}`));
            }
          });
        });
      }

      fs.rm(tempDir, { recursive: true, force: true }, err => {});

      return { success: true, message: "All dependencies installed successfully" };
    } catch (error) {
      console.error("An error occurred:", error);
      return { success: false, message: error.message };
    } finally {
      isInstalling = false;
    }
  });

  // Timestamp handlers
  ipcMain.handle("timestamp-time", async () => {
    try {
      if (!fs.existsSync(TIMESTAMP_FILE)) return "No timestamp available";
      const data = JSON.parse(await fs.promises.readFile(TIMESTAMP_FILE, "utf8"));
      if (!data.timestamp) return "No timestamp recorded";
      return new Date(data.timestamp).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (error) {
      return "Error retrieving timestamp";
    }
  });

  ipcMain.handle("set-timestamp-value", async (_, key, value) => {
    try {
      let timestamp = {};
      if (fs.existsSync(TIMESTAMP_FILE)) {
        timestamp = JSON.parse(fs.readFileSync(TIMESTAMP_FILE, "utf8"));
      }
      timestamp[key] = value;
      fs.writeFileSync(TIMESTAMP_FILE, JSON.stringify(timestamp, null, 2));
    } catch (error) {
      console.error("Error setting timestamp value:", error);
    }
  });

  ipcMain.handle("get-timestamp-value", async (_, key) => {
    try {
      let timestamp = {};
      if (fs.existsSync(TIMESTAMP_FILE)) {
        timestamp = JSON.parse(fs.readFileSync(TIMESTAMP_FILE, "utf8"));
      }
      return timestamp[key];
    } catch (error) {
      return null;
    }
  });

  ipcMain.handle("update-launch-count", () => {
    try {
      let timestamp = {};
      if (fs.existsSync(TIMESTAMP_FILE)) {
        timestamp = JSON.parse(fs.readFileSync(TIMESTAMP_FILE, "utf8"));
      }
      const launchCount = (timestamp.launchCount || 0) + 1;
      const merged = updateTimestampFile({ launchCount });
      return merged.launchCount;
    } catch (error) {
      return 1;
    }
  });

  ipcMain.handle("get-launch-count", () => {
    try {
      if (fs.existsSync(TIMESTAMP_FILE)) {
        const timestamp = JSON.parse(fs.readFileSync(TIMESTAMP_FILE, "utf8"));
        return timestamp.launchCount || 0;
      }
      return 0;
    } catch (error) {
      return 0;
    }
  });

  ipcMain.handle("is-watchdog-running", async () => {
    try {
      if (fs.existsSync(TIMESTAMP_FILE)) {
        const payload = JSON.parse(fs.readFileSync(TIMESTAMP_FILE, "utf8"));
        return payload.watchdogRunning || false;
      }
      return false;
    } catch (e) {
      return false;
    }
  });

  ipcMain.handle("delete-installer", () => {
    const filePath = path.join(app.getPath("temp"), "ascendarainstaller.exe");
    try {
      fs.unlinkSync(filePath);
    } catch (error) {}
  });

  // Install Wine (macOS/Linux only)
  ipcMain.handle("install-wine", async () => {
    if (process.platform === "win32") {
      return {
        success: false,
        message: "Windows installation not supported in this handler",
      };
    }

    const installWindow = new BrowserWindow({
      width: 500,
      height: 300,
      frame: false,
      transparent: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    installWindow.loadURL(
      "data:text/html;charset=utf-8," +
        encodeURIComponent(`
      <!DOCTYPE html><html><head><style>
        body { font-family: sans-serif; background: rgba(30,30,30,0.95); color: white; padding: 24px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; }
        .spinner { width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.1); border-top: 3px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .status { font-size: 14px; text-align: center; max-width: 360px; color: rgba(255,255,255,0.8); }
        .progress-container { width: 100%; max-width: 360px; }
        .progress-bar { height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden; }
        .progress { height: 100%; background: #3498db; border-radius: 3px; transition: width 0.3s ease; width: 0%; }
      </style></head><body>
        <div class="spinner"></div>
        <h2>Installing Wine & Winetricks</h2>
        <div class="status">Initializing...</div>
        <div class="progress-container"><div class="progress-bar"><div class="progress"></div></div></div>
      </body></html>`)
    );

    const updateStatus = msg =>
      installWindow.webContents.executeJavaScript(
        `document.querySelector('.status').textContent = ${JSON.stringify(msg)};`
      );

    const updateProgress = percent =>
      installWindow.webContents.executeJavaScript(
        `document.querySelector('.progress').style.width = '${percent}%';`
      );

    try {
      const runCommand = (cmd, onProgress, pStart = 0, pEnd = 100) =>
        new Promise((resolve, reject) => {
          const proc = exec(cmd, err => (err ? reject(err) : resolve()));
          let currentProgress = pStart;
          proc.stdout.on("data", data => {
            currentProgress = Math.min(currentProgress + 1, pEnd);
            updateProgress(currentProgress);
            onProgress?.(data.toString().trim());
          });
          proc.stderr.on("data", data => onProgress?.(data.toString().trim()));
        });

      if (process.platform === "darwin") {
        updateStatus("Checking for Homebrew...");
        updateProgress(5);
        const hasBrew = await new Promise(resolve =>
          exec("which brew", err => resolve(!err))
        );
        if (!hasBrew) {
          updateStatus("Installing Homebrew...");
          await runCommand(
            '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
            updateStatus,
            5,
            10
          );
        }

        updateStatus("Installing Wine and Winetricks...");
        await runCommand(
          "brew install --cask --no-quarantine wine-stable && brew install winetricks",
          updateStatus,
          10,
          30
        );

        updateStatus("Checking for Vulkan (MoltenVK)...");
        const hasVulkan = await new Promise(resolve =>
          exec("which vulkaninfo", err => resolve(!err))
        );
        if (!hasVulkan) {
          updateStatus("Installing Vulkan tools...");
          await runCommand("brew install vulkan-tools", updateStatus, 30, 40);
        }

        updateStatus("Verifying Vulkan...");
        await new Promise(resolve =>
          exec("vulkaninfo | grep 'Vulkan Instance Version'", (err, stdout) => {
            updateStatus(
              err
                ? "Vulkan not detected. DXVK may not work."
                : "Vulkan detected: " + stdout.trim()
            );
            setTimeout(resolve, 2000);
          })
        );
      } else if (process.platform === "linux") {
        updateStatus("Installing Wine & Winetricks...");
        await runCommand(
          "pkexec sh -c 'dpkg --add-architecture i386 && apt-get update && apt-get install -y wine64 wine32 winetricks'",
          updateStatus,
          5,
          30
        );
      }

      updateProgress(100);
      updateStatus("Installation complete!");
      setTimeout(() => installWindow.close(), 2500);
      return { success: true, message: "Wine and dependencies installed successfully" };
    } catch (err) {
      updateStatus("Installation failed: " + err.message);
      setTimeout(() => installWindow.close(), 3000);
      return { success: false, message: err.message };
    }
  });

  // Install Python (macOS/Linux only)
  ipcMain.handle("install-python", async () => {
    if (process.platform === "win32") {
      return {
        success: false,
        message: "Windows installation not supported in this handler",
      };
    }

    try {
      const resourcePath =
        process.env.NODE_ENV === "development"
          ? path.join(app.getAppPath(), "binaries")
          : path.join(process.resourcesPath, "binaries");

      await new Promise((resolve, reject) => {
        const chmodCommand = [
          `chmod +x "${isDev ? "./binaries/AscendaraCrashReporter/src/AscendaraCrashReporter.py" : path.join(resourcePath, "/resources/AscendaraCrashReporter.py")}"`,
          `chmod +x "${isDev ? "./binaries/AscendaraDownloader/src/AscendaraDownloader.py" : path.join(resourcePath, "/resources/AscendaraDownloader.py")}"`,
          `chmod +x "${isDev ? "./binaries/AscendaraDownloader/src/AscendaraGofileHelper.py" : path.join(resourcePath, "/resources/AscendaraGofileHelper.py")}"`,
          `chmod +x "${isDev ? "./binaries/AscendaraGameHandler/src/AscendaraGameHandler.py" : path.join(resourcePath, "/resources/AscendaraGameHandler.py")}"`,
          `chmod +x "${isDev ? "./binaries/AscendaraLanguageTranslation/src/AscendaraLanguageTranslation.py" : path.join(resourcePath, "/resources/AscendaraLanguageTranslation.py")}"`,
          `chmod +x "${isDev ? "./binaries/AscendaraLocalRefresh/src/AscendaraLocalRefresh.py" : path.join(resourcePath, "/resources/AscendaraLocalRefresh.py")}"`,
          `chmod +x "${isDev ? "./binaries/AscendaraAchievementWatcher/dist/AscendaraAchievementWatcher" : path.join(resourcePath, "/resources/AscendaraAchievementWatcher")}"`,
        ].join(" && ");

        exec(chmodCommand, error => {
          if (error) {
            console.error("Error making Python files executable:", error);
            reject(error);
          } else {
            resolve();
          }
        });
      });

      const installWindow = new BrowserWindow({
        width: 500,
        height: 300,
        frame: false,
        transparent: true,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
        },
      });

      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background: rgba(30, 30, 30, 0.95); color: white; border-radius: 10px; padding: 20px; margin: 0; height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; box-sizing: border-box; }
              .spinner { width: 50px; height: 50px; border: 5px solid #f3f3f3; border-top: 5px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 20px; }
              @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
              .status { margin-top: 15px; text-align: center; max-width: 400px; word-wrap: break-word; }
              .progress-bar { width: 300px; height: 4px; background: #2c2c2c; border-radius: 2px; margin-top: 15px; overflow: hidden; }
              .progress { width: 0%; height: 100%; background: #3498db; transition: width 0.3s ease; }
            </style>
          </head>
          <body>
            <div class="spinner"></div>
            <h2>Installing Python</h2>
            <div class="status">Initializing installation...</div>
            <div class="progress-bar"><div class="progress"></div></div>
          </body>
        </html>
      `;

      installWindow.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`
      );

      const updateStatus = message => {
        installWindow.webContents.executeJavaScript(`
          document.querySelector('.status').textContent = ${JSON.stringify(message)};
        `);
      };

      const updateProgress = percent => {
        installWindow.webContents.executeJavaScript(`
          document.querySelector('.progress').style.width = '${percent}%';
        `);
      };

      const command =
        process.platform === "darwin"
          ? "brew install python"
          : "pkexec apt-get install -y python3 python3-pip python3-venv";

      await new Promise((resolve, reject) => {
        const proc = exec(command, (error) => {
          if (error) {
            updateStatus(`Error installing Python: ${error.message}`);
            setTimeout(() => {
              installWindow.close();
              reject(error);
            }, 3000);
          } else {
            resolve();
          }
        });

        let progress = 0;
        proc.stdout.on("data", data => {
          progress = Math.min(progress + 10, 35);
          updateProgress(progress);
          updateStatus(data.toString().trim());
        });

        proc.stderr.on("data", data => {
          updateStatus(data.toString().trim());
        });
      });

      updateStatus("Setting up virtual environment...");
      updateProgress(40);

      const venvPath = path.join(os.homedir(), ".ascendara", "venv");
      const packages = ["requests", "psutil", "pypresence", "patool", "pySmartDL", "cloudscraper"];

      await new Promise((resolveVenv, rejectVenv) => {
        exec(`mkdir -p "${path.join(os.homedir(), ".ascendara")}" && python3 -m venv "${venvPath}"`, (err, _stdout, stderr) => {
          if (err) {
            console.error("venv creation failed:", stderr);
            rejectVenv(err);
          } else {
            resolveVenv();
          }
        });
      });

      updateStatus("Installing required packages...");
      updateProgress(50);

      const venvPip = path.join(venvPath, "bin", "pip");

      await new Promise((resolvePackage, rejectPackage) => {
        const pipProc = exec(`"${venvPip}" install ${packages.join(" ")}`, (err, _stdout, stderr) => {
          if (err) {
            console.error("Error installing packages:", stderr);
            rejectPackage(err);
          } else {
            resolvePackage();
          }
        });

        pipProc.stdout.on("data", data => {
          updateStatus(data.toString().trim());
        });

        pipProc.stderr.on("data", data => {
          updateStatus(data.toString().trim());
        });
      });

      updateStatus("All dependencies installed successfully!");
      updateProgress(100);
      await new Promise(r => setTimeout(r, 2000));
      installWindow.close();

      return { success: true, message: "Python installed successfully" };
    } catch (error) {
      console.error("An error occurred during Python installation:", error);
      return { success: false, message: error.message };
    }
  });
}

module.exports = {
  registerSystemHandlers,
  getDirectorySize,
  checkGameDependencies,
};
