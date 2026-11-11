const { test } = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const Module = require("node:module");
const http = require("node:http");
const {
  APP_HOST_RESOLVER_RULE,
  closeAppServers,
  describePortHolder,
  holdAppPort,
} = require("../electron/modules/core/local-server-security.js");

const freePort = () =>
  new Promise(resolve => {
    const probe = http.createServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
const listen = (port, host) =>
  new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once("error", reject);
    server.listen(port, host, () => resolve(server));
  });
const closeAll = servers =>
  Promise.all(servers.map(server => new Promise(done => server.close(done))));
const hasIpv6Loopback = async () => {
  const port = await freePort();
  try {
    await closeAll([await listen(port, "::1")]);
    return true;
  } catch {
    return false;
  }
};
const quick = { tries: 1, waitMs: 0 };

test("the app port is held on 127.0.0.1, where the window is pinned", async () => {
  const port = await freePort();
  const { owned, servers } = await holdAppPort(() => http.createServer(), {
    port,
    ...quick,
  });
  assert.equal(owned, true);
  assert.deepEqual(
    servers.map(server => server.address().address),
    ["127.0.0.1"]
  );
  await assert.rejects(listen(port, "127.0.0.1"), { code: "EADDRINUSE" });
  await closeAll(servers);
  // Chromium would try ::1 first for "localhost", so the window is pinned to 127.0.0.1.
  assert.equal(APP_HOST_RESOLVER_RULE, "MAP localhost:46859 127.0.0.1:46859");
});

test("another program on 127.0.0.1 means the port is not the app's", async () => {
  const port = await freePort();
  const otherServer = await listen(port, "127.0.0.1");
  const realError = console.error;
  console.error = () => {};
  try {
    const result = await holdAppPort(() => http.createServer(), { port, ...quick });
    assert.deepEqual(result, { owned: false, servers: [], errorCode: "EADDRINUSE" });
  } finally {
    console.error = realError;
  }
  await closeAll([otherServer]);
});

test("another program on ::1 does not stop the app", async t => {
  if (!(await hasIpv6Loopback())) return t.skip("no IPv6 loopback here");
  const port = await freePort();
  const otherServer = await listen(port, "::1");
  const { owned, servers } = await holdAppPort(() => http.createServer(), {
    port,
    ...quick,
  });
  assert.equal(owned, true);
  await closeAll([...servers, otherServer]);
});

test("the program holding the port is named", async t => {
  if (process.platform !== "win32") return t.skip("netstat parsing is Windows only");
  const port = await freePort();
  const server = await listen(port, "127.0.0.1");
  try {
    const holder = await describePortHolder(port);
    assert.match(holder, new RegExp(`\\(PID ${process.pid}\\)$`));
  } finally {
    await closeAll([server]);
  }
  assert.equal(await describePortHolder(port), null);
});

