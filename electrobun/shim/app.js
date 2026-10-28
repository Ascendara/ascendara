// Electron's `app` object. Paths match what Electron used so existing installs
// keep their settings, library and logs after moving to Electrobun.

import { EventEmitter } from "node:events";
import os from "node:os";
import path from "node:path";
import Electrobun, { Utils } from "electrobun/main";
import { BrowserWindow, onAllWindowsClosed } from "./browser-window.js";
import {
  getLoginItemSettings,
  scheduleRelaunch,
  setAsDefaultProtocolClient,
  setLoginItemSettings,
} from "./os-integration.js";
import { launcherPath, runtime } from "./runtime.js";

function appDataDir() {
  if (process.platform === "darwin")
    return path.join(os.homedir(), "Library", "Application Support");
  if (process.platform === "win32") {
    return process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  }
  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
}

function makeEvent() {
  const event = {
    defaultPrevented: false,
    preventDefault() {
      event.defaultPrevented = true;
    },
  };
  return event;
}

class App extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(0);
    this.commandLine = {
      appendSwitch() {},
      appendArgument() {},
      hasSwitch: name => process.argv.includes(`--${name}`),
      getSwitchValue: () => "",
    };
    this._exiting = false;
    this._quitSequenceRan = false;
    this._pathOverrides = new Map();

    // Every quit path (tray, Cmd+Q, dock, process.exit) goes through
    // Electrobun's before-quit, so Electron's quit events are emitted there.
    Electrobun.events.on("before-quit", event => {
      if (this._exiting || this._quitSequenceRan) return;
      const beforeQuit = makeEvent();
      this.emit("before-quit", beforeQuit);
      if (beforeQuit.defaultPrevented) {
        event.response = { allow: false };
        return;
      }
      const willQuit = makeEvent();
      this.emit("will-quit", willQuit);
      if (willQuit.defaultPrevented) {
        event.response = { allow: false };
        return;
      }
      this._quitSequenceRan = true;
      this.emit("quit", makeEvent(), 0);
    });
    Electrobun.events.on("open-url", event => {
      const url = event.data?.url;
      if (url) this.emit("open-url", makeEvent(), url);
    });
    Electrobun.events.on("reopen", () => this.emit("activate", makeEvent(), false));
    onAllWindowsClosed(() => this.emit("window-all-closed"));
  }

  get name() {
    return runtime.isPackaged ? "Ascendara" : "ascendara";
  }

  getName() {
    return this.name;
  }

  getVersion() {
    return runtime.version;
  }

  get isPackaged() {
    return runtime.isPackaged;
  }

  getAppPath() {
    return runtime.appRoot;
  }

  getLocale() {
    return Intl.DateTimeFormat().resolvedOptions().locale || "en-US";
  }

  getSystemLocale() {
    return this.getLocale();
  }

  getPreferredSystemLanguages() {
    return [this.getLocale()];
  }

  setPath(name, value) {
    this._pathOverrides.set(name, value);
  }

  getPath(name) {
    if (this._pathOverrides.has(name)) return this._pathOverrides.get(name);
    const userData = path.join(appDataDir(), this.name);
    switch (name) {
      case "home":
        return os.homedir();
      case "appData":
        return appDataDir();
      case "userData":
      case "sessionData":
        return userData;
      case "temp":
        return os.tmpdir();
      case "exe":
        return launcherPath();
      case "module":
        return process.execPath;
      case "desktop":
        return Utils.paths.desktop;
      case "documents":
        return Utils.paths.documents;
      case "downloads":
        return Utils.paths.downloads;
      case "music":
        return Utils.paths.music;
      case "pictures":
        return Utils.paths.pictures;
      case "videos":
        return Utils.paths.videos;
      case "cache":
        return Utils.paths.cache;
      case "logs":
        return process.platform === "darwin"
          ? path.join(os.homedir(), "Library", "Logs", this.name)
          : path.join(userData, "logs");
      case "crashDumps":
        return path.join(userData, "Crashpad");
      default:
        throw new Error(`Failed to get '${name}' path`);
    }
  }

  whenReady() {
    return Promise.resolve();
  }

  isReady() {
    return true;
  }

  // protocol.js keeps its own lock file and forwards URLs through it.
  requestSingleInstanceLock() {
    return true;
  }

  hasSingleInstanceLock() {
    return true;
  }

  releaseSingleInstanceLock() {}

  setAsDefaultProtocolClient(scheme) {
    void setAsDefaultProtocolClient(scheme);
    return true;
  }

  removeAsDefaultProtocolClient() {
    return false;
  }

  isDefaultProtocolClient() {
    return true;
  }

  setLoginItemSettings(settings) {
    void setLoginItemSettings(settings);
  }

  getLoginItemSettings() {
    return getLoginItemSettings();
  }

  setAppUserModelId() {}

  focus() {
    BrowserWindow.getAllWindows()[0]?.focus();
  }

  quit() {
    Utils.quit(0);
  }

  // Electron's exit() skips before-quit/will-quit.
  exit(code = 0) {
    this._exiting = true;
    process.exit(code);
  }

  relaunch(options = {}) {
    scheduleRelaunch(options.args || process.argv.slice(2));
  }

  _emitReady() {
    this.emit("ready", makeEvent(), {});
  }
}

export const app = new App();
