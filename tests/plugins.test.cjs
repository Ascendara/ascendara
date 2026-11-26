const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const Module = require("node:module");

const MANIFEST = path.join(__dirname, "..", "electron/modules/app/plugin-manifest.js");
const PLUGINS = path.join(__dirname, "..", "electron/modules/app/plugins.js");
const LUDUSAVI = path.join(__dirname, "..", "electron/modules/library/ludusavi.js");
const REGISTRY = path.join(__dirname, "..", "plugins");
const { compareVersions, resolveInside, validateManifest, incompatibility } = require(
  MANIFEST
);
const { buildIndex } = require("../scripts/build-plugin-index.cjs");

const manifest = overrides => ({
  name: "Example",
  version: "1.0.0",
  author: "Someone",
  ...overrides,
});

test("manifests need a name, author and a 1.0.0 style version", () => {
  assert.equal(validateManifest(manifest(), "example").main, "index.js");
  assert.throws(
    () => validateManifest(manifest({ version: "1.0" }), "example"),
    /1\.0\.0/
  );
  assert.throws(() => validateManifest(manifest({ author: "" }), "example"), /author/);
  assert.throws(() => validateManifest(manifest(), "Bad_Id"), /lowercase/);
});

test("manifests only accept known permissions and files inside the plugin", () => {
  assert.deepEqual(
    validateManifest(manifest({ permissions: ["processes", "processes"] }), "example")
      .permissions,
    ["processes"]
  );
  assert.throws(
    () => validateManifest(manifest({ permissions: ["everything"] }), "example"),
    /Unknown permission/
  );
  assert.throws(
    () => validateManifest(manifest({ main: "../x.js" }), "example"),
    /inside/
  );
  assert.equal(validateManifest(manifest({ style: "style.css" }), "example").main, "");
});

test("manifests can describe what the plugin changes", () => {
  const described = validateManifest(
    manifest({
      details: "  Longer text.  ",
      affects: ["Hides the Ascend button", " "],
      changelog: "Fixed a bug",
      license: "MIT",
    }),
    "example"
  );
  assert.equal(described.details, "Longer text.");
  assert.deepEqual(described.affects, ["Hides the Ascend button"]);
  assert.equal(described.changelog, "Fixed a bug");
  assert.equal(described.license, "MIT");
  assert.deepEqual(validateManifest(manifest(), "example").affects, []);
  assert.throws(
    () => validateManifest(manifest({ affects: "everything" }), "example"),
    /list of text/
  );
  assert.throws(
    () => validateManifest(manifest({ affects: Array(21).fill("x") }), "example"),
    /at most 20/
  );
});

test("versions compare numerically and gate incompatible plugins", () => {
  assert.equal(compareVersions("1.10.0", "1.9.9"), 1);
  assert.equal(compareVersions("2.0.0", "2.0.0"), 0);
  assert.equal(compareVersions("0.9.0", "1.0.0"), -1);
  const needsNewer = validateManifest(manifest({ minAppVersion: "13.0.0" }), "example");
  assert.match(incompatibility(needsNewer, "12.3.0"), /13\.0\.0/);
  assert.equal(incompatibility(needsNewer, "13.0.0"), null);
  assert.match(
    incompatibility(validateManifest(manifest({ apiVersion: 99 }), "example"), "99.0.0"),
    /newer version/
  );
});

test("plugin paths can't leave their folder", () => {
  const root = path.resolve("/data/plugin");
  assert.equal(resolveInside(root, "a/b.txt"), path.join(root, "a", "b.txt"));
  assert.equal(resolveInside(root, "../other/file"), null);
  assert.equal(resolveInside(root, path.resolve("/etc/passwd")), null);
  assert.equal(resolveInside(root, ""), null);
});

test("plugins/index.json matches the plugin folders", () => {
  assert.equal(
    fs.readFileSync(path.join(REGISTRY, "index.json"), "utf8"),
    buildIndex(),
    "Run: node scripts/build-plugin-index.cjs"
  );
});

