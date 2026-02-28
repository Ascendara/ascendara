/**
 * Protocol Module
 * Handles protocol URL handling (ascendara://)
 */

const { BrowserWindow, app } = require("electron");
const path = require("path");
const fs = require("fs");
const { isDev } = require("./config");
const { createWindow, setHandlingProtocolUrl, setMainWindowHidden } = require("./window");

let lastHandledUrl = null;
let lastHandleTime = 0;
let pendingUrls = new Set();
const URL_DEBOUNCE_TIME = 2000;

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
      
      if (processExists) {
        console.log("Another instance is running (PID:", existingPid + "), passing protocol URL and exiting");
        
        // If we have a protocol URL in argv, write it to the protocol file
        const protocolUrl = process.argv.find(arg => arg.startsWith("ascendara://"));
        if (protocolUrl) {
          fs.writeFileSync(protocolFile, protocolUrl, "utf8");
          console.log("Wrote protocol URL to file for existing instance");
        }
        
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
          if (protocolUrl && protocolUrl.startsWith("ascendara://")) {
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

    if (windows.length > 0) {
      const mainWindow = windows[0];
      setMainWindowHidden(false);
      if (!mainWindow.isVisible()) mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.setAlwaysOnTop(true);
      mainWindow.focus();
      mainWindow.center();
      setTimeout(() => mainWindow.setAlwaysOnTop(false), 100);
      
      // Only send second-instance-detected if there's no protocol URL
      // (protocol URL handling will navigate to the appropriate page)
      if (!protocolUrl) {
        mainWindow.webContents.send("second-instance-detected");
      }
    } else {
      console.log("No windows found, creating new window");
      createWindow();
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
