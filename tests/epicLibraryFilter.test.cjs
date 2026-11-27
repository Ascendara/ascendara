const test = require("node:test");
const assert = require("node:assert/strict");

const { isEpicGame } = require("../electron/modules/store-accounts/providers.js");

const item = (...paths) => ({ title: "Item", categories: paths.map(path => ({ path })) });

test("Epic games and applications are imported", () => {
  assert.equal(isEpicGame(item("games", "games/edition/base", "applications")), true);
  assert.equal(isEpicGame(item("applications")), true);
});

test("Unreal Engine assets, engines, plugins and projects are skipped", () => {
  assert.equal(isEpicGame(item("assets", "assets/environments")), false);
  assert.equal(isEpicGame(item("assets/codeplugins")), false);
  assert.equal(isEpicGame(item("engines")), false);
  assert.equal(isEpicGame(item("plugins", "plugins/engine")), false);
  assert.equal(isEpicGame(item("projects")), false);
});

test("DLC and add-ons are skipped", () => {
  assert.equal(isEpicGame(item("addons", "applications")), false);
  assert.equal(isEpicGame({ title: "DLC", mainGameItem: { id: "x" } }), false);
});

test("listings without categories are kept", () => {
  assert.equal(isEpicGame({ title: "Game" }), true);
  assert.equal(isEpicGame(null), false);
});
