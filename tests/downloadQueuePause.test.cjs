const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("./helpers/loadModule.cjs");

const load = () => loadModule("src/services/downloads/downloadState.js");
const game = (name, downloadingData) => ({ game: name, downloadingData });
const active = name => game(name, { downloading: true });

test("pausing the active download does not free a slot for the queue", async () => {
  const { freedByPause } = await load();
  const paused = game("A", { downloading: false, stopped: true });
  assert.equal(freedByPause([active("A")], [paused]), true);
});

test("a download that finished or was cancelled frees a slot", async () => {
  const { freedByPause } = await load();
  assert.equal(freedByPause([active("A")], []), false);
  assert.equal(freedByPause([active("A")], [game("A", { error: true })]), false);
});

test("a download that was already paused does not block the queue", async () => {
  const { freedByPause } = await load();
  const paused = game("A", { downloading: false, stopped: true });
  assert.equal(freedByPause([paused, active("B")], [paused]), false);
});
