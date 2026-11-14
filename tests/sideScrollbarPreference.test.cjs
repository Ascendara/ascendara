const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadModule } = require("./helpers/loadModule.cjs");

const read = relative => fs.readFileSync(path.join(__dirname, "..", relative), "utf8");

test("side scrollbar runtime class follows the persisted setting value", async () => {
  const { SIDE_SCROLLBAR_CLASS, applySideScrollbarPreference } = await loadModule(
    "src/lib/sideScrollbarPreference.js"
  );

  const classes = new Set();
  const rootElement = {
    classList: {
      toggle(className, enabled) {
        if (enabled) classes.add(className);
        else classes.delete(className);
      },
    },
  };

  applySideScrollbarPreference(rootElement, true);
  assert.equal(classes.has(SIDE_SCROLLBAR_CLASS), true);

  applySideScrollbarPreference(rootElement, false);
  assert.equal(classes.has(SIDE_SCROLLBAR_CLASS), false);
});

test("legacy side scrollbar storage migrates once into authoritative settings", async () => {
  const { migrateLegacySideScrollbarPreference } = await loadModule(
    "src/lib/sideScrollbarPreference.js",
    { fresh: true }
  );
  const values = new Map([["sideScrollBar", "true"]]);
  const storage = {
    getItem: key => values.get(key) ?? null,
    removeItem: key => values.delete(key),
  };
  const persisted = [];

  const result = await migrateLegacySideScrollbarPreference(storage, async value => {
    persisted.push(value);
    return true;
  });

  assert.deepEqual(result, { value: true, persisted: true });
  assert.deepEqual(persisted, [true]);
  assert.equal(values.has("sideScrollBar"), false);
});

test("failed legacy migration preserves the old value for a later retry", async () => {
  const { migrateLegacySideScrollbarPreference } = await loadModule(
    "src/lib/sideScrollbarPreference.js",
    { fresh: true }
  );
  const values = new Map([["sideScrollBar", "false"]]);
  const storage = {
    getItem: key => values.get(key) ?? null,
    removeItem: key => values.delete(key),
  };

  const result = await migrateLegacySideScrollbarPreference(storage, async () => false);

  assert.deepEqual(result, { value: false, persisted: false });
  assert.equal(values.get("sideScrollBar"), "false");
});

test("side scrollbar has one SettingsContext/Electron authority after legacy migration", () => {
  const settingsPage = read("src/pages/Settings.jsx");
  const settingsContext = read("src/context/SettingsContext.jsx");
  const transferService = read("src/services/library/libraryTransferService.js");
  const app = read("src/app.jsx");

  assert.match(settingsPage, /window\.electron\.updateSetting\(key, value\)/);
  assert.match(
    settingsPage,
    /if \(key === "sideScrollBar"\)[\s\S]*clearLegacySideScrollbarPreference\(window\.localStorage\)/
  );
  assert.doesNotMatch(settingsPage, /document\.documentElement\.classList/);

  assert.match(
    settingsContext,
    /applySideScrollbarPreference\(document\.documentElement, settings\.sideScrollBar\)/
  );
  assert.match(settingsContext, /\[settings\.sideScrollBar\]/);
  assert.match(settingsContext, /migrateLegacySideScrollbarPreference/);
  assert.match(settingsContext, /migration\?\.persisted/);

  const appearanceCategory = transferService.slice(
    transferService.indexOf('id: "appearance"'),
    transferService.indexOf('id: "profile"')
  );
  assert.doesNotMatch(appearanceCategory, /"sideScrollBar"/);

  assert.doesNotMatch(app, /localStorage\.getItem\("sideScrollBar"\)/);
  assert.doesNotMatch(app, /custom-scrollbar/);
});
