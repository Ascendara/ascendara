/**
 * Ascendara Main Process
 * Entry point for the Electron application
 *
 * This file has been refactored to use modular architecture.
 * All functionality is organized into separate modules in the ./modules directory.
 *
 * Start the app in development mode by running `yarn start`.
 * Build the app from source to an executable by running `yarn dist`.
 * Note: This will run the build_ascendara.py script to build the index files, then build the app.
 */

require("dotenv").config();

// Finder-launched apps do not inherit Homebrew paths. Child game processes need Wine too.
if (process.platform !== "win32") {
  process.env.PATH = require("./modules/wine-setup").runtimePath();
}

const { app, BrowserWindow, Tray, Menu, nativeImage, powerMonitor } = require("electron");
const http = require("http");
const { proxyLocalRequest } = require("./modules/local-api-proxy");
const path = require("path");
const fs = require("fs-extra");
const { isLinux } = require("./modules/config");
const {
  isAllowedLocalRequest,
  resolvePublicFile,
} = require("./modules/local-server-security");

// Disable sandbox for Linux compatibility (must be set before app ready)
if (process.platform === "linux") {
  app.commandLine.appendSwitch("--no-sandbox");
  // Ignore GPU blocklist to prevent WebGL errors in external windows
  app.commandLine.appendSwitch("--ignore-gpu-blocklist");
  // Disable GPU process crash limit to prevent crashes from affecting the app
  app.commandLine.appendSwitch("--disable-gpu-process-crash-limit");
}

// Import modules
const {
  config,
  logger,
  utils,
  settings,
  window: windowModule,
  discordRpc,
  protocol,
  tools,
  steamcmd,
  updates,
  downloads,
  games,
  localRefresh,
  ludusavi,
  translations,
  system,
  themes,
  ipcHandlers,
} = require("./modules");

// Destructure commonly used values from config
const { appVersion, isDev } = config;

// Initialize logger
logger.initializeLogger();

// Print dev mode intro if in development
if (isDev) {
  utils.printDevModeIntro(appVersion, process.env.NODE_ENV || "development", isDev);
}

// Global variables
let tray = null;
let localServer = null;
let watcherProcess = null;

/**
 * Launch crash reporter
 */
function launchCrashReporter(errorType, errorMessage) {
  const { spawn } = require("child_process");

  let crashReporterPath;
  if (isDev) {
    crashReporterPath =
      process.platform === "win32"
        ? path.join(
            "./binaries/AscendaraCrashReporter/target/release/AscendaraCrashReporter.exe"
          )
        : path.join(
            "./binaries/AscendaraCrashReporter/target/release/AscendaraCrashReporter"
          );
  } else {
    crashReporterPath =
      process.platform === "win32"
        ? path.join(config.appDirectory, "/resources/AscendaraCrashReporter.exe")
        : path.join(process.resourcesPath, "AscendaraCrashReporter");
  }

  if (!fs.existsSync(crashReporterPath)) {
    console.error("Crash reporter not found at:", crashReporterPath);
    return;
  }

  const crashReporter = spawn(crashReporterPath, [errorType, errorMessage], {
    detached: true,
    stdio: "ignore",
  });

  crashReporter.unref();
}

/**
 * Create system tray
 */
function createTray() {
  // Use the correct icon path - try multiple locations
  const isLinux = process.platform === "linux";
  let iconPath;
  if (isDev) {
    iconPath = isLinux
      ? path.join(__dirname, "../readme/logo/png/ascendara_64x.png")
      : path.join(__dirname, "../readme/logo/ico/ascendara_64x.ico");
  } else {
    // In production, icon should be in resources
    iconPath = isLinux
      ? path.join(process.resourcesPath, "icon.png")
      : path.join(process.resourcesPath, "icon.ico");
    // Fallback to app directory if not in resources
    if (!fs.existsSync(iconPath)) {
      iconPath = isLinux
        ? path.join(config.appDirectory, "icon.png")
        : path.join(config.appDirectory, "icon.ico");
    }
  }

  // Verify icon exists
  if (!fs.existsSync(iconPath)) {
    console.error("Tray icon not found at:", iconPath);
    iconPath = isLinux
      ? path.join(__dirname, "../readme/logo/png/ascendara_64x.png")
      : path.join(__dirname, "../readme/logo/ico/ascendara_64x.ico");
  }

  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show Ascendara",
      click: () => {
        windowModule.showWindow();
      },
    },
    {
      label: "Hide Ascendara",
      click: () => {
        windowModule.hideWindow();
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip("Ascendara");
  tray.setContextMenu(contextMenu);

  // Double-click to show/hide window
  tray.on("double-click", () => {
    const mainWindow = windowModule.getMainWindow();
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        windowModule.hideWindow();
      } else {
        windowModule.showWindow();
      }
    } else {
      windowModule.showWindow();
    }
  });

  // Single click to show window (Windows behavior)
  if (process.platform === "win32") {
    tray.on("click", () => {
      windowModule.showWindow();
    });
  }

  console.log("System tray created successfully");
}

