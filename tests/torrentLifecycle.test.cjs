const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("./helpers/loadModule.cjs");

const lifecycle = loadModule("src/services/downloads/torrentLifecycle.js");

const gameData = {
  online: true,
  dlc: false,
  category: ["Virtual Reality"],
  isUpdating: true,
  version: "1.2.3",
  imgID: "cover",
  size: "12 GB",
  gameID: "game-1",
  browserAssetGameId: 42,
  browserAssetLogoId: 7,
};

test("local torrent queue data preserves the exact resolved link", async () => {
  const { createLocalTorrentQueueData } = await lifecycle;

  for (const torrentLink of [
    "magnet:?xt=urn:btih:exact-link",
    "https://example.test/game.torrent?download=1#mirror",
  ]) {
    const queued = createLocalTorrentQueueData({
      torrentLink,
      gameName: "Example Game",
      gameData,
      dir: 2,
    });

    assert.equal(queued.url, torrentLink);
    assert.equal(queued.directUrl, torrentLink);
    assert.equal(queued.browserDirect, false);
    assert.equal(queued.debridProviderId, null);
    assert.equal(queued.debridLink, null);
    assert.equal(queued.additionalDirIndex, 2);
    assert.equal(queued.dir, 2);
    assert.equal(queued.isVr, true);
    assert.equal(queued.updateFlow, true);
  }
});

test("local torrent queue data rejects non-torrent URLs", async () => {
  const { createLocalTorrentQueueData } = await lifecycle;

  assert.throws(
    () =>
      createLocalTorrentQueueData({
        torrentLink: "https://example.test/game.zip",
        gameName: "Example Game",
        gameData,
        dir: 0,
      }),
    /requires a magnet or \.torrent URL/
  );
});
