const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

const SETTINGS = require.resolve("../electron/modules/core/settings.js");
const UPDATES = require.resolve("../electron/modules/system/updates.js");
const ENCRYPTION = require.resolve("../electron/modules/core/encryption.js");

const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));

async function withSettings(run, initialContent) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "ascendara-update-consent-"));
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
        ipcMain: {
          emit() {},
          handle() {},
        },
      };
    }
    if (request === "./machine-id") {
      return { getMachineId: () => "update-consent-test-machine" };
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
    const manager = new SettingsManager();
    await run({ manager, file });
  } finally {
    Module._load = realLoad;
    forget();
    fs.rmSync(userData, { recursive: true, force: true });
  }
}

function loadUpdates(settings, { settingsError = null, isWindows = false } = {}) {
  const timestampWrites = [];
  const notifications = [];
  const handlers = {};
  let versionRequests = 0;
  let differentialDownloads = 0;

  const fsExtra = {
    ...fs,
    remove: target => fs.promises.rm(target, { recursive: true, force: true }),
  };

  const axios = async () => {
    throw new Error("unexpected update download request");
  };
  axios.get = async url => {
    versionRequests += 1;
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
        powerSaveBlocker: {
          start: () => 1,
          stop() {},
        },
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
          getSettings() {
            if (settingsError) throw settingsError;
            return settings;
          },
        }),
      };
    }
    if (request === "../app/translations") {
      return {
        runTranslation: async () => {},
        isTranslationRunning: () => false,
      };
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

  try {
    delete require.cache[UPDATES];
    const updates = require(UPDATES);
    return {
      updates,
      timestampWrites,
      notifications,
      handlers,
      getVersionRequests: () => versionRequests,
      getDifferentialDownloads: () => differentialDownloads,
      cleanup() {
        delete require.cache[UPDATES];
      },
    };
  } finally {
    Module._load = realLoad;
  }
}

test("fresh settings do not opt in to background app updates", async () => {
  await withSettings(async ({ manager, file }) => {
    const settings = manager.getSettings();
    assert.equal(settings.autoUpdate, false);
    assert.equal(settings.autoUpdateChosen, false);
    assert.equal(manager.getSetting("autoUpdate"), false);

    const disk = readJson(file);
    assert.equal(disk.autoUpdate, false);
    assert.equal(disk.autoUpdateChosen, false);
  });
});

test("legacy default true without consent provenance fails closed", async () => {
  await withSettings(
    async ({ manager }) => {
      const settings = manager.getSettings();
      assert.equal(settings.autoUpdate, false);
      assert.equal(settings.autoUpdateChosen, false);
      assert.equal(manager.getSetting("autoUpdate"), false);
    },
    JSON.stringify({ autoUpdate: true })
  );
});

test("corrupt settings fail closed for automatic app updates", async () => {
  await withSettings(
    async ({ manager }) => {
      const settings = manager.getSettings();
      assert.equal(settings.autoUpdate, false);
      assert.equal(settings.autoUpdateChosen, false);
      assert.equal(manager.getSetting("autoUpdate"), false);
    },
    "{"
  );
});

test("an explicit auto-update choice is persisted as consent", async () => {
  await withSettings(async ({ manager, file }) => {
    assert.equal(manager.updateSetting("autoUpdate", true), true);

    const settings = manager.getSettings();
    assert.equal(settings.autoUpdate, true);
    assert.equal(settings.autoUpdateChosen, true);

    const disk = readJson(file);
    assert.equal(disk.autoUpdate, true);
    assert.equal(disk.autoUpdateChosen, true);
  });
});

test("version checks do not download for default or unknown consent states", async () => {
  for (const settings of [
    { autoUpdate: false, autoUpdateChosen: false },
    { autoUpdate: true },
    { autoUpdate: true, autoUpdateChosen: false },
  ]) {
    const harness = loadUpdates(settings);
    try {
      assert.equal(await harness.updates.checkVersionAndUpdate(), false);
      assert.equal(harness.getVersionRequests(), 1);
      assert.equal(
        harness.timestampWrites.some(write => write?.downloadingUpdate === true),
        false
      );
      assert.deepEqual(harness.notifications, ["update-available"]);
    } finally {
      harness.cleanup();
    }
  }
});

test("explicit persisted consent allows automatic background downloads", async () => {
  const harness = loadUpdates(
    { autoUpdate: true, autoUpdateChosen: true },
    { isWindows: true }
  );
  try {
    assert.equal(await harness.updates.checkVersionAndUpdate(), false);

    for (
      let attempt = 0;
      attempt < 20 && !harness.updates.getUpdateDownloaded();
      attempt++
    ) {
      await new Promise(resolve => setTimeout(resolve, 5));
    }

    assert.equal(harness.getDifferentialDownloads(), 1);
    assert.equal(harness.updates.getUpdateDownloaded(), true);
    assert.equal(
      harness.timestampWrites.some(write => write?.downloadingUpdate === true),
      true
    );
  } finally {
    harness.cleanup();
  }
});

test("settings read errors fail closed before any update download can start", async () => {
  const harness = loadUpdates(null, { settingsError: new Error("settings unreadable") });
  try {
    assert.equal(await harness.updates.checkVersionAndUpdate(), true);
    assert.equal(harness.getVersionRequests(), 0);
    assert.equal(
      harness.timestampWrites.some(write => write?.downloadingUpdate === true),
      false
    );
  } finally {
    harness.cleanup();
  }
});

test("manual update download still works when automatic updates are off", async () => {
  const harness = loadUpdates(
    { autoUpdate: false, autoUpdateChosen: true },
    { isWindows: true }
  );
  try {
    assert.equal(await harness.updates.checkVersionAndUpdate(), false);
    harness.updates.registerUpdateHandlers();
    assert.equal(typeof harness.handlers["download-update"], "function");

    await harness.handlers["download-update"]();

    assert.equal(harness.getDifferentialDownloads(), 1);
    assert.equal(harness.updates.getUpdateDownloaded(), true);
  } finally {
    harness.cleanup();
  }
});
