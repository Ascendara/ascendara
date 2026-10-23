/**
 * Protocol Module
 * Handles protocol URL handling (ascendara://)
 */

const { BrowserWindow, app } = require("electron");
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const { isDev } = require("../core/config");
const { createWindow, setHandlingProtocolUrl, setMainWindowHidden } = require("./window");

let lastHandledUrl = null;
let lastHandleTime = 0;
let pendingUrls = new Set();
const pendingCheckoutSessions = new Set();
const pendingBrowserDownloads = new Set();
const pendingGameUrls = new Set();
const pendingPlayGames = new Set();
const URL_DEBOUNCE_TIME = 2000;

function findProtocolUrlInArgs(args = process.argv) {
  if (!Array.isArray(args)) return null;
  for (const rawArg of args) {
    if (typeof rawArg !== "string") continue;
    const cleaned = rawArg.trim().replace(/^["']+|["']+$/g, "");
    if (cleaned.startsWith("ascendara://")) {
      return cleaned;
    }
  }
  return null;
}

function parseGameIdFromUrl(cleanUrl) {
  if (typeof cleanUrl !== "string") return "";
  const route = cleanUrl.slice("ascendara://".length).split(/[/?#]/)[0];
  if (route !== "game") return "";
  return cleanUrl
    .replace(/^ascendara:\/\/game\/?\??/i, "")
    .replace(/[/?#].*$/, "")
    .trim();
}

/**
 * The game an ascendara://play/<game>?t=<token> link starts, from a macOS
 * shortcut. Links without this Mac's token are ignored, so a web page can't
 * start games.
 */
function parsePlayGameFromUrl(cleanUrl) {
  if (typeof cleanUrl !== "string") return "";
  const match = cleanUrl.match(/^ascendara:\/\/play\/([^/?#]+)\?t=([0-9a-f]+)$/i);
  if (!match) return "";
  let game;
  try {
    game = decodeURIComponent(match[1]).trim();
  } catch {
    return "";
  }
  if (!game || /[/\\]|\.\./.test(game)) return "";
  return require("../library/macShortcuts").isValidLaunchToken(match[2]) ? game : "";
}

/**
 * Bring the main window to the foreground, restoring/showing it if needed.
 * Used when another launch attempt (protocol URL, second instance, or a
 * plain relaunch while already running hidden) needs to surface the app.
 */
function focusMainWindow() {
  const windows = BrowserWindow.getAllWindows();
  if (windows.length === 0) {
    console.log("No windows found, creating new window");
    createWindow();
    return;
  }

  const mainWindow = windows[0];
  setMainWindowHidden(false);
  if (!mainWindow.isVisible()) mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.setAlwaysOnTop(true);
  mainWindow.focus();
  mainWindow.center();
  setTimeout(() => mainWindow.setAlwaysOnTop(false), 100);
}

/**
 * Handle protocol URL
 * @param {string} url - The protocol URL to handle
 */
function handleProtocolUrl(url) {
  if (!url) return;

  const cleanUrl = url.trim().replace(/^["']+|["']+$/g, "");
  if (!cleanUrl.startsWith("ascendara://")) return;

  const earlyGameId = parseGameIdFromUrl(cleanUrl);
  if (earlyGameId) {
    pendingGameUrls.add(earlyGameId);
  }
  const playGame = parsePlayGameFromUrl(cleanUrl);
  if (playGame) {
    pendingPlayGames.add(playGame);
  }

  const existingWindow = BrowserWindow.getAllWindows().find(win => win);

  // Before app ready (macOS open-url on launch) no window can be created yet;
  // app.js drains these once the main window exists.
  if (!app.isReady()) {
    pendingUrls.add(cleanUrl);
    return;
  }

  // Still running in the tray with its window closed: reopen it and deliver
  // the URL once the page has loaded.
  if (!existingWindow) {
    const newWindow = createWindow();
    newWindow.webContents.once("did-finish-load", () => handleProtocolUrl(cleanUrl));
    return;
  }

  focusMainWindow();

  try {
    setHandlingProtocolUrl(true);

    const currentTime = Date.now();
    if (cleanUrl !== lastHandledUrl || currentTime - lastHandleTime > URL_DEBOUNCE_TIME) {
      lastHandledUrl = cleanUrl;
      lastHandleTime = currentTime;

      console.log("Processing protocol URL:", cleanUrl);

      const route = cleanUrl.slice("ascendara://".length).split(/[/?#]/)[0];
      if (route === "checkout-success") {
        try {
          const normalizedUrl = cleanUrl
            .replace(
              "ascendara://checkout-success/",
              "https://placeholder/checkout-success"
            )
            .replace(
              "ascendara://checkout-success",
              "https://placeholder/checkout-success"
            );
          const urlParams = new URL(normalizedUrl);
          const sessionId = urlParams.searchParams.get("session_id");
          if (!sessionId || !/^cs_[A-Za-z0-9_]{1,255}$/.test(sessionId)) {
            throw new Error("Invalid checkout session ID");
          }
          pendingCheckoutSessions.add(sessionId);
          console.log("Checkout success with session:", sessionId);
          existingWindow.webContents.send("checkout-success", { sessionId });
        } catch (error) {
          console.error("Error parsing checkout success URL:", error);
        }
      } else if (route === "checkout-canceled") {
        console.log("Checkout was canceled");
        existingWindow.webContents.send("checkout-canceled");
      } else if (route === "steamrip-cookie") {
        try {
          const cookieMatch = cleanUrl.match(/steamrip-cookie\/(.+)/);
          if (cookieMatch && cookieMatch[1]) {
            let cookieValue;
            let userAgent = null;
            const rawValue = cookieMatch[1];

            if (rawValue.startsWith("b64:")) {
              try {
                const base64Data = rawValue.substring(4);
                const decoded = Buffer.from(base64Data, "base64").toString("utf-8");

                try {
                  const payload = JSON.parse(decoded);
                  cookieValue = payload.cookie;
                  userAgent = payload.userAgent;
                } catch (jsonError) {
                  cookieValue = decoded;
                }
              } catch (decodeError) {
                console.error("Error decoding base64 cookie:", decodeError);
                return;
              }
            } else {
              const decoded = decodeURIComponent(rawValue);

              try {
                const payload = JSON.parse(decoded);
                cookieValue = payload.cookie;
                userAgent = payload.userAgent;
              } catch (jsonError) {
                cookieValue = decoded;
              }
            }

            console.log(
              "Received steamrip cookie from extension (length:",
              cookieValue.length + ")"
            );
            existingWindow.webContents.send("steamrip-cookie-received", {
              cookie: cookieValue,
              userAgent: userAgent,
            });
          }
        } catch (error) {
          console.error("Error parsing steamrip cookie URL:", error);
        }
      } else if (route === "play") {
        if (playGame) {
          existingWindow.webContents.send("protocol-play-game", { game: playGame });
        } else {
          console.warn("Ignored a play link without a valid token");
        }
      } else if (route === "game") {
        try {
          const gameID = parseGameIdFromUrl(cleanUrl);
          if (gameID) {
            pendingGameUrls.add(gameID);
            console.log("Sending game URL to renderer with gameID:", gameID);
            existingWindow.webContents.send("protocol-game-url", { gameID });
          }
        } catch (error) {
          console.error("Error parsing game URL:", error);
        }
      } else {
        pendingBrowserDownloads.add(cleanUrl);
        existingWindow.webContents.send("protocol-download-url", cleanUrl);
      }
    }

    setTimeout(() => {
      setHandlingProtocolUrl(false);
    }, 1000);
  } catch (error) {
    console.error("Error handling protocol URL:", error);
    setHandlingProtocolUrl(false);
  }

  pendingUrls.clear();
}

/**
 * Get pending URLs
 * @returns {string[]} - Array of pending URLs
 */
function getPendingUrls() {
  const urls = Array.from(pendingUrls);
  pendingUrls.clear();
  return urls;
}

/**
 * Clear pending URLs
 */
function clearPendingUrls() {
  pendingUrls.clear();
}

/**
 * Register protocol handlers and single instance lock
 */
function registerProtocolHandlers() {
  const { ipcMain } = require("electron");

  ipcMain.handle("get-pending-urls", () => {
    return getPendingUrls();
  });
  ipcMain.handle("get-pending-game-urls", () => [...pendingGameUrls]);
  ipcMain.handle("get-pending-play-games", () => [...pendingPlayGames]);
  ipcMain.handle("acknowledge-play-game", (_event, game) =>
    pendingPlayGames.delete(game)
  );
  ipcMain.handle("acknowledge-game-url", (_event, gameID) =>
    pendingGameUrls.delete(gameID)
  );
  ipcMain.handle("get-pending-browser-downloads", () => [...pendingBrowserDownloads]);
  ipcMain.handle("acknowledge-browser-download", (_event, url) =>
    pendingBrowserDownloads.delete(url)
  );
  ipcMain.handle("get-pending-checkouts", () => [...pendingCheckoutSessions]);
  ipcMain.handle("acknowledge-checkout", (_event, sessionId) => {
    pendingCheckoutSessions.delete(sessionId);
  });
}

/**
 * Get the executable/process name for a given PID.
 * Used to guard against stale lock files whose PID has been recycled
 * by an unrelated process (e.g. Steam webhelper reusing an old Ascendara PID).
 * @param {number} pid
 * @returns {string|null} - Lowercased process image name, or null if it can't be determined
 */
function getProcessName(pid) {
  try {
    if (process.platform === "win32") {
      const output = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, {
        encoding: "utf8",
        windowsHide: true,
      });
      const match = output.match(/^"([^"]+)"/);
      return match ? match[1].toLowerCase() : null;
    } else {
      const output = execSync(`ps -p ${pid} -o comm=`, { encoding: "utf8" });
      return output.trim().toLowerCase() || null;
    }
  } catch (e) {
    return null;
  }
}

/**
 * Setup single instance lock and protocol handling
 * @returns {boolean} - Whether this is the primary instance
 */
function setupSingleInstance() {
  // Use file-based lock to work across dev and production instances
  const lockDir = path.join(app.getPath("userData"), ".lock");
  const lockFile = path.join(lockDir, "instance.lock");
  const protocolFile = path.join(lockDir, "protocol.txt");

  // Ensure lock directory exists
  if (!fs.existsSync(lockDir)) {
    fs.mkdirSync(lockDir, { recursive: true });
  }

  // Check if lock file exists
  if (fs.existsSync(lockFile)) {
    try {
      const lockData = JSON.parse(fs.readFileSync(lockFile, "utf8"));
      const existingPid = lockData.pid;

      // Check if the process is still running
      let processExists = false;
      try {
        process.kill(existingPid, 0); // Signal 0 checks existence without killing
        processExists = true;
      } catch (e) {
        // Process doesn't exist
        processExists = false;
      }

      // Guard against PID reuse: on Windows, PIDs are recycled quickly after
      // a process exits, so a stale lock file can point at an unrelated
      // process (e.g. Steam webhelper). Verify the running process is
      // actually our own executable before trusting the lock.
      if (processExists) {
        const expectedName = path.basename(process.execPath).toLowerCase();
        const actualName = getProcessName(existingPid);
        if (actualName && actualName !== expectedName) {
          console.log(
            `Lock PID ${existingPid} belongs to '${actualName}', not '${expectedName}' - treating lock as stale`
          );
          processExists = false;
        }
      }

      if (processExists) {
        console.log(
          "Another instance is running (PID:",
          existingPid + "), passing protocol URL and exiting"
        );

        // If we have a protocol URL in argv, write it to the protocol file.
        // Otherwise (e.g. user just relaunched the app normally), signal the
        // existing instance to bring its window to the front - this matters
        // when it was started hidden (start minimized on login).
        const protocolUrl = findProtocolUrlInArgs(process.argv);
        fs.writeFileSync(protocolFile, protocolUrl || "ascendara://show-window", "utf8");
        console.log(
          protocolUrl
            ? "Wrote protocol URL to file for existing instance"
            : "Wrote show-window signal to file for existing instance"
        );

        app.exit(0);
        return false;
      } else {
        // Stale lock file, remove it
        console.log("Removing stale lock file");
        fs.unlinkSync(lockFile);
        if (fs.existsSync(protocolFile)) {
          try {
            fs.unlinkSync(protocolFile);
          } catch (e) {
            // Ignore
          }
        }
      }
    } catch (error) {
      console.error("Error reading lock file:", error);
      // If we can't read it, try to remove it
      try {
        fs.unlinkSync(lockFile);
      } catch (e) {
        // Ignore
      }
    }
  }

  // Write our PID to the lock file
  fs.writeFileSync(
    lockFile,
    JSON.stringify({ pid: process.pid, timestamp: Date.now() }),
    "utf8"
  );

  // Queue any startup protocol URL from argv immediately so the renderer can
  // retrieve it even if it initializes before did-finish-load fires.
  const startupProtocolUrl = findProtocolUrlInArgs(process.argv);
  if (startupProtocolUrl) {
    pendingUrls.add(startupProtocolUrl);
    const startupGameId = parseGameIdFromUrl(startupProtocolUrl);
    if (startupGameId) {
      pendingGameUrls.add(startupGameId);
    }
    const startupPlayGame = parsePlayGameFromUrl(startupProtocolUrl);
    if (startupPlayGame) {
      pendingPlayGames.add(startupPlayGame);
    }
  }

  // Watch for protocol file changes (other instances passing URLs to us)
  let protocolFileWatcher = null;
  try {
    protocolFileWatcher = fs.watch(lockDir, (eventType, filename) => {
      if (filename === "protocol.txt" && fs.existsSync(protocolFile)) {
        try {
          const protocolUrl = fs.readFileSync(protocolFile, "utf8").trim();
          if (protocolUrl === "ascendara://show-window") {
            console.log("Received show-window signal from another instance");
            focusMainWindow();
            fs.unlinkSync(protocolFile);
          } else if (protocolUrl && protocolUrl.startsWith("ascendara://")) {
            console.log("Received protocol URL from another instance:", protocolUrl);
            handleProtocolUrl(protocolUrl);
            // Delete the file after reading
            fs.unlinkSync(protocolFile);
          }
        } catch (error) {
          console.error("Error reading protocol file:", error);
        }
      }
    });
  } catch (error) {
    console.error("Error setting up protocol file watcher:", error);
  }

  // Clean up lock file on exit
  app.on("will-quit", () => {
    try {
      if (protocolFileWatcher) {
        protocolFileWatcher.close();
      }
      if (fs.existsSync(lockFile)) {
        const lockData = JSON.parse(fs.readFileSync(lockFile, "utf8"));
        // Only remove if it's our lock
        if (lockData.pid === process.pid) {
          fs.unlinkSync(lockFile);
        }
      }
    } catch (error) {
      console.error("Error cleaning up lock file:", error);
    }
  });

  // Request single instance lock (as backup)
  const gotTheLock = app.requestSingleInstanceLock();

  if (!gotTheLock) {
    console.log("Another instance detected via Electron lock, quitting");
    app.exit(0);
    return false;
  }

  // Register protocol handler
  if (process.defaultApp || isDev) {
    app.setAsDefaultProtocolClient("ascendara", process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  } else {
    app.setAsDefaultProtocolClient("ascendara");
  }

  // Handle second instance
  app.on("second-instance", (event, commandLine, workingDirectory) => {
    console.log("Second instance detected with args:", commandLine);

    // Find protocol URL in command line arguments
    // On Linux, the URL might be passed differently
    let protocolUrl = findProtocolUrlInArgs(commandLine);

    if (protocolUrl) {
      console.log("Protocol URL found in second instance:", protocolUrl);
      handleProtocolUrl(protocolUrl);
    }

    const windows = BrowserWindow.getAllWindows();
    focusMainWindow();

    // Only send second-instance-detected if there's no protocol URL
    // (protocol URL handling will navigate to the appropriate page)
    if (windows.length > 0 && !protocolUrl) {
      windows[0].webContents.send("second-instance-detected");
    }
  });

  app.on("open-url", (event, url) => {
    console.log("open-url event fired with url:", url);
    event.preventDefault();
    handleProtocolUrl(url);
  });

  return true;
}

module.exports = {
  handleProtocolUrl,
  findProtocolUrlInArgs,
  getPendingUrls,
  clearPendingUrls,
  registerProtocolHandlers,
  setupSingleInstance,
};
