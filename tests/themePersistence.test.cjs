const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadModule } = require("./helpers/loadModule.cjs");

function localEffects(log) {
  return {
    clearCustomTheme: () => log.push(["clear"]),
    applyTheme: value => log.push(["theme", value]),
    syncSettings: value => log.push(["settings", value]),
  };
}

test("failed theme persistence leaves all local theme authorities untouched", async () => {
  const { persistThemeSelection } = await loadModule("src/lib/themePersistence.js", {
    fresh: true,
  });
  const log = [];

  const success = await persistThemeSelection("midnight", {
    persist: async value => {
      log.push(["persist", value]);
      return false;
    },
    ...localEffects(log),
  });

  assert.equal(success, false);
  assert.deepEqual(log, [["persist", "midnight"]]);
});

test("rejected theme persistence leaves all local theme authorities untouched", async () => {
  const { persistThemeSelection } = await loadModule("src/lib/themePersistence.js", {
    fresh: true,
  });
  const log = [];
  const failure = new Error("disk unavailable");

  await assert.rejects(
    persistThemeSelection("midnight", {
      persist: async value => {
        log.push(["persist", value]);
        throw failure;
      },
      ...localEffects(log),
    }),
    failure
  );

  assert.deepEqual(log, [["persist", "midnight"]]);
});

test("successful persistence fans one theme value out after the save", async () => {
  const { persistThemeSelection } = await loadModule("src/lib/themePersistence.js", {
    fresh: true,
  });
  const log = [];

  const success = await persistThemeSelection("midnight", {
    persist: async value => {
      log.push(["persist", value]);
      return true;
    },
    ...localEffects(log),
  });

  assert.equal(success, true);
  assert.deepEqual(log, [
    ["persist", "midnight"],
    ["clear"],
    ["theme", "midnight"],
    ["settings", "midnight"],
  ]);
});

test("custom theme persistence does not clear custom theme data", async () => {
  const { persistThemeSelection } = await loadModule("src/lib/themePersistence.js", {
    fresh: true,
  });
  const log = [];

  assert.equal(
    await persistThemeSelection("custom", {
      persist: async value => {
        log.push(["persist", value]);
        return true;
      },
      ...localEffects(log),
    }),
    true
  );

  assert.deepEqual(log, [
    ["persist", "custom"],
    ["theme", "custom"],
    ["settings", "custom"],
  ]);
});

test("Settings delegates theme selection to the persistence transaction", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "src/pages/Settings.jsx"),
    "utf8"
  );
  const start = source.indexOf("const handleThemeChange = useCallback");
  const end = source.indexOf("const groupedThemes", start);
  const handler = source.slice(start, end);

  assert.match(handler, /await persistThemeSelection\(newTheme,/);
  assert.match(
    handler,
    /persist: value => window\.electron\.updateSetting\("theme", value\)/
  );
  assert.match(handler, /applyTheme: setTheme/);
  assert.doesNotMatch(handler, /localStorage\.setItem\("ascendara-theme"/);
  assert.match(handler, /setSettingsLocal\(prev => \(\{ \.\.\.prev, theme: value \}\)\)/);
});

test("Theme Studio activates custom theme only through the persistence transaction", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "src/pages/ThemeStudio.jsx"),
    "utf8"
  );
  const start = source.indexOf("const handleSave = async () =>");
  const end = source.indexOf("const handleImport = async () =>", start);
  const handler = source.slice(start, end);

  assert.match(handler, /await persistThemeSelection\("custom",/);
  assert.match(
    handler,
    /persist: value => window\.electron\.updateSetting\("theme", value\)/
  );
  assert.match(handler, /if \(!themeSaved\)[\s\S]*return;/);
  assert.match(handler, /applyTheme: value => \{[\s\S]*setTheme\(value\);[\s\S]*applyCustomTheme\(colors\);/);
  assert.doesNotMatch(handler, /localStorage\.setItem\("ascendara-theme"/);
});
