const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

const SETTINGS = require.resolve("../electron/modules/core/settings.js");
const UPDATES = require.resolve("../electron/modules/system/updates.js");
const ENCRYPTION = require.resolve("../electron/modules/core/encryption.js");

async function withSettings(run, initialContent) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "ascendara-update-settings-"));
  const file = path.join(userData, "ascendarasettings.json");
  if (initialContent !== undefined) fs.writeFileSync(file, initialContent);

  const realLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === "fs-extra") return fs;
    if (request === "electron") {
      return {
        app: {
          getPath: () => userData,
          isReady: () => true,
          setLoginItemSettings() {},
        },
        safeStorage: {
          isEncryptionAvailable: () => false,
          getSelectedStorageBackend: () => "basic_text",
        },
        ipcMain: { emit() {}, handle() {} },
      };
    }
    if (request === "./machine-id") {
      return { getMachineId: () => "update-settings-test-machine" };
    }
    return realLoad.call(this, request, ...rest);
  };

  const forget = () => {
    delete require.cache[SETTINGS];
    delete require.cache[ENCRYPTION];
  };

  try {
    forget();
    const { SettingsManager } = require(SETTINGS);
    await run({ manager: new SettingsManager(), file });
  } finally {
    Module._load = realLoad;
    forget();
    fs.rmSync(userData, { recursive: true, force: true });
  }
}

function loadUpdates(settings, { loadError = false, isWindows = false } = {}) {
  const timestampWrites = [];
  const notifications = [];
  const handlers = {};
  let differentialDownloads = 0;

  const fsExtra = {
    ...fs,
    remove: target => fs.promises.rm(target, { recursive: true, force: true }),
  };

  const axios = async () => {
    throw new Error("unexpected update download request");
  };
  axios.get = async url => {
    assert.equal(url, "https://updates.test/");
    return { data: { appVer: "2.0.0" } };
  };

  const installUpdate = async () => {};
  installUpdate.cleanupStaleUpdates = async () => {};

  const realLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === "fs-extra") return fsExtra;
    if (request === "axios") return axios;
    if (request === "electron") {
      return {
        ipcMain: {
          handle(name, handler) {
            handlers[name] = handler;
          },
        },
        BrowserWindow: {
          getAllWindows: () => [
            {
              webContents: {
                send(channel) {
                  notifications.push(channel);
                },
              },
            },
          ],
        },
        app: { getPath: () => os.tmpdir() },
        powerSaveBlocker: { start: () => 1, stop() {} },
        shell: { openExternal: async () => {} },
      };
    }
    if (request === "../core/config") {
      return {
        API_URL: "https://updates.test",
        appVersion: "1.0.0",
        appBranch: "live",
        testingVersion: "",
        isDev: false,
        isWindows,
        isPortable: false,
        isLinux: !isWindows,
        TIMESTAMP_FILE: "",
        TESTING_BRANCH_FILE: "",
        testingReleaseTag: branch => branch,
        LANG_DIR: "",
        appDirectory: "",
      };
    }
    if (request === "../core/utils") {
      return { updateTimestampFile: value => timestampWrites.push(value) };
    }
    if (request === "../core/settings") {
      return {
        getSettingsManager: () => ({
          getSettings: () => settings,
          hasSettingsLoadError: () => loadError,
        }),
      };
    }
    if (request === "../app/translations") {
      return { runTranslation: async () => {}, isTranslationRunning: () => false };
    }
    if (request === "./install-update") return installUpdate;
    if (request === "./differential-update") {
      return {
        downloadDifferentialUpdate: async () => {
          differentialDownloads += 1;
        },
      };
    }
    if (request === "./mac-updates") {
      return {
        resolveMacUpdate: async () => null,
        downloadMacDelta: async () => false,
        cacheMacBuild: async () => {},
        pruneMacCache: async () => {},
        sha256File: async () => "",
      };
    }
    return realLoad.call(this, request, ...rest);
  };

  // updates.js reads process.platform at load for its macOS path, so match the
  // mocked config instead of the machine running the tests
  const realPlatform = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { value: isWindows ? "win32" : "linux" });

  try {
    delete require.cache[UPDATES];
    const updates = require(UPDATES);
    return {
      updates,
      timestampWrites,
      notifications,
      handlers,
      getDifferentialDownloads: () => differentialDownloads,
      cleanup() {
        delete require.cache[UPDATES];
      },
    };
  } finally {
    Module._load = realLoad;
    Object.defineProperty(process, "platform", realPlatform);
  }
}

async function waitForDownload(harness) {
  for (let attempt = 0; attempt < 20 && !harness.updates.getUpdateDownloaded(); attempt++) {
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

test("fresh settings preserve Ascendara's default-on automatic update policy", async () => {
  await withSettings(async ({ manager }) => {
    const settings = manager.getSettings();
    assert.equal(settings.autoUpdate, true);
    assert.equal("autoUpdateChosen" in settings, false);
    assert.equal(manager.hasSettingsLoadError(), false);
  });
});

test("an explicit automatic-update opt-out remains authoritative", async () => {
  await withSettings(async ({ manager }) => {
    assert.equal(manager.updateSetting("autoUpdate", false), true);
    assert.equal(manager.getSettings().autoUpdate, false);
    assert.equal(manager.getSetting("autoUpdate"), false);
    assert.equal("autoUpdateChosen" in manager.getSettings(), false);
  });
});

test("corrupt settings are distinguishable from valid default settings", async () => {
  await withSettings(
    async ({ manager }) => {
      assert.equal(manager.getSettings().autoUpdate, true);
      assert.equal(manager.hasSettingsLoadError(), true);
    },
    "{"
  );
});

test("readable default-on settings start the background update", async () => {
  const harness = loadUpdates({ autoUpdate: true }, { isWindows: true });
  try {
    assert.equal(await harness.updates.checkVersionAndUpdate(), false);
    await waitForDownload(harness);
    assert.equal(harness.getDifferentialDownloads(), 1);
    assert.equal(harness.updates.getUpdateDownloaded(), true);
    assert.deepEqual(harness.notifications, ["update-ready"]);
  } finally {
    harness.cleanup();
  }
});

test("an explicit opt-out notifies without downloading", async () => {
  const harness = loadUpdates({ autoUpdate: false }, { isWindows: true });
  try {
    assert.equal(await harness.updates.checkVersionAndUpdate(), false);
    assert.equal(harness.getDifferentialDownloads(), 0);
    assert.deepEqual(harness.notifications, ["update-available"]);
  } finally {
    harness.cleanup();
  }
});

test("unreadable settings fail closed for background transfer but still report the update", async () => {
  const harness = loadUpdates({ autoUpdate: true }, { loadError: true, isWindows: true });
  try {
    assert.equal(await harness.updates.checkVersionAndUpdate(), false);
    assert.equal(harness.getDifferentialDownloads(), 0);
    assert.deepEqual(harness.notifications, ["update-available"]);
  } finally {
    harness.cleanup();
  }
});

test("manual update download still works after opting out", async () => {
  const harness = loadUpdates({ autoUpdate: false }, { isWindows: true });
  try {
    assert.equal(await harness.updates.checkVersionAndUpdate(), false);
    harness.updates.registerUpdateHandlers();
    await harness.handlers["download-update"]();
    await waitForDownload(harness);
    assert.equal(harness.getDifferentialDownloads(), 1);
    assert.equal(harness.updates.getUpdateDownloaded(), true);
  } finally {
    harness.cleanup();
  }
});
