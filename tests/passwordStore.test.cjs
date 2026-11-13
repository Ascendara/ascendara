const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  pinPasswordStore,
  rememberPasswordStore,
  readPinnedStore,
} = require("../electron/modules/core/password-store.js");

const fakeApp = (userData, switches = {}) => ({
  getPath: () => userData,
  commandLine: {
    hasSwitch: name => name in switches,
    appendSwitch: (name, value) => {
      switches[name] = value;
    },
  },
  switches,
});
const fakeSafeStorage = backend => ({
  isEncryptionAvailable: () => true,
  getSelectedStorageBackend: () => backend,
});
const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "password-store-"));

test("a session without a keyring asks for the one that sealed the secrets", () => {
  const dir = tempDir();
  rememberPasswordStore({
    app: fakeApp(dir),
    safeStorage: fakeSafeStorage("kwallet5"),
    platform: "linux",
  });
  const app = fakeApp(dir);
  assert.equal(pinPasswordStore({ app, platform: "linux" }), "kwallet5");
  assert.equal(app.switches["password-store"], "kwallet5");
});

test("falling back to basic_text keeps the remembered keyring", () => {
  const dir = tempDir();
  rememberPasswordStore({
    app: fakeApp(dir),
    safeStorage: fakeSafeStorage("gnome_libsecret"),
    platform: "linux",
  });
  rememberPasswordStore({
    app: fakeApp(dir),
    safeStorage: fakeSafeStorage("basic_text"),
    platform: "linux",
  });
  assert.equal(readPinnedStore(dir), "gnome-libsecret");
});

test("a keyring given on the command line wins", () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "password-store.json"), JSON.stringify({ store: "kwallet6" }));
  const app = fakeApp(dir, { "password-store": "basic" });
  assert.equal(pinPasswordStore({ app, platform: "linux" }), null);
  assert.equal(app.switches["password-store"], "basic");
});

test("nothing changes outside Linux or with an unknown value", () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "password-store.json"), JSON.stringify({ store: "nope" }));
  assert.equal(pinPasswordStore({ app: fakeApp(dir), platform: "linux" }), null);
  assert.equal(
    rememberPasswordStore({
      app: fakeApp(dir),
      safeStorage: fakeSafeStorage("kwallet5"),
      platform: "win32",
    }),
    null
  );
  assert.equal(readPinnedStore(dir), null);
});
