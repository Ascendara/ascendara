const { test } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const os = require("node:os");

const SYSTEM = require.resolve("../electron/modules/system/system.js");

// The real system module over a fake Electron, returning its IPC handlers
const loadHandlers = () => {
  const handlers = {};
  const realLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === "electron") {
      return {
        app: { getPath: () => os.tmpdir(), isPackaged: true },
        BrowserWindow: { getAllWindows: () => [] },
        ipcMain: {
          handle(name, handler) {
            handlers[name] = handler;
          },
        },
      };
    }
    if (request === "../core/settings") {
      return { getSettingsManager: () => ({ getSettings: () => ({}) }) };
    }
    if (request === "../core/config") {
      return {
        isDev: false,
        isWindows: false,
        isLinux: false,
        TIMESTAMP_FILE: "",
        DEPENDENCY_REGISTRY_PATHS: {},
      };
    }
    return realLoad.call(this, request, ...rest);
  };
  try {
    delete require.cache[SYSTEM];
    require(SYSTEM).registerSystemHandlers();
  } finally {
    Module._load = realLoad;
    delete require.cache[SYSTEM];
  }
  return handlers;
};

test("every page shares one system specs read per run", async t => {
  const handlers = loadHandlers();
  const realCpus = os.cpus;
  let reads = 0;
  os.cpus = () => {
    reads += 1;
    return [{ model: "Test CPU" }];
  };
  t.after(() => {
    os.cpus = realCpus;
  });

  const fetchSpecs = handlers["fetch-system-specs"];
  // The requirements card and Compare can ask at the same moment
  const [first, second] = await Promise.all([fetchSpecs(), fetchSpecs()]);
  // Another page asks later in the same run
  const later = await fetchSpecs();

  assert.equal(reads, 1);
  assert.equal(first.cpu, "Test CPU");
  assert.equal(second, first);
  assert.equal(later, first);
});
