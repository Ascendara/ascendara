const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadModule } = require("./helpers/loadModule.cjs");

const lifecycle = loadModule("src/services/app/updateLifecycle.js");

test("update lifecycle preserves available -> downloading -> ready as exclusive phases", async () => {
  const { INITIAL_UPDATE_STATUS, UPDATE_PHASES, reduceUpdateStatus } = await lifecycle;
  let state = { ...INITIAL_UPDATE_STATUS };

  state = reduceUpdateStatus(state, {
    type: "SNAPSHOT",
    isLatest: false,
    downloaded: false,
    downloading: false,
  });
  assert.equal(state.phase, UPDATE_PHASES.AVAILABLE);

  state = reduceUpdateStatus(state, { type: "DOWNLOAD_PROGRESS", progress: 37 });
  assert.equal(state.phase, UPDATE_PHASES.DOWNLOADING);
  assert.equal(state.downloadProgress, 37);

  state = reduceUpdateStatus(state, { type: "READY" });
  assert.equal(state.phase, UPDATE_PHASES.READY);
  assert.equal(state.downloadProgress, 100);

  state = reduceUpdateStatus(state, {
    type: "SNAPSHOT",
    isLatest: false,
    downloaded: true,
    downloading: false,
  });
  assert.equal(state.phase, UPDATE_PHASES.READY);
});

test("current and failed downloads keep their expected lifecycle states", async () => {
  const { INITIAL_UPDATE_STATUS, UPDATE_PHASES, reduceUpdateStatus } = await lifecycle;

  const current = reduceUpdateStatus(
    { ...INITIAL_UPDATE_STATUS },
    {
      type: "SNAPSHOT",
      isLatest: true,
      downloaded: false,
      downloading: false,
    }
  );
  assert.equal(current.phase, UPDATE_PHASES.CURRENT);

  let failed = reduceUpdateStatus(
    { ...INITIAL_UPDATE_STATUS },
    {
      type: "SNAPSHOT",
      isLatest: false,
      downloaded: false,
      downloading: false,
    }
  );
  failed = reduceUpdateStatus(failed, { type: "DOWNLOAD_PROGRESS", progress: 52 });
  failed = reduceUpdateStatus(failed, { type: "DOWNLOAD_ERROR" });
  assert.equal(failed.phase, UPDATE_PHASES.AVAILABLE);
  assert.equal(failed.downloadProgress, 0);
});

test("install failure returns a ready update to ready instead of available", async () => {
  const { INITIAL_UPDATE_STATUS, UPDATE_PHASES, reduceUpdateStatus } = await lifecycle;
  let state = reduceUpdateStatus({ ...INITIAL_UPDATE_STATUS }, { type: "READY" });

  state = reduceUpdateStatus(state, { type: "INSTALLING" });
  assert.equal(state.phase, UPDATE_PHASES.INSTALLING);

  state = reduceUpdateStatus(state, { type: "INSTALL_FAILED" });
  assert.equal(state.phase, UPDATE_PHASES.READY);
});

test("MenuBar gates download-now and ready presentation on shared lifecycle phases", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "components", "MenuBar.jsx"),
    "utf8"
  );

  assert.match(source, /updatePhase === UPDATE_PHASES\.AVAILABLE/);
  assert.match(source, /updatePhase === UPDATE_PHASES\.DOWNLOADING/);
  assert.match(source, /updatePhase === UPDATE_PHASES\.READY/);
  assert.doesNotMatch(source, /!isLatest && !isDownloadingUpdate/);
});

test("App update-ready UX subscribes to the same lifecycle source", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "app.jsx"), "utf8");

  assert.match(source, /subscribeToUpdateStatus\(handleUpdateStatus\)/);
  assert.match(source, /getUpdateStatus\(\)\.phase === UPDATE_PHASES\.READY/);
  assert.doesNotMatch(source, /window\.electron\.onUpdateReady\(/);
  assert.doesNotMatch(source, /window\.electron\.isUpdateDownloaded\(/);
});
