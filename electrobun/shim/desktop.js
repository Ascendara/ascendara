// dialog, shell, screen, Tray, Menu, nativeImage, Notification and clipboard.

import { execFile } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { Screen, Tray as EBTray, Utils } from "electrobun/main";

// Electrobun runs dialogs as its own top-level windows, so the optional
// BrowserWindow first argument is dropped.
function splitWindowArg(args) {
  return args.length > 1 || (args[0] && typeof args[0].webContents === "object")
    ? args[1] || {}
    : args[0] || {};
}

function run(command, args) {
  return new Promise(resolve => {
    execFile(
      command,
      args,
      { windowsHide: true, maxBuffer: 1024 * 1024 },
      (error, stdout) => {
        resolve(error ? null : String(stdout).trim());
      }
    );
  });
}

async function nativeSaveDialog({ title = "Save", defaultPath = "", filters = [] }) {
  const dir =
    defaultPath && path.isAbsolute(defaultPath)
      ? path.dirname(defaultPath)
      : Utils.paths.downloads;
  const name = defaultPath ? path.basename(defaultPath) : "";
  if (process.platform === "darwin") {
    const script = `POSIX path of (choose file name with prompt ${JSON.stringify(title)} default name ${JSON.stringify(name)} default location (POSIX file ${JSON.stringify(dir)}))`;
    return run("osascript", ["-e", script]);
  }
  if (process.platform === "win32") {
    const filter = filters.length
      ? filters
          .map(f => `${f.name}|${f.extensions.map(e => `*.${e}`).join(";")}`)
          .join("|")
      : "All files|*.*";
    const quote = value => `'${String(value).replace(/'/g, "''")}'`;
    const script = [
      "Add-Type -AssemblyName System.Windows.Forms",
      "$d = New-Object System.Windows.Forms.SaveFileDialog",
      `$d.Title = ${quote(title)}`,
      `$d.FileName = ${quote(name)}`,
      `$d.InitialDirectory = ${quote(dir)}`,
      `$d.Filter = ${quote(filter)}`,
      "if ($d.ShowDialog() -eq 'OK') { $d.FileName }",
    ].join("; ");
    return run("powershell.exe", ["-NoProfile", "-STA", "-Command", script]);
  }
  const target = path.join(dir, name);
  return (
    (await run("zenity", [
      "--file-selection",
      "--save",
      "--confirm-overwrite",
      `--title=${title}`,
      `--filename=${target}`,
    ])) ?? (await run("kdialog", ["--getsavefilename", target]))
  );
}

export const dialog = {
  async showOpenDialog(...args) {
    const options = splitWindowArg(args);
    const properties = options.properties || ["openFile"];
    const directory = properties.includes("openDirectory");
    const extensions = (options.filters || [])
      .flatMap(filter => filter.extensions || [])
      .filter(ext => ext && ext !== "*");
    let startingFolder = options.defaultPath || Utils.paths.home;
    try {
      if (!fs.statSync(startingFolder).isDirectory())
        startingFolder = path.dirname(startingFolder);
    } catch {
      startingFolder = Utils.paths.home;
    }
    const filePaths = (
      await Utils.openFileDialog({
        startingFolder,
        allowedFileTypes: extensions.length ? extensions.join(",") : "*",
        canChooseFiles: !directory || properties.includes("openFile"),
        canChooseDirectory: directory,
        allowsMultipleSelection: properties.includes("multiSelections"),
      })
    ).filter(Boolean);
    return { canceled: filePaths.length === 0, filePaths };
  },

  async showSaveDialog(...args) {
    const filePath = await nativeSaveDialog(splitWindowArg(args));
    return filePath ? { canceled: false, filePath } : { canceled: true, filePath: "" };
  },

  async showMessageBox(...args) {
    const options = splitWindowArg(args);
    const { response } = await Utils.showMessageBox({
      type: options.type === "none" ? "info" : options.type,
      title: options.title,
      message: options.message,
      detail: options.detail,
      buttons: options.buttons,
      defaultId: options.defaultId,
      cancelId: options.cancelId,
    });
    return { response, checkboxChecked: false };
  },

  showErrorBox(title, content) {
    Utils.showMessageBox({
      type: "error",
      title,
      message: title,
      detail: content,
      buttons: ["OK"],
    });
  },
};

export const shell = {
  async openExternal(url) {
    if (!Utils.openExternal(url)) throw new Error(`Failed to open ${url}`);
  },
  async openPath(target) {
    if (!fs.existsSync(target)) return `Path does not exist: ${target}`;
    return Utils.openPath(target) ? "" : `Failed to open ${target}`;
  },
  showItemInFolder(target) {
    Utils.showItemInFolder(target);
  },
  async trashItem(target) {
    Utils.moveToTrash(target);
  },
  beep() {},
};

function toElectronDisplay(display) {
  const { x, y, width, height } = display.workArea;
  return {
    id: display.id,
    bounds: { ...display.bounds },
    workArea: { x, y, width, height },
    size: { width: display.bounds.width, height: display.bounds.height },
    workAreaSize: { width, height },
    scaleFactor: display.scaleFactor,
    rotation: 0,
    internal: Boolean(display.isPrimary),
  };
}