async function withPlugins(run, routes = {}, electron = {}, settings = {}) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "ascendara-plugins-"));
  const server = http.createServer((request, response) => {
    if (routes[request.url]) {
      response.end(routes[request.url]);
      return;
    }
    const file = path.join(REGISTRY, decodeURIComponent(request.url));
    if (!file.startsWith(REGISTRY) || !fs.existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    response.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  process.env.ASCENDARA_PLUGIN_REGISTRY = `http://127.0.0.1:${server.address().port}`;

  const handlers = {};
  const realLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === "electron")
      return {
        app: { getPath: () => userData },
        ipcMain: { handle: (channel, handler) => (handlers[channel] = handler) },
        shell: { openPath: async () => "" },
        dialog: {},
        BrowserWindow: { getAllWindows: () => [] },
        ...electron,
      };
    // New enough for every listed plugin's minAppVersion
    if (request === "../core/config") return { appVersion: "99.0.0" };
    if (request === "../core/settings")
      return { getSettingsManager: () => ({ getSettings: () => settings }) };
    return realLoad.call(this, request, ...rest);
  };
  delete require.cache[PLUGINS];
  delete require.cache[LUDUSAVI];
  const sender = { isDestroyed: () => false, send() {} };
  const invoke = (channel, ...args) => handlers[channel]({ sender }, ...args);
  try {
    require(PLUGINS).registerPluginHandlers();
    await run({ invoke, userData });
  } finally {
    Module._load = realLoad;
    delete require.cache[PLUGINS];
    delete require.cache[LUDUSAVI];
    delete process.env.ASCENDARA_PLUGIN_REGISTRY;
    server.close();
    fs.rmSync(userData, { recursive: true, force: true });
  }
}

test("installs a plugin from the list, runs its calls, and uninstalls it", async () => {
  await withPlugins(async ({ invoke, userData }) => {
    const listed = await invoke("plugins-registry", true);
    const entry = listed.find(plugin => plugin.id === "hide-ascend-nav");
    assert.equal(entry.installedVersion, null);

    await invoke("plugins-install", "hide-ascend-nav");
    const { plugins } = await invoke("plugins-list");
    assert.deepEqual(
      plugins.map(plugin => [plugin.id, plugin.enabled, plugin.source]),
      [["hide-ascend-nav", true, "registry"]]
    );
    const [source] = await invoke("plugins-sources");
    assert.match(source.code, /data-nav-path/);

    await invoke("plugins-call", "hide-ascend-nav", "files.write", "notes/a.txt", "hi");
    assert.equal(
      await invoke("plugins-call", "hide-ascend-nav", "files.read", "notes/a.txt"),
      "hi"
    );
    await assert.rejects(
      invoke("plugins-call", "hide-ascend-nav", "files.read", "../../plugins.json"),
      /outside/
    );
    await assert.rejects(
      invoke("plugins-call", "hide-ascend-nav", "run", "/bin/echo"),
      /"processes"/
    );

    await invoke("plugins-set-enabled", "hide-ascend-nav", false);
    assert.deepEqual(await invoke("plugins-sources"), []);
    await assert.rejects(
      invoke("plugins-call", "hide-ascend-nav", "files.exists", "notes/a.txt"),
      /turned off/
    );

    await invoke("plugins-uninstall", "hide-ascend-nav");
    assert.deepEqual((await invoke("plugins-list")).plugins, []);
    assert.equal(
      fs.existsSync(path.join(userData, "plugin-data", "hide-ascend-nav")),
      false
    );
  });
});

test("refuses plugin files that don't match their pinned hash", async () => {
  const tampered = JSON.parse(fs.readFileSync(path.join(REGISTRY, "index.json"), "utf8"));
  const target = tampered.plugins.find(plugin => plugin.id === "hide-ascend-nav");
  target.files[0].sha256 = "0".repeat(64);
  await withPlugins(
    async ({ invoke }) => {
      await assert.rejects(invoke("plugins-install", target.id), /changed/);
      assert.deepEqual((await invoke("plugins-list")).plugins, []);
    },
    { "/index.json": JSON.stringify(tampered) }
  );
});

