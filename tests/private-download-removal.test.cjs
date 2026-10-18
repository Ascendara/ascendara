const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs-extra");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const { createOperationLock } = require("../electron/modules/downloadControl");

// Exercise the real IPC handler with only Electron/process boundaries stubbed.
const source = fs.readFileSync(path.join(__dirname, "../electron/modules/downloads.js"), "utf8");
let handlerSource;
traverse(parser.parse(source), {
  CallExpression({ node }) {
    if (node.callee.type === "MemberExpression" && node.callee.object.name === "ipcMain" &&
        node.callee.property.name === "handle" && node.arguments[0]?.value === "stop-download") {
      handlerSource = source.slice(node.arguments[1].start, node.arguments[1].end);
    }
  },
});

for (const mode of ["delete", "keep", "active", "pause"]) {
  test(`private download removal: ${mode}`, async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ascendara-removal-"));
    t.after(() => fs.remove(root));
    const name = "Test Game Setup (fixture)", dir = path.join(root, name);
    const metadata = path.join(dir, `${name}.ascendara.json`);
    const file = path.join(dir, "Test Game Setup.exe");
    await fs.ensureDir(dir);
    await fs.writeFile(file, "inert fixture");
    await fs.writeJson(metadata, { game: name, privateSource: { sourceId: "fixture" },
      downloadingData: mode === "active" || mode === "pause"
        ? { downloading: true } : { pendingManualInstall: true, progressCompleted: "100" } });
    let stopped = false;
    const handler = vm.runInNewContext(`(${handlerSource})`, {
      fs, path, console: { log() {}, error() {} }, setTimeout,
      sanitizeText: value => value, sanitizeGameName: value => value,
      settingsManager: { getSettings: () => ({ downloadDirectory: root }) },
      app: { getPath: () => root }, withDownloadOperation: createOperationLock(),
      downloadProcesses: new Map(), retryDownloadProcesses: new Map(),
      stopHelpers: async () => { assert.equal(stopped, true); },
      require: module => {
        assert.equal(module, "./privateSources");
        return { stop: async () => {
          // A private transfer may still publish its final checkpoint while stopping.
          await new Promise(resolve => setTimeout(resolve, 5));
          assert.equal(await fs.pathExists(file), true);
          if (mode === "active" || mode === "pause") {
            const info = await fs.readJson(metadata);
            info.downloadingData = { downloading: false, stopped: true };
            await fs.writeJson(metadata, info);
          }
          stopped = true; return true;
        } };
      },
    });
    const deleteFiles = mode === "delete" || mode === "active";
    assert.equal(await handler(null, name, deleteFiles, mode !== "pause"), true);
    assert.equal(stopped, true);
    if (deleteFiles) assert.equal(await fs.pathExists(dir), false);
    else {
      assert.equal(await fs.readFile(file, "utf8"), "inert fixture");
      const info = await fs.readJson(metadata);
      if (mode === "pause") assert.equal(info.downloadingData.stopped, true);
      else assert.equal(info.downloadingData, undefined);
    }
  });
}
