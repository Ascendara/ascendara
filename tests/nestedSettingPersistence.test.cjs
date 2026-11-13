const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { mergeNestedSettingValue } = require("../electron/modules/core/nested-setting");

const read = relative => fs.readFileSync(path.join(__dirname, "..", relative), "utf8");

test("sequential Wine and Proton field merges preserve sibling values", () => {
  const wineDefaults = {
    wineBin: "wine",
    winePrefix: "",
  };
  let wine = {
    wineBin: "wine",
    winePrefix: "/prefix/original",
  };

  wine = mergeNestedSettingValue(wineDefaults, wine, "wineBin", "wine-staging");
  wine = mergeNestedSettingValue(wineDefaults, wine, "winePrefix", "/prefix/new");

  assert.deepEqual(wine, {
    wineBin: "wine-staging",
    winePrefix: "/prefix/new",
  });

  const protonDefaults = {
    enabled: false,
    protonBin: "",
    steamCompatDataPath: "",
  };
  let proton = {
    enabled: false,
    protonBin: "/proton/original",
    steamCompatDataPath: "/compat/original",
  };

  proton = mergeNestedSettingValue(protonDefaults, proton, "enabled", true);
  proton = mergeNestedSettingValue(protonDefaults, proton, "protonBin", "/proton/new");

  assert.deepEqual(proton, {
    enabled: true,
    protonBin: "/proton/new",
    steamCompatDataPath: "/compat/original",
  });
});

test("old or partial nested settings retain schema defaults", () => {
  const wineDefaults = {
    wineBin: "wine",
    winePrefix: "",
  };
  assert.deepEqual(
    mergeNestedSettingValue(wineDefaults, undefined, "winePrefix", "/new"),
    {
      wineBin: "wine",
      winePrefix: "/new",
    }
  );

  const protonDefaults = {
    enabled: false,
    protonBin: "",
    steamCompatDataPath: "",
  };
  assert.deepEqual(
    mergeNestedSettingValue(protonDefaults, { protonBin: "/custom" }, "enabled", true),
    {
      enabled: true,
      protonBin: "/custom",
      steamCompatDataPath: "",
    }
  );
});

test("Wine and Proton field writes merge in the main-process settings authority", () => {
  const manager = read("electron/modules/core/settings.js");
  const preload = read("electron/preload.js");
  const settingsPage = read("src/pages/Settings.jsx");

  assert.match(
    manager,
    /mergeNestedSettingValue\(\s*this\.defaultSettings\[key\],\s*this\.settings\[key\],\s*field,\s*value\s*\)/
  );
  assert.match(manager, /return this\.updateSetting\(key, updatedValue\)/);
  assert.match(
    manager,
    /ipcMain\.handle\("update-nested-setting", async \(event, key, field, value\) =>/
  );
  assert.match(
    manager,
    /event\.sender\.send\("settings-updated", manager\.getSettings\(\)\)/
  );

  assert.match(
    preload,
    /updateNestedSetting: \(key, field, value\) =>\s*ipcRenderer\.invoke\("update-nested-setting", key, field, value\)/
  );

  assert.match(
    settingsPage,
    /window\.electron\.updateNestedSetting\("wine", field, val\)/
  );
  assert.match(
    settingsPage,
    /window\.electron\.updateNestedSetting\("proton", field, val\)/
  );
  assert.match(
    settingsPage,
    /wine: \{\s*\.\.\.\(prev\.wine \|\| \{\}\),\s*\[field\]: val/s
  );
  assert.match(
    settingsPage,
    /proton: \{\s*\.\.\.\(prev\.proton \|\| \{\}\),\s*\[field\]: val/s
  );
  assert.doesNotMatch(settingsPage, /\.\.\.\(settings\.wine \|\| \{\}\)/);
  assert.doesNotMatch(settingsPage, /\.\.\.\(settings\.proton \|\| \{\}\)/);
});
