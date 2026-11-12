const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  TORRENT_DISABLED_MESSAGE,
  isMagnetLink,
  isTorrentFileUrl,
  isTorrentLink,
  canStartLocalTorrent,
  assertLocalTorrentEnabled,
} = require("../electron/modules/downloads/torrentLink");

test("main-process torrent classification matches renderer semantics", () => {
  assert.equal(isMagnetLink("magnet:?xt=urn:btih:test"), true);
  assert.equal(isTorrentLink("magnet:?xt=urn:btih:test"), true);
  assert.equal(isTorrentFileUrl("https://example.test/game.torrent"), true);
  assert.equal(
    isTorrentFileUrl("https://example.test/game.torrent?download=1"),
    true
  );
  assert.equal(
    isTorrentFileUrl("https://example.test/game.torrent#mirror"),
    true
  );
  assert.equal(
    isTorrentFileUrl("https://example.test/game.torrent?download=1#mirror"),
    true
  );
  assert.equal(isTorrentLink("https://example.test/game.zip#torrent"), false);
});

test("local torrent execution requires the current main-process opt-in", () => {
  for (const link of [
    "magnet:?xt=urn:btih:test",
    "https://example.test/game.torrent",
    "https://example.test/game.torrent?download=1#mirror",
  ]) {
    assert.equal(canStartLocalTorrent({ torrentEnabled: false }, link), false);
    assert.equal(canStartLocalTorrent({ torrentEnabled: true }, link), true);
    assert.throws(
      () => assertLocalTorrentEnabled({ torrentEnabled: false }, link),
      error =>
        error?.code === "TORRENT_DISABLED" &&
        error?.message === TORRENT_DISABLED_MESSAGE
    );
  }

  assert.equal(
    canStartLocalTorrent({ torrentEnabled: false }, "https://example.test/game.zip"),
    true,
    "the torrent opt-in must not block ordinary downloads"
  );
});

test("start, queued start, retry and resume share main-process torrent authority", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../electron/modules/downloads/downloads.js"),
    "utf8"
  );
  const queueSource = fs.readFileSync(
    path.join(__dirname, "../src/services/downloads/downloadQueueService.js"),
    "utf8"
  );

  assert.match(
    source,
    /const \{[\s\S]*isTorrentLink,[\s\S]*assertLocalTorrentEnabled,[\s\S]*\} = require\("\.\/torrentLink"\);/
  );
  assert.match(source, /assertLocalTorrentEnabled\(settings, link\);/);
  assert.match(source, /assertLocalTorrentEnabled\(settings, downloadLink\);/);
  assert.equal(
    (source.match(/assertLocalTorrentEnabled\(settings, link\);/g) || []).length,
    2,
    "fresh starts and retries must both enforce the same local torrent opt-in"
  );
  assert.match(
    queueSource,
    /window\.electron\.downloadFile\(\s*url,/,
    "queued execution must enter the guarded download-file handler"
  );
  assert.match(source, /const torrentLink = isTorrentLink\(link\);/);
  assert.match(source, /const torrentDownload = isTorrentLink\(downloadLink\);/);
  assert.doesNotMatch(source, /split\("\?"\)\[0\]\.endsWith\("\.torrent"\)/);
  assert.doesNotMatch(source, /\.torrent\(\?:\\\?\|\$\)/);
});
