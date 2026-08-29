/**
 * Protocol Module
 * Handles protocol URL handling (ascendara://)
 */

const { BrowserWindow, app } = require("electron");
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const { isDev } = require("./config");
const { createWindow, setHandlingProtocolUrl, setMainWindowHidden } = require("./window");

let lastHandledUrl = null;
let lastHandleTime = 0;
let pendingUrls = new Set();
const URL_DEBOUNCE_TIME = 2000;

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

  const cleanUrl = url.trim();
  if (!cleanUrl.startsWith("ascendara://")) return;

  const existingWindow = BrowserWindow.getAllWindows().find(win => win);

  if (!existingWindow) {
    pendingUrls.add(cleanUrl);
    createWindow();
    return;
  }

  if (existingWindow.isMinimized()) existingWindow.restore();
  existingWindow.focus();

  try {
    setHandlingProtocolUrl(true);

    const currentTime = Date.now();
    if (cleanUrl !== lastHandledUrl || currentTime - lastHandleTime > URL_DEBOUNCE_TIME) {
      lastHandledUrl = cleanUrl;
      lastHandleTime = currentTime;

      console.log("Processing protocol URL:", cleanUrl);

      if (cleanUrl.includes("checkout-success")) {
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
          console.log("Checkout success with session:", sessionId);
          existingWindow.webContents.send("checkout-success", { sessionId });
        } catch (error) {
          console.error("Error parsing checkout success URL:", error);
        }
      } else if (cleanUrl.includes("checkout-canceled")) {
        console.log("Checkout was canceled");
        existingWindow.webContents.send("checkout-canceled");
      } else if (cleanUrl.includes("steamrip-cookie")) {
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
      } else if (cleanUrl.includes("game")) {
        try {
          const gameID = cleanUrl.split("?").pop().replace("/", "");
          if (gameID) {
            console.log("Sending game URL to renderer with gameID:", gameID);
            existingWindow.webContents.send("protocol-game-url", { gameID });
          }
        } catch (error) {
          console.error("Error parsing game URL:", error);
        }
      } else {
        console.log("Sending download URL to renderer:", cleanUrl);
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
        console.log("Another instance is running (PID:", existingPid + "), passing protocol URL and exiting");
        
        // If we have a protocol URL in argv, write it to the protocol file.
        // Otherwise (e.g. user just relaunched the app normally), signal the
        // existing instance to bring its window to the front - this matters
        // when it was started hidden (start minimized on login).
        const protocolUrl = process.argv.find(arg => arg.startsWith("ascendara://"));
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
  fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, timestamp: Date.now() }), "utf8");
  
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
    let protocolUrl = commandLine.find(arg => arg.startsWith("ascendara://"));
    
    // If not found in direct args, check if it's in the last argument (common on Linux)
    if (!protocolUrl && commandLine.length > 0) {
      const lastArg = commandLine[commandLine.length - 1];
      if (lastArg && lastArg.startsWith("ascendara://")) {
        protocolUrl = lastArg;
      }
    }
    
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
  getPendingUrls,
  clearPendingUrls,
  registerProtocolHandlers,
  setupSingleInstance,
};
