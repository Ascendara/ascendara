const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");

const LUDUSAVI = path.join(__dirname, "..", "electron/modules/library/ludusavi.js");

function loadLudusavi() {
  const realLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === "electron") return { app: {}, ipcMain: {}, dialog: {} };
    if (request === "../core/config") return { isWindows: false };
    if (request === "../core/settings") return { getSettingsManager: () => ({}) };
    if (request === "../core/utils") return { sanitizeGameName: name => name };
    return realLoad.call(this, request, ...rest);
  };
  try {
    delete require.cache[LUDUSAVI];
    return require(LUDUSAVI);
  } finally {
    Module._load = realLoad;
    delete require.cache[LUDUSAVI];
  }
}

const { saveFoldersFromFiles } = loadLudusavi();
const shared = ["/home/me", "/home/me/.local/share", "/home/me/.config"];

test("save files become the folder that holds them", () => {
  assert.deepEqual(
    saveFoldersFromFiles(
      [
        "/home/me/.local/share/Studio/Game/save1.dat",
        "/home/me/.local/share/Studio/Game/backup/save1.bak",
      ],
      shared
    ),
    ["/home/me/.local/share/Studio/Game"]
  );
});

test("save slot folders fold into the game's folder", () => {
  assert.deepEqual(
    saveFoldersFromFiles(
      [
        "/home/me/.local/share/Studio/Game/Saves/slot1/data.sav",
        "/home/me/.local/share/Studio/Game/Saves/slot2/data.sav",
        "/home/me/.local/share/Studio/Game/Config/settings.ini",
      ],
      shared
    ),
    ["/home/me/.local/share/Studio/Game"]
  );
});

test("folders shared by many games are never picked", () => {
  assert.deepEqual(
    saveFoldersFromFiles(
      ["/home/me/.local/share/GameA/a.sav", "/home/me/.config/GameA/settings.ini"],
      shared
    ).sort(),
    ["/home/me/.config/GameA", "/home/me/.local/share/GameA"]
  );
  assert.deepEqual(
    saveFoldersFromFiles(
      ["/home/me/.local/share/a.sav", "/home/me/.local/share/b.sav"],
      shared
    ),
    ["/home/me/.local/share"]
  );
  assert.deepEqual(saveFoldersFromFiles([], shared), []);
});
