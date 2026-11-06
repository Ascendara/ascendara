const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("./helpers/loadModule.cjs");

test("torrent names Windows cannot store are made storable before the handoff", async () => {
  const { validateFileList } = require("../electron/modules/downloads/downloadManifest");
  const { storableFilename } = await loadModule(
    "src/services/downloads/debridTorrentHandoff.js",
    { fresh: true }
  );
  const cases = [
    ["Game: Deluxe Edition/setup.exe", "Game_ Deluxe Edition/setup.exe"],
    ["Game/notes. ", "Game/notes"],
    ["/Game//Data\\file?.bin", "Game/Data/file_.bin"],
    ["Game/../evil.exe", "Game/_/evil.exe"],
    ["Game/CON.txt", "Game/_CON.txt"],
    ["Game/.ascendara.json", "Game/_.ascendara.json_"],
    ["Game/save.ascendara.json", "Game/save.ascendara.json_"],
    ["Game/plain.bin", "Game/plain.bin"],
  ];
  for (const [name, expected] of cases) {
    const safe = storableFilename(name);
    assert.equal(safe, expected, name);
    assert.doesNotThrow(() =>
      validateFileList({
        transferId: "test:torrent:1",
        files: [{ url: "https://example.com/f", filename: safe }],
      })
    );
  }
});

test("names that collide after cleaning, or differ only by case, stay apart", async () => {
  const { validateFileList } = require("../electron/modules/downloads/downloadManifest");
  const { storableFiles, storableFilename } = await loadModule(
    "src/services/downloads/debridTorrentHandoff.js",
    { fresh: true }
  );
  const files = [
    "Track: 1.mp3",
    "Track_ 1.mp3",
    "notes.",
    "notes",
    "Readme.txt",
    "README.TXT",
  ].map(filename => ({ url: "https://example.com/f", filename }));
  const safe = storableFiles(files).map(file => file.filename);
  assert.deepEqual(safe, [
    "Track_ 1.mp3",
    "Track_ 1 (2).mp3",
    "notes",
    "notes (2)",
    "Readme.txt",
    "README (2).TXT",
  ]);
  assert.doesNotThrow(() =>
    validateFileList({ transferId: "test:torrent:1", files: storableFiles(files) })
  );
  assert.equal(
    storableFilename(undefined),
    undefined,
    "a missing name is left to the check"
  );
});