/**
 * Start the achievement watcher process (Windows and Linux)
 */
function startAchievementWatcher() {
  // Migrate the legacy completion flag before the watcher can rewrite it.
  require("./modules/onboarding").hasCompletedOnboarding();
  if (process.platform !== "win32" && process.platform !== "linux") {
    return;
  }

  const { spawn } = require("child_process");

  const isLinux = process.platform === "linux";
  const watcherExePath = isLinux
    ? isDev
      ? "./binaries/AscendaraAchievementWatcher/dist/AscendaraAchievementWatcher"
      : path.join(process.resourcesPath, "AscendaraAchievementWatcher")
    : isDev
      ? "./binaries/AscendaraAchievementWatcher/dist/AscendaraAchievementWatcher.exe"
      : path.join(process.resourcesPath, "AscendaraAchievementWatcher.exe");

  if (!fs.existsSync(watcherExePath)) {
    console.error("Achievement watcher not found at:", watcherExePath);
    return;
  }

  watcherProcess = spawn(watcherExePath, [], {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ASCENDARA_STEAM_WEB_API_KEY: config.steamWebApiKey,
    },
    windowsHide: !isLinux,
  });

  watcherProcess.stdout.on("data", data => {
    console.log(`[WATCHER] ${data.toString().trim()}`);
  });

  watcherProcess.stderr.on("data", data => {
    console.error(`[WATCHER ERROR] ${data.toString().trim()}`);
  });

  watcherProcess.on("error", error => {
    console.error("Achievement watcher error:", error);
  });

  watcherProcess.on("exit", (code, signal) => {
    console.log(`Achievement watcher exited with code ${code} and signal ${signal}`);
    watcherProcess = null;
  });

  console.log("Achievement watcher started");
}

/**
 * Terminate the achievement watcher process
 */
function terminateWatcher() {
  if (watcherProcess && !watcherProcess.killed) {
    if (process.platform === "win32") {
      const { exec } = require("child_process");
      exec(`taskkill /pid ${watcherProcess.pid} /T /F`, err => {
        if (err) {
          console.error("Error terminating watcher:", err);
        }
      });
    } else {
      watcherProcess.kill("SIGTERM");
    }
    watcherProcess = null;
  }
}

/**
 * Register critical IPC handlers (needed immediately)
 */
function registerCriticalHandlers() {
  settings.registerSettingsHandlers();
  windowModule.registerWindowHandlers();
  protocol.registerProtocolHandlers();
  tools.registerToolHandlers();
  updates.registerUpdateHandlers();
  downloads.registerDownloadHandlers();
  games.registerGameHandlers();
  require("./modules/retro").registerRetroHandlers();
  system.registerSystemHandlers();
  require("./modules/proton").registerRunnerHandlers();
  if (isLinux) {
    const { registerProtonHandlers } = require("./modules/proton");
    registerProtonHandlers();

    const {
      registerUmuDatabaseHandlers,
      refreshUmuDatabase,
    } = require("./modules/umu-database");
    registerUmuDatabaseHandlers();

    refreshUmuDatabase().catch(e =>
      console.warn("[UMU-DB] Background refresh failed:", e.message)
    );
  }
  ipcHandlers.registerMiscHandlers();
  translations.registerTranslationHandlers();
  localRefresh.registerLocalRefreshHandlers();
}

/**
 * Register deferred IPC handlers (can wait until after window loads)
 */
function registerDeferredHandlers() {
  steamcmd.registerSteamCMDHandlers();
  ludusavi.registerLudusaviHandlers();
  themes.registerThemeHandlers();
}

/**
 * Initialize the application
 */
