// The object handed to `require("electron")` from the unchanged main-process
// modules. Anything not listed here was never used by Ascendara. The bundled
// Electrobun updater rides along, since electron/ is not bundled and cannot
// import the SDK itself.

import { Updater } from "electrobun/main";
import { app } from "./app.js";
import { BrowserWindow } from "./browser-window.js";
import {
  clipboard,
  dialog,
  Menu,
  nativeImage,
  Notification,
  screen,
  shell,
  Tray,
} from "./desktop.js";
import { ipcMain } from "./ipc.js";
import { powerMonitor, powerSaveBlocker } from "./power.js";
import { safeStorage } from "./safe-storage.js";
import { session } from "./session.js";

const nativeTheme = {
  shouldUseDarkColors: true,
  themeSource: "system",
  on() {},
  removeListener() {},
};

const crashReporter = {
  start() {},
  getLastCrashReport: () => null,
  getUploadedReports: () => [],
};

const globalShortcut = {
  register: () => false,
  unregister() {},
  unregisterAll() {},
  isRegistered: () => false,
};

export const electron = {
  app,
  BrowserWindow,
  clipboard,
  crashReporter,
  dialog,
  electrobunUpdater: Updater,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  Notification,
  powerMonitor,
  powerSaveBlocker,
  safeStorage,
  screen,
  session,
  shell,
  Tray,
};
