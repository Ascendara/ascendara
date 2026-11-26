// Runs the official plugins in plugins/ against a stand-in for the `ascendara`
// object from src/lib/plugins.js, so a broken plugin fails here, not in review.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { validateManifest } = require("../electron/modules/app/plugin-manifest");

const REGISTRY = path.join(__dirname, "..", "plugins");

function loadPlugin(id) {
  const folder = path.join(REGISTRY, id);
  const manifest = validateManifest(
    JSON.parse(fs.readFileSync(path.join(folder, "manifest.json"), "utf8")),
    id
  );
  const module = { exports: {} };
  // `window` resolves to the global the fake API sets, like in the app
  new Function(
    "module",
    "exports",
    fs.readFileSync(path.join(folder, manifest.main), "utf8")
  )(module, module.exports);
  return { manifest, plugin: module.exports };
}

// A fake `ascendara` with the same surface as createApi in src/lib/plugins.js
function fakeApi(
  manifest,
  {
    platform = "win32",
    values = {},
    exec,
    downloads = [],
    folders = ["C:\\Saves\\1437400"],
    pick = null,
  } = {}
) {
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>");
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  const settingValues = Object.fromEntries(
    manifest.settings.map(setting => [setting.key, setting.default])
  );
  Object.assign(settingValues, values);
  const listeners = { settings: [], launch: [], exit: [] };
  const record = {
    toasts: [],
    actions: [],
    exec: [],
    run: [],
    paused: [],
    resumed: [],
    storage: {},
    opened: [],
    cleared: [],
  };
  const cleanups = [];
  const onCleanup = cleanup => (cleanups.push(cleanup), cleanup);
  const listen = (list, callback) => {
    list.push(callback);
    return onCleanup(() => list.splice(list.indexOf(callback), 1));
  };

  const api = {
    id: manifest.id,
    platform,
    dataPath: "C:\\Data\\plugin",
    permissions: manifest.permissions,
    addStyle(css) {
      const style = globalThis.document.createElement("style");
      style.textContent = css;
      globalThis.document.head.appendChild(style);
      return onCleanup(() => style.remove());
    },
    onCleanup,
    log() {},
    toast: (message, type = "info") => record.toasts.push({ message, type }),
    storage: {
      get: (key, fallback = null) =>
        key in record.storage ? record.storage[key] : fallback,
      set: (key, value) => (record.storage[key] = value),
      remove: key => delete record.storage[key],
    },
    settings: {
      get: key => settingValues[key],
      all: () => ({ ...settingValues }),
      onChange: callback => listen(listeners.settings, callback),
    },
    downloads: {
      list: async () => downloads,
      pause: async name => record.paused.push(name),
      resume: async name => record.resumed.push(name),
    },
    files: {
      write: async () => {},
      exists: async () => true,
      list: async () => [],
      remove: async () => {},
    },
    exec: async (program, args) => {
      record.exec.push([program, ...args]);
      return exec ? exec(program, args) : { code: 0, stdout: "", stderr: "" };
    },
    run: async (program, args = []) => record.run.push([program, ...args]),
    download: async () => {},
    extract: async () => {},
    openFolder: async folder => record.opened.push(folder),
    games: {
      executable: async game => game.executable,
      saveFolders: async () => ({ appId: "1437400", folders, custom: false }),
      pickSaveFolder: async () => pick,
      clearSaveFolder: async game => record.cleared.push(game.game),
      onLaunch: callback => listen(listeners.launch, callback),
      onExit: callback => listen(listeners.exit, callback),
    },
    gameScreen: {
      addAction(action) {
        record.actions.push(action);
        return onCleanup(() => {
          record.actions = record.actions.filter(item => item !== action);
        });
      },
    },
  };

  return {
    api,
    record,
    css: () =>
      [...globalThis.document.head.querySelectorAll("style")]
        .map(s => s.textContent)
        .join("\n"),
    changeSetting(key, value) {
      settingValues[key] = value;
      for (const listener of listeners.settings) listener({ ...settingValues }, key);
    },
    launch: async name => {
      for (const listener of listeners.launch) await listener(name);
    },
    exit: async name => {
      for (const listener of listeners.exit) await listener(name, { game: name });
    },
    stop() {
      for (const cleanup of cleanups.reverse()) cleanup();
    },
  };
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

test("every official plugin starts and stops cleanly", () => {
  for (const id of fs.readdirSync(REGISTRY)) {
    if (!fs.statSync(path.join(REGISTRY, id)).isDirectory()) continue;
    const { manifest, plugin } = loadPlugin(id);
    if (!manifest.main) continue;
    const harness = fakeApi(manifest);
    assert.doesNotThrow(() => plugin.start(harness.api), id);
    harness.stop();
    assert.equal(harness.css(), "", `${id} must remove its styles when stopped`);
  }
});

test("hide plugins follow their options and undo everything when stopped", () => {
  const cases = [
    ["hide-menubar-badges", "big-picture", '[data-menubar-badge="big-picture"]'],
    ["hide-nav-items", "workshop", '[data-nav-path="/workshopdownloader"]'],
    ["hide-store-card-details", "rating", '[data-game-card] [data-card-part="rating"]'],
  ];
  for (const [id, key, selector] of cases) {
    const { manifest, plugin } = loadPlugin(id);
    const harness = fakeApi(manifest);
    plugin.start(harness.api);
    assert.ok(!harness.css().includes(selector), `${id} starts with ${key} shown`);
    harness.changeSetting(key, true);
    assert.ok(harness.css().includes(selector), `${id} hides ${key}`);
    harness.changeSetting(key, false);
    assert.ok(!harness.css().includes(selector), `${id} shows ${key} again`);
    harness.stop();
  }

  const badges = loadPlugin("hide-menubar-badges");
  const harness = fakeApi(badges.manifest);
  badges.plugin.start(harness.api);
  assert.match(
    harness.css(),
    /\[data-menubar-badge="torrent-warning"\]/,
    "the VPN badge is hidden by default"
  );
});

test("the hooks the hide plugins target exist in the app", () => {
  const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const menuBar = read("src/components/MenuBar.jsx");
  for (const badge of [
    "torrent-warning",
    "big-picture",
    "public-testing",
    "experimental",
    "dev",
  ])
    assert.match(menuBar, new RegExp(`data-menubar-badge="${badge}"`));
  const card = read("src/components/GameCard.jsx");
  assert.match(card, /data-game-card/);
  for (const part of [
    "rating",
    "views",
    "features",
    "tags",
    "specs",
    "source",
    "verified",
    "recently-updated",
    "mac-compat",
  ])
    assert.match(card, new RegExp(`data-card-part="${part}"`));
  const navigation = read("src/components/Navigation.jsx");
  assert.match(navigation, /data-nav-path=\{item\.path\}/);
});

test("compact mode scales the root font size", () => {
  const { manifest, plugin } = loadPlugin("compact-mode");
  const harness = fakeApi(manifest);
  plugin.start(harness.api);
  assert.match(harness.css(), /font-size: 90%/);
  harness.changeSetting("scale", "80");
  assert.match(harness.css(), /font-size: 80%/);
  assert.doesNotMatch(harness.css(), /font-size: 90%/);
});

test("downloads pause while playing and resume after the last game closes", async () => {
  const { manifest, plugin } = loadPlugin("pause-downloads-while-playing");
  const harness = fakeApi(manifest, {
    downloads: [
      { name: "Busy", status: "downloading" },
      { name: "Mine", status: "paused" },
    ],
  });
  plugin.start(harness.api);
  await harness.launch("Game A");
  await harness.launch("Game B");
  assert.deepEqual(harness.record.paused, ["Busy", "Busy"]);
  await harness.exit("Game A");
  await flush();
  assert.deepEqual(harness.record.resumed, [], "another game is still running");
  await harness.exit("Game B");
  await flush();
  assert.deepEqual(harness.record.resumed, ["Busy"], "only what the plugin paused");
  delete globalThis.window.__ascendaraPauseWhilePlaying;
});

test("save folder opens the best match first and can be set and reset", async () => {
  const { manifest, plugin } = loadPlugin("open-save-folder");
  const harness = fakeApi(manifest, {
    folders: ["C:\\Users\\me\\AppData\\LocalLow\\Studio\\Game", "C:\\Saves\\1437400"],
    pick: "D:\\Saves\\Game",
  });
  plugin.start(harness.api);
  const game = { game: "Game", executable: "game.exe" };
  const action = label => harness.record.actions.find(item => item.label === label);

  await action("Open save folder").onClick(game);
  assert.deepEqual(harness.record.opened, [
    "C:\\Users\\me\\AppData\\LocalLow\\Studio\\Game",
  ]);
  assert.match(
    harness.record.toasts[0].message,
    /Also found: .*1437400.*Set save folder/
  );

  assert.equal(action("Reset save folder").when(game), false);
  await action("Set save folder").onClick(game);
  assert.equal(action("Reset save folder").when(game), true);
  await action("Reset save folder").onClick(game);
  assert.deepEqual(harness.record.cleared, ["Game"]);
  assert.equal(action("Reset save folder").when(game), false);
});

test("save folder points to Set save folder when nothing is found", async () => {
  const { manifest, plugin } = loadPlugin("open-save-folder");
  const harness = fakeApi(manifest, { folders: [] });
  plugin.start(harness.api);
  await harness.record.actions[0].onClick({ game: "Game" });
  assert.deepEqual(harness.record.opened, []);
  assert.match(harness.record.toasts[0].message, /Set save folder/);
});

test("save backups zip the save folder when a game closes", async () => {
  const { manifest, plugin } = loadPlugin("save-backups");
  const harness = fakeApi(manifest);
  plugin.start(harness.api);
  await harness.exit("Salt and Sacrifice");
  await flush();
  const [call] = harness.record.exec;
  assert.equal(call[0], "C:\\Windows\\System32\\tar.exe");
  assert.ok(call.includes("C:\\Saves\\1437400"));
  assert.match(
    call.find(arg => arg.endsWith(".zip")),
    /^C:\\Data\\plugin\\backups\\Salt and Sacrifice\\.+-1\.zip$/
  );
});

test("run with only appears once a program is set, and passes the executable", async () => {
  const { manifest, plugin } = loadPlugin("run-with");
  const harness = fakeApi(manifest);
  plugin.start(harness.api);
  assert.equal(harness.record.actions.length, 0);
  harness.changeSetting("tool", "C:\\Tools\\launcher.exe");
  assert.equal(harness.record.actions[0].label, "Run with launcher");
  await harness.record.actions[0].onClick({
    game: "Game",
    executable: "C:\\Games\\My Game\\game.exe",
  });
  assert.deepEqual(harness.record.run, [
    ["C:\\Tools\\launcher.exe", "C:\\Games\\My Game\\game.exe"],
  ]);
});

test("close apps only closes listed programs that are running, and reopens them", async () => {
  const { manifest, plugin } = loadPlugin("close-apps-while-gaming");
  const harness = fakeApi(manifest, {
    values: { programs: "chrome.exe, notrunning; bad'name" },
    exec: (program, args) =>
      program.endsWith("powershell.exe")
        ? {
            code: 0,
            stdout: args.at(-1).includes("'chrome'") ? "C:\\Chrome\\chrome.exe\r\n" : "",
          }
        : { code: 0, stdout: "" },
  });
  plugin.start(harness.api);
  await harness.launch("Game");
  await flush();
  const commands = harness.record.exec.map(call => call.join(" "));
  assert.ok(commands.some(command => /taskkill\.exe \/IM chrome\.exe/.test(command)));
  assert.ok(
    !commands.some(command => command.includes("bad'name")),
    "unsafe names skipped"
  );
  await harness.exit("Game");
  await flush();
  assert.deepEqual(harness.record.run, [["C:\\Chrome\\chrome.exe"]]);
  delete globalThis.window.__ascendaraCloseApps;
});

test("the power plan switches while playing and goes back afterwards", async () => {
  const { manifest, plugin } = loadPlugin("gaming-power-plan");
  const harness = fakeApi(manifest, {
    exec: (_program, args) => ({
      code: 0,
      stdout:
        args[0] === "/list"
          ? "Power Scheme GUID: 381b4222-f694-41f0-9685-ff5bb260df2e  (Balanced) *\r\nPower Scheme GUID: 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c  (High performance)\r\n"
          : "Power Scheme GUID: 381b4222-f694-41f0-9685-ff5bb260df2e  (Balanced)",
    }),
  });
  plugin.start(harness.api);
  await harness.launch("Game");
  await flush();
  await harness.exit("Game");
  await flush();
  const setActive = harness.record.exec.filter(call => call[1] === "/setactive");
  assert.deepEqual(
    setActive.map(call => call[2]),
    ["8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c", "381b4222-f694-41f0-9685-ff5bb260df2e"]
  );
  delete globalThis.window.__ascendaraPowerPlan;
});

test("DXVK backs up the game's DLLs, installs, and restores them on removal", async () => {
  const { manifest, plugin } = loadPlugin("dxvk");
  const harness = fakeApi(manifest);
  plugin.start(harness.api);
  const game = { game: "Old Game", executable: "C:\\Games\\Old Game\\bin\\game.exe" };
  const install = harness.record.actions.find(action => action.label === "Install DXVK");
  assert.equal(install.when(game), true);
  await install.onClick(game);
  const [backup, copy] = harness.record.exec;
  assert.deepEqual(backup.slice(0, 6), [
    "C:\\Windows\\System32\\robocopy.exe",
    "C:\\Games\\Old Game\\bin",
    "C:\\Data\\plugin\\backups\\Old Game",
    "d3d11.dll",
    "dxgi.dll",
    "d3d10core.dll",
  ]);
  assert.equal(copy[1], "C:\\Data\\plugin\\dxvk\\dxvk-3.1.1\\x64");
  assert.equal(copy[2], "C:\\Games\\Old Game\\bin");

  const remove = harness.record.actions.find(action => action.label === "Remove DXVK");
  assert.equal(install.when(game), false);
  assert.equal(remove.when(game), true);
  await remove.onClick(game);
  assert.equal(remove.when(game), false);
  const [moveOut, moveBack] = harness.record.exec.slice(2);
  assert.ok(moveOut.includes("/MOV") && moveOut[1] === "C:\\Games\\Old Game\\bin");
  assert.ok(moveBack.includes("/MOV") && moveBack[2] === "C:\\Games\\Old Game\\bin");
});

test("Windows-only plugins do nothing on other platforms", () => {
  for (const id of ["close-apps-while-gaming", "gaming-power-plan", "dxvk"]) {
    const { manifest, plugin } = loadPlugin(id);
    const harness = fakeApi(manifest, { platform: "linux" });
    plugin.start(harness.api);
    assert.equal(harness.record.actions.length, 0, id);
  }
});
