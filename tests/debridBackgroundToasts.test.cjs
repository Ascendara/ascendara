const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("./helpers/loadModule.cjs");

test("one service failing does not hide the download another service started", async t => {
  const saved = { window: global.window, localStorage: global.localStorage };
  t.after(() => Object.assign(global, saved));
  const records = {
    good: { "torrent:1": { game: "Started", autoHandoff: true } },
    bad: { "torrent:2": { game: "Broken", autoHandoff: true } },
  };
  global.localStorage = {
    getItem: key => JSON.stringify(records[key]),
    setItem: (key, value) => {
      records[key] = JSON.parse(value);
    },
  };
  global.window = {
    electron: {
      getGames: async () => [],
      downloadFile: async () => ({ success: true }),
    },
  };
  const { createDebridService } = await loadModule(
    "src/services/downloads/debridService.js",
    {
      fresh: true,
    }
  );
  const fake = (id, getTorrentDownload) => ({
    id,
    name: id,
    apiKeySetting: `${id}Key`,
    torrentSetting: `${id}Torrents`,
    metadataStorageKey: id,
    getTorrentGame: entry => entry,
    getTorrentDownload,
  });
  const debrid = createDebridService([
    fake("bad", async () => {
      throw new Error("Bad service is down");
    }),
    fake("good", async () => [
      { url: "https://good.test/f", filename: "f.bin", size: 1 },
    ]),
  ]);
  const results = await debrid.resumePendingTorrents({
    debridEnabled: true,
    badKey: "a",
    goodKey: "b",
  });
  assert.equal(results[0].status, "rejected");
  assert.match(results[0].reason.message, /Bad service is down/);
  assert.deepEqual(results[1], {
    status: "fulfilled",
    value: {
      game: "Started",
      providerId: "good",
      storageKey: "good",
      recordKey: "torrent:1",
    },
  });
});
