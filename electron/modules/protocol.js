/**
 * Protocol Module
 * Handles protocol URL handling (ascendara://)
 */

const { BrowserWindow, app } = require("electron");
const path = require("path");
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
  const { appVersion } = require("./config");
  const lockKey = process.platform === "linux" ? { appVersion } : undefined;
  const gotTheLock = app.requestSingleInstanceLock(lockKey);

  if (!gotTheLock) {
    console.log("Another instance is running, quitting this instance");
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

    const protocolUrl = commandLine.find(arg => arg.startsWith("ascendara://"));
    if (protocolUrl) {
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
      mainWindow.webContents.send("second-instance-detected");
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
