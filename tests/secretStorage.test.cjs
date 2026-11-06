const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

const { SAFE_PREFIX } = require("../electron/modules/core/secret-store.js");

const SETTINGS = require.resolve("../electron/modules/core/settings.js");
const ENCRYPTION = require.resolve("../electron/modules/core/encryption.js");
const RECOVERY = require.resolve("../electron/modules/app/recovery.js");

const fakeSafeStorage = (overrides = {}) => ({
  decrypts: 0,
  isEncryptionAvailable: () => true,
  getSelectedStorageBackend: () => "gnome_libsecret",
  encryptString: value => Buffer.from(`sealed|${value}`),
  decryptString(buffer) {
    this.decrypts += 1;
    const text = buffer.toString();
    if (!text.startsWith("sealed|")) throw new Error("wrong keychain");
    return text.slice("sealed|".length);
  },
  ...overrides,
});
const sealedForm = value =>
  `${SAFE_PREFIX}${Buffer.from(`sealed|${value}`).toString("base64")}`;
const readDisk = file => JSON.parse(fs.readFileSync(file, "utf8"));

// The real settings, encryption and recovery modules over a fake Electron.
const withSettings = async (
  run,
  { safeStorage, ready = true, machineId = "machine-a" } = {}
) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "ascendara-secrets-"));
  const env = { ready, machineId };
  const handlers = {};
  const realLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === "electron") {
      return {
        app: {
          getPath: () => userData,
          getVersion: () => "0.0.0",
          isReady: () => env.ready,
          setLoginItemSettings() {},
        },
        safeStorage,
        ipcMain: {
          emit() {},
          handle(name, handler) {
            handlers[name] = handler;
          },
        },
      };
    }
    if (request === "./machine-id") return { getMachineId: () => env.machineId };
    return realLoad.call(this, request, ...rest);
  };
  const forgetModules = () => {
    for (const modulePath of [SETTINGS, ENCRYPTION, RECOVERY])
      delete require.cache[modulePath];
  };
  const file = path.join(userData, "ascendarasettings.json");
  const boot = () => {
    forgetModules();
    return new (require(SETTINGS).SettingsManager)();
  };
  const encryptWith = (machineIdForValue, value) => {
    const before = env.machineId;
    env.machineId = machineIdForValue;
    delete require.cache[ENCRYPTION];
    const stored = require(ENCRYPTION).encrypt(value);
    env.machineId = before;
    delete require.cache[ENCRYPTION];
    return stored;
  };
  const invoke = (name, ...args) => {
    if (!handlers[name]) require(SETTINGS).registerSettingsHandlers();
    const event = { sender: { send() {} } };
    return Promise.resolve(handlers[name](event, ...args));
  };
  try {
    await run({ boot, encryptWith, env, file, invoke, userData });
  } finally {
    Module._load = realLoad;
    forgetModules();
    fs.rmSync(userData, { recursive: true, force: true });
  }
};

test("a saved key moves to safeStorage once, and the old file stays as a backup", async () => {
  await withSettings(
    async ({ boot, encryptWith, file }) => {
      const old = encryptWith("machine-a", "rd-key");
      fs.writeFileSync(
        file,
        JSON.stringify({ realDebridApiKey: old, torboxApiKey: "plain-key" })
      );
      const manager = boot();
      assert.equal(manager.migrateSecretStorage(), true);

      const disk = readDisk(file);
      assert.equal(disk.realDebridApiKey, sealedForm("rd-key"));
      assert.equal(disk.torboxApiKey, sealedForm("plain-key"));
      assert.equal(manager.getSettings().realDebridApiKey, "rd-key");
      assert.equal(manager.getSetting("torboxApiKey"), "plain-key");
      assert.equal(readDisk(manager.preMigrationBackupPath).realDebridApiKey, old);
      assert.equal(fs.existsSync(`${file}.tmp`), false);

      assert.equal(
        boot().migrateSecretStorage(),
        false,
        "a second launch has nothing to do"
      );
    },
    { safeStorage: fakeSafeStorage() }
  );
});

