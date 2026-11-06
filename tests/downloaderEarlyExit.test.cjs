const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { watchEarlyExit } = require("../electron/modules/downloads/downloadControl");

function run(code, signal, windowMs = 5000) {
  const child = new EventEmitter();
  const seen = [];
  watchEarlyExit(child, c => seen.push(c), windowMs);
  child.emit("exit", code, signal);
  return seen;
}

test("a helper that fails right away is reported", () => {
  assert.deepEqual(run(2, null), [2]);
});

test("a clean exit or a signal is not a failed start", () => {
  assert.deepEqual(run(0, null), []);
  assert.deepEqual(run(null, "SIGTERM"), []);
});

test("an exit after the window is left to the downloader's own report", () => {
  assert.deepEqual(run(1, null, -1), []);
});
