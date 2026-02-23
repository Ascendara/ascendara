/**
 * Proton Module
 * Handles Proton/Wine runner detection, download, prefix management for Linux.
 */

const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const { exec, spawn } = require("child_process");
const { ipcMain, BrowserWindow } = require("electron");
const {
  isLinux,
  linuxConfigDir,
  linuxCompatDataDir,
  linuxRunnersDir,
  STEAM_COMMON_PATHS,
  STEAM_INSTALL_PATHS,
} = require("./config");
const { getSettingsManager } = require("./settings");

// ─── Helpers ──────────────────────────────────────────────

/**
 * Sanitize a game name for use as a folder name
 */
function sanitizeGameSlug(name) {
  return name
    .replace(/[^\w\s\-().]/g, "")
    .replace(/\s+/g, "_")
    .substring(0, 100);
}

/**
 * Check if a file is a Windows executable
 */
function isWindowsExecutable(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return [".exe", ".msi", ".bat"].includes(ext);
}

/**
 * Find Steam client install path (needed by some Proton versions)
 */
function findSteamInstallPath() {
  for (const steamPath of STEAM_INSTALL_PATHS) {
    if (fs.existsSync(steamPath)) {
      return steamPath;
    }
  }
  return path.join(os.homedir(), ".steam/steam"); // fallback
}

// ─── Directory Setup ──────────────────────────────────────

/**
 * Ensure all Linux-specific directories exist.
 * Called at app startup.
 */
function ensureLinuxDirectories() {
  if (!isLinux) return;

  const dirs = [linuxConfigDir, linuxCompatDataDir, linuxRunnersDir];

  for (const dir of dirs) {
    if (dir) {
      fs.ensureDirSync(dir);
    }
  }

  console.log("[Proton] Linux directories ensured:", linuxConfigDir);
}

// ─── Proton Detection ─────────────────────────────────────

/**
 * Scan for installed Proton versions in Steam directories and custom runners.
 * Returns array of { name, path, version, source }
 */
async function detectInstalledProtons() {
  if (!isLinux) return [];

  const protons = [];
  const seen = new Set();

  // 1. Scan Steam common directories
  for (const commonPath of STEAM_COMMON_PATHS) {
    if (!fs.existsSync(commonPath)) continue;

    try {
      const dirs = await fs.readdir(commonPath, { withFileTypes: true });
      for (const d of dirs) {
        if (!d.isDirectory()) continue;
        if (!d.name.toLowerCase().includes("proton")) continue;

        const protonScript = path.join(commonPath, d.name, "proton");
        if (fs.existsSync(protonScript)) {
          const fullPath = path.join(commonPath, d.name);
          if (!seen.has(fullPath)) {
            seen.add(fullPath);
            protons.push({
              name: d.name,
              path: fullPath,
              version: d.name.replace(/Proton\s*/i, "").trim() || "Unknown",
              source: "steam",
            });
          }
        }
      }
    } catch (err) {
      console.warn(`[Proton] Error scanning ${commonPath}:`, err.message);
    }
  }

  // 2. Scan custom runners directory (~/.ascendara/runners/)
  if (fs.existsSync(linuxRunnersDir)) {
    try {
      const dirs = await fs.readdir(linuxRunnersDir, { withFileTypes: true });
      for (const d of dirs) {
        if (!d.isDirectory()) continue;

        const protonScript = path.join(linuxRunnersDir, d.name, "proton");
        if (fs.existsSync(protonScript)) {
          const fullPath = path.join(linuxRunnersDir, d.name);
          if (!seen.has(fullPath)) {
            seen.add(fullPath);
            protons.push({
              name: d.name,
              path: fullPath,
              version: d.name.replace(/.*Proton\s*/i, "").trim() || d.name,
              source: "custom",
            });
          }
        }
      }
    } catch (err) {
      console.warn(`[Proton] Error scanning runners dir:`, err.message);
    }
  }

  // Sort: Proton GE first, then by version desc
  protons.sort((a, b) => {
    const aIsGE = a.name.toLowerCase().includes("ge");
    const bIsGE = b.name.toLowerCase().includes("ge");
    if (aIsGE && !bIsGE) return -1;
    if (!aIsGE && bIsGE) return 1;
    return b.version.localeCompare(a.version, undefined, { numeric: true });
  });

  return protons;
}