test("every sensitive setting gets the stored format", async () => {
  await withSettings(
    async ({ boot, file }) => {
      const manager = boot();
      const names = [
        "torboxApiKey",
        "realDebridApiKey",
        "realDebridOauthClientId",
        "realDebridOauthClientSecret",
        "realDebridOauthRefreshToken",
        "allDebridApiKey",
        "premiumizeApiKey",
        "debridLinkApiKey",
      ];
      assert.deepEqual(manager.sensitiveKeys, names);
      for (const name of names)
        assert.equal(manager.updateSetting(name, `value-${name}`), true);
      const disk = readDisk(file);
      for (const name of names) {
        assert.equal(disk[name], sealedForm(`value-${name}`));
        assert.equal(manager.getSetting(name), `value-${name}`);
      }
    },
    { safeStorage: fakeSafeStorage() }
  );
});

test("a key with a non-ASCII character saves and reads back as it was", async () => {
  const pasted = "key with-é";
  for (const safeStorage of [fakeSafeStorage(), undefined]) {
    await withSettings(
      async ({ boot }) => {
        const manager = boot();
        assert.equal(manager.updateSetting("torboxApiKey", pasted), true);
        assert.equal(manager.getSetting("torboxApiKey"), pasted);
      },
      { safeStorage }
    );
  }
});

test("a code sign-in saved in one bulk save is sealed, and clearing it leaves nothing", async () => {
  await withSettings(
    async ({ boot, file, invoke }) => {
      boot();
      const login = {
        realDebridApiKey: "access",
        realDebridOauthClientId: "client",
        realDebridOauthClientSecret: "secret",
        realDebridOauthRefreshToken: "refresh",
      };
      assert.equal(await invoke("save-settings", login), true);
      const disk = readDisk(file);
      for (const [name, value] of Object.entries(login)) {
        assert.equal(disk[name], sealedForm(value));
      }
      assert.equal(boot().getSetting("realDebridOauthRefreshToken"), "refresh");

      await invoke("save-settings", {
        realDebridApiKey: "pasted",
        realDebridOauthClientId: "",
        realDebridOauthClientSecret: "",
        realDebridOauthRefreshToken: "",
      });
      const cleared = readDisk(file);
      assert.equal(cleared.realDebridApiKey, sealedForm("pasted"));
      assert.equal(cleared.realDebridOauthRefreshToken, "");
      assert.equal(cleared.realDebridOauthClientSecret, "");
    },
    { safeStorage: fakeSafeStorage() }
  );
});

test("without safeStorage plain values get the machine-key format", async () => {
  for (const safeStorage of [
    undefined,
    fakeSafeStorage({ isEncryptionAvailable: () => false }),
    fakeSafeStorage({ getSelectedStorageBackend: () => "basic_text" }),
  ]) {
    await withSettings(
      async ({ boot, file }) => {
        fs.writeFileSync(file, JSON.stringify({ torboxApiKey: "plain-key" }));
        const manager = boot();
        assert.equal(manager.migrateSecretStorage(), true);
        assert.match(readDisk(file).torboxApiKey, /^[0-9a-f]{32}:[0-9a-f]+$/);
        assert.equal(manager.getSetting("torboxApiKey"), "plain-key");
      },
      { safeStorage }
    );
  }
});

test("a value that can not be decrypted reads as empty, never as ciphertext", async () => {
  await withSettings(
    async ({ boot, encryptWith, file }) => {
      const stored = encryptWith("another-machine", "rd-key");
      fs.writeFileSync(file, JSON.stringify({ realDebridApiKey: stored }));
      const manager = boot();
      assert.equal(manager.getSetting("realDebridApiKey"), "");
      assert.equal(manager.getSettings().realDebridApiKey, "");
      assert.equal(manager.migrateSecretStorage(), false);
      assert.equal(
        readDisk(file).realDebridApiKey,
        stored,
        "stays on disk for a later launch"
      );
    },
    { safeStorage: fakeSafeStorage() }
  );
});

test("a sealed value reads as empty when the keychain refuses it or the app is not ready", async () => {
  await withSettings(
    async ({ boot, env, file }) => {
      const stored = `${SAFE_PREFIX}${Buffer.from("garbage").toString("base64")}`;
      fs.writeFileSync(
        file,
        JSON.stringify({ realDebridApiKey: stored, torboxApiKey: sealedForm("tb-key") })
      );
      env.ready = false;
      const early = boot();
      assert.equal(early.getSetting("torboxApiKey"), "");
      assert.equal(early.migrateSecretStorage(), false);
      assert.equal(readDisk(file).torboxApiKey, sealedForm("tb-key"));

      env.ready = true;
      const manager = boot();
      assert.equal(manager.getSetting("realDebridApiKey"), "");
      assert.equal(manager.getSetting("torboxApiKey"), "tb-key");
    },
    { safeStorage: fakeSafeStorage() }
  );
});

