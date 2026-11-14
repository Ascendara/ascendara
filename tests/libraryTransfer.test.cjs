const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const JSZip = require("jszip");
const {
  CATEGORIES,
  buildLibraryArchive,
  inspectLibraryArchive,
  applyLibraryArchive,
  getExportInfo,
} = require("../electron/modules/library/libraryTransfer");

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), "ascendara-library-"));
const writeJson = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data));
};
const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));

function seedSource() {
  const root = temp();
  const downloads = path.join(root, "downloads");
  const userData = path.join(root, "userData");
  const index = path.join(root, "index");
  writeJson(path.join(downloads, "games.json"), {
    games: [
      { game: "Custom One", executable: "C:/Games/one.exe", isRunning: true },
      { game: "Deleted", _isDeleted: true },
    ],
  });
  fs.mkdirSync(path.join(downloads, "games"));
  fs.writeFileSync(path.join(downloads, "games", "Custom One.ascendara.jpg"), "cover");
  writeJson(path.join(downloads, "Installed", "Installed.ascendara.json"), {
    game: "Installed",
    executable: "Installed/game.exe",
    playTime: 500,
    launchCount: 4,
    lastPlayed: "2026-01-02T00:00:00.000Z",
    favorite: true,
  });
  writeJson(path.join(index, "ascendara_games.json"), { games: [] });
  fs.mkdirSync(path.join(index, "imgs"));
  fs.writeFileSync(path.join(index, "imgs", "a.jpg"), "img");
  writeJson(path.join(userData, "retro", "library.json"), {
    version: 1,
    profiles: { ps3: { executable: "C:/rpcs3.exe" } },
    games: [{ id: "g1", title: "Retro" }],
  });
  fs.mkdirSync(path.join(userData, "profile_images"), { recursive: true });
  fs.writeFileSync(path.join(userData, "profile_images", "profile.png"), "png");
  writeJson(path.join(userData, "games-size-cache.json"), { a: 1 });
  const settings = {
    downloadDirectory: downloads,
    additionalDirectories: [],
    localIndex: index,
    theme: "royal-night",
    customTheme: [],
    sideScrollBar: true,
    language: "fr",
    threadCount: 20,
    torboxApiKey: "secret-key",
    twitchSecret: "shh",
    torrentPassword: "adminadmin",
    runningGames: { x: 1 },
    ludusavi: { enabled: true, backupLocation: root, backupFormat: "zip" },
  };
  return { root, downloads, userData, index, settings };
}

function seedTarget() {
  const root = temp();
  const downloads = path.join(root, "downloads");
  const userData = path.join(root, "userData");
  fs.mkdirSync(userData, { recursive: true });
  writeJson(path.join(downloads, "Installed", "Installed.ascendara.json"), {
    game: "Installed",
    executable: "Installed/other.exe",
    playTime: 100,
    launchCount: 9,
  });
  const settings = {
    downloadDirectory: downloads,
    localIndex: path.join(root, "index"),
    theme: "light",
    sideScrollBar: false,
    language: "en",
    torboxApiKey: "mine",
    ludusavi: { enabled: false, backupLocation: "D:/Mine" },
  };
  return { root, downloads, userData, settings };
}

const build = (source, categories = CATEGORIES, storage = {}) =>
  buildLibraryArchive(
    {
      settings: source.settings,
      userData: source.userData,
      appVersion: "12.1.0",
      sensitiveKeys: ["torboxApiKey"],
    },
    { categories, storage }
  );

