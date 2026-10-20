/**
 * System Module
 * Handles system-related operations (drive space, specs, dependencies, etc.)
 */

const fs = require("fs-extra");
const nativeFs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { machineIdSync } = require("node-machine-id");
const { exec, execFile, spawn } = require("child_process");
const { ipcMain, app, BrowserWindow } = require("electron");
const unzipper = require("unzipper");
const { runDependencyInstaller } = require("./dependency-installer");
const {
  isDev,
  isWindows,
  isLinux,
  TIMESTAMP_FILE,
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
// Shared by concurrent callers (app startup prefetch, Library, health checks)
// so they wait on one directory walk instead of each starting their own.
let gamesSizeInFlight = null;

// Files antivirus software commonly flags in game downloads, used to check
// whether a download folder is safe from quarantines.
const VERIFY_DOWNLOAD_FILES = [
  "https://cdn.ascendara.app/setup/1/OnlineFix64.dll",
  "https://cdn.ascendara.app/setup/2/OnlineFix64.dll",
];
const VERIFY_WATCH_MS = 5000;
const VERIFY_POLL_MS = 250;

const hashFile = async filePath =>
  crypto
    .createHash("sha256")
    .update(await fs.readFile(filePath))
    .digest("hex");

/**
 * Download one test file into testDir, watch that it isn't removed or changed,
 * then make sure it can still be moved and deleted. onPhase(phase, progress)
 * reports each phase, with download progress from 0 to 1 while downloading.
 * Resolves to { ok, reason?, error? } where reason is downloadFailed, blocked,
 * deleted or locked.
 */
async function verifyTestDownload(url, testDir, onPhase) {
  const fileDir = path.join(testDir, crypto.randomUUID());
  const filePath = path.join(fileDir, path.basename(new URL(url).pathname));
  const fail = (reason, error) => ({ ok: false, reason, error });

  onPhase("downloading", 0);
  let response;
  try {
    response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Server responded with ${response.status}`);
  } catch (error) {
    return fail("downloadFailed", error.message);
  }

  // Stream to disk like a real download, so a scanner can step in mid-write
  const total = Number(response.headers.get("content-length")) || 0;
  const hash = crypto.createHash("sha256");
  let file;
  let received = 0;
  let lastReport = 0;
  let writeFailed = false;
  try {
    await fs.ensureDir(fileDir);
    file = await nativeFs.promises.open(filePath, "w");
    for await (const chunk of response.body) {
      hash.update(chunk);
      writeFailed = true;
      await file.write(chunk);
      writeFailed = false;
      received += chunk.length;
      if (total && Date.now() - lastReport > 100) {
        lastReport = Date.now();
        // content-length is the compressed size when the server compresses
        onPhase("downloading", Math.min(received / total, 1));
      }
    }
    // Scanners often act when the file is closed
    writeFailed = true;
    await file.close();
    file = null;
  } catch (error) {
    await file?.close().catch(() => {});
    // A failed write or close is the file being blocked; anything else is the network
    return fail(writeFailed || !file ? "blocked" : "downloadFailed", error.message);
  }
  const expectedHash = hash.digest("hex");

  onPhase("watching");
  const watchUntil = Date.now() + VERIFY_WATCH_MS;
  while (Date.now() < watchUntil) {
    await new Promise(resolve => setTimeout(resolve, VERIFY_POLL_MS));
    if (!(await fs.pathExists(filePath))) {
      return fail("deleted", "The file was removed after it downloaded.");
    }
  }
  try {
    if ((await hashFile(filePath)) !== expectedHash) {
      return fail("deleted", "The file was changed after it downloaded.");
    }
  } catch (error) {
    return fail("deleted", error.message);
  }

  onPhase("cleanup");
  try {
    const movedPath = `${filePath}.moved`;
    await fs.rename(filePath, movedPath);
    await fs.unlink(movedPath);
  } catch (error) {
    return fail("locked", error.message);
  }
  return { ok: true };
}

/**
 * Get disk space using Node.js built-in fs.statfs
 */
async function getDiskSpace(directory) {
  return new Promise((resolve, reject) => {
    nativeFs.statfs(directory, (err, stats) => {
      if (err) {
        reject(err);
      } else {
        resolve({
          available: stats.bavail * stats.bsize,
          total: stats.blocks * stats.bsize,
        });
      }
    });
  });
}

/**
 * Calculate size of directory recursively
 */
async function getDirectorySize(directoryPath) {
  try {
    // Dirents tell us the entry type without an lstat per entry, and walking
    // siblings in parallel lets libuv's thread pool overlap the disk I/O.
    const entries = await nativeFs.promises.readdir(directoryPath, {
      withFileTypes: true,
    });

    const sizes = await Promise.all(
      entries.map(async entry => {
        if (entry.isSymbolicLink()) return 0; // Ignoring symbolic links (like z:)
        const entryPath = path.join(directoryPath, entry.name);
        if (entry.isDirectory()) return getDirectorySize(entryPath);
        try {
          return (await nativeFs.promises.lstat(entryPath)).size;
        } catch {
          return 0;
        }
      })
    );

    return sizes.reduce((total, size) => total + size, 0);
  } catch (error) {
    console.error(`Error calculating size for ${directoryPath}:`, error);
    return 0;
  }
}

function getGamesSizeCacheFile() {
  return path.join(app.getPath("userData"), "games-size-cache.json");
}

/**
 * Load the last games size result from disk so the first request after launch
 * can answer immediately instead of waiting on a full directory walk.
 */
function loadPersistedGamesSize() {
  try {
    const data = JSON.parse(nativeFs.readFileSync(getGamesSizeCacheFile(), "utf8"));
    if (Array.isArray(data.directorySizes)) {
      gamesSizeCache.totalSize = data.totalSize || 0;
      gamesSizeCache.directorySizes = data.directorySizes;
      gamesSizeCache.lastCalculated = data.lastCalculated || 0;
    }
  } catch {}
}

async function calculateGamesSize(directories) {
  const directorySizes = await Promise.all(
    directories.map(async dir => {
      try {
        return { path: dir, size: await getDirectorySize(dir) };
      } catch (err) {
        return { path: dir, size: 0, error: err.message };
      }
    })
  );
  const totalSize = directorySizes.reduce((total, dir) => total + dir.size, 0);

  gamesSizeCache.totalSize = totalSize;
  gamesSizeCache.directorySizes = directorySizes;
  gamesSizeCache.lastCalculated = Date.now();
  fs.writeJson(getGamesSizeCacheFile(), gamesSizeCache).catch(() => {});

  return { totalSize, directorySizes };
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

      regKey.get(valueName, (err, item) => {
        const value = item?.value;
        resolve(
          !err &&
            (/^(Install|Installed)$/i.test(valueName)
              ? Number(value) === 1
              : Boolean(value))
        );
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
  loadPersistedGamesSize();

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
                      const { available, total } = await getDiskSpace(directory);
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
                const { available, total } = await getDiskSpace(dir);
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

      const refresh = () => {
        if (!gamesSizeInFlight) {
          gamesSizeInFlight = calculateGamesSize(directories).finally(() => {
            gamesSizeInFlight = null;
          });
        }
        return gamesSizeInFlight;
      };

      // A cached result is only usable if it covers the same set of directories
      const cachedPaths = gamesSizeCache.directorySizes.map(dir => dir.path);
      const cacheMatches =
        gamesSizeCache.lastCalculated > 0 &&
        cachedPaths.length === directories.length &&
        directories.every(dir => cachedPaths.includes(dir));

      if (cacheMatches) {
        // Serve the cached size right away and refresh it in the background
        // once it is older than 5 minutes.
        if (gamesSizeCache.lastCalculated < Date.now() - 5 * 60 * 1000) {
          refresh().catch(() => {});
        }
        return {
          success: true,
          calculating: false,
          totalSize: gamesSizeCache.totalSize,
          directorySizes: gamesSizeCache.directorySizes,
        };
      }

      const { totalSize, directorySizes } = await refresh();
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

  // Is on Linux
  ipcMain.handle("is-on-linux", () => isLinux);

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

  // Check that games can actually land in a download folder: basic file
  // operations, then known antivirus false positives that must download, stay
  // put for a few seconds and still be movable and deletable afterwards.
  // runId is echoed in progress events so the page can ignore an older run.
  ipcMain.handle("verify-download-directory", async (event, directory, runId) => {
    const sendProgress = progress => {
      if (!event.sender.isDestroyed()) {
        event.sender.send("download-directory-verify-progress", { runId, ...progress });
      }
    };
    const testDir = path.join(directory, `.ascendara-check-${crypto.randomUUID()}`);
    const result = { basic: { ok: false }, files: [] };

    try {
      sendProgress({ stage: "basic", status: "running" });
      try {
        await fs.ensureDir(testDir);
        const filePath = path.join(testDir, "test.txt");
        const movedPath = path.join(testDir, "test-moved.txt");
        const content = `ascendara ${Date.now()}`;
        await fs.writeFile(filePath, content);
        await fs.appendFile(filePath, "\nappended");
        if ((await fs.readFile(filePath, "utf8")) !== `${content}\nappended`) {
          throw new Error("A test file read back with different contents.");
        }
        await fs.rename(filePath, movedPath);
        await fs.unlink(movedPath);
        if (await fs.pathExists(movedPath)) {
          throw new Error("A test file couldn't be deleted.");
        }
        result.basic = { ok: true };
      } catch (error) {
        result.basic = { ok: false, error: error.message };
        return result;
      } finally {
        sendProgress({ stage: "basic", status: result.basic.ok ? "ok" : "failed" });
      }

      for (const [index, url] of VERIFY_DOWNLOAD_FILES.entries()) {
        const fileResult = await verifyTestDownload(url, testDir, (phase, progress) =>
          sendProgress({ stage: "file", index, status: "running", phase, progress })
        );
        result.files.push({ url, ...fileResult });
        sendProgress({
          stage: "file",
          index,
          status: fileResult.ok ? "ok" : "failed",
          reason: fileResult.reason,
        });
      }
      return result;
    } finally {
      await fs.remove(testDir).catch(error => {
        console.error("Failed to remove download folder check:", error);
      });
    }
  });

  // Folder exclusion (Windows Defender)
  ipcMain.handle("folder-exclusion", async (_, enabled) => {
    if (!isWindows) return { success: false, error: "This feature requires Windows." };
    const runPowerShell = args =>
      new Promise((resolve, reject) => {
        execFile(
          "powershell.exe",
          ["-NoProfile", "-NonInteractive", ...args],
          { windowsHide: true },
          (error, stdout, stderr) => {
            if (error) reject(new Error(String(stderr || error.message).trim()));
            else resolve(stdout);
          }
        );
      });
    const normalize = value =>
      path
        .resolve(value)
        .replace(/[\\/]+$/, "")
        .toLowerCase();
    const quote = value => `'${value.replace(/'/g, "''")}'`;
    // Each failure carries a reason so the UI can explain what to do next.
    const fail = (reason, error) => ({ success: false, reason, error });

    // Defender stays installed but stops scanning when another antivirus takes
    // over, so a missing cmdlet or a disabled engine both mean it can't help.
    try {
      const status = await runPowerShell([
        "-Command",
        "(Get-MpComputerStatus).AntivirusEnabled",
      ]);
      if (enabled && status.trim().toLowerCase() !== "true") {
        return fail(
          "defenderUnavailable",
          "Windows Security isn't scanning for viruses on this PC, so another antivirus is probably in charge. Add your download folder as an exclusion in that antivirus instead."
        );
      }
    } catch {
      return fail(
        "defenderUnavailable",
        "Windows Security isn't available on this PC, so another antivirus is probably in charge. Add your download folder as an exclusion in that antivirus instead."
      );
    }

    const settings = settingsManager.getSettings();
    const directories = [
      settings.downloadDirectory,
      ...(Array.isArray(settings.additionalDirectories)
        ? settings.additionalDirectories
        : []),
    ].filter(Boolean);
    if (directories.length === 0) {
      return fail("noDirectories", "Choose a download folder first.");
    }

    // Windows hides the exclusion list from non-admin processes, so the elevated
    // process verifies its own change and writes the result for us to read.
    const resultFile = path.join(
      os.tmpdir(),
      `ascendara-exclusion-${crypto.randomUUID()}.txt`
    );
    const commandType = enabled ? "Add-MpPreference" : "Remove-MpPreference";
    const elevatedCommand = [
      "$ErrorActionPreference = 'Stop'",
      "try {",
      ...directories.map(
        directory => `  ${commandType} -ExclusionPath ${quote(directory)}`
      ),
      `  @((Get-MpPreference).ExclusionPath) | Set-Content -LiteralPath ${quote(resultFile)} -Encoding UTF8`,
      "} catch {",
      `  'ERROR: ' + $_.Exception.Message | Set-Content -LiteralPath ${quote(resultFile)} -Encoding UTF8`,
      "}",
    ].join("\n");
    const encodedCommand = Buffer.from(elevatedCommand, "utf16le").toString("base64");
    const launcher = `Start-Process powershell.exe -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile','-NonInteractive','-EncodedCommand','${encodedCommand}'`;

    try {
      try {
        await runPowerShell(["-Command", launcher]);
      } catch (err) {
        if (/cancel/i.test(err.message)) {
          return fail(
            "cancelled",
            "The administrator prompt was declined. Try again and choose Yes when Windows asks."
          );
        }
        throw err;
      }

      // trimStart also drops the BOM that PowerShell 5.1 writes with UTF8
      const output = fs.existsSync(resultFile)
        ? fs.readFileSync(resultFile, "utf8").trimStart()
        : "";
      if (!output.trim() && enabled) {
        return fail(
          "failed",
          "Windows Security didn't report back. Try again, or skip and turn it on later in Settings."
        );
      }
      if (output.startsWith("ERROR:")) {
        return fail("failed", output.slice("ERROR:".length).trim());
      }

      const exclusions = new Set(
        output
          .split(/\r?\n/)
          .map(value => value.trim())
          .filter(Boolean)
          .map(normalize)
      );
      const confirmed = directories.every(directory =>
        exclusions.has(normalize(directory))
      );
      if (confirmed !== enabled) {
        return fail(
          "blocked",
          enabled
            ? "Windows Security didn't keep the exclusion. Tamper Protection or a policy set by your organization may be blocking changes."
            : "Windows Security did not remove every directory exclusion."
        );
      }
      settingsManager.updateSetting("excludeFolders", enabled);
      return { success: true, directories };
    } catch (err) {
      return fail("failed", err.message || "Couldn't update Windows Security.");
    } finally {
      fs.rm(resultFile, { force: true }, () => {});
    }
  });

  let isInstallingDependencies = false;

  // Install dependencies
  ipcMain.handle("install-dependencies", async event => {
    if (!isWindows) return { success: false, error: "This feature requires Windows." };
    if (isInstallingDependencies) {
      return { success: false, message: "Installation already in progress" };
    }

    isInstallingDependencies = true;

    try {
      const tempDir = path.join(os.tmpdir(), "ascendaradependencies");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
      }

      const zipUrl = "https://cdn.ascendara.app/files/deps.zip";
      const zipPath = path.join(tempDir, "deps.zip");
      const res = await fetch(zipUrl);
      if (!res.ok) throw new Error(`Dependency download failed: ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      fs.writeFileSync(zipPath, buffer);

      await fs
        .createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: tempDir }))
        .promise();

      const installers = fs
        .readdirSync(tempDir)
        .filter(file => [".exe", ".msi"].includes(path.extname(file).toLowerCase()));
      if (!installers.length) throw new Error("No dependency installers found");

      const failures = [];
      const failed = [];
      for (const installer of installers) {
        const sendStatus = status => {
          if (!event.sender.isDestroyed()) {
            event.sender.send("dependency-installation-status", {
              name: installer,
              status,
            });
          }
        };
        sendStatus("starting");
        const info = DEPENDENCY_REGISTRY_PATHS[installer];
        try {
          const alreadyInstalled = info && (await checkDependencyInstalled(info));
          if (!alreadyInstalled) {
            await runDependencyInstaller(path.join(tempDir, installer));
          }
          sendStatus("finished");
        } catch (error) {
          // Some installers (notably the DirectX web setup) report odd exit codes
          // even when they worked, so trust what's actually on disk.
          if (info && (await checkDependencyInstalled(info))) {
            sendStatus("finished");
            continue;
          }
          sendStatus("failed");
          failed.push(installer);
          failures.push(`${installer}: ${error.message}`);
        }
      }
      if (failures.length) {
        return { success: false, failed, message: failures.join("\n") };
      }

      fs.rm(tempDir, { recursive: true, force: true }, err => {});

      return {
        success: true,
        failed: [],
        message: "All dependencies installed successfully",
      };
    } catch (error) {
      console.error("An error occurred:", error);
      return { success: false, message: error.message };
    } finally {
      isInstallingDependencies = false;
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

    await installWindow.loadURL(
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
      !installWindow.isDestroyed() &&
      installWindow.webContents.executeJavaScript(
        `document.querySelector('.status').textContent = ${JSON.stringify(msg)};`
      );

    const updateProgress = percent =>
      !installWindow.isDestroyed() &&
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

      const {
        findCommand,
        findWine,
        linuxWineCommand,
        runtimePath,
      } = require("./wine-setup");
      process.env.PATH = runtimePath();
      if (process.platform === "darwin") {
        const brew = findCommand("brew");
        if (!brew) {
          throw new Error(
            "Install Homebrew from https://brew.sh in Terminal, then retry Wine setup. Homebrew installation requires an interactive terminal."
          );
        }
        updateStatus(
          "Installing Wine. If a password is required, complete setup in Terminal."
        );
        await new Promise((resolve, reject) => {
          execFile(
            brew,
            ["install", "--cask", "wine-stable"],
            { env: { ...process.env, NONINTERACTIVE: "1" }, timeout: 20 * 60 * 1000 },
            error =>
              error
                ? reject(
                    new Error(
                      "Wine setup failed. Run 'brew install --cask wine-stable' in Terminal, then check again. " +
                        error.message
                    )
                  )
                : resolve()
          );
        });
      } else if (process.platform === "linux") {
        updateStatus(
          "Installing Wine and Winetricks. Approve the system authentication prompt."
        );
        await runCommand(
          "pkexec sh -c '" + linuxWineCommand() + "'",
          updateStatus,
          5,
          90
        );
      } else {
        throw new Error("Wine setup is supported on macOS and Linux.");
      }
      if (!(await findWine())) {
        throw new Error(
          "Wine was installed but could not run. On Apple Silicon, install Rosetta 2, then check again. Otherwise verify 'wine --version' in Terminal."
        );
      }

      updateProgress(100);
      updateStatus("Installation complete!");
      setTimeout(() => {
        if (!installWindow.isDestroyed()) installWindow.close();
      }, 2500);
      return { success: true, message: "Wine and dependencies installed successfully" };
    } catch (err) {
      updateStatus("Installation failed: " + err.message);
      setTimeout(() => {
        if (!installWindow.isDestroyed()) installWindow.close();
      }, 3000);
      return { success: false, message: err.message };
    }
  });

  // Install Python (macOS/Linux only)
  ipcMain.handle("install-python", async () => {
    let installWindow;
    if (process.platform === "win32") {
      return {
        success: false,
        message: "Windows installation not supported in this handler",
      };
    }

    try {
      // Source builds may not include compiled optional helpers. Packaged resources
      // already live at resourcesPath (there is no nested resources directory).
      const helpers = [
        ["AscendaraCrashReporter", "target/release/AscendaraCrashReporter"],
        ["AscendaraDownloader", "src/AscendaraDownloader.py"],
        ["AscendaraGameHandler", "src/AscendaraGameHandler.py"],
        ["AscendaraLanguageTranslation", "src/AscendaraLanguageTranslation.py"],
        ["AscendaraTorrentHandler", "src/AscendaraTorrentHandler.py"],
        ["AscendaraAchievementWatcher", "dist/AscendaraAchievementWatcher"],
      ];
      for (const [name, source] of helpers) {
        const helper = isDev
          ? path.join(app.getAppPath(), "binaries", name, source)
          : path.join(process.resourcesPath, name);
        if (fs.existsSync(helper)) await fs.chmod(helper, 0o755);
      }

      installWindow = new BrowserWindow({
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

      await installWindow.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`
      );

      const updateStatus = message => {
        !installWindow.isDestroyed() &&
          installWindow.webContents.executeJavaScript(`
          document.querySelector('.status').textContent = ${JSON.stringify(message)};
        `);
      };

      const updateProgress = percent => {
        !installWindow.isDestroyed() &&
          installWindow.webContents.executeJavaScript(`
          document.querySelector('.progress').style.width = '${percent}%';
        `);
      };

      const { findCommand, runtimePath } = require("./wine-setup");
      process.env.PATH = runtimePath();
      let command;
      if (process.platform === "darwin") {
        if (!findCommand("brew"))
          throw new Error(
            "Install Homebrew from https://brew.sh in Terminal, then retry Python setup."
          );
        command = "NONINTERACTIVE=1 brew install python";
      } else if (!findCommand("pkexec")) {
        throw new Error(
          "Install Python 3, pip and venv using your distribution's software manager. Automatic setup requires pkexec."
        );
      } else if (findCommand("apt-get")) {
        command = "pkexec apt-get install -y python3 python3-pip python3-venv";
      } else if (findCommand("dnf")) {
        command = "pkexec dnf install -y python3 python3-pip";
      } else if (findCommand("pacman")) {
        command = "pkexec pacman -S --needed --noconfirm python python-pip";
      } else if (findCommand("zypper")) {
        command = "pkexec zypper --non-interactive install python3 python3-pip";
      } else {
        throw new Error(
          "Install Python 3, pip and venv using your distribution's software manager."
        );
      }

      await new Promise((resolve, reject) => {
        const proc = exec(command, error => {
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
      const packages = [
        "requests",
        "psutil",
        "pypresence",
        "patool",
        "pySmartDL",
        "cloudscraper",
        "beautifulsoup4",
        "rarfile",
      ];

      await new Promise((resolveVenv, rejectVenv) => {
        exec(
          `mkdir -p "${path.join(os.homedir(), ".ascendara")}" && python3 -m venv "${venvPath}"`,
          (err, _stdout, stderr) => {
            if (err) {
              console.error("venv creation failed:", stderr);
              rejectVenv(err);
            } else {
              resolveVenv();
            }
          }
        );
      });

      updateStatus("Installing required packages...");
      updateProgress(50);

      const venvPip = path.join(venvPath, "bin", "pip");

      await new Promise((resolvePackage, rejectPackage) => {
        const pipProc = exec(
          `"${venvPip}" install ${packages.join(" ")}`,
          (err, _stdout, stderr) => {
            if (err) {
              console.error("Error installing packages:", stderr);
              rejectPackage(err);
            } else {
              resolvePackage();
            }
          }
        );

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
      if (installWindow && !installWindow.isDestroyed()) installWindow.close();
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
