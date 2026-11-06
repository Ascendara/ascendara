const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("./helpers/loadModule.cjs");

const load = () => loadModule("src/services/downloads/debridParts.js");

test("extras are recognised", async () => {
  const { classifyTorrentPart } = await load();
  for (const name of [
    "Game Soundtrack.zip",
    "Game_OST_FLAC.rar",
    "Bonus Content.zip",
    "Digital Artbook.pdf",
    "Game Art Book.zip",
    "fg-optional-bonus-content.bin",
    "fg-optional-soundtrack.bin",
    "fg-optional-wallpapers.bin",
    "fg-optional-misc.bin",
  ])
    assert.equal(classifyTorrentPart(name).kind, "extra", name);
});

test("language packs report their language, codes only in a language context", async () => {
  const { classifyTorrentPart } = await load();
  const cases = {
    "fg-selective-english.bin": "en",
    "fg-selective-french.bin": "fr",
    "fg-optional-spanish.bin": "es",
    "selective-de.bin": "de",
    "Game/Language/lang_ja.pak": "ja",
    "voice_pt-br.bin": "pt",
    "Russian Language Pack.zip": "ru",
  };
  for (const [name, language] of Object.entries(cases))
    assert.deepEqual(classifyTorrentPart(name), { kind: "language", language }, name);
  for (const name of [
    "setup.exe",
    "fg-01.bin",
    "data-it.bin",
    "Game.part01.rar",
    "de-pack.dat",
    "id.txt",
  ])
    assert.equal(classifyTorrentPart(name).kind, "game", name);
});

test("the part setting picks, keeps everything, or asks", async () => {
  const { selectTorrentParts, DEFAULT_TORRENT_PART_MODE } = await load();
  const files = [
    "setup.exe",
    "fg-01.bin",
    "fg-selective-english.bin",
    "fg-selective-french.bin",
    "fg-selective-german.bin",
    "fg-optional-bonus.bin",
    "Soundtrack.zip",
  ].map((path, id) => ({ id, path, size: 10 }));
  const names = list => list.map(file => file.path);

  assert.equal(DEFAULT_TORRENT_PART_MODE, "ask");
  assert.equal(selectTorrentParts(files), null, "asks by default");
  assert.equal(selectTorrentParts(files, "ask", "fr-FR"), null);
  assert.equal(selectTorrentParts(files, "all", "fr-FR"), files);
  assert.deepEqual(names(selectTorrentParts(files, "skipExtras", "fr-FR")), [
    "setup.exe",
    "fg-01.bin",
    "fg-selective-english.bin",
    "fg-selective-french.bin",
  ]);
  assert.deepEqual(names(selectTorrentParts(files, "skipExtras", "en-US")), [
    "setup.exe",
    "fg-01.bin",
    "fg-selective-english.bin",
  ]);
  const single = [files[0]];
  assert.equal(selectTorrentParts(single, "ask"), single, "one file never asks");
});

test("the setting has a default in both settings stores", () => {
  const fs = require("node:fs");
  for (const file of [
    "src/context/SettingsContext.jsx",
    "electron/modules/core/settings.js",
  ])
    assert.match(
      fs.readFileSync(file, "utf8"),
      /debridTorrentParts: "ask"/,
      `${file} default`
    );
});
