const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("./helpers/loadModule.cjs");
const fs = require("node:fs");

const load = () => loadModule("src/services/downloads/fitgirlInstallOptions.js");

test("FitGirl install defaults: ask, checks, silent and delete on; RAM limit and extras off", async () => {
  const { FITGIRL_INSTALL_DEFAULTS, resolveFitgirlOptions } = await load();
  assert.deepEqual(FITGIRL_INSTALL_DEFAULTS, {
    ask: true,
    verify: true,
    silent: true,
    limitRam: false,
    verifyInstalled: true,
    redists: false,
    hostsRedirect: false,
    openSite: false,
    deletePack: true,
  });
  assert.deepEqual(resolveFitgirlOptions({}, null), FITGIRL_INSTALL_DEFAULTS);
});

test("settings set the defaults and a per-download choice wins", async () => {
  const { resolveFitgirlOptions } = await load();
  const settings = {
    fitgirlAskInstall: false,
    fitgirlVerifyMd5: true,
    fitgirlSilentSetup: false,
    fitgirlLimitRam: true,
    fitgirlRedists: true,
    fitgirlDeletePack: false,
  };
  assert.deepEqual(resolveFitgirlOptions(settings), {
    ask: false,
    verify: true,
    silent: false,
    limitRam: true,
    verifyInstalled: true,
    redists: true,
    hostsRedirect: false,
    openSite: false,
    deletePack: false,
  });
  assert.deepEqual(
    resolveFitgirlOptions(settings, {
      verify: false,
      deletePack: true,
      limitRam: "yes",
      redists: false,
    }),
    {
      ask: false,
      verify: false,
      silent: false,
      limitRam: true,
      verifyInstalled: true,
      redists: false,
      hostsRedirect: false,
      openSite: false,
      deletePack: true,
    }
  );
});

test("FitGirl names are recognised for the download dialog", async () => {
  const { looksLikeFitgirl } = await load();
  assert.equal(looksLikeFitgirl("Game [FitGirl Repack]"), true);
  assert.equal(looksLikeFitgirl("fitgirl-repacks.site"), true);
  assert.equal(looksLikeFitgirl("Game [DODI Repack]"), false);
  assert.equal(looksLikeFitgirl(null), false);
});

test("both settings stores carry the same FitGirl defaults", async () => {
  const { FITGIRL_SETTING_KEYS, FITGIRL_INSTALL_DEFAULTS } = await load();
  for (const file of [
    "src/context/SettingsContext.jsx",
    "electron/modules/core/settings.js",
  ]) {
    const source = fs.readFileSync(file, "utf8");
    for (const [option, key] of Object.entries(FITGIRL_SETTING_KEYS)) {
      const expected = new RegExp(`\\b${key}: ${FITGIRL_INSTALL_DEFAULTS[option]},`, "g");
      // SettingsContext keeps two default blocks, settings.js one.
      const count = (source.match(expected) || []).length;
      assert.ok(count >= 1, `${file} ${key}`);
    }
  }
});

test("a per-download choice is saved per game and can be cleared", async () => {
  const { readDownloadChoice, saveDownloadChoice } = await load();
  const data = new Map();
  const storage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
  assert.equal(readDownloadChoice("Game", storage), null);
  saveDownloadChoice("Game", { ask: false }, storage);
  saveDownloadChoice("Other", { verify: false }, storage);
  assert.deepEqual(readDownloadChoice("Game", storage), { ask: false });
  saveDownloadChoice("Game", null, storage);
  assert.equal(readDownloadChoice("Game", storage), null);
  assert.deepEqual(readDownloadChoice("Other", storage), { verify: false });
  data.set("fitgirlInstallChoices", "not json");
  assert.equal(readDownloadChoice("Other", storage), null);
});