test("full export then import restores every category", async () => {
  const source = seedSource();
  const info = await getExportInfo(source.settings, source.userData);
  assert.equal(info.customGames, 1);
  assert.equal(info.installedGames, 1);
  assert.equal(info.retroGames, 1);
  assert.equal(info.indexFiles, 2);
  assert.equal(info.hasProfileImage, true);

  const { buffer } = await build(source, CATEGORIES, {
    organization: { "game-favorites": '["Custom One"]' },
    appearance: { "ascendara-theme": "royal-night" },
    library: { ignored: "x" },
  });

  const archive = await JSZip.loadAsync(buffer);
  const exportedSettings = JSON.parse(
    await archive.file("settings.json").async("string")
  );
  for (const key of ["torboxApiKey", "twitchSecret", "torrentPassword", "runningGames"]) {
    assert.equal(key in exportedSettings, false, `${key} must not be exported`);
  }
  assert.equal("downloadDirectory" in exportedSettings, false);
  assert.equal("theme" in exportedSettings, false);
  assert.equal("sideScrollBar" in exportedSettings, false);
  const exportedAppearance = JSON.parse(
    await archive.file("appearance-settings.json").async("string")
  );
  assert.equal(exportedAppearance.sideScrollBar, true);
  assert.equal(exportedSettings.ludusavi.backupLocation, undefined);
  assert.equal(archive.file("storage/library.json"), null);

  const inspected = await inspectLibraryArchive(buffer);
  assert.deepEqual(inspected.categories, CATEGORIES);

  const target = seedTarget();
  let saved = null;
  const result = await applyLibraryArchive(
    {
      settings: target.settings,
      userData: target.userData,
      sensitiveKeys: ["torboxApiKey"],
      saveSettings: changes => {
        saved = changes;
        return true;
      },
    },
    buffer,
    CATEGORIES
  );

  assert.deepEqual(result.summary.library, { added: 1, skipped: 0 });
  assert.deepEqual(result.summary.stats, { restored: 1, missing: 0 });
  assert.deepEqual(result.storage.organization, { "game-favorites": '["Custom One"]' });
  assert.deepEqual(result.storage.appearance, { "ascendara-theme": "royal-night" });

  const games = readJson(path.join(target.downloads, "games.json")).games;
  assert.deepEqual(
    games.map(game => [game.game, game.isRunning]),
    [["Custom One", false]]
  );
  assert.equal(
    fs.readFileSync(
      path.join(target.downloads, "games", "Custom One.ascendara.jpg"),
      "utf8"
    ),
    "cover"
  );

  const info2 = readJson(
    path.join(target.downloads, "Installed", "Installed.ascendara.json")
  );
  assert.equal(info2.playTime, 500);
  assert.equal(info2.launchCount, 9);
  assert.equal(info2.favorite, true);
  assert.equal(info2.executable, "Installed/other.exe");

  assert.equal(saved.language, "fr");
  assert.equal(saved.theme, "royal-night");
  assert.equal(saved.sideScrollBar, true);
  assert.equal("torboxApiKey" in saved, false);
  assert.equal("runningGames" in saved, false);
  // Folder locations from the backup exist here, so they apply
  assert.equal(saved.downloadDirectory, source.downloads);
  assert.equal(saved.ludusavi.backupLocation, source.root);
  assert.equal(saved.ludusavi.backupFormat, "zip");

  assert.equal(
    fs.readFileSync(path.join(target.userData, "profile_images", "profile.png"), "utf8"),
    "png"
  );
  const retro = readJson(path.join(target.userData, "retro", "library.json"));
  assert.equal(retro.games.length, 1);
  assert.equal(retro.profiles.ps3.executable, "C:/rpcs3.exe");
  assert.deepEqual(readJson(path.join(target.userData, "games-size-cache.json")), {
    a: 1,
  });
  assert.equal(result.summary.gameIndex.restored, true);
  assert.equal(
    fs.readFileSync(path.join(target.root, "index", "imgs", "a.jpg"), "utf8"),
    "img"
  );
});

test("import applies only the chosen categories and is safe to repeat", async () => {
  const source = seedSource();
  const { buffer } = await build(source, ["library", "settings"]);
  assert.deepEqual((await inspectLibraryArchive(buffer)).categories, [
    "library",
    "settings",
  ]);

  const target = seedTarget();
  let saved = null;
  const context = {
    settings: target.settings,
    userData: target.userData,
    saveSettings: changes => {
      saved = changes;
      return true;
    },
  };
  const first = await applyLibraryArchive(context, buffer, ["library", "stats", "paths"]);
  assert.deepEqual(first.categories, ["library"]);
  assert.equal(saved, null, "settings were not chosen");

  const again = await applyLibraryArchive(context, buffer, ["library"]);
  assert.deepEqual(again.summary.library, { added: 0, skipped: 1 });
  assert.equal(readJson(path.join(target.downloads, "games.json")).games.length, 1);

  await applyLibraryArchive(context, buffer, ["settings"]);
  assert.equal(saved.language, "fr");
  assert.equal(saved.ludusavi.backupLocation, "D:/Mine", "local backup folder kept");
  assert.equal("downloadDirectory" in saved, false);
});

