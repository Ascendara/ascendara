/**
 * Window Management Module
 * Handles window creation, visibility, and related operations
 */

const { BrowserWindow, screen, ipcMain, dialog, app } = require("electron");
const path = require("path");
const { isDev } = require("./config");
const { initializeDiscordRPC, destroyDiscordRPC } = require("./discord-rpc");
const { getSettingsManager } = require("./settings");

let mainWindowHidden = false;
let isHandlingProtocolUrl = false;

/**
 * Create the main application window
 * @returns {BrowserWindow} - The created window
 */
function createWindow() {
  // Detect if Big Picture mode should be used
  const startInBigPicture = process.argv.some(
    arg => arg.toLowerCase() === "--big-picture"
  );
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  // If screen height is less than 900px, likely a laptop
  const isLaptop = screenHeight < 900;

  const windowWidth = isLaptop ? Math.min(1500, screenWidth * 0.9) : 1600;
  const windowHeight = isLaptop ? Math.min(700, screenHeight * 0.9) : 800;

  const iconFile = process.platform === "linux" ? "icon.png" : "icon.ico";
  const mainWindow = new BrowserWindow({
    title: "Ascendara",
    icon: path.join(__dirname, "..", iconFile),
    width: windowWidth,
    height: windowHeight,
    frame: false,
    show: false,
    backgroundColor: "#09090b",
    // Enable native full-screen if asked for
    fullscreen: startInBigPicture,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      nodeIntegration: true,
      contextIsolation: true,
      // Disable sandbox for Linux compatibility
      sandbox: false,
      // Disable web security to allow CORS requests to external APIs
      webSecurity: false,
      // Must be explicitly true for openDevTools() to work in packaged builds
      devTools: true,
    },
  });

  // Width, Height
  mainWindow.setMinimumSize(600, 400);

  // Only show the window when it's ready to be displayed
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    
    mainWindowHidden = false;
  });

  // Adding hash to URL
  const urlSuffix = startInBigPicture ? "#/bigpicture" : "";

  if (isDev) {
    // Load from localhost:5173 in development
    mainWindow.loadURL("http://localhost:5173" + urlSuffix);
  } else {
    mainWindow.loadURL("http://localhost:46859" + urlSuffix);
  }

  // Handle load failures (e.g., local server not running)
  mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription) => {
    console.error(`Failed to load: ${errorCode} - ${errorDescription}`);
    // Show a helpful error page instead of white screen
    mainWindow.loadURL(`data:text/html,
      <html>
        <head>
          <style>
            body { background: #09090b; color: #fff; font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; flex-direction: column; }
            h1 { color: #ef4444; margin-bottom: 16px; }
            p { color: #a1a1aa; max-width: 500px; text-align: center; line-height: 1.6; }
            code { background: #27272a; padding: 2px 6px; border-radius: 4px; }
          </style>
        </head>
        <body>
          <h1>Failed to Load Ascendara</h1>
          <p>Error: ${errorDescription} (${errorCode})</p>
          <p>This may be caused by:</p>
          <p>• Missing Visual C++ Redistributables - <a href="https://aka.ms/vs/17/release/vc_redist.x64.exe" style="color: #3b82f6;">Download here</a></p>
          <p>• Antivirus blocking the app</p>
          <p>• Port 46859 being used by another application</p>
          <p>Try restarting Ascendara or your computer.</p>
        </body>
      </html>
    `);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Allow Firebase/Google auth popups
    if (
      url.includes("accounts.google.com") ||
      url.includes("firebaseapp.com") ||
      url.includes("googleapis.com")
    ) {
      return { action: "allow" };
    }
    // Open other external links in system browser
    if (url.startsWith("http://") || url.startsWith("https://")) {
      require("electron").shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // Add window event listeners
  mainWindow.on("hide", () => {
    mainWindowHidden = true;
    console.log("Window hidden event fired");
    // Notify renderer to set status to invisible when hiding to tray
    mainWindow.webContents.send("app-hidden");
  });

  mainWindow.on("show", () => {
    mainWindowHidden = false;
    console.log("Window shown event fired");
    // Notify renderer to restore status when showing from tray
    mainWindow.webContents.send("app-shown");
  });

  mainWindow.on("close", () => {
    console.log("Window close event fired");
  });

  return mainWindow;
}

/**
 * Hide the main window
 */
function hideWindow() {
  // Don't hide window if handling protocol URL
  if (isHandlingProtocolUrl) {
    console.log("Skipping window hide during protocol URL handling");
    return;
  }

  const mainWindow = BrowserWindow.getAllWindows().find(win => win);
  if (mainWindow) {
    mainWindowHidden = true;
    mainWindow.hide();
    console.log("Window hidden");
  }
}

/**
 * Show the main window
 */
function showWindow() {
  const mainWindow = BrowserWindow.getAllWindows().find(win => win);
  if (mainWindow) {
    mainWindowHidden = false;
    mainWindow.show();

    // Restore if minimized
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    // Add setAlwaysOnTop temporarily to force focus
    mainWindow.setAlwaysOnTop(true);
    mainWindow.focus();
    // Remove the always on top flag after focusing
    setTimeout(() => {
      mainWindow.setAlwaysOnTop(false);
    }, 100);
  } else {
    console.log("Creating new window from showWindow function");
    createWindow();
    initializeDiscordRPC();
  }
}

/**
 * Set the protocol URL handling flag
 * @param {boolean} value - Whether currently handling protocol URL
 */
function setHandlingProtocolUrl(value) {
  isHandlingProtocolUrl = value;
}

/**
 * Check if main window is hidden
 * @returns {boolean}
 */
function isMainWindowHidden() {
  return mainWindowHidden;
}

/**
 * Set main window hidden state
 * @param {boolean} value
 */
function setMainWindowHidden(value) {
  mainWindowHidden = value;
}

/**
 * Get the main window
 * @returns {BrowserWindow|null} - The main window or null if not found
 */
function getMainWindow() {
  return BrowserWindow.getAllWindows().find(win => win) || null;
}

/**
 * Show an error dialog
 * @param {string} title - Dialog title
 * @param {string} message - Dialog message
 */
async function showErrorDialog(title, message) {
  const window = BrowserWindow.getFocusedWindow();
  if (window) {
    await dialog.showMessageBox(window, {
      type: "error",
      title: title,
      message: message,
      buttons: ["OK"],
    });
  }
}

/**
 * Register window-related IPC handlers
 */
function registerWindowHandlers() {
  // Open DevTools (available in production on Linux for debugging)
  ipcMain.handle("open-devtools", () => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools({ mode: "detach" });
      }
    }
  });

  // Minimize the window
  ipcMain.handle("minimize-window", () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.minimize();
  });

  // Maximize the window
  ipcMain.handle("maximize-window", () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize();
        return false;
      } else {
        win.maximize();
        return true;
      }
    }
    return false;
  });

  // Let the interface knows if it's already at max at start
  ipcMain.handle("is-window-maximized", () => {
    const win = BrowserWindow.getFocusedWindow();
    return win ? win.isMaximized() : false;
  });

  // Handle fullscreen toggle
  ipcMain.handle("toggle-fullscreen", () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      win.setFullScreen(!win.isFullScreen());
      return win.isFullScreen();
    }
    return false;
  });

  ipcMain.handle("get-fullscreen-state", () => {
    const win = BrowserWindow.getFocusedWindow();
    return win ? win.isFullScreen() : false;
  });

  // Close the window
  ipcMain.handle("close-window", async (_, forceQuit = false) => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      const settingsManager = getSettingsManager();
      const settings = settingsManager.getSettings();

      if (forceQuit === true || settings.endOnClose) {
        // Set quitting flag to allow app to quit
        app.isQuitting = true;
        console.log("Closing app completely...");

        // Destroy all windows to ensure cleanup
        BrowserWindow.getAllWindows().forEach(window => {
          if (!window.isDestroyed()) {
            window.destroy();
          }
        });

        // Force quit the app
        app.quit();
      } else {
        // Default behavior
        mainWindowHidden = true;
        destroyDiscordRPC();
        win.hide();
        console.log("Window hidden to tray");
      }
    }
  });

  // Clear cache
  ipcMain.handle("clear-cache", async () => {
    try {
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (mainWindow) {
        // Clear all browser data including cache, cookies, storage etc.
        await mainWindow.webContents.session.clearStorageData({
          storages: [
            "appcache",
            "cookies",
            "filesystem",
            "indexdb",
            "localstorage",
            "shadercache",
            "websql",
            "serviceworkers",
            "cachestorage",
          ],
        });

        // Clear HTTP cache specifically
        await mainWindow.webContents.session.clearCache();

        return true;
      }
      return false;
    } catch (error) {
      console.error("Error clearing cache:", error);
      return false;
    }
  });

  // Get asset path
  ipcMain.handle("get-asset-path", (_, filename) => {
    const fs = require("fs-extra");
    let assetPath;
    if (!app.isPackaged) {
      // In development
      assetPath = path.join(__dirname, "../../src/public", filename);
    } else {
      // In production
      assetPath = path.join(process.resourcesPath, "public", filename);
    }

    if (!fs.existsSync(assetPath)) {
      console.error(`Asset not found: ${assetPath}`);
      return null;
    }

    // Return the raw file data as base64
    const imageBuffer = fs.readFileSync(assetPath);
    return `data:image/png;base64,${imageBuffer.toString("base64")}`;
  });

  // Get audio asset as base64 data URL
  ipcMain.handle("get-audio-asset", (_, filename) => {
    const fs = require("fs-extra");
    let assetPath;
    if (!app.isPackaged) {
      // In development
      assetPath = path.join(__dirname, "../../src/public", filename);
    } else {
      // In production
      assetPath = path.join(process.resourcesPath, "public", filename);
    }

    if (!fs.existsSync(assetPath)) {
      console.error(`Audio asset not found: ${assetPath}`);
      return null;
    }

    const audioBuffer = fs.readFileSync(assetPath);
    return `data:audio/mpeg;base64,${audioBuffer.toString("base64")}`;
  });
}

module.exports = {
  createWindow,
  hideWindow,
  showWindow,
  getMainWindow,
  setHandlingProtocolUrl,
  isMainWindowHidden,
  setMainWindowHidden,
  showErrorDialog,
  registerWindowHandlers,
};
