const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("./helpers/loadModule.cjs");

const capability = loadModule("src/services/downloads/torrentCapability.js");

test("local torrent capability depends only on the Ascendara torrent toggle", async () => {
  const { localTorrentEnabled, canDownloadTorrentLinks } = await capability;

  assert.equal(localTorrentEnabled({}), false);

  const local = { torrentEnabled: true };
  assert.equal(localTorrentEnabled(local), true);

  const legacyQbitSettings = {
    torrentEnabled: true,
    torrentHost: "203.0.113.1",
    torrentPort: 1,
    torrentUsername: "unused",
    torrentPassword: "unused",
  };
  assert.equal(
    canDownloadTorrentLinks(["https://example.test/game.torrent"], legacyQbitSettings),
    true,
    "legacy qBittorrent connection settings must not gate the built-in client"
  );
});

test("torrent source links accept magnets and .torrent URLs", async () => {
  const { canDownloadTorrentLinks } = await capability;
  const local = { torrentEnabled: true };

  assert.equal(canDownloadTorrentLinks(["magnet:?xt=urn:btih:test"], local), true);
  assert.equal(
    canDownloadTorrentLinks(["https://example.test/game.torrent"], local),
    true
  );
  assert.equal(
    canDownloadTorrentLinks(["https://example.test/game.torrent?download=1"], local),
    true
  );
  assert.equal(canDownloadTorrentLinks(["https://example.test/game.zip"], local), false);
  assert.equal(canDownloadTorrentLinks(["https://example.test/game.torrent"], {}), false);

  const cloudOnly = {
    debridEnabled: true,
    torboxApiKey: "tb",
    torrentEnabled: false,
  };
  assert.equal(
    canDownloadTorrentLinks(["magnet:?xt=urn:btih:test"], cloudOnly),
    true,
    "cloud torrent providers can handle magnets without local torrenting"
  );
  assert.equal(
    canDownloadTorrentLinks(["https://example.test/game.torrent"], cloudOnly),
    false,
    "raw .torrent URLs still require the local built-in client"
  );
});

test("synced torrent-only sources persist link-level cloud coverage", async () => {
  const { analyzeTorrentSource, withTorrentSourceCapabilities, canUseTorrentOnlySource } =
    await capability;

  const rawOnlyGames = [
    { download_links: { torrent: ["https://example.test/a.torrent"] } },
    { download_links: { torrent: ["https://example.test/b.torrent#mirror"] } },
  ];
  assert.deepEqual(analyzeTorrentSource(rawOnlyGames), {
    known: true,
    torrentOnly: true,
    hasMagnet: false,
    hasTorrentFile: true,
    cloudCompatible: false,
  });

  const rawOnlySource = withTorrentSourceCapabilities(
    { name: "Raw torrent source", torrentOnly: true },
    rawOnlyGames
  );
  assert.deepEqual(rawOnlySource.torrentSupport, {
    hasMagnet: false,
    hasTorrentFile: true,
    cloudCompatible: false,
  });

  const cloudOnly = {
    debridEnabled: true,
    torboxApiKey: "tb",
    torrentEnabled: false,
  };
  assert.equal(canUseTorrentOnlySource(rawOnlySource, cloudOnly), false);
  assert.equal(
    canUseTorrentOnlySource(rawOnlySource, { ...cloudOnly, torrentEnabled: true }),
    true
  );
  const legacyUnknownSource = { name: "Legacy source", torrentOnly: true };
  assert.equal(
    canUseTorrentOnlySource(legacyUnknownSource, cloudOnly),
    false,
    "saved sources without a link summary must not assume cloud compatibility"
  );
  assert.equal(
    canUseTorrentOnlySource(legacyUnknownSource, cloudOnly, {
      allowUnknownCloud: true,
    }),
    true,
    "metadata-only source browsing may temporarily allow cloud so the source can sync"
  );

  const magnetGames = [
    { download_links: { torrent: ["magnet:?xt=urn:btih:a"] } },
    {
      download_links: {
        torrent: ["https://example.test/b.torrent", "magnet:?xt=urn:btih:b"],
      },
    },
  ];
  const magnetSource = withTorrentSourceCapabilities(
    { name: "Magnet-compatible source", torrentOnly: true },
    magnetGames
  );
  assert.equal(magnetSource.torrentSupport.cloudCompatible, true);
  assert.equal(magnetSource.torrentSupport.hasMagnet, true);
  assert.equal(magnetSource.torrentSupport.hasTorrentFile, true);
  assert.equal(canUseTorrentOnlySource(magnetSource, cloudOnly), true);

  const partiallyCloudCovered = withTorrentSourceCapabilities(
    { name: "Mixed torrent source", torrentOnly: true },
    [
      { download_links: { torrent: ["magnet:?xt=urn:btih:a"] } },
      { download_links: { torrent: ["https://example.test/b.torrent"] } },
    ]
  );
  assert.equal(
    partiallyCloudCovered.torrentSupport.cloudCompatible,
    false,
    "cloud coverage must include every torrent-only game before local torrenting can be disabled"
  );

  const sourceWithDirectLinks = withTorrentSourceCapabilities(
    { name: "Mixed source", torrentOnly: true },
    [
      {
        download_links: {
          torrent: ["https://example.test/a.torrent"],
          gofile: ["https://gofile.io/d/example"],
        },
      },
    ]
  );
  assert.equal(sourceWithDirectLinks.torrentOnly, undefined);
  assert.equal(sourceWithDirectLinks.torrentSupport, null);
});

test("cloud torrent capability remains independent from local torrenting", async () => {
  const { localTorrentEnabled, canDownloadTorrentLinks } = await capability;

  const torbox = {
    debridEnabled: true,
    torboxApiKey: "tb",
    torrentEnabled: false,
  };
  assert.equal(localTorrentEnabled(torbox), false);
  assert.equal(canDownloadTorrentLinks(["magnet:?xt=urn:btih:torbox"], torbox), true);

  const realDebrid = {
    debridEnabled: true,
    realDebridApiKey: "rd",
    torrentEnabled: false,
  };
  assert.equal(canDownloadTorrentLinks(["magnet:?xt=urn:btih:rd"], realDebrid), true);

  assert.equal(
    canDownloadTorrentLinks(["magnet:?xt=urn:btih:rd"], {
      ...realDebrid,
      useRealDebridForTorrents: false,
    }),
    false
  );
});
