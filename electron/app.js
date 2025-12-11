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

const { app, BrowserWindow, Tray, Menu, nativeImage } = require("electron");
const http = require("http");
const path = require("path");
const fs = require("fs-extra");

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

/**
 * Launch crash reporter
 */
function launchCrashReporter(errorType, errorMessage) {
  const { spawn } = require("child_process");

  const crashReporterPath = isDev
    ? path.join("./binaries/AscendaraCrashReporter/dist/AscendaraCrashReporter.exe")
    : path.join(config.appDirectory, "/resources/AscendaraCrashReporter.exe");

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
  const iconPath = path.join(__dirname, "icon.ico");
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Open Ascendara",
      click: () => {
        windowModule.showWindow();
      },
    },
    {
      label: "Quit",
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setToolTip("Ascendara");
  tray.setContextMenu(contextMenu);

  tray.on("click", () => {
    windowModule.showWindow();
  });
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
  system.registerSystemHandlers();
  ipcHandlers.registerMiscHandlers();
  translations.registerTranslationHandlers();
}

/**
 * Register deferred IPC handlers (can wait until after window loads)
 */
function registerDeferredHandlers() {
  steamcmd.registerSteamCMDHandlers();
  localRefresh.registerLocalRefreshHandlers();
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
    // Start local HTTP server in production to serve app from localhost
    // This allows Firebase auth to work since 'localhost' can be added to authorized domains
    if (!isDev) {
      localServer = http.createServer((req, res) => {
        let filePath = req.url === "/" ? "/index.html" : req.url;
        // Remove query strings
        filePath = filePath.split("?")[0];
        const fullPath = path.join(__dirname, filePath);
        const ext = path.extname(fullPath).toLowerCase();
        const contentType = mimeTypes[ext] || "application/octet-stream";

        fs.readFile(fullPath)
          .then(data => {
            res.writeHead(200, { "Content-Type": contentType });
            res.end(data);
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

      // Handle server errors silently (e.g., port in use, connection reset on close)
      localServer.on("error", err => {
        console.error("Local server error:", err.message);
      });

      localServer.listen(5432, "127.0.0.1", () => {
        console.log("Local server running at http://localhost:5432");
      });
    }

    // Register critical IPC handlers first (needed for window to function)
    registerCriticalHandlers();

    // Create the main window
    const mainWindow = windowModule.createWindow();

    // Create system tray
    createTray();

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

    // macOS specific handling
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        windowModule.createWindow();
      }
    });
  });

  // Quit when all windows are closed (except on macOS)
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      // Don't quit, just hide to tray
    }
  });

  // Before quit cleanup
  app.on("before-quit", () => {
    console.log("App is quitting...");
    // Close local server if running
    if (localServer) {
      localServer.close();
      localServer = null;
    }
    // Notify renderer to set status to invisible
    const mainWindow = windowModule.getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("app-closing");
    }
    discordRpc.destroyDiscordRPC();
  });

  // Will quit cleanup
  app.on("will-quit", () => {
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
});

process.on("SIGINT", () => {
  console.log("Received SIGINT");
  discordRpc.destroyDiscordRPC();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("Received SIGTERM");
  discordRpc.destroyDiscordRPC();
  process.exit(0);
});

// Start the application
initializeApp();
