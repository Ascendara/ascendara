// Electron's BrowserWindow/webContents surface backed by Electrobun windows.
// Only windows that ask for a preload and are not sandboxed get the IPC bridge;
// provider, store and helper windows load with no RPC at all.

import { dlopen, FFIType, ptr } from "bun:ffi";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import {
  BrowserWindow as EBBrowserWindow,
  BrowserView as EBBrowserView,
} from "electrobun/main";
import { dispatchInvoke, dispatchSend } from "./ipc.js";
import { session as sessionModule, Session } from "./session.js";
import { encodeArgs } from "../shared/wire.js";

// Passed inline: this bundle sits at app/bun, the preload view at app/views.
let preloadScript;
function getPreloadScript() {
  preloadScript ??= fs.readFileSync(
    new URL("../views/preload/index.js", `file://${import.meta.dir}/`),
    "utf8"
  );
  return preloadScript;
}

const windows = new Map();
let nextWebContentsId = 1;
let focusedWindowId = null;
let lastFocusedWindowId = null;
let evalSequence = 0;

function makeEvent(extra = {}) {
  const event = {
    defaultPrevented: false,
    preventDefault() {
      event.defaultPrevented = true;
    },
    ...extra,
  };
  return event;
}

function decodeDataUrl(url) {
  const comma = url.indexOf(",");
  const meta = url.slice(5, comma);
  const data = url.slice(comma + 1);
  return meta.includes(";base64")
    ? Buffer.from(data, "base64").toString("utf8")
    : decodeURIComponent(data);
}

// Electron returns the completion value of a script. A native evaluation call
// returns nothing, so the script reports back through the host-message bridge.
// Expressions are returned directly; statement lists run as-is and yield
// undefined. No eval() is involved, so page CSP does not get in the way.
function buildEvalScript(code, id) {
  const source = String(code)
    .trim()
    .replace(/;+\s*$/, "");
  let body;
  try {
    new Function(`return (${source}\n);`);
    body = `return (${source}\n);`;
  } catch {
    body = `${code}\n;return undefined;`;
  }
  return `(async () => {
    let reply;
    try {
      const value = await (async () => { ${body} })();
      try { JSON.stringify(value); reply = { ok: true, value }; }
      catch { reply = { ok: true, value: null }; }
    } catch (error) {
      reply = { ok: false, error: String(error && error.message || error) };
    }
    window.__electrobunSendToHost({ __ascendaraEval: ${id}, ...reply });
  })();`;
}

class DownloadItem extends EventEmitter {
  constructor(detail, fallbackUrl) {
    super();
    this._detail = typeof detail === "object" && detail ? detail : {};
    this._url = this._detail.url || fallbackUrl || "";
    this._cancelled = false;
    this._state = "progressing";
  }
  getURL() {
    return this._url;
  }
  getFilename() {
    return this._detail.filename || "";
  }
  getSavePath() {
    return this._detail.path || "";
  }
  setSavePath() {}
  getState() {
    return this._state;
  }
  isPaused() {
    return false;
  }
  // The webview has already started writing the file; drop it once settled.
  cancel() {
    this._cancelled = true;
    this._removeFile();
  }
  _removeFile() {
    const target = this._detail.path;
    if (target) fs.promises.rm(target, { force: true }).catch(() => {});
  }
}

class WebContents extends EventEmitter {
  constructor(owner, session) {
    super();
    this.setMaxListeners(0);
    this.id = nextWebContentsId++;
    this._owner = owner;
    this.session = session;
    this._url = "";
    this._loading = false;
    this._pendingLoads = [];
    this._pendingEvals = new Map();
    this._devToolsOpen = false;
    this._windowOpenHandler = null;
    this._lastNavigationUrl = "";
    this._lastAllowedUrl = "";
    this._activeDownloads = new Map();
    const contents = this;
    this.mainFrame = {
      get url() {
        return contents._url;
      },
      get origin() {
        try {
          return new URL(contents._url).origin;
        } catch {
          return "null";
        }
      },
    };
  }

  get _view() {
    return this._owner._view;
  }

  isDestroyed() {
    return this._owner._destroyed;
  }

  getURL() {
    return this._url;
  }

  getTitle() {
    return this._owner._title;
  }

  isLoading() {
    return this._loading;
  }

