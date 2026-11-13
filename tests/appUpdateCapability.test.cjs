const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  getAutomaticUpdateCapability,
} = require("../electron/modules/system/update-capability");

test("automatic update preference is available on supported installed builds", () => {
  assert.deepEqual(
    getAutomaticUpdateCapability({
      platform: "win32",
      execPath: "C:\\Program Files\\Ascendara\\Ascendara.exe",
    }),
    { supported: true, reason: null }
  );

  assert.deepEqual(
    getAutomaticUpdateCapability({
      platform: "darwin",
      execPath: "/Applications/Ascendara.app/Contents/MacOS/Ascendara",
    }),
    { supported: true, reason: null }
  );

  assert.deepEqual(
    getAutomaticUpdateCapability({
      platform: "linux",
      isAppImage: true,
      execPath: "/tmp/.mount_Ascendara/Ascendara",
    }),
    { supported: true, reason: null }
  );
});

test("automatic update preference is disabled for portable and unsupported builds", () => {
  assert.deepEqual(
    getAutomaticUpdateCapability({
      platform: "win32",
      isPortable: true,
      execPath: "D:\\Ascendara Portable\\Ascendara.exe",
    }),
    { supported: false, reason: "portable" }
  );

  assert.deepEqual(
    getAutomaticUpdateCapability({
      platform: "linux",
      isAppImage: false,
      execPath: "/usr/bin/ascendara",
    }),
    { supported: false, reason: "linux-not-appimage" }
  );

  assert.deepEqual(
    getAutomaticUpdateCapability({
      platform: "darwin",
      execPath: "/usr/local/bin/ascendara",
    }),
    { supported: false, reason: "mac-not-installed-app" }
  );

  assert.deepEqual(
    getAutomaticUpdateCapability({
      platform: "freebsd",
      execPath: "/usr/local/bin/ascendara",
    }),
    { supported: false, reason: "unsupported-platform" }
  );

  assert.deepEqual(
    getAutomaticUpdateCapability({
      platform: "linux",
      isDev: true,
      isAppImage: true,
      execPath: "/tmp/.mount_Ascendara/Ascendara",
    }),
    { supported: false, reason: "development" }
  );
});

test("Settings exposes the update row through capability instead of a Windows gate", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../src/pages/Settings.jsx"),
    "utf8"
  );
  const rowStart = source.indexOf('id="auto-update"');
  const rowEnd = source.indexOf('id="notifications"', rowStart);
  const row = source.slice(rowStart, rowEnd);

  assert.notEqual(rowStart, -1);
  assert.notEqual(rowEnd, -1);
  assert.match(source, /getAutomaticUpdateCapability\(\)/);
  assert.doesNotMatch(row, /getPlatform\(\).*win32/);
  assert.match(row, /disabled=\{!automaticUpdateCapability\?\.supported\}/);
});

test("renderer honors the main-process manual-update signal before checking version", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/app.jsx"), "utf8");
  const effectStart = source.indexOf("// Version check effect");
  const effectEnd = source.indexOf("if (isAdmin)", effectStart);
  const effect = source.slice(effectStart, effectEnd);

  const listenerIndex = effect.indexOf("window.electron.onUpdateAvailable?.");
  const checkIndex = effect.indexOf("checkVersionAndSetupUpdates();");

  assert.notEqual(listenerIndex, -1, "renderer must subscribe to update-available");
  assert.notEqual(checkIndex, -1, "version check invocation is missing");
  assert.ok(
    listenerIndex < checkIndex,
    "update-available listener must be installed before the main-process version check"
  );

  assert.match(
    effect,
    /const showUpdateAvailableNotification = async \(\) => \{[\s\S]*hasShownUpdateNotification\.current[\s\S]*await window\.electron\.getBranch\(\)[\s\S]*hasShownUpdateNotification\.current[\s\S]*toast\(/,
    "manual-update event and renderer fallback must share one deduplicated toast path"
  );
  assert.match(
    effect,
    /onUpdateAvailable\?\.\(\(\) => \{\s*void showUpdateAvailableNotification\(\);\s*\}\)/
  );
  assert.match(effect, /unsubscribeUpdateAvailable\?\.\(\)/);
});