function overlap(a, b) {
  const w = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return w * h;
}

export const screen = {
  getPrimaryDisplay() {
    const display = toElectronDisplay(Screen.getPrimaryDisplay());
    // Some Linux setups report an empty work area before a window exists.
    if (!display.workAreaSize.width || !display.workAreaSize.height) {
      display.workAreaSize = { width: 1600, height: 900 };
      display.workArea = { x: 0, y: 0, width: 1600, height: 900 };
    }
    return display;
  },
  getAllDisplays() {
    return Screen.getAllDisplays().map(toElectronDisplay);
  },
  getDisplayMatching(rect) {
    const displays = screen.getAllDisplays();
    return displays.reduce(
      (best, display) =>
        overlap(display.bounds, rect) > overlap(best.bounds, rect) ? display : best,
      displays[0] || screen.getPrimaryDisplay()
    );
  },
  getCursorScreenPoint() {
    return Screen.getCursorScreenPoint?.() || { x: 0, y: 0 };
  },
};

class NativeImage {
  constructor(filePath = "") {
    this._path = filePath;
  }
  isEmpty() {
    return !this._path || !fs.existsSync(this._path);
  }
  // Electrobun sizes tray images itself; keep the path and remember the size.
  resize({ width, height } = {}) {
    const image = new NativeImage(this._path);
    image._size = { width: width || height || 16, height: height || width || 16 };
    return image;
  }
  getSize() {
    return this._size || { width: 16, height: 16 };
  }
  toPNG() {
    return this.isEmpty() ? Buffer.alloc(0) : fs.readFileSync(this._path);
  }
  toDataURL() {
    return this.isEmpty()
      ? ""
      : `data:image/png;base64,${this.toPNG().toString("base64")}`;
  }
  setTemplateImage() {}
}

export const nativeImage = {
  createFromPath: filePath => new NativeImage(filePath),
  createEmpty: () => new NativeImage(),
};

let menuActionSequence = 0;

class MenuItem {
  constructor(options) {
    Object.assign(this, options);
  }
}

export class Menu {
  constructor(items = []) {
    this.items = items;
  }

  static buildFromTemplate(template) {
    return new Menu(template.map(item => new MenuItem(item)));
  }

  static setApplicationMenu() {}

  static getApplicationMenu() {
    return null;
  }

  append(item) {
    this.items.push(item);
  }

  // Electrobun menus carry an action string; clicks are routed back by it.
  _toConfig(actions) {
    return this.items.map(item => {
      if (item.type === "separator") return { type: "separator" };
      const action = `menu-${++menuActionSequence}`;
      if (typeof item.click === "function") actions.set(action, item.click);
      return {
        type: "normal",
        label: item.label || "",
        action,
        enabled: item.enabled !== false,
        ...(item.checked !== undefined ? { checked: Boolean(item.checked) } : {}),
        ...(item.visible === false ? { hidden: true } : {}),
        ...(item.submenu
          ? {
              submenu: (item.submenu instanceof Menu
                ? item.submenu
                : Menu.buildFromTemplate(item.submenu)
              )._toConfig(actions),
            }
          : {}),
      };
    });
  }
}

export class Tray extends EventEmitter {
  constructor(image) {
    super();
    const imagePath = typeof image === "string" ? image : image?._path || "";
    const size =
      typeof image === "object" && image?._size ? image._size : { width: 16, height: 16 };
    this._actions = new Map();
    this._lastClick = 0;
    this._eb = new EBTray({ image: imagePath, template: false, ...size });
    this._eb.on("tray-clicked", event => {
      const action = event.data?.action;
      if (action) {
        this._actions.get(action)?.();
        return;
      }
      const now = Date.now();
      this.emit("click");
      if (now - this._lastClick < 400) this.emit("double-click");
      this._lastClick = now;
    });
  }

  setContextMenu(menu) {
    this._actions.clear();
    this._eb.setMenu(menu ? menu._toConfig(this._actions) : []);
  }

  setToolTip(tooltip) {
    this._tooltip = tooltip;
  }

  setTitle(title) {
    this._eb.setTitle(title);
  }

  setImage(image) {
    this._eb.setImage(typeof image === "string" ? image : image?._path || "");
  }

  destroy() {
    this._eb.remove();
  }

  isDestroyed() {
    return !this._eb.id;
  }
}

export class Notification extends EventEmitter {
  static isSupported() {
    return true;
  }

  constructor(options = {}) {
    super();
    this._options = options;
  }

  show() {
    Utils.showNotification({
      title: this._options.title || "Ascendara",
      body: this._options.body,
      subtitle: this._options.subtitle,
      silent: Boolean(this._options.silent),
    });
    this.emit("show");
  }

  close() {}
}

export const clipboard = {
  readText: () => Utils.clipboardReadText() || "",
  writeText: text => Utils.clipboardWriteText(String(text)),
  clear: () => Utils.clipboardClear(),
};