  send(channel, ...args) {
    if (this.isDestroyed() || !this._owner._rpc) return;
    try {
      this._owner._rpc.send.ipcEvent({ channel, args: encodeArgs(args) });
    } catch (error) {
      console.warn(`[Electrobun] Failed to send "${channel}":`, error.message);
    }
  }

  loadURL(url) {
    if (this.isDestroyed()) return Promise.reject(new Error("Object has been destroyed"));
    this._loading = true;
    const loaded = new Promise(resolve => this._pendingLoads.push(resolve));
    if (typeof url === "string" && url.startsWith("data:")) {
      this._url = "about:blank";
      this._view.loadHTML(decodeDataUrl(url));
    } else {
      this._url = url;
      this._lastAllowedUrl = url;
      this._view.loadURL(url);
    }
    this._owner._loadRequested = true;
    this.emit("did-start-loading");
    return loaded;
  }

  loadFile(filePath) {
    return this.loadURL(`file://${filePath}`);
  }

  reload() {
    this._loading = true;
    this._view?.executeJavascript("location.reload()");
  }

  executeJavaScript(code) {
    if (this.isDestroyed()) return Promise.reject(new Error("Object has been destroyed"));
    const id = ++evalSequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pendingEvals.delete(id);
        reject(new Error("Script did not complete"));
      }, 30000);
      this._pendingEvals.set(id, { resolve, reject, timer });
      this._view.executeJavascript(buildEvalScript(code, id));
    });
  }

  insertCSS(css) {
    const script = `(() => { const s = document.createElement("style"); s.textContent = ${JSON.stringify(css)}; document.head.appendChild(s); })()`;
    this._view?.executeJavascript(script);
    return Promise.resolve("");
  }

  setWindowOpenHandler(handler) {
    this._windowOpenHandler = handler;
  }

  setUserAgent(userAgent) {
    this.session.setUserAgent(userAgent);
  }

  getUserAgent() {
    return this.session.getUserAgent();
  }

  openDevTools() {
    this._view?.openDevTools();
    this._devToolsOpen = true;
  }

  closeDevTools() {
    this._view?.closeDevTools();
    this._devToolsOpen = false;
  }

  toggleDevTools() {
    if (this._devToolsOpen) this.closeDevTools();
    else this.openDevTools();
  }

  isDevToolsOpened() {
    return this._devToolsOpen;
  }

  focus() {
    this._owner.focus();
  }

  invalidate() {}

  setBackgroundThrottling() {}

  setZoomFactor(factor) {
    this._view?.setPageZoom(factor);
  }

  getZoomFactor() {
    return this._view?.getPageZoom() ?? 1;
  }

  _attach(view) {
    view.on("will-navigate", event => {
      const url = typeof event.data?.detail === "string" ? event.data.detail : "";
      this._lastNavigationUrl = url;
      const navEvent = makeEvent({ url });
      this.emit("will-navigate", navEvent, url);
      if (navEvent.defaultPrevented) {
        this._blockedUrl = url;
        return;
      }
      this._loading = true;
      // Leaving the current origin drops IPC trust at once: the bridge exists
      // on every page in this view, and did-navigate may arrive after the new
      // page's scripts start.
      try {
        if (new URL(url).origin !== this.mainFrame.origin) this._url = url;
      } catch {
        this._url = url;
      }
    });
    view.on("did-navigate", event => {
      const url = typeof event.data?.detail === "string" ? event.data.detail : this._url;
      // Electrobun cannot cancel a navigation from Bun, so undo a vetoed one.
      if (this._blockedUrl && url === this._blockedUrl) {
        this._blockedUrl = null;
        if (this._lastAllowedUrl) this._view.loadURL(this._lastAllowedUrl);
        return;
      }
      this._url = url;
      this._lastAllowedUrl = url;
      this.emit("did-navigate", makeEvent(), url, 200, "OK");
    });
    view.on("did-navigate-in-page", event => {
      const url = typeof event.data?.detail === "string" ? event.data.detail : this._url;
      this._url = url;
      this.emit("did-navigate-in-page", makeEvent(), url, true);
    });
    view.on("dom-ready", event => {
      const url = typeof event.data?.detail === "string" ? event.data.detail : "";
      if (url && url !== "about:blank" && !url.startsWith("views://internal"))
        this._url = url;
      this._loading = false;
      this.emit("dom-ready", makeEvent());
      this.emit("did-stop-loading");
      this.emit("did-finish-load", makeEvent());
      for (const resolve of this._pendingLoads.splice(0)) resolve();
      this._owner._handleFirstPaint();
      if (!this.session._userAgent) {
        this.executeJavaScript("navigator.userAgent")
          .then(userAgent => this.session._learnUserAgent(userAgent))
          .catch(() => {});
      }
    });
    view.on("host-message", event => {
      const message = event.data?.detail;
      if (!message || typeof message !== "object" || !("__ascendaraEval" in message))
        return;
      const pending = this._pendingEvals.get(message.__ascendaraEval);
      if (!pending) return;
      this._pendingEvals.delete(message.__ascendaraEval);
      clearTimeout(pending.timer);
      if (message.ok) pending.resolve(message.value);
      else pending.reject(new Error(message.error));
    });
    view.on("download-started", event => {
      const item = new DownloadItem(event.data?.detail, this._lastNavigationUrl);
      const key = item.getSavePath() || item.getFilename() || String(Math.random());
      this._activeDownloads.set(key, item);
      const downloadEvent = makeEvent();
      this.session.emit("will-download", downloadEvent, item, this);
      if (downloadEvent.defaultPrevented) item.cancel();
    });
    const settle = (state, event) => {
      const detail = event.data?.detail || {};
      const key = detail.path || detail.filename;
      const item = this._activeDownloads.get(key);
      if (!item) return;
      this._activeDownloads.delete(key);
      item._state = state;
      if (item._cancelled) item._removeFile();
      item.emit("done", makeEvent(), state);
    };
    view.on("download-completed", event => settle("completed", event));
    view.on("download-failed", event => settle("interrupted", event));
    // Electrobun reports popups through this event instead of opening them.
    view.on("new-window-open", event => this._handleNewWindow(event.data?.detail));
  }

  _handleNewWindow(detail) {
    const url = typeof detail === "string" ? detail : detail?.url;
    if (!url) return;
    const handler = this._windowOpenHandler;
    const decision = handler
      ? handler({
          url,
          frameName: "",
          features: "",
          disposition: "new-window",
          referrer: { url: this._url },
        })
      : { action: "allow" };
    if (decision?.action !== "allow") return;
    const overrides = decision.overrideBrowserWindowOptions || {};
    const popup = new BrowserWindow({
      width: 800,
      height: 640,
      ...overrides,
      webPreferences: { sandbox: true, ...(overrides.webPreferences || {}), preload: "" },
    });
    popup.loadURL(url);
    this.emit("did-create-window", popup, { url });
  }

  _destroy() {
    for (const pending of this._pendingEvals.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Object has been destroyed"));
    }
    this._pendingEvals.clear();
    for (const resolve of this._pendingLoads.splice(0)) resolve();
  }
}