/**
 * Detect if system Wine is available as fallback
 */
async function detectSystemWine() {
  return new Promise(resolve => {
    exec("which wine", (err, stdout) => {
      if (err || !stdout.trim()) {
        resolve(null);
      } else {
        // Get Wine version
        exec("wine --version", (verErr, verOut) => {
          resolve({
            name: "System Wine",
            path: stdout.trim(),
            version: verErr ? "Unknown" : verOut.trim(),
            source: "system",
          });
        });
      }
    });
  });
}

/**
 * Get all available runners (Proton + Wine)
 */
async function getAllRunners() {
  const protons = await detectInstalledProtons();
  const wine = await detectSystemWine();

  const runners = [...protons];
  if (wine) {
    runners.push(wine);
  }

  return runners;
}

// ─── Proton GE Download ───────────────────────────────────
/**
 * Fetch info about the latest Proton-GE release.
 * Checks if an update is available by comparing with installed versions.
 * Returns: { name, size, downloadUrl, asset } or error
 */

async function getProtonGEInfo() {
  try {
    const releaseRes = await fetch(
      "https://api.github.com/repos/GloriousEggroll/proton-ge-custom/releases/latest",
      { headers: { "User-Agent": "Ascendara-Launcher" } }
    );

    if (!releaseRes.ok) {
      throw new Error(`GitHub API returned ${releaseRes.status}`);
    }

    const release = await releaseRes.json();
    const tagName = release.tag_name;

    const tarAsset = release.assets.find(
      a => a.name.endsWith(".tar.gz") && !a.name.includes("sha512sum")
    );

    if (!tarAsset) {
      throw new Error("No tar.gz asset found in the latest release");
    }

    // Check if this exact version is already installed
    const targetDir = path.join(linuxRunnersDir, tagName);
    const alreadyInstalled = fs.existsSync(path.join(targetDir, "proton"));

    // Check if ANY Proton-GE is installed (for update detection)
    let installedGEVersions = [];
    if (fs.existsSync(linuxRunnersDir)) {
      try {
        const dirs = await fs.readdir(linuxRunnersDir, { withFileTypes: true });
        for (const d of dirs) {
          if (d.isDirectory() && d.name.toLowerCase().includes("ge-proton")) {
            if (fs.existsSync(path.join(linuxRunnersDir, d.name, "proton"))) {
              installedGEVersions.push(d.name);
            }
          }
        }
      } catch (e) {}
    }

    const hasOlderVersion = installedGEVersions.length > 0 && !alreadyInstalled;

    return {
      success: true,
      name: tagName,
      fileName: tarAsset.name,
      size: tarAsset.size,
      sizeFormatted: `${(tarAsset.size / (1024 * 1024)).toFixed(0)} MB`,
      downloadUrl: tarAsset.browser_download_url,
      alreadyInstalled,
      installPath: targetDir,
      // Update info
      updateAvailable: hasOlderVersion,
      installedVersions: installedGEVersions,
      latestVersion: tagName,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Remove old Proton-GE versions after a successful update.
 * Keeps only the specified version.
 */
async function removeOldProtonGE(keepVersion) {
  if (!fs.existsSync(linuxRunnersDir)) return [];

  const removed = [];
  try {
    const dirs = await fs.readdir(linuxRunnersDir, { withFileTypes: true });
    for (const d of dirs) {
      if (
        d.isDirectory() &&
        d.name.toLowerCase().includes("ge-proton") &&
        d.name !== keepVersion
      ) {
        const fullPath = path.join(linuxRunnersDir, d.name);
        await fs.remove(fullPath);
        removed.push(d.name);
        console.log(`[Proton] Removed old version: ${d.name}`);
      }
    }
  } catch (err) {
    console.error("[Proton] Error removing old versions:", err);
  }
  return removed;
}

/**
 * Download and install Proton-GE from GitHub releases.
 * Shows progress in a dedicated window.
 * Call getProtonGEInfo() first to show confirmation to user.
 */
async function downloadProtonGE(parentWindow) {
  if (!isLinux) {
    return { success: false, message: "Only available on Linux" };
  }

  // Create progress window
  const progressWindow = new BrowserWindow({
    width: 520,
    height: 280,
    parent: parentWindow || undefined,
    modal: !!parentWindow,
    frame: false,
    transparent: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  progressWindow.loadURL(
    "data:text/html;charset=utf-8," +
      encodeURIComponent(`<!DOCTYPE html><html><head><style>
        * { margin: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: rgba(24, 24, 27, 0.97);
          color: #e4e4e7;
          padding: 32px;
          height: 100vh;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          gap: 16px; border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.1);
        }
        .spinner { width: 36px; height: 36px; border: 3px solid rgba(255,255,255,0.1); border-top: 3px solid #8b5cf6; border-radius: 50%; animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        h3 { font-size: 16px; font-weight: 600; }
        .status { font-size: 13px; color: #a1a1aa; text-align: center; min-height: 20px; }
        .progress-wrap { width: 100%; max-width: 400px; }
        .progress-bar { height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden; }
        .progress { height: 100%; background: linear-gradient(90deg, #8b5cf6, #6d28d9); border-radius: 3px; transition: width 0.3s ease; width: 0%; }
        .percent { font-size: 12px; color: #71717a; text-align: right; margin-top: 4px; }
      </style></head><body>
        <div class="spinner"></div>
        <h3>Downloading Proton-GE</h3>
        <div class="status">Fetching latest release...</div>
        <div class="progress-wrap">
          <div class="progress-bar"><div class="progress" id="prog"></div></div>
          <div class="percent" id="pct"></div>
        </div>
      </body></html>`)
  );

  const updateStatus = msg =>
    progressWindow.webContents.executeJavaScript(
      `document.querySelector('.status').textContent=${JSON.stringify(msg)};`
    );
  const updateProgress = pct =>
    progressWindow.webContents.executeJavaScript(
      `document.getElementById('prog').style.width='${pct}%';document.getElementById('pct').textContent='${Math.round(pct)}%';`
    );

  try {
    // 1. Get release info
    updateStatus("Fetching latest Proton-GE release...");
    updateProgress(5);

    const info = await getProtonGEInfo();
    if (!info.success) throw new Error(info.error);

    if (info.alreadyInstalled) {
      updateStatus(`${info.name} is already installed!`);
      updateProgress(100);
      await new Promise(r => setTimeout(r, 2000));
      progressWindow.close();
      return {
        success: true,
        message: "Already installed",
        path: info.installPath,
        name: info.name,
      };
    }

    // 2. Download
    updateStatus(`Downloading ${info.fileName} (${info.sizeFormatted})...`);
    updateProgress(10);

    const tempPath = path.join(os.tmpdir(), info.fileName);

    const downloadRes = await fetch(info.downloadUrl);
    if (!downloadRes.ok) throw new Error(`Download failed: ${downloadRes.status}`);

    const totalSize = parseInt(downloadRes.headers.get("content-length") || info.size);
    const reader = downloadRes.body.getReader();
    const chunks = [];
    let downloaded = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      downloaded += value.length;
      const pct = 10 + (downloaded / totalSize) * 60;
      updateProgress(pct);
      updateStatus(
        `Downloading... ${(downloaded / 1024 / 1024).toFixed(1)} / ${(totalSize / 1024 / 1024).toFixed(1)} MB`
      );
    }

    const buffer = Buffer.concat(chunks);
    await fs.writeFile(tempPath, buffer);

    // 3. Extract
    updateStatus("Extracting (this may take a moment)...");
    updateProgress(75);

    fs.ensureDirSync(linuxRunnersDir);

    await new Promise((resolve, reject) => {
      const proc = exec(
        `tar -xzf "${tempPath}" -C "${linuxRunnersDir}"`,
        { maxBuffer: 10 * 1024 * 1024 },
        err => {
          if (err) reject(err);
          else resolve();
        }
      );
      proc.stderr.on("data", data => {
        updateStatus(`Extracting: ${data.toString().trim().substring(0, 60)}`);
      });
    });

    updateProgress(95);

    // 4. Cleanup
    await fs.remove(tempPath);

    // 5. Verify
    let installedPath = path.join(linuxRunnersDir, info.name);
    let installedName = info.name;

    if (!fs.existsSync(path.join(installedPath, "proton"))) {
      const extractedDirs = await fs.readdir(linuxRunnersDir, { withFileTypes: true });
      const found = extractedDirs.find(
        d => d.isDirectory() && d.name.toLowerCase().includes("ge-proton")
      );
      if (found && fs.existsSync(path.join(linuxRunnersDir, found.name, "proton"))) {
        installedPath = path.join(linuxRunnersDir, found.name);
        installedName = found.name;
      } else {
        throw new Error("Extraction succeeded but proton script not found");
      }
    }

    // 6. Auto-select this runner if current setting is "auto"
    const settingsManager = getSettingsManager();
    const currentSettings = settingsManager.getSettings();
    if (!currentSettings.linuxRunner || currentSettings.linuxRunner === "auto") {
      settingsManager.updateSetting("linuxRunner", installedPath);
      console.log(`[Proton] Auto-selected ${installedName} as default runner`);
    }

    // 7. If the current runner was an old GE version, update it
    if (currentSettings.linuxRunner && currentSettings.linuxRunner !== "auto") {
      const currentRunnerName = path.basename(currentSettings.linuxRunner);
      if (
        currentRunnerName.toLowerCase().includes("ge-proton") &&
        currentRunnerName !== installedName
      ) {
        settingsManager.updateSetting("linuxRunner", installedPath);
        console.log(
          `[Proton] Updated runner from ${currentRunnerName} to ${installedName}`
        );
      }
    }

    // 8. Remove old Proton-GE versions
    const removedVersions = await removeOldProtonGE(installedName);
    if (removedVersions.length > 0) {
      console.log(`[Proton] Cleaned up old versions: ${removedVersions.join(", ")}`);
    }
    updateStatus(`${installedName} installed successfully!`);
    updateProgress(100);
    await new Promise(r => setTimeout(r, 2000));
    progressWindow.close();

    return {
      success: true,
      message: `${installedName} installed`,
      path: installedPath,
      name: installedName,
    };
  } catch (err) {
    console.error("[Proton] Download failed:", err);
    updateStatus(`Error: ${err.message}`);
    await new Promise(r => setTimeout(r, 3000));
    progressWindow.close();
    return { success: false, message: err.message };
  }
}

// ─── Prefix Management ───────────────────────────────────

/**
 * Get the compat data path for a game (creates dir if needed)
 */
function getCompatDataPath(gameName) {
  const slug = sanitizeGameSlug(gameName);
  const compatPath = path.join(linuxCompatDataDir, slug);
  fs.ensureDirSync(compatPath);
  return compatPath;
}

/**
 * Delete a game's prefix (the pfx directory inside compat data)
 */
async function deleteGamePrefix(gameName) {
  const slug = sanitizeGameSlug(gameName);
  const compatPath = path.join(linuxCompatDataDir, slug);

  if (!fs.existsSync(compatPath)) {
    return { success: true, message: "No prefix to delete" };
  }

  try {
    await fs.remove(compatPath);
    // Recreate the empty compat dir (Proton will recreate pfx on next launch)
    fs.ensureDirSync(compatPath);
    return { success: true, message: "Prefix deleted successfully" };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/**
 * Get the size of a game's prefix directory
 */
async function getPrefixSize(gameName) {
  const slug = sanitizeGameSlug(gameName);
  const compatPath = path.join(linuxCompatDataDir, slug);

  if (!fs.existsSync(compatPath)) return 0;

  const { getDirectorySize } = require("./system");
  return await getDirectorySize(compatPath);
}

// ─── Runner Resolution ────────────────────────────────────

/**
 * Resolve which runner to use for a game.
 * Priority:
 *   1. Per-game override (from game JSON)
 *   2. Global setting
 *   3. Auto-detect (first available Proton, then Wine)
 *
 * Returns: { type: 'proton'|'wine', path: string, name: string } or null
 */
async function resolveRunner(gameOverride) {
  const settingsManager = getSettingsManager();
  const settings = settingsManager.getSettings();

  // 1. Per-game override
  if (gameOverride && gameOverride !== "auto") {
    if (fs.existsSync(path.join(gameOverride, "proton"))) {
      return { type: "proton", path: gameOverride, name: path.basename(gameOverride) };
    }
    // Could be a Wine binary path
    if (fs.existsSync(gameOverride)) {
      return { type: "wine", path: gameOverride, name: "Custom Wine" };
    }
  }

  // 2. Global setting
  const globalRunner = settings.linuxRunner || "auto";

  if (globalRunner !== "auto") {
    if (fs.existsSync(path.join(globalRunner, "proton"))) {
      return { type: "proton", path: globalRunner, name: path.basename(globalRunner) };
    }
    if (fs.existsSync(globalRunner)) {
      return { type: "wine", path: globalRunner, name: "Custom Wine" };
    }
  }

  // 3. Auto-detect
  const protons = await detectInstalledProtons();
  if (protons.length > 0) {
    return { type: "proton", path: protons[0].path, name: protons[0].name };
  }

  const wine = await detectSystemWine();
  if (wine) {
    return { type: "wine", path: wine.path, name: wine.name };
  }

  return null;
}

/**
 * Build the launch command and environment for a Windows game on Linux.
 *
 * Returns: { cmd: string[], env: object, runner: object } or null
 */
async function buildLaunchConfig(gameName, exePath, gameRunnerOverride) {
  const runner = await resolveRunner(gameRunnerOverride);

  if (!runner) {
    return { error: "No compatible runner found. Please install Proton-GE or Wine." };
  }

  const compatDataPath = getCompatDataPath(gameName);
  const steamInstallPath = findSteamInstallPath();

  if (runner.type === "proton") {
    const protonScript = path.join(runner.path, "proton");

    const env = {
      STEAM_COMPAT_DATA_PATH: compatDataPath,
      STEAM_COMPAT_CLIENT_INSTALL_PATH: steamInstallPath,
      // Proton handles DXVK/VKD3D automatically, but we can override
      // PROTON_USE_WINED3D: "1",    // Uncomment to disable DXVK
      // PROTON_NO_D3D11: "1",       // Uncomment to disable D3D11
      // PROTON_NO_D3D12: "1",       // Uncomment to disable VKD3D
      // PROTON_ENABLE_NVAPI: "1",   // For NVIDIA DLSS
    };

    return {
      cmd: [protonScript, "run", exePath],
      env,
      runner,
      compatDataPath,
    };
  }

  if (runner.type === "wine") {
    // Wine fallback — still use isolated prefix
    const winePrefix = path.join(compatDataPath, "pfx");
    fs.ensureDirSync(winePrefix);

    const env = {
      WINEPREFIX: winePrefix,
      WINEDLLOVERRIDES: "winemenubuilder.exe=d", // Prevent Wine from creating .desktop files
    };

    return {
      cmd: [runner.path, exePath],
      env,
      runner,
      compatDataPath,
    };
  }

  return { error: "Unknown runner type" };
}

// ─── IPC Handlers ─────────────────────────────────────────

function registerProtonHandlers() {
  if (!isLinux) return;

  // Ensure directories exist at startup
  ensureLinuxDirectories();

  // Get Proton-GE release info (for confirmation dialog)
  ipcMain.handle("get-proton-ge-info", async () => {
    return await getProtonGEInfo();
  });

  // Check for Proton-GE updates
  ipcMain.handle("check-proton-ge-update", async () => {
    return await getProtonGEInfo();
  });

  // Remove old Proton-GE versions manually
  ipcMain.handle("cleanup-old-proton-ge", async (_, keepVersion) => {
    const removed = await removeOldProtonGE(keepVersion);
    return { success: true, removed };
  });

  // Set custom runner path (from file dialog)
  ipcMain.handle("select-custom-runner", async event => {
    const { dialog } = require("electron");
    const win = BrowserWindow.fromWebContents(event.sender);

    const result = await dialog.showOpenDialog(win, {
      title: "Select Proton or Wine executable",
      properties: ["openDirectory"],
      message: "Select the folder containing a Proton installation or a Wine binary",
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    const selectedPath = result.filePaths[0];

    // Check if it's a Proton directory
    if (fs.existsSync(path.join(selectedPath, "proton"))) {
      return {
        success: true,
        type: "proton",
        path: selectedPath,
        name: path.basename(selectedPath),
      };
    }

    // Check if it's a directory containing a wine binary
    const wineBin = path.join(selectedPath, "bin", "wine");
    if (fs.existsSync(wineBin)) {
      return {
        success: true,
        type: "wine",
        path: wineBin,
        name: `Wine (${path.basename(selectedPath)})`,
      };
    }

    // Check if wine binary is directly in the folder
    const wineDirectBin = path.join(selectedPath, "wine");
    if (fs.existsSync(wineDirectBin)) {
      return {
        success: true,
        type: "wine",
        path: wineDirectBin,
        name: `Wine (${path.basename(selectedPath)})`,
      };
    }

    return {
      success: false,
      error:
        "No Proton or Wine installation found in the selected folder. Look for a folder containing a 'proton' script or a 'bin/wine' binary.",
    };
  });

  // Get all available runners
  ipcMain.handle("get-runners", async () => {
    return await getAllRunners();
  });

  // Detect Proton installations (replaces the one in system.js)
  ipcMain.handle("detect-proton", async () => {
    return await detectInstalledProtons();
  });

  // Download Proton-GE
  ipcMain.handle("download-proton-ge", async event => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return await downloadProtonGE(win);
  });

  // Delete game prefix
  ipcMain.handle("delete-game-prefix", async (_, gameName) => {
    return await deleteGamePrefix(gameName);
  });

  // Get prefix size
  ipcMain.handle("get-prefix-size", async (_, gameName) => {
    return await getPrefixSize(gameName);
  });

  // Get compat data path for a game
  ipcMain.handle("get-compat-data-path", async (_, gameName) => {
    return getCompatDataPath(gameName);
  });

  // Resolve which runner would be used
  ipcMain.handle("resolve-runner", async (_, gameOverride) => {
    return await resolveRunner(gameOverride);
  });

  // Set per-game runner override
  ipcMain.handle("set-game-runner", async (_, gameName, runnerPath) => {
    // This will be stored in the game's .ascendara.json
    // The actual modification is done in games.js when reading the game config
    return { success: true, runnerPath };
  });

  // Open prefix folder in file manager
  ipcMain.handle("open-prefix-folder", async (_, gameName) => {
    const compatPath = getCompatDataPath(gameName);
    const { shell } = require("electron");
    shell.openPath(compatPath);
  });
}

// ─── Exports ──────────────────────────────────────────────

module.exports = {
  registerProtonHandlers,
  ensureLinuxDirectories,
  detectInstalledProtons,
  detectSystemWine,
  getAllRunners,
  downloadProtonGE,
  getProtonGEInfo,
  resolveRunner,
  buildLaunchConfig,
  getCompatDataPath,
  deleteGamePrefix,
  getPrefixSize,
  sanitizeGameSlug,
  isWindowsExecutable,
  findSteamInstallPath,
  removeOldProtonGE,
};
