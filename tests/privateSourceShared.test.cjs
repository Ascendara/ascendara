const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const core = require("../electron/modules/downloads/privateSourceCore");

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "ascendara-shared-"));
const id = "0123456789abcdef01234567";

test("shared library rejects files that aren't a version 1 shared library", () => {
  for (const raw of [null, { version: 2, kind: "ascendara-shared-library", games: {} },
    { version: 1, kind: "other", games: {} }, { version: 1, kind: "ascendara-shared-library", games: [] }])
    assert.throws(() => core.validateShared(raw), /invalidSharedLibrary/);
});

test("shared library drops unknown IDs and entries without a match status", () => {
  const games = core.validateShared({ version: 1, kind: "ascendara-shared-library", games: {
    [id]: { match: "manual", title: "Portal", identifiers: { steam: "400" }, updatedAt: "2026-10-01T00:00:00Z" },
    "not-a-game-id": { match: "manual", title: "Bad" },
    ["f".repeat(24)]: { title: "No status" },
  } });
  assert.deepEqual(Object.keys(games), [id]);
  assert.equal(games[id].identifiers.steam, "400");
});

test("shared artwork must stay inside the shared art folder", () => {
  for (const art of ["../secret.jpg", "art/../../x", "/etc/passwd", "covers/a"])
    assert.throws(() => core.sharedEntry({ match: "manual", art }), /unsafePath/);
  assert.equal(core.sharedEntry({ match: "manual", art: "art/abc-123" }).art, "art/abc-123");
});

test("manual matches beat automatic ones, then newer edits win", () => {
  const auto = { match: "automatic", updatedAt: "2026-10-30T00:00:00Z" };
  const manual = { match: "manual", updatedAt: "2026-01-01T00:00:00Z" };
  assert.equal(core.newer(auto, manual), manual);
  assert.equal(core.newer(manual, auto), manual);
  const later = { match: "automatic", updatedAt: "2026-10-31T00:00:00Z" };
  assert.equal(core.newer(auto, later), later);
  const tie = { ...auto };
  assert.equal(core.newer(auto, tie), auto);
  assert.equal(core.newer(undefined, auto), auto);
});

test("shared library round-trips through the folder and scans skip it", async () => {
  const root = tempDir();
  fs.mkdirSync(path.join(root, "Games"));
  fs.writeFileSync(path.join(root, "Games", "Portal Setup.exe"), "x");
  assert.equal(await core.readShared(root), null);
  await core.writeShared(root, { [id]: { match: "manual", title: "Portal" } });
  fs.writeFileSync(path.join(root, ".ascendara", "stray.exe"), "x");
  assert.equal((await core.readShared(root))[id].title, "Portal");
  assert.deepEqual(fs.readdirSync(path.join(root, ".ascendara")).sort(), ["library.json", "stray.exe"]);
  const index = await core.scan(root, "source");
  assert.deepEqual(index.games.map(g => g.path), ["Games/Portal Setup.exe"]);
});

test("the same file gets the same game ID from different mount points", async () => {
  const a = tempDir(), b = tempDir();
  for (const root of [a, b]) fs.writeFileSync(path.join(root, "Game.iso"), "x");
  const [ga] = (await core.scan(a, "one")).games, [gb] = (await core.scan(b, "two")).games;
  assert.equal(ga.id, gb.id);
});

test("corrupt shared library files are reported instead of replaced", async () => {
  const root = tempDir();
  fs.mkdirSync(path.join(root, ".ascendara"));
  fs.writeFileSync(path.join(root, ".ascendara", "library.json"), "{not json");
  await assert.rejects(core.readShared(root), /invalidSharedLibrary/);
});