// Windows 11 rounds frameless (WS_POPUP) windows only when asked, which
// Electron did for its frameless windows. Windows 10 ignores the request.
const DWMWA_WINDOW_CORNER_PREFERENCE = 33;
const DWMWCP_ROUND = 2;
let dwmapi;

function roundWindowCorners(hwnd) {
  if (process.platform !== "win32" || !hwnd) return;
  try {
    dwmapi ??= dlopen("dwmapi.dll", {
      DwmSetWindowAttribute: {
        args: [FFIType.ptr, FFIType.u32, FFIType.ptr, FFIType.u32],
        returns: FFIType.i32,
      },
    });
    const preference = new Int32Array([DWMWCP_ROUND]);
    dwmapi.symbols.DwmSetWindowAttribute(
      hwnd,
      DWMWA_WINDOW_CORNER_PREFERENCE,
      ptr(preference),
      4
    );
  } catch (error) {
    console.warn("[Electrobun] Could not round window corners:", error.message);
  }
}

const allClosedListeners = new Set();

export function onAllWindowsClosed(listener) {
  allClosedListeners.add(listener);
}

function createRpc(contents) {
  return EBBrowserView.defineRPC({
    maxRequestTime: Infinity,
    handlers: {
      requests: {
        ipcInvoke: ({ channel, args }) => dispatchInvoke(contents, channel, args),
      },
      messages: {
        ipcSend: ({ channel, args }) => dispatchSend(contents, channel, args),
      },
    },
  });
}

export class BrowserWindow extends EventEmitter {
  static getAllWindows() {
    return [...windows.values()].filter(win => !win._destroyed);
  }

