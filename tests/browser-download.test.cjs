const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const parser = fs
  .readFileSync(path.join(__dirname, "../src/lib/browserDownload.js"), "utf8")
  .replace("export function", "function");
const scope = { URL, URLSearchParams };
vm.runInNewContext(parser, scope);
test("legacy and v5 handoffs preserve signed URLs and games in host/path", () => {
  const url =
    "https://cdn.astralgames.example/game.zip?signature=a%2Fb%2B&name=checkout-success/";
  assert.equal(
    scope.parseBrowserDownload("ascendara://" + encodeURIComponent(url)).url,
    url
  );
  const raw =
    "ascendara://download?payload=" +
    encodeURIComponent(
      JSON.stringify({
        version: 1,
        url,
        filename: "C:\\Downloads\\game.zip",
        title: "Example",
      })
    );
  const result = scope.parseBrowserDownload(raw);
  assert.equal(result.url, url);
  assert.equal(result.filename, "game.zip");
  assert.equal(result.title, "Example");
  const normalized = raw.replace("ascendara://download?", "ascendara://download/?");
  assert.equal(scope.parseBrowserDownload(normalized).url, url);
});
test("invalid envelopes and nontransferable URLs are rejected", () => {
  for (const url of [
    "blob:https://example.org/id",
    "file:///tmp/a",
    "javascript:alert(1)",
    "https://user:pass@example.org/a",
  ]) {
    assert.throws(() =>
      scope.parseBrowserDownload("ascendara://" + encodeURIComponent(url))
    );
  }
  assert.throws(() => scope.parseBrowserDownload("ascendara://download?payload=oops"));
});
test("protocol routes by command, retains downloads until acknowledged, and restores hidden window", () => {
  const events = [],
    handlers = {};
  let shown = false;
  const win = {
    isVisible: () => false,
    show: () => {
      shown = true;
    },
    isMinimized: () => false,
    setAlwaysOnTop() {},
    focus() {},
    center() {},
    webContents: { send: (...args) => events.push(args) },
  };
  const context = {
    module: { exports: {} },
    console: { log() {}, error() {} },
    URL,
    Buffer,
    setTimeout() {},
    require: name => {
      if (name === "electron")
        return {
          BrowserWindow: { getAllWindows: () => [win] },
          app: { isReady: () => true },
          ipcMain: {
            handle: (name, handler) => {
              handlers[name] = handler;
            },
          },
        };
      if (name === "./config") return { isDev: true };
      if (name === "./window")
        return {
          setMainWindowHidden() {},
          setHandlingProtocolUrl() {},
          createWindow() {},
        };
      return require(name);
    },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../electron/modules/protocol.js"), "utf8"),
    context
  );
  const protocol = context.module.exports;
  protocol.registerProtocolHandlers();
  const raw =
    "ascendara://" +
    encodeURIComponent("https://astralgames.example/game.zip?checkout-success=yes");
  protocol.handleProtocolUrl(raw);
  assert.equal(events[0][0], "protocol-download-url");
  assert.equal(shown, true);
  assert.equal(handlers["get-pending-browser-downloads"]()[0], raw);
  handlers["acknowledge-browser-download"](null, raw);
  assert.equal(handlers["get-pending-browser-downloads"]().length, 0);
  protocol.handleProtocolUrl("ascendara://game?123");
  assert.equal(events.at(-1)[0], "protocol-game-url");
});
test("protocol URL received with no window reopens it and delivers after load", () => {
  const events = [],
    handlers = {},
    windows = [];
  let onLoad;
  const win = {
    isVisible: () => true,
    isMinimized: () => false,
    setAlwaysOnTop() {},
    focus() {},
    center() {},
    webContents: {
      once: (_name, callback) => {
        onLoad = callback;
      },
      send: (...args) => events.push(args),
    },
  };
  const context = {
    module: { exports: {} },
    console: { log() {}, error() {} },
    URL,
    Buffer,
    setTimeout() {},
    require: name => {
      if (name === "electron")
        return {
          BrowserWindow: { getAllWindows: () => windows },
          app: { isReady: () => true },
          ipcMain: {
            handle: (name, handler) => {
              handlers[name] = handler;
            },
          },
        };
      if (name === "./config") return { isDev: true };
      if (name === "./window")
        return {
          setMainWindowHidden() {},
          setHandlingProtocolUrl() {},
          createWindow() {
            windows.push(win);
            return win;
          },
        };
      return require(name);
    },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../electron/modules/protocol.js"), "utf8"),
    context
  );
  const protocol = context.module.exports;
  protocol.registerProtocolHandlers();
  const raw = "ascendara://" + encodeURIComponent("https://astralgames.example/game.zip");
  protocol.handleProtocolUrl(raw);
  assert.equal(windows.length, 1);
  assert.equal(events.length, 0);
  onLoad();
  assert.equal(events[0][0], "protocol-download-url");
  assert.equal(handlers["get-pending-browser-downloads"]()[0], raw);
});
