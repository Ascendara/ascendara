const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("./helpers/loadModule.cjs");

test("torrent link classification covers magnets and .torrent URLs", async () => {
  const { isMagnetLink, isTorrentFileUrl, isTorrentLink } = await loadModule(
    "src/services/downloads/torrentLink.js"
  );

  assert.equal(isMagnetLink("magnet:?xt=urn:btih:test"), true);
  assert.equal(isTorrentLink("magnet:?xt=urn:btih:test"), true);
  assert.equal(isTorrentFileUrl("https://example.test/files/game.torrent"), true);
  assert.equal(
    isTorrentFileUrl("https://example.test/files/game.torrent?download=1"),
    true
  );
  assert.equal(isTorrentLink("https://example.test/files/game.torrent#mirror"), true);
  assert.equal(isTorrentLink("https://example.test/files/game.zip"), false);
});

test("torrent routing prefers magnets only when cloud routing is requested", async () => {
  const { pickTorrentLink } = await loadModule(
    "src/services/downloads/torrentLink.js"
  );
  const links = [
    "https://example.test/game.torrent",
    "magnet:?xt=urn:btih:test",
  ];

  assert.equal(
    pickTorrentLink(links),
    "https://example.test/game.torrent",
    "local routing preserves source order"
  );
  assert.equal(
    pickTorrentLink(links, { preferMagnet: true }),
    "magnet:?xt=urn:btih:test",
    "cloud routing selects an available magnet"
  );
  assert.equal(
    pickTorrentLink(["https://example.test/game.torrent"], {
      preferMagnet: true,
    }),
    "https://example.test/game.torrent",
    "a raw .torrent remains available for local fallback"
  );
});

test("Hydra source mapping treats unlabeled .torrent URLs as torrent sources", async () => {
  const { hydraHostKey } = await loadModule("src/services/games/hydraSource.js");

  assert.equal(hydraHostKey("magnet:?xt=urn:btih:test"), "torrent");
  assert.equal(hydraHostKey("https://downloads.example.test/game.torrent"), "torrent");
  assert.equal(
    hydraHostKey("https://downloads.example.test/game.torrent?token=abc"),
    "torrent"
  );
  assert.equal(hydraHostKey("https://downloads.example.test/game.zip"), "example");
});