test("a plugin with permissions can download, extract and run a program", async () => {
  const JSZip = require("jszip");
  const zip = new JSZip();
  zip.file("tool/hello.js", "console.log('hello ' + process.argv[2])");
  const archive = await zip.generateAsync({ type: "nodebuffer" });
  const evil = new JSZip();
  evil.file("../escape.txt", "x");
  const evilArchive = await evil.generateAsync({ type: "nodebuffer" });

  await withPlugins(
    async ({ invoke, userData }) => {
      const folder = path.join(userData, "plugins", "emulator-helper");
      fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(
        path.join(folder, "manifest.json"),
        JSON.stringify(manifest({ permissions: ["downloads", "processes"] }))
      );
      fs.writeFileSync(path.join(folder, "index.js"), "module.exports = {};");
      await invoke("plugins-set-enabled", "emulator-helper", true);
      const call = (...args) => invoke("plugins-call", "emulator-helper", ...args);
      const base = process.env.ASCENDARA_PLUGIN_REGISTRY;

      await assert.rejects(call("download", `${base}/tool.zip`, "tool.zip"), /https/);
      // The test server is plain http, so stand in for the download.
      await call("files.write", "placeholder", "");
      fs.writeFileSync(
        path.join(userData, "plugin-data", "emulator-helper", "tool.zip"),
        archive
      );
      await call("extract", "tool.zip", "emulator");
      assert.deepEqual(await call("files.list", "emulator/tool"), [
        { name: "hello.js", directory: false },
      ]);

      fs.writeFileSync(
        path.join(userData, "plugin-data", "emulator-helper", "evil.zip"),
        evilArchive
      );
      await assert.rejects(call("extract", "evil.zip", "evil"), /outside/);

      const result = await call("exec", process.execPath, [
        path.join(userData, "plugin-data", "emulator-helper", "emulator/tool/hello.js"),
        "world",
      ]);
      assert.deepEqual(result, { code: 0, stdout: "hello world\n", stderr: "" });

      const pid = await call("run", process.execPath, [
        "-e",
        "setTimeout(() => {}, 5000)",
      ]);
      assert.equal(typeof pid, "number");
      await call("kill", pid);
      await assert.rejects(call("kill", 1), /Not a process/);
    },
    { "/tool.zip": archive }
  );
});

test("a picked folder only installs after it's confirmed", async () => {
  const folder = path.join(REGISTRY, "hide-ascend-nav");
  await withPlugins(
    async ({ invoke, userData }) => {
      const picked = await invoke("plugins-pick-folder");
      assert.equal(picked.id, "hide-ascend-nav");
      assert.deepEqual(picked.affects, ["Hides the Ascend button in the navigation bar"]);
      assert.ok(picked.files.some(file => file.path === "index.js" && file.size > 0));
      assert.equal(
        fs.existsSync(path.join(userData, "plugins", "hide-ascend-nav")),
        false
      );

      await assert.rejects(invoke("plugins-install-folder", "made-up"), /again/);
      await invoke("plugins-install-folder", picked.token);
      const { plugins } = await invoke("plugins-list");
      assert.deepEqual(
        plugins.map(plugin => [plugin.id, plugin.enabled, plugin.source]),
        [["hide-ascend-nav", true, "local"]]
      );
      await assert.rejects(invoke("plugins-install-folder", picked.token), /again/);
    },
    {},
    { dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [folder] }) } }
  );
});

test("the plugin list includes file sizes but not hashes", async () => {
  await withPlugins(async ({ invoke }) => {
    const [entry] = await invoke("plugins-registry", true);
    assert.ok(entry.files.length > 0);
    assert.ok(entry.files.every(file => file.path && file.size > 0 && !file.sha256));
    assert.equal(entry.installedPermissions, null);
  });
});

test("manifest settings are checked and get sensible defaults", () => {
  const settings = validateManifest(
    manifest({
      settings: [
        { key: "hide", type: "boolean", label: "Hide it" },
        { key: "count", type: "number", label: "Count", default: 500, min: 1, max: 50 },
        {
          key: "size",
          type: "select",
          label: "Size",
          default: "missing",
          options: [
            { value: "s", label: "Small" },
            { value: "l", label: "Large" },
          ],
        },
        { key: "path", type: "text", label: "Path", placeholder: "/opt/tools" },
      ],
    }),
    "example"
  ).settings;
  assert.deepEqual(
    settings.map(setting => [setting.key, setting.default]),
    [
      ["hide", false],
      ["count", 50],
      ["size", "s"],
      ["path", ""],
    ]
  );
  assert.deepEqual(validateManifest(manifest(), "example").settings, []);
  const invalid = setting => () =>
    validateManifest(manifest({ settings: [setting] }), "example");
  assert.throws(invalid({ key: "a", type: "color", label: "A" }), /unknown type/);
  assert.throws(invalid({ key: "a", type: "boolean" }), /label/);
  assert.throws(invalid({ key: "bad key", type: "boolean", label: "A" }), /letters/);
  assert.throws(
    invalid({ key: "a", type: "select", label: "A", options: [] }),
    /options/
  );
  assert.throws(
    () =>
      validateManifest(
        manifest({
          settings: [
            { key: "a", type: "boolean", label: "A" },
            { key: "a", type: "boolean", label: "A" },
          ],
        }),
        "example"
      ),
    /twice/
  );
  assert.equal(
    validateManifest(manifest({ permissions: ["manageDownloads"] }), "example")
      .permissions[0],
    "manageDownloads"
  );
});