test("old Appearance backups migrate side scrollbar storage into settings", async () => {
  const target = seedTarget();
  const zip = new JSZip();
  zip.file(
    "manifest.json",
    JSON.stringify({
      format: "ascendara-export",
      version: 1,
      categories: ["appearance"],
    })
  );
  zip.file("appearance-settings.json", JSON.stringify({ theme: "royal-night" }));
  zip.file(
    "storage/appearance.json",
    JSON.stringify({ sideScrollBar: "true", "ascendara-theme": "royal-night" })
  );

  let saved = null;
  const result = await applyLibraryArchive(
    {
      settings: target.settings,
      userData: target.userData,
      saveSettings: changes => {
        saved = changes;
        return true;
      },
    },
    await zip.generateAsync({ type: "nodebuffer" }),
    ["appearance"]
  );

  assert.equal(saved.theme, "royal-night");
  assert.equal(saved.sideScrollBar, true);
  assert.equal(result.storage.appearance.sideScrollBar, "true");
});

test("missing folders are skipped and an existing game index is kept", async () => {
  const source = seedSource();
  source.settings.additionalDirectories = [path.join(source.root, "gone")];
  const { buffer } = await build(source, ["paths", "gameIndex"]);
  const target = seedTarget();
  writeJson(path.join(target.root, "index", "ascendara_games.json"), { mine: true });
  let saved = null;
  const result = await applyLibraryArchive(
    {
      settings: target.settings,
      userData: target.userData,
      saveSettings: c => (saved = c),
    },
    buffer,
    ["paths", "gameIndex"]
  );
  assert.deepEqual(saved.additionalDirectories, []);
  assert.equal(result.summary.paths.missing, 1);
  assert.equal(result.summary.gameIndex.restored, false);
  assert.deepEqual(readJson(path.join(target.root, "index", "ascendara_games.json")), {
    mine: true,
  });
});

test("import rejects foreign files and ignores unsafe names", async () => {
  const target = seedTarget();
  const context = { settings: target.settings, userData: target.userData };
  await assert.rejects(
    applyLibraryArchive(context, Buffer.from("not a zip")),
    /not an Ascendara export/
  );

  const zip = new JSZip();
  zip.file(
    "manifest.json",
    JSON.stringify({
      format: "ascendara-export",
      version: 1,
      categories: ["library", "gameIndex"],
    })
  );
  zip.file(
    "custom-games.json",
    JSON.stringify([
      { game: "../escape", _cover: "../escape.ascendara.jpg" },
      { game: "Fine", _cover: "../../evil.ascendara.jpg" },
      { game: "Imported", assetDirectory: "C:/elsewhere/../../bad id" },
    ])
  );
  zip.file("covers/../../evil.ascendara.jpg", "x");
  zip.file("index/../../escaped.txt", "x");
  zip.file("index/ok.json", "{}");
  const result = await applyLibraryArchive(
    context,
    await zip.generateAsync({ type: "nodebuffer" }),
    ["library", "gameIndex"]
  );
  assert.deepEqual(result.summary.library, { added: 2, skipped: 1 });
  const games = readJson(path.join(target.downloads, "games.json")).games;
  assert.deepEqual(
    games.map(game => game.game),
    ["Fine", "Imported"]
  );
  assert.equal(games[1].assetDirectory, undefined);
  assert.equal(fs.existsSync(path.join(target.downloads, "games")), false);
  assert.equal(fs.existsSync(path.join(target.root, "escaped.txt")), false);
  assert.equal(fs.existsSync(path.join(path.dirname(target.root), "escaped.txt")), false);
  assert.equal(fs.existsSync(path.join(target.root, "index", "ok.json")), true);

  const newer = new JSZip();
  newer.file(
    "manifest.json",
    JSON.stringify({ format: "ascendara-export", version: 99 })
  );
  await assert.rejects(
    applyLibraryArchive(context, await newer.generateAsync({ type: "nodebuffer" })),
    /newer version/
  );
});