test("no window trusts the port before the answer, and only a yes grants it", async () => {
  const realLoad = Module._load;
  const windows = [];
  const anyMethod = own =>
    new Proxy(own, {
      get: (target, name) => (name in target ? target[name] : () => undefined),
    });
  function FakeWindow() {
    const window = anyMethod({
      urls: [],
      webContents: anyMethod({}),
      loadURL: url => window.urls.push(url),
      isDestroyed: () => false,
      getBounds: () => ({ width: 1, height: 1 }),
    });
    windows.push(window);
    return window;
  }
  const trusted = [];
  Module._load = function (request, parent, ...rest) {
    if (request === "electron") {
      return {
        BrowserWindow: FakeWindow,
        app: {
          getPath: () => os.tmpdir(),
          commandLine: { hasSwitch: () => false },
          isPackaged: true,
        },
        ipcMain: { handle() {}, on() {} },
        screen: {
          getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 } }),
        },
        shell: { openExternal: async () => {} },
        dialog: {},
      };
    }
    if (parent?.filename?.endsWith("window.js") && /core\/config$/.test(request))
      return { isDev: false };
    if (parent?.filename?.endsWith("window.js") && /core\/settings$/.test(request)) {
      return {
        getSettingsManager: () => ({
          getSettings: () => ({}),
          getSetting: () => undefined,
        }),
      };
    }
    if (parent?.filename?.endsWith("window.js") && /core\/security$/.test(request)) {
      return {
        isAllowedAppNavigation: () => true,
        isAllowedAuthPopup: () => false,
        isSafeExternalUrl: () => false,
        registerTrustedWebContents: contents => trusted.push(contents),
      };
    }
    return realLoad.call(this, request, parent, ...rest);
  };
  const modulePath = require.resolve("../electron/modules/app/window.js");
  const fresh = () => {
    delete require.cache[modulePath];
    return require(modulePath);
  };
  const realLog = console.log;
  console.log = () => {};
  try {
    const refused = fresh();
    refused.createWindow();
    await new Promise(setImmediate);
    assert.deepEqual(windows[0].urls, [], "nothing loads before the answer");
    assert.equal(trusted.length, 0);
    refused.setAppServerOwned(false, "EADDRINUSE");
    await new Promise(setImmediate);
    assert.equal(trusted.length, 0, "no trust for a port someone else holds");
    assert.equal(windows[0].urls.length, 1);
    assert.match(windows[0].urls[0], /^data:text\/html/);
    // The page must survive URL parsing whole: a raw "#" would end it at the first colour.
    const errorPage = new URL(windows[0].urls[0]);
    assert.equal(errorPage.hash, "", "no part of the page is read as a fragment");
    const errorHtml = decodeURIComponent(
      errorPage.pathname.slice(errorPage.pathname.indexOf(",") + 1)
    );
    assert.match(errorHtml, /netstat -ano/, "says how to find the holder");
    assert.doesNotMatch(errorHtml, /Visual C\+\+|Antivirus/);
    assert.match(errorHtml, /background: #09090b;/);
    assert.match(errorHtml, /Another program is using port 46859 \(port in use\)/);
    assert.match(errorHtml, /findstr :46859<\/code>/);
    assert.match(
      errorHtml,
      /Try restarting Ascendara or your computer\.<\/p>\s*<\/body>\s*<\/html>/
    );

    // A reserved port (EACCES) gets its own page: netstat would show nothing there.
    const reserved = fresh();
    reserved.createWindow();
    reserved.setAppServerOwned(false, "EACCES");
    await new Promise(setImmediate);
    assert.equal(trusted.length, 0);
    const reservedPage = new URL(windows[1].urls[0]);
    const reservedHtml = decodeURIComponent(
      reservedPage.pathname.slice(reservedPage.pathname.indexOf(",") + 1)
    );
    assert.match(reservedHtml, /\(port reserved\)/);
    assert.match(reservedHtml, /excludedportrange/);
    assert.match(reservedHtml, /net stop winnat/);
    assert.doesNotMatch(reservedHtml, /netstat -ano/);
    windows.splice(1, 1);

    const pageHtml = window => {
      const page = new URL(window.urls[0]);
      return decodeURIComponent(page.pathname.slice(page.pathname.indexOf(",") + 1));
    };

    // When the holder is known, the page names it (escaped: it comes from tasklist).
    const named = fresh();
    named.createWindow();
    named.setAppServerOwned(false, "EADDRINUSE", "<b>Foo.exe (PID 42)");
    await new Promise(setImmediate);
    assert.match(
      pageHtml(windows[1]),
      /Port 46859 is being used by &lt;b&gt;Foo\.exe \(PID 42\) \(port in use\)/
    );
    windows.splice(1, 1);

    // Any other failure is not blamed on another program.
    const other = fresh();
    other.createWindow();
    other.setAppServerOwned(false, "EINVAL");
    await new Promise(setImmediate);
    assert.equal(trusted.length, 0);
    const otherHtml = pageHtml(windows[1]);
    assert.match(otherHtml, /Ascendara could not open port 46859 \(EINVAL\)/);
    assert.doesNotMatch(otherHtml, /Another program/);
    windows.splice(1, 1);

    const owned = fresh();
    owned.createWindow();
    owned.setAppServerOwned(true);
    await new Promise(setImmediate);
    assert.equal(trusted.length, 1);
    assert.deepEqual(windows[1].urls, ["http://localhost:46859"]);

    // A deep link at cold start: right after createWindow() the page has not started
    // loading, so delivery must wait for did-finish-load instead of isLoading().
    const listeners = {};
    const startup = {
      webContents: {
        isLoading: () => false,
        once: (event, fn) => (listeners[event] = fn),
      },
    };
    const delivered = [];
    owned.whenFirstPageLoads(startup, () => delivered.push("ascendara://game/1"));
    await new Promise(setImmediate);
    assert.deepEqual(delivered, [], "nothing is sent before a page exists");
    listeners["did-finish-load"]();
    assert.deepEqual(delivered, ["ascendara://game/1"]);
  } finally {
    console.log = realLog;
    Module._load = realLoad;
    delete require.cache[modulePath];
  }
});

test("closing the app's servers logs once for the set", async () => {
  const port = await freePort();
  const servers = [await listen(port, "127.0.0.1"), await listen(0, "127.0.0.1")];
  const lines = [];
  const realLog = console.log;
  console.log = line => lines.push(line);
  try {
    closeAppServers(servers);
    await new Promise(resolve => setTimeout(resolve, 50));
  } finally {
    console.log = realLog;
  }
  assert.deepEqual(lines, ["Closing local HTTP server...", "Local server closed"]);
  assert.equal(servers.filter(server => server.listening).length, 0);
});