test("plugins can find a game's executable and App ID, and open only folders", async () => {
  const game = fs.mkdtempSync(path.join(os.tmpdir(), "ascendara-game-"));
  fs.mkdirSync(path.join(game, "bin", "x64"), { recursive: true });
  fs.writeFileSync(path.join(game, "bin", "x64", "steam_appid.txt"), "1437400\n");
  fs.writeFileSync(path.join(game, "game.exe"), "");
  const opened = [];
  try {
    await withPlugins(
      async ({ invoke }) => {
        await invoke("plugins-install", "hide-ascend-nav");
        const call = (method, ...args) =>
          invoke("plugins-call", "hide-ascend-nav", method, ...args);
        const custom = {
          game: "Game",
          isCustom: true,
          executable: path.join(game, "game.exe"),
        };

        assert.equal(await call("games.executable", custom), custom.executable);
        assert.equal(
          await call("games.executable", {
            ...custom,
            executable: path.join(game, "gone.exe"),
          }),
          null
        );
        assert.equal(await call("games.appId", custom), "1437400");
        assert.equal(
          await call("games.appId", { ...custom, steamAppId: "283640" }),
          "283640"
        );

        await call("openFolder", game);
        assert.deepEqual(opened, [game]);
        await assert.rejects(call("openFolder", custom.executable), /Folder not found/);
        await assert.rejects(call("openFolder", "relative"), /full folder path/);
      },
      {},
      { shell: { openPath: async target => (opened.push(target), "") } }
    );
  } finally {
    fs.rmSync(game, { recursive: true, force: true });
  }
});

test("a save folder the user picks is the only one plugins get, until it's cleared", async () => {
  const library = fs.mkdtempSync(path.join(os.tmpdir(), "ascendara-library-"));
  const saves = fs.mkdtempSync(path.join(os.tmpdir(), "ascendara-saves-"));
  const gamesFile = path.join(library, "games.json");
  fs.writeFileSync(gamesFile, JSON.stringify({ games: [{ game: "Game" }] }));
  const picks = [];
  try {
    await withPlugins(
      async ({ invoke, userData }) => {
        await invoke("plugins-install", "hide-ascend-nav");
        const call = (method, ...args) =>
          invoke("plugins-call", "hide-ascend-nav", method, ...args);
        const game = { game: "Game", isCustom: true, steamAppId: "1437400" };

        picks.push(null);
        assert.equal(await call("games.pickSaveFolder", game), null);
        assert.equal(
          JSON.parse(fs.readFileSync(gamesFile)).games[0].customSavePaths,
          undefined
        );

        picks.push(saves);
        assert.equal(await call("games.pickSaveFolder", game), saves);
        assert.deepEqual(
          JSON.parse(fs.readFileSync(gamesFile)).games[0].customSavePaths,
          [saves]
        );
        assert.match(
          fs.readFileSync(
            path.join(userData, "ludusavi-cloud-config", "config.yaml"),
            "utf8"
          ),
          /name: "Game"/
        );
        assert.deepEqual(await call("games.saveFolders", game), {
          appId: "1437400",
          folders: [saves],
          custom: true,
        });

        await call("games.clearSaveFolder", game);
        assert.equal(
          JSON.parse(fs.readFileSync(gamesFile)).games[0].customSavePaths,
          undefined
        );
        const searched = await call("games.saveFolders", game);
        assert.equal(searched.custom, false);
        assert.ok(!searched.folders.includes(saves));
      },
      {},
      {
        dialog: {
          showOpenDialog: async () => {
            const folder = picks.shift();
            return { canceled: !folder, filePaths: folder ? [folder] : [] };
          },
        },
        BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
      },
      { downloadDirectory: library }
    );
  } finally {
    fs.rmSync(library, { recursive: true, force: true });
    fs.rmSync(saves, { recursive: true, force: true });
  }
});

test("plugin sources include their settings", async () => {
  await withPlugins(async ({ invoke }) => {
    await invoke("plugins-install", "hide-nav-items");
    const [source] = await invoke("plugins-sources");
    assert.ok(source.settings.some(setting => setting.key === "workshop"));
  });
});
