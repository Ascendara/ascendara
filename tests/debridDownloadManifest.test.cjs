const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");
const { validateFileList } = require("../electron/modules/downloads/downloadManifest");

test("cloud file lists reject traversal, duplicate paths and metadata collisions", () => {
  const list = files => ({ transferId: "realdebrid:torrent:ready", files });
  const file = filename => ({ filename, url: "https://cdn.example/file", size: 10 });
  for (const name of [
    "../setup.exe",
    "/setup.exe",
    "C:/setup.exe",
    "data:stream",
    "CON.exe",
    ".ascendara-receipts/data",
    "Example.ascendara.json",
  ])
    assert.throws(() => validateFileList(list([file(name)])), /filename/);
  assert.throws(
    () => validateFileList(list([file("Data.bin"), file("data.bin")])),
    /conflicting/
  );
  assert.throws(
    () => validateFileList(list([{ ...file("setup.exe"), url: "file:///secret" }])),
    /URL/
  );
});

// Loads downloads.js in a fresh context, as after an app start.
function loadDownloadHandlers(root, settings, spawns) {
  const handlers = new Map();
  const control = require("../electron/modules/downloads/downloadControl");
  const mocked = {
    electron: {
      ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
      app: { getPath: () => root },
    },
    child_process: {
      spawn: (command, args) => {
        spawns.push({ command, args });
        const child = new EventEmitter();
        child.pid = 12345;
        child.unref = () => {};
        process.nextTick(() => child.emit("spawn"));
        return child;
      },
    },
    "../core/config": {
      isDev: true,
      isWindows: true,
      TIMESTAMP_FILE: path.join(root, "timestamp.json"),
      getHelperPath: () => "unused.exe",
      getPythonPath: () => "python",
    },
    "../core/settings": { getSettingsManager: () => ({ getSettings: () => settings }) },
    "../core/log-safe": { linkForLog: link => link },
    "../core/utils": {
      sanitizeText: x => x,
      sanitizeGameName: x => x,
      updateTimestampFile: async () => {},
    },
    "../library/steamgrid": { fetchGameAssets: async () => {} },
    "../app/analytics": {
      sendAnalyticsEvent() {},
      trackDownloadOutcome() {},
      linkProvider: () => "direct",
    },
    "./downloadControl": control,
    "./downloadLiveness": { startDownloadWatchdog() {} },
    "./dllRepair": {},
    "./downloaderRuntime": {},
    "./gameUpdateBackup": {},
    "./downloadManifest": { validateFileList },
  };
  const context = {
    require: name => mocked[name] || require(name),
    module: { exports: {} },
    process,
    console: { log() {}, error() {} },
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, "../electron/modules/downloads/downloads.js"),
      "utf8"
    ),
    context
  );
  context.module.exports.registerDownloadHandlers();
  return handlers;
}

const payload = {
  transferId: "realdebrid:torrent:ready",
  files: [
    { filename: "setup.exe", url: "https://cdn.example/setup", size: 10 },
    { filename: "data.bin", url: "https://cdn.example/data", size: 20 },
  ],
};
const args = [
  { sender: { send() {} } },
  payload,
  "Example",
  false,
  false,
  false,
  false,
  "1",
  undefined,
  "30 B",
  0,
  "",
  true,
];

test("download IPC launches a grouped torrent using edited helper source and prevents duplicate starts", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ascendara-handoff-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const settings = { downloadDirectory: path.join(root, "games") };
  fs.mkdirSync(settings.downloadDirectory);
  const spawns = [];
  const start = loadDownloadHandlers(root, settings, spawns).get("download-file");
  assert.equal((await start(...args)).success, true);
  assert.equal(spawns.length, 1);
  assert.equal(spawns[0].command, "python");
  assert.ok(spawns[0].args.includes("--file-list"));
  const manifest = JSON.parse(fs.readFileSync(spawns[0].args[1], "utf8"));
  assert.deepEqual(manifest.files, payload.files);
  assert.equal((await start(...args)).alreadyStarted, true);
  assert.equal(spawns.length, 1);
  const cached = JSON.parse(
    fs.readFileSync(path.join(root, "downloadCache/Example.json"), "utf8")
  );
  assert.equal(cached.fileList, true, "resume must retain the grouped transfer mode");
  assert.equal(cached.transferId, payload.transferId);
  await assert.rejects(
    start(
      args[0],
      { ...payload, transferId: "realdebrid:torrent:other" },
      ...args.slice(2)
    ),
    /folder already exists/
  );
});

test("a leftover of the same torrent with nothing running starts downloading again", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ascendara-handoff-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const settings = { downloadDirectory: path.join(root, "games") };
  fs.mkdirSync(settings.downloadDirectory);
  const spawns = [];
  const startFresh = () =>
    loadDownloadHandlers(root, settings, spawns).get("download-file");
  assert.equal((await startFresh()(...args)).success, true);
  // The earlier attempt was stopped and the app restarted: folder and game file stay.
  const gameFile = path.join(
    settings.downloadDirectory,
    "Example/Example.ascendara.json"
  );
  fs.writeFileSync(gameFile, JSON.stringify({ game: "Example" }));
  const again = await startFresh()(...args);
  assert.equal(again.success, true);
  assert.equal(again.alreadyStarted, undefined, "nothing was running");
  assert.equal(spawns.length, 2, "the download really starts again");
  // A tracked download (running or stopped where Downloads can resume it) is left alone.
  fs.writeFileSync(
    gameFile,
    JSON.stringify({ game: "Example", downloadingData: { stopped: true } })
  );
  assert.equal((await startFresh()(...args)).alreadyStarted, true);
  assert.equal(spawns.length, 2);
  await assert.rejects(
    startFresh()(
      args[0],
      { ...payload, transferId: "realdebrid:torrent:other" },
      ...args.slice(2)
    ),
    /folder already exists/
  );
});
