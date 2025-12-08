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
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  // If screen height is less than 900px, likely a laptop
  const isLaptop = screenHeight < 900;

  const windowWidth = isLaptop ? Math.min(1500, screenWidth * 0.9) : 1600;
  const windowHeight = isLaptop ? Math.min(700, screenHeight * 0.9) : 800;

  const mainWindow = new BrowserWindow({
    title: "Ascendara",
    icon: path.join(__dirname, "..", "icon.ico"),
    width: windowWidth,
    height: windowHeight,
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      nodeIntegration: true,
      contextIsolation: true,
    },
  });

  // Width, Height
  mainWindow.setMinimumSize(600, 400);

  // Only show the window when it's ready to be displayed
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindowHidden = false;
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "index.html"));
  }

  mainWindow.webContents.setWindowOpenHandler(info => {
    return { action: "deny" };
  });

  // Add window event listeners
  mainWindow.on("hide", () => {
    mainWindowHidden = true;
    console.log("Window hidden event fired");
  });

  mainWindow.on("show", () => {
    mainWindowHidden = false;
    console.log("Window shown event fired");
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
      } else {
        win.maximize();
      }
    }
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
  ipcMain.handle("close-window", async () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      const settingsManager = getSettingsManager();
      const settings = settingsManager.getSettings();
      if (!settings.endOnClose) {
        mainWindowHidden = true;
        destroyDiscordRPC();
        win.hide();
        console.log("Window hidden instead of closed");
      } else {
        win.close();
        // If endOnClose is true, we should make sure the app fully quits
        if (process.platform !== "darwin") {
          app.quit();
        }
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
}

module.exports = {
  createWindow,
  hideWindow,
  showWindow,
  setHandlingProtocolUrl,
  isMainWindowHidden,
  setMainWindowHidden,
  showErrorDialog,
  registerWindowHandlers,
};
