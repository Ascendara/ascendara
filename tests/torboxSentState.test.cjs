const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("./helpers/loadModule.cjs");

const torrent = { id: 5, _torboxType: "torrent", _storageKey: "torrent:5" };
const webdl = { id: 5, _torboxType: "webdl", _storageKey: "webdl:5" };
const torrentRecord = {
  name: "Torrent Game",
  autoHandoff: true,
  torboxType: "torrent",
  gameData: { game: "Torrent Game" },
};
// Before torrents existed the page saved web downloads under their bare id.
const legacyWebdl = { name: "Web Game", gameData: { game: "Web Game" } };

test("a web download sharing a torrent's id does not mark the torrent as sent", async () => {
  const { isSentToPc, getStoredDownloadData } = await loadModule(
    "src/services/downloads/torboxRecords.js"
  );
  const downloadedToPc = { 5: { name: "Web Game" } };
  const stored = { 5: { ...legacyWebdl, localDownloadStarted: true } };
  stored["torrent:5"] = torrentRecord;

  assert.equal(isSentToPc(downloadedToPc, stored, torrent), false);
  assert.equal(getStoredDownloadData(stored, torrent), torrentRecord);
  // Legacy web download entries still count for the web download itself.
  assert.equal(isSentToPc(downloadedToPc, stored, webdl), true);
  assert.equal(getStoredDownloadData(stored, webdl), stored[5]);

  // Without its own record a torrent must not borrow the web download's data.
  assert.equal(getStoredDownloadData({ 5: legacyWebdl }, torrent), null);
  assert.equal(
    isSentToPc({ "torrent:5": { name: "Torrent Game" } }, {}, torrent),
    true,
    "a torrent sent from the page stays sent"
  );
});

test("a finished torrent nobody sent is handed off and only then shows as sent", async t => {
  const saved = { window: global.window, localStorage: global.localStorage };
  t.after(() => Object.assign(global, saved));
  const store = new Map();
  global.localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
  };
  store.set(
    "torboxGameNames",
    JSON.stringify({ 5: legacyWebdl, "torrent:5": torrentRecord })
  );
  const started = [];
  global.window = {
    electron: {
      getGames: async () => [],
      downloadFile: async (...args) => {
        started.push(args);
        return { success: true };
      },
    },
  };
  const requested = [];
  const provider = {
    id: "torbox",
    metadataStorageKey: "torboxGameNames",
    getTorrentGame: entry => entry.gameData,
    getTorrentDownload: async (key, id) => {
      requested.push(id);
      return [{ url: "https://cdn.example/torrent.zip", filename: "torrent.zip" }];
    },
  };
  const { handoffTorrents } = await loadModule(
    "src/services/downloads/debridTorrentHandoff.js"
  );
  const { isSentToPc } = await loadModule("src/services/downloads/torboxRecords.js");
  const downloadedToPc = { 5: { name: "Web Game" } };
  const read = () => JSON.parse(store.get("torboxGameNames"));

  assert.equal(isSentToPc(downloadedToPc, read(), torrent), false);
  assert.deepEqual(await handoffTorrents(provider, "key"), {
    game: "Torrent Game",
    providerId: "torbox",
  });
  assert.deepEqual(requested, ["5"]);
  assert.equal(started[0][1], "Torrent Game");
  assert.equal(read()["torrent:5"].localDownloadStarted, true);
  assert.equal(read()[5].localDownloadStarted, undefined);
  assert.equal(isSentToPc(downloadedToPc, read(), torrent), true);
});