test("a bulk save keeps a key it could not read, an explicit removal clears it", async () => {
  await withSettings(
    async ({ boot, encryptWith, file, invoke }) => {
      const stored = encryptWith("another-machine", "rd-key");
      fs.writeFileSync(file, JSON.stringify({ realDebridApiKey: stored }));
      const manager = boot();
      await invoke("save-settings", { ...manager.getSettings(), theme: "blue" });
      assert.equal(readDisk(file).realDebridApiKey, stored);
      assert.equal(readDisk(file).theme, "blue");

      assert.equal(await invoke("update-setting", "realDebridApiKey", ""), true);
      assert.equal(readDisk(file).realDebridApiKey, "");
    },
    { safeStorage: fakeSafeStorage() }
  );
});

test("a bulk save does not rewrite a key that did not change, and protects one holding a colon", async () => {
  await withSettings(
    async ({ boot, file, invoke }) => {
      const manager = boot();
      manager.updateSetting("torboxApiKey", "tb-key");
      const before = readDisk(file).torboxApiKey;
      await invoke("save-settings", { ...manager.getSettings(), theme: "blue" });
      assert.equal(readDisk(file).torboxApiKey, before);

      await invoke("save-settings", {
        ...manager.getSettings(),
        realDebridApiKey: "a:b",
      });
      assert.equal(readDisk(file).realDebridApiKey, sealedForm("a:b"));
      assert.equal(boot().getSetting("realDebridApiKey"), "a:b");
    },
    { safeStorage: fakeSafeStorage() }
  );
});

test("a value that can not be protected is refused and never written plain", async () => {
  await withSettings(
    async ({ boot, file }) => {
      const manager = boot();
      assert.equal(manager.updateSetting("realDebridApiKey", "rd-key"), false);
      assert.equal(
        manager.saveSettings({ realDebridApiKey: "rd-key", theme: "blue" }),
        false
      );
      const disk = fs.readFileSync(file, "utf8");
      assert.equal(disk.includes("rd-key"), false);
      assert.equal(readDisk(file).theme, "blue", "other settings still save");
    },
    {
      safeStorage: fakeSafeStorage({
        encryptString: () => {
          throw new Error("keychain locked");
        },
      }),
    }
  );
});

test(
  "saved files are private to the user",
  { skip: process.platform === "win32" },
  async () => {
    const mode = file => fs.statSync(file).mode & 0o777;
    await withSettings(
      async ({ boot, file, userData }) => {
        const point = path.join(userData, "recovery-points", "settings-1.json");
        fs.mkdirSync(path.dirname(point));
        fs.writeFileSync(point, "{}", { mode: 0o644 });
        fs.writeFileSync(file, JSON.stringify({ torboxApiKey: "plain-key" }), {
          mode: 0o644,
        });
        fs.chmodSync(point, 0o644);
        fs.chmodSync(file, 0o644);

        const manager = boot();
        manager.migrateSecretStorage();
        assert.equal(mode(file), 0o600);
        assert.equal(mode(manager.preMigrationBackupPath), 0o600);
        assert.equal(mode(point), 0o600, "points made by an earlier version too");
        manager.updateSetting("theme", "blue");
        assert.equal(mode(file), 0o600);

        const { createRecoveryPoint } = require(RECOVERY);
        const created = await createRecoveryPoint("test", "0.0.0");
        assert.equal(mode(path.join(path.dirname(point), `${created.id}.json`)), 0o600);
      },
      { safeStorage: fakeSafeStorage() }
    );
  }
);