  static getFocusedWindow() {
    const pick = id => {
      const win = id !== null ? windows.get(id) : null;
      return win && !win._destroyed ? win : null;
    };
    // Focus events can be missed on some platforms; fall back to the window
    // the user most recently interacted with so window controls keep working.
    return (
      pick(focusedWindowId) ||
      pick(lastFocusedWindowId) ||
      BrowserWindow.getAllWindows().find(win => win.isVisible()) ||
      null
    );
  }

  static fromWebContents(contents) {
    return contents?._owner && !contents._owner._destroyed ? contents._owner : null;
  }

  static fromId(id) {
    return windows.get(id) || null;
  }

  constructor(options = {}) {
    super();
    this.setMaxListeners(0);
    const prefs = options.webPreferences || {};
    const trusted = Boolean(prefs.preload) && prefs.sandbox !== true;
    const session =
      prefs.session instanceof Session
        ? prefs.session
        : prefs.partition
          ? sessionModule.fromPartition(prefs.partition)
          : sessionModule.defaultSession;

    this._destroyed = false;
    this._title = options.title || "Ascendara";
    this._loadRequested = false;
    this._shownOnce = options.show !== false;
    this._readyToShowSent = false;
    this.webContents = new WebContents(this, session);
    this._rpc = trusted ? createRpc(this.webContents) : null;

    const frame = {
      width: Math.round(options.width || 800),
      height: Math.round(options.height || 600),
      ...(Number.isFinite(options.x) && Number.isFinite(options.y)
        ? { x: Math.round(options.x), y: Math.round(options.y) }
        : {}),
    };
    const navigationRules = options.electrobunNavigationRules
      ? JSON.stringify(options.electrobunNavigationRules)
      : null;
    const partitioned = Boolean(prefs.partition || prefs.session);

    this._eb = new EBBrowserWindow({
      title: this._title,
      frame,
      url: null,
      html: null,
      preload: trusted && !partitioned ? getPreloadScript() : null,
      titleBarStyle: options.frame === false ? "hidden" : "default",
      transparent: Boolean(options.transparent),
      hidden: options.show === false,
      rpc: partitioned ? undefined : this._rpc || undefined,
      sandbox: partitioned ? false : !trusted,
      navigationRules,
    });
    this.id = this._eb.id;

    if (partitioned) {
      // Electrobun windows always create a default-profile webview, so swap in
      // one bound to the requested partition.
      const size = this._eb.getSize();
      this._eb.webview.remove();
      this._partitionView = new EBBrowserView({
        url: null,
        html: null,
        preload: trusted ? getPreloadScript() : null,
        partition: session.partition,
        frame: { x: 0, y: 0, width: size.width, height: size.height },
        windowId: this._eb.id,
        autoResize: true,
        rpc: this._rpc || undefined,
        sandbox: !trusted,
        navigationRules,
      });
    }

    windows.set(this.id, this);
    this.webContents._attach(this._view);

    this._eb.on("will-close", event => {
      const closeEvent = makeEvent();
      this.emit("close", closeEvent);
      if (closeEvent.defaultPrevented) event.response = { allow: false };
    });
    this._eb.on("close", () => this._markDestroyed());
    this._eb.on("focus", () => {
      focusedWindowId = this.id;
      lastFocusedWindowId = this.id;
      this.emit("focus");
    });
    this._eb.on("blur", () => {
      if (focusedWindowId === this.id) focusedWindowId = null;
      this.emit("blur");
    });
    this._eb.on("resize", () => {
      this.emit("resize");
      this._emitMaximizeState();
    });
    this._eb.on("move", () => this.emit("move"));

    if (options.frame === false) roundWindowCorners(this._eb.ptr);
    if (options.alwaysOnTop) this._eb.setAlwaysOnTop(true);
    if (options.fullscreen || options.simpleFullscreen) this._eb.setFullScreen(true);
    if (options.show !== false) {
      focusedWindowId = this.id;
      lastFocusedWindowId = this.id;
    }
  }

  get _view() {
    return this._partitionView || this._eb.webview;
  }

  _handleFirstPaint() {
    if (!this._loadRequested || this._readyToShowSent) return;
    this._readyToShowSent = true;
    this.emit("ready-to-show");
  }

  _emitMaximizeState() {
    const maximized = this.isMaximized();
    if (maximized === this._wasMaximized) return;
    this._wasMaximized = maximized;
    this.emit(maximized ? "maximize" : "unmaximize");
  }

