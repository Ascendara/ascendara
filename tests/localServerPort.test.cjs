const { test } = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const Module = require("node:module");
const http = require("node:http");
const { holdAppPort } = require("../electron/modules/core/local-server-security.js");

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

test("the app port is held on both loopback addresses", async t => {
  if (!(await hasIpv6Loopback())) return t.skip("no IPv6 loopback here");
  const port = await freePort();
  const { owned, servers } = await holdAppPort(() => http.createServer(), {
    port,
    ...quick,
  });
  assert.equal(owned, true);
  assert.deepEqual(servers.map(server => server.address().address).sort(), [
    "127.0.0.1",
    "::1",
  ]);
  // Nothing can sit on the address the browser may try first.
  await assert.rejects(listen(port, "::1"), { code: "EADDRINUSE" });
  await closeAll(servers);
});

for (const host of ["127.0.0.1", "::1"]) {
  test(`another program on ${host} means the port is not the app's`, async t => {
    if (host === "::1" && !(await hasIpv6Loopback()))
      return t.skip("no IPv6 loopback here");
    const port = await freePort();
    const otherServer = await listen(port, host);
    const realError = console.error;
    console.error = () => {};
    try {
      const result = await holdAppPort(() => http.createServer(), { port, ...quick });
      assert.deepEqual(result, { owned: false, servers: [] });
    } finally {
      console.error = realError;
    }
    // What it held for a moment is free again.
    const other = host === "::1" ? "127.0.0.1" : null;
    if (other) await closeAll([await listen(port, other)]);
    await closeAll([otherServer]);
  });
}

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
    refused.setAppServerOwned(false);
    await new Promise(setImmediate);
    assert.equal(trusted.length, 0, "no trust for a port someone else holds");
    assert.equal(windows[0].urls.length, 1);
    assert.match(windows[0].urls[0], /^data:text\/html/);

    const owned = fresh();
    owned.createWindow();
    owned.setAppServerOwned(true);
    await new Promise(setImmediate);
    assert.equal(trusted.length, 1);
    assert.deepEqual(windows[1].urls, ["http://localhost:46859"]);
  } finally {
    console.log = realLog;
    Module._load = realLoad;
    delete require.cache[modulePath];
  }
});