test("a removed key is gone from the backup and memory, and no recovery point holds one", async () => {
  const safeStorage = fakeSafeStorage();
  await withSettings(
    async ({ boot, encryptWith, file, invoke, userData }) => {
      fs.writeFileSync(
        file,
        JSON.stringify({
          realDebridApiKey: encryptWith("machine-a", "rd-key"),
          torboxApiKey: encryptWith("machine-a", "tb-key"),
        })
      );
      const manager = boot();
      manager.migrateSecretStorage();
      await invoke("get-settings");

      manager.updateSetting("theme", "blue");
      const { createRecoveryPoint, restoreRecoveryPoint } = require(RECOVERY);
      const { id } = await createRecoveryPoint("test", "0.0.0");
      const pointFile = path.join(userData, "recovery-points", `${id}.json`);
      const saved = readDisk(pointFile).settings;
      assert.equal(saved.theme, "blue");
      for (const key of manager.sensitiveKeys) assert.equal(key in saved, false);
      // A point made by an older version still holds its keys.
      const older = path.join(userData, "recovery-points", "settings-1000000000000.json");
      fs.writeFileSync(
        older,
        JSON.stringify({ settings: { ...readDisk(file), theme: "red" } })
      );

      const decryptsBefore = safeStorage.decrypts;
      assert.equal(manager.getSetting("torboxApiKey"), "tb-key");
      assert.equal(
        safeStorage.decrypts,
        decryptsBefore,
        "reads come from the opened copy"
      );

      assert.equal(manager.updateSetting("realDebridApiKey", ""), true);

      assert.equal(fs.existsSync(manager.preMigrationBackupPath), false);

      assert.equal(manager.getSetting("torboxApiKey"), "tb-key");
      assert.equal(
        safeStorage.decrypts,
        decryptsBefore + 1,
        "the opened copies were dropped"
      );

      for (const point of [id, "settings-1000000000000"]) {
        await restoreRecoveryPoint(point);
        assert.equal(
          readDisk(file).realDebridApiKey,
          "",
          "a restore does not bring it back"
        );
        assert.equal(readDisk(file).torboxApiKey, sealedForm("tb-key"), "nor drops one");
      }
      assert.equal(readDisk(file).theme, "red");
    },
    { safeStorage }
  );
});

test("the backup goes after 7 days, never while a saved secret can not be read", async () => {
  await withSettings(
    async ({ boot, encryptWith, file }) => {
      fs.writeFileSync(
        file,
        JSON.stringify({ torboxApiKey: encryptWith("machine-a", "tb-key") })
      );
      const manager = boot();
      manager.migrateSecretStorage();
      const later = Date.now() + 8 * 24 * 60 * 60 * 1000;
      assert.equal(manager.retirePreMigrationBackup(), false, "too young");
      assert.equal(fs.existsSync(manager.preMigrationBackupPath), true);

      const disk = readDisk(file);
      fs.writeFileSync(
        file,
        JSON.stringify({ ...disk, realDebridApiKey: `${SAFE_PREFIX}AAAA` })
      );
      assert.equal(
        manager.retirePreMigrationBackup({ now: later }),
        false,
        "may be the way back"
      );
      assert.equal(fs.existsSync(manager.preMigrationBackupPath), true);

      fs.writeFileSync(file, JSON.stringify(disk));
      assert.equal(manager.retirePreMigrationBackup({ now: later }), true);
      assert.equal(fs.existsSync(manager.preMigrationBackupPath), false);
    },
    { safeStorage: fakeSafeStorage() }
  );
});

test("logins from removed features stay out of recovery points", async () => {
  await withSettings(
    async ({ boot, encryptWith, file, userData }) => {
      fs.writeFileSync(
        file,
        JSON.stringify({
          theme: "blue",
          twitchClientId: encryptWith("machine-a", "old-client-id"),
          twitchSecret: encryptWith("machine-a", "old-secret"),
        })
      );
      const manager = boot();
      const { createRecoveryPoint, restoreRecoveryPoint } = require(RECOVERY);
      const { id } = await createRecoveryPoint("test", "0.0.0");
      const saved = readDisk(
        path.join(userData, "recovery-points", `${id}.json`)
      ).settings;
      assert.equal(saved.theme, "blue");
      assert.equal("twitchClientId" in saved, false);
      assert.equal("twitchSecret" in saved, false);

      // A point made by an older version still holds them.
      const older = path.join(userData, "recovery-points", "settings-1000000000000.json");
      fs.writeFileSync(
        older,
        JSON.stringify({ settings: { theme: "red", twitchSecret: "plain-old-secret" } })
      );
      fs.writeFileSync(file, JSON.stringify({ theme: "blue" }));
      manager.settings = manager.loadSettings();
      await restoreRecoveryPoint("settings-1000000000000");
      assert.equal(readDisk(file).theme, "red");
      assert.equal(
        "twitchSecret" in readDisk(file),
        false,
        "a restore does not bring it back"
      );
    },
    { safeStorage: fakeSafeStorage() }
  );
});