  _markDestroyed() {
    if (this._destroyed) return;
    this._destroyed = true;
    windows.delete(this.id);
    if (focusedWindowId === this.id) focusedWindowId = null;
    if (lastFocusedWindowId === this.id) lastFocusedWindowId = null;
    this.webContents._destroy();
    this.emit("closed");
    this.webContents.emit("destroyed");
    if (windows.size === 0) for (const listener of allClosedListeners) listener();
  }

  isDestroyed() {
    return this._destroyed;
  }

  loadURL(url, options) {
    return this.webContents.loadURL(url, options);
  }

  loadFile(filePath) {
    return this.webContents.loadFile(filePath);
  }

  reload() {
    this.webContents.reload();
  }

  show() {
    if (this._destroyed) return;
    this._eb.show();
    focusedWindowId = this.id;
    lastFocusedWindowId = this.id;
    this.emit("show");
  }

  showInactive() {
    if (this._destroyed) return;
    this._eb.showInactive();
    this.emit("show");
  }

  hide() {
    if (this._destroyed) return;
    this._eb.hide();
    if (focusedWindowId === this.id) focusedWindowId = null;
    this.emit("hide");
  }

  isVisible() {
    return !this._destroyed && this._eb.isVisible();
  }

  focus() {
    if (this._destroyed) return;
    this._eb.focus();
    focusedWindowId = this.id;
    lastFocusedWindowId = this.id;
  }

  blur() {}

  isFocused() {
    return focusedWindowId === this.id;
  }

  close() {
    if (this._destroyed) return;
    const closeEvent = makeEvent();
    this.emit("close", closeEvent);
    if (closeEvent.defaultPrevented) return;
    this._eb.close();
    this._markDestroyed();
  }

  destroy() {
    if (this._destroyed) return;
    this._eb.close();
    this._markDestroyed();
  }

  minimize() {
    this._eb.minimize();
    this.emit("minimize");
  }

  restore() {
    if (this._eb.isMinimized()) this._eb.unminimize();
    this.emit("restore");
  }

  isMinimized() {
    return !this._destroyed && this._eb.isMinimized();
  }

  maximize() {
    this._eb.maximize();
    this._emitMaximizeState();
  }

  unmaximize() {
    this._eb.unmaximize();
    this._emitMaximizeState();
  }

  isMaximized() {
    return !this._destroyed && this._eb.isMaximized();
  }

  setFullScreen(value) {
    this._eb.setFullScreen(Boolean(value));
    this.emit(value ? "enter-full-screen" : "leave-full-screen");
  }

  isFullScreen() {
    return !this._destroyed && this._eb.isFullScreen();
  }

  // macOS "simple" fullscreen has no Electrobun counterpart; use the native one.
  setSimpleFullScreen(value) {
    this.setFullScreen(value);
  }

  isSimpleFullScreen() {
    return this.isFullScreen();
  }

  getBounds() {
    const { x, y, width, height } = this._eb.getFrame();
    return { x, y, width, height };
  }

  setBounds(bounds) {
    const current = this.getBounds();
    const next = { ...current, ...bounds };
    this._eb.setFrame(next.x, next.y, next.width, next.height);
  }

  getSize() {
    const { width, height } = this._eb.getSize();
    return [width, height];
  }

  setSize(width, height) {
    this._eb.setSize(width, height);
  }

  getPosition() {
    const { x, y } = this._eb.getPosition();
    return [x, y];
  }

  setPosition(x, y) {
    this._eb.setPosition(x, y);
  }

  center() {
    this._eb.center();
  }

  setAlwaysOnTop(value) {
    this._eb.setAlwaysOnTop(Boolean(value));
  }

  isAlwaysOnTop() {
    return this._eb.isAlwaysOnTop();
  }

  setTitle(title) {
    this._title = title;
    this._eb.setTitle(title);
  }

  getTitle() {
    return this._title;
  }

  // Electron-only window chrome options with no Electrobun equivalent.
  setMinimumSize() {}
  setMaximumSize() {}
  setResizable() {}
  setMenu() {}
  removeMenu() {}
  setMenuBarVisibility() {}
  setAutoHideMenuBar() {}
  setSkipTaskbar() {}
  setProgressBar() {}
  flashFrame() {}
  setIcon() {}
  setBackgroundColor() {}
  moveTop() {
    this.focus();
  }
}
