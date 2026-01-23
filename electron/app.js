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
const https = require("https");
const path = require("path");
const fs = require("fs-extra");

// Disable sandbox for Linux compatibility (must be set before app ready)
if (process.platform === "linux") {
  app.commandLine.appendSwitch("--no-sandbox");
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
  // Use the correct icon path - try multiple locations
  let iconPath;
  if (isDev) {
    iconPath = path.join(__dirname, "../readme/logo/ico/ascendara_64x.ico");
  } else {
    // In production, icon should be in resources
    iconPath = path.join(process.resourcesPath, "icon.ico");
    // Fallback to app directory if not in resources
    if (!fs.existsSync(iconPath)) {
      iconPath = path.join(config.appDirectory, "icon.ico");
    }
  }

  // Verify icon exists
  if (!fs.existsSync(iconPath)) {
    console.error("Tray icon not found at:", iconPath);
    // Use a fallback - create from the window icon
    iconPath = path.join(__dirname, "../readme/logo/ico/ascendara_64x.ico");
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
 * Start the achievement watcher process (Windows only)
 */
function startAchievementWatcher() {
  if (process.platform !== "win32") {
    return;
  }

  const { spawn } = require("child_process");
  const os = require("os");

  const watcherExePath = isDev
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
    windowsHide: true,
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
  system.registerSystemHandlers();
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
    // Start local HTTP server in production to serve app from localhost
    // This allows Firebase auth to work since 'localhost' can be added to authorized domains
    if (!isDev) {
      localServer = http.createServer((req, res) => {
        // Handle KHInsider proxy requests
        if (req.url.startsWith("/api/khinsider")) {
          const targetPath = req.url.replace(/^\/api\/khinsider/, "");
          const targetUrl = `https://downloads.khinsider.com${targetPath}`;

          const parsedUrl = new URL(targetUrl);
          const proxyOptions = {
            hostname: parsedUrl.hostname,
            port: 443,
            path: parsedUrl.pathname + parsedUrl.search,
            method: req.method,
            headers: { ...req.headers, host: parsedUrl.hostname },
          };

          delete proxyOptions.headers["host"];
          delete proxyOptions.headers["connection"];

          const proxyReq = https.request(proxyOptions, proxyRes => {
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res);
          });

          proxyReq.on("error", err => {
            console.error("KHInsider proxy error:", err);
            res.writeHead(502);
            res.end("Proxy error");
          });

          proxyReq.end();
          return;
        }

        // Handle Torbox API proxy requests
        if (req.url.startsWith("/api/torbox")) {
          const targetPath = req.url.replace(/^\/api\/torbox/, "");
          const targetUrl = `https://api.torbox.app/v1/api${targetPath}`;

          // Collect request body for POST/PUT requests
          let body = [];
          req.on("data", chunk => body.push(chunk));
          req.on("end", () => {
            body = Buffer.concat(body);

            const parsedUrl = new URL(targetUrl);
            const proxyOptions = {
              hostname: parsedUrl.hostname,
              port: 443,
              path: parsedUrl.pathname + parsedUrl.search,
              method: req.method,
              headers: { ...req.headers, host: parsedUrl.hostname },
            };

            // Remove headers that shouldn't be forwarded
            delete proxyOptions.headers["host"];
            delete proxyOptions.headers["connection"];
            delete proxyOptions.headers["content-length"];
            if (body.length > 0) {
              proxyOptions.headers["content-length"] = body.length;
            }

            const proxyReq = https.request(proxyOptions, proxyRes => {
              // Set CORS headers
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.setHeader(
                "Access-Control-Allow-Methods",
                "GET, POST, PUT, DELETE, OPTIONS"
              );
              res.setHeader(
                "Access-Control-Allow-Headers",
                "Content-Type, Authorization"
              );

              res.writeHead(proxyRes.statusCode, proxyRes.headers);
              proxyRes.pipe(res);
            });

            proxyReq.on("error", err => {
              console.error("Torbox proxy error:", err);
              res.writeHead(502);
              res.end("Proxy error");
            });

            if (body.length > 0) {
              proxyReq.write(body);
            }
            proxyReq.end();
          });
          return;
        }

        // Handle FLiNG Trainer proxy requests
        if (req.url.startsWith("/api/flingtrainer")) {
          const targetPath = req.url.replace(/^\/api\/flingtrainer/, "");
          const targetUrl = `https://flingtrainer.com${targetPath}`;

          const parsedUrl = new URL(targetUrl);
          const proxyOptions = {
            hostname: parsedUrl.hostname,
            port: 443,
            path: parsedUrl.pathname + parsedUrl.search,
            method: req.method,
            headers: { ...req.headers, host: parsedUrl.hostname },
          };

          delete proxyOptions.headers["host"];
          delete proxyOptions.headers["connection"];

          const proxyReq = https.request(proxyOptions, proxyRes => {
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res);
          });

          proxyReq.on("error", err => {
            console.error("FlingTrainer proxy error:", err);
            res.writeHead(502);
            res.end("Proxy error");
          });

          proxyReq.end();
          return;
        }

        // Handle Analytics proxy requests
        if (req.url.startsWith("/api/analytics")) {
          const targetPath = req.url.replace(/^\/api\/analytics/, "");
          const targetUrl = `https://analytics.ascendara.app${targetPath}`;

          // Collect request body for POST/PUT requests
          let body = [];
          req.on("data", chunk => body.push(chunk));
          req.on("end", () => {
            body = Buffer.concat(body);

            const parsedUrl = new URL(targetUrl);
            const proxyOptions = {
              hostname: parsedUrl.hostname,
              port: 443,
              path: parsedUrl.pathname + parsedUrl.search,
              method: req.method,
              headers: { ...req.headers, host: parsedUrl.hostname },
            };

            // Remove headers that shouldn't be forwarded
            delete proxyOptions.headers["host"];
            delete proxyOptions.headers["connection"];
            delete proxyOptions.headers["content-length"];
            if (body.length > 0) {
              proxyOptions.headers["content-length"] = body.length;
            }

            const proxyReq = https.request(proxyOptions, proxyRes => {
              // Set CORS headers
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.setHeader(
                "Access-Control-Allow-Methods",
                "GET, POST, PUT, DELETE, OPTIONS"
              );
              res.setHeader(
                "Access-Control-Allow-Headers",
                "Content-Type, Authorization, X-API-Key, X-Signature"
              );

              res.writeHead(proxyRes.statusCode, proxyRes.headers);
              proxyRes.pipe(res);
            });

            proxyReq.on("error", err => {
              console.error("Analytics proxy error:", err);
              res.writeHead(502);
              res.end("Proxy error");
            });

            if (body.length > 0) {
              proxyReq.write(body);
            }
            proxyReq.end();
          });
          return;
        }

        // Handle CORS preflight for API routes
        if (req.method === "OPTIONS" && req.url.startsWith("/api/")) {
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader(
            "Access-Control-Allow-Methods",
            "GET, POST, PUT, DELETE, OPTIONS"
          );
          res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
          res.writeHead(204);
          res.end();
          return;
        }

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

    // Create the main window
    const mainWindow = windowModule.createWindow();

    // Create system tray
    createTray();

    // Start achievement watcher (Windows only)
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