async function initializeApp() {
  // Setup single instance lock and protocol handling
  const isPrimaryInstance = protocol.setupSingleInstance();
  if (!isPrimaryInstance) {
    return;
  }

  // Check for broken version
  await updates.checkBrokenVersion();

  // Check installed tools
  tools.checkInstalledTools();

  // MIME type lookup for local server
  const mimeTypes = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".eot": "application/vnd.ms-fontobject",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".webp": "image/webp",
  };

  // App ready handler
  app.whenReady().then(async () => {
    // Reset quitting flag on app start
    app.isQuitting = false;

    // Start local HTTP server in production to serve app from localhost
    // This allows Firebase auth to work since 'localhost' can be added to authorized domains
    if (!isDev) {
      localServer = http.createServer((req, res) => {
        if (!isAllowedLocalRequest(req)) {
          res.writeHead(403);
          res.end("Forbidden");
          return;
        }
        res.setHeader("X-Content-Type-Options", "nosniff");
        if (proxyLocalRequest(req, res)) return;

        const fullPath = resolvePublicFile(__dirname, req.url);
        if (!fullPath || !["GET", "HEAD"].includes(req.method)) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const ext = path.extname(fullPath).toLowerCase();
        const contentType = mimeTypes[ext] || "application/octet-stream";

        fs.readFile(fullPath)
          .then(data => {
            res.writeHead(200, { "Content-Type": contentType });
            res.end(req.method === "HEAD" ? undefined : data);
          })
          .catch(() => {
            // For SPA routing, serve index.html for non-file routes
            fs.readFile(path.join(__dirname, "index.html"))
              .then(data => {
                res.writeHead(200, { "Content-Type": "text/html" });
                res.end(data);
              })
              .catch(() => {
                res.writeHead(404);
                res.end("Not found");
              });
          });
      });

      // Handle server errors (e.g., port in use)
      localServer.on("error", err => {
        console.error("Local server error:", err.message);
      });

      localServer.listen(46859, "127.0.0.1", () => {
        console.log("Local server running at http://localhost:46859");
      });
    }

    // Register critical IPC handlers first (needed for window to function)
    registerCriticalHandlers();

    // Keep the OS login item (auto-launch) settings in sync with saved settings
    settings.applyLoginItemSettings();

    // Create the main window
    const mainWindow = windowModule.createWindow();

    // Create system tray
    createTray();

    // Start achievement watcher (Windows and Linux)
    startAchievementWatcher();

    // Defer non-critical initialization until after window loads
    mainWindow.webContents.once("did-finish-load", () => {
      // Register deferred handlers (steamcmd, ludusavi, translations, themes, etc.)
      registerDeferredHandlers();

      // Initialize Discord RPC after a short delay
      setTimeout(() => {
        discordRpc.initializeDiscordRPC();
      }, 500);
    });

    // Handle pending protocol URLs
    const pendingUrls = protocol.getPendingUrls();
    if (pendingUrls.length > 0) {
      mainWindow.webContents.once("did-finish-load", () => {
        pendingUrls.forEach(url => protocol.handleProtocolUrl(url));
      });
    }

    // Handle protocol URL from command line (Windows)
    const protocolUrl = process.argv.find(arg => arg.startsWith("ascendara://"));
    if (protocolUrl) {
      mainWindow.webContents.once("did-finish-load", () => {
        protocol.handleProtocolUrl(protocolUrl);
      });
    }

    // Force repaint after system resume or display wake to fix idle black screens
    const handleSystemResume = () => {
      const mainWindow = windowModule.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
        console.log("System resumed - forcing window repaint");
        mainWindow.webContents.invalidate();
      }
    };
    powerMonitor.on("resume", handleSystemResume);
    powerMonitor.on("unlock-screen", handleSystemResume);

    // macOS specific handling
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        windowModule.createWindow();
      }
    });
  });

  // Quit when all windows are closed (except on macOS)
  app.on("window-all-closed", () => {
    // Don't quit - keep running in tray
    // Only quit if explicitly requested via tray menu or app.isQuitting flag
    if (app.isQuitting) {
      app.quit();
    }
  });

  // Before quit cleanup
  app.on("before-quit", () => {
    console.log("App is quitting...");

    // Close local server if running
    if (localServer) {
      console.log("Closing local HTTP server...");
      localServer.close(() => {
        console.log("Local server closed");
      });
      // Force close all connections
      localServer.closeAllConnections?.();
      localServer = null;
    }

    // Notify renderer to set status to invisible
    const mainWindow = windowModule.getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("app-closing");
    }

    // Cleanup Discord RPC and achievement watcher
    discordRpc.destroyDiscordRPC();
    terminateWatcher();
  });

  // Will quit cleanup
  app.on("will-quit", e => {
    console.log("App will quit - final cleanup...");

    // Ensure watcher is terminated
    terminateWatcher();

    // Final check for any remaining achievement watcher processes
    // NOTE: Do NOT kill AscendaraDownloader.exe - downloads should continue in background
    if (process.platform === "win32") {
      const { exec } = require("child_process");
      exec(`taskkill /F /IM AscendaraAchievementWatcher.exe /T 2>nul`, () => {});
    }

    logger.closeLogger();
  });
}

// Global error handlers
process.on("uncaughtException", error => {
  console.error("Uncaught Exception:", error);
  if (!isDev) {
    launchCrashReporter("uncaughtException", error.message || "Unknown error");
  }
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  if (!isDev) {
    launchCrashReporter(
      "unhandledRejection",
      reason?.message || String(reason) || "Unknown rejection"
    );
  }
});

// Process exit handlers
process.on("exit", code => {
  console.log(`Process exiting with code: ${code}`);
  discordRpc.destroyDiscordRPC();
  terminateWatcher();
});

process.on("SIGINT", () => {
  console.log("Received SIGINT");
  app.isQuitting = true;
  discordRpc.destroyDiscordRPC();
  terminateWatcher();
  app.quit();
});

process.on("SIGTERM", () => {
  console.log("Received SIGTERM");
  app.isQuitting = true;
  discordRpc.destroyDiscordRPC();
  terminateWatcher();
  app.quit();
});

// Start the application
initializeApp();
