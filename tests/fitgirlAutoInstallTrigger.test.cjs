const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("./helpers/loadModule.cjs");

const load = () => loadModule("src/services/downloads/fitgirlAutoInstallTrigger.js");

const pack = (name, extra = {}) => ({
  name,
  downloadingData: {
    pendingManualInstall: true,
    fitgirlPack: true,
    manualInstallerPath: `D:\\Games\\${name}\\setup.exe`,
    ...extra,
  },
});

test("a finished FitGirl pack is handled once, never twice", async () => {
  const { takeFitgirlActions } = await load();
  const handled = new Set();
  const downloads = [pack("Game A")];
  const first = takeFitgirlActions(downloads, { settings: {}, handled });
  assert.equal(first.length, 1);
  assert.equal(first[0].game, "Game A");
  assert.equal(first[0].installerPath, "D:\\Games\\Game A\\setup.exe");
  assert.deepEqual(takeFitgirlActions(downloads, { settings: {}, handled }), []);
});

test("skips non-FitGirl, unfinished and already running packs", async () => {
  const { takeFitgirlActions } = await load();
  const downloads = [
    pack("Not FitGirl", { fitgirlPack: false }),
    pack("Still downloading", { pendingManualInstall: false }),
    pack("Running"),
    { name: "No data" },
  ];
  const handled = new Set();
  const actions = takeFitgirlActions(downloads, {
    settings: {},
    handled,
    states: { Running: { stage: "verifying", percent: 10 } },
  });
  assert.deepEqual(actions, []);
  assert.ok(handled.has("Running"));
});

test("ask on prompts, ask off installs, per-download choice beats Settings", async () => {
  const { takeFitgirlActions } = await load();
  const settings = { fitgirlAskInstall: true, fitgirlDeletePack: true };
  const choices = { B: { ask: false, deletePack: false } };
  const actions = takeFitgirlActions([pack("A"), pack("B")], {
    settings,
    handled: new Set(),
    readChoice: game => choices[game] || null,
  });
  assert.deepEqual(
    actions.map(({ game, action }) => [game, action]),
    [
      ["A", "ask"],
      ["B", "install"],
    ]
  );
  assert.equal(actions[0].options.deletePack, true);
  assert.equal(actions[1].options.deletePack, false);
  const off = takeFitgirlActions([pack("C")], {
    settings: { fitgirlAskInstall: false },
    handled: new Set(),
  });
  assert.equal(off[0].action, "install");
});

test("only checking, verifying, installing and cleaning count as running", async () => {
  const { isFitgirlInstallActive } = await load();
  for (const stage of ["checking", "verifying", "installing", "cleaning"])
    assert.equal(isFitgirlInstallActive({ stage }), true);
  for (const state of [{ stage: "done" }, { stage: "failed" }, null, undefined])
    assert.equal(isFitgirlInstallActive(state), false);
});

test("card text: Verifying N%, Installing, Cleaning up, Done, Failed: stage: reason", async () => {
  const { describeFitgirlState } = await load();
  assert.deepEqual(describeFitgirlState({ stage: "verifying", percent: 42 }), {
    key: "fitgirlInstall.verifying",
    values: { percent: 42 },
  });
  assert.equal(
    describeFitgirlState({ stage: "verifying", percent: 250 }).values.percent,
    100
  );
  for (const stage of ["checking", "installing", "cleaning", "done"])
    assert.equal(describeFitgirlState({ stage }).key, `fitgirlInstall.${stage}`);
  assert.deepEqual(
    describeFitgirlState({ stage: "failed", failedStage: "installing", error: "code 2" }),
    { key: "fitgirlInstall.failed", values: { error: "installing: code 2" } }
  );
  assert.equal(
    describeFitgirlState({ stage: "failed", error: "Windows only" }).values.error,
    "Windows only"
  );
  assert.equal(describeFitgirlState(null), null);
});
