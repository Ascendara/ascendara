const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("./helpers/loadModule.cjs");
const service = loadModule("src/services/downloads/debridService.js");

test("debrid is off by default and disabling it retains configuration without routing requests", async () => {
  const debrid = await service;
  const saved = {
    torboxApiKey: "tb",
    realDebridApiKey: "rd",
    debridProviderOrder: ["realdebrid", "torbox"],
  };
  for (const settings of [saved, { ...saved, debridEnabled: false }]) {
    assert.deepEqual(debrid.getConfiguredProviders(settings), []);
    assert.equal(debrid.getTorrentProvider(settings), null);
    assert.equal(debrid.canDownloadTorrents(settings), false);
    assert.equal(
      debrid.canUseForHost(settings, "custom", "https://1fichier.com/file"),
      false
    );
    assert.deepEqual(await debrid.getSupportedHosts(settings), {});
    await assert.rejects(
      debrid.resolveHost(
        settings,
        "https://1fichier.com/file",
        "custom",
        null,
        0,
        "torbox"
      ),
      /disabled/
    );
  }
  assert.equal(
    debrid.getPreferredProvider({ ...saved, debridEnabled: true }).id,
    "realdebrid"
  );
  assert.equal(debrid.canDownloadTorrents({ ...saved, torrentEnabled: true }), true);
  assert.deepEqual(saved.debridProviderOrder, ["realdebrid", "torbox"]);
  assert.equal(saved.torboxApiKey, "tb");
});

test("registered providers select one configured service and expose its capabilities", async () => {
  const debrid = await service;
  assert.equal(debrid.getPreferredProvider({}), null);
  assert.equal(
    debrid.getPreferredProvider({ debridEnabled: true, torboxApiKey: " " }),
    null
  );
  assert.equal(
    debrid.getPreferredProvider({ debridEnabled: true, realDebridApiKey: "rd" }).id,
    "realdebrid"
  );
  assert.equal(
    debrid.getPreferredProvider({
      debridEnabled: true,
      realDebridApiKey: "rd",
      torboxApiKey: "tb",
    }).id,
    "torbox"
  );
  const preferred = {
    debridEnabled: true,
    realDebridApiKey: "rd",
    torboxApiKey: "tb",
    debridProvider: "realdebrid",
    debridProviderOrder: ["realdebrid", "torbox"],
  };
  assert.equal(debrid.getPreferredProvider(preferred).id, "realdebrid");
  assert.equal(debrid.canUseCloudTorrents(preferred), true);
  assert.equal(
    debrid.canUseCloudTorrents({ ...preferred, useRealDebridForTorrents: false }),
    true
  );
  assert.equal(
    debrid.canDownloadTorrents({
      ...preferred,
      useRealDebridForTorrents: false,
      torrentEnabled: true,
    }),
    true
  );
  assert.equal(
    debrid.allowsTorrentFallback({
      debridEnabled: true,
      torboxApiKey: "tb",
      fallbackToQbittorrentOnTorboxFailure: true,
    }),
    true
  );
  assert.equal(
    debrid.allowsTorrentFallback({
      ...preferred,
      fallbackToQbittorrentOnTorboxFailure: true,
    }),
    false
  );
});

test("host routing applies the chosen adapter's seamless preference and URL support", async () => {
  const debrid = await service;
  const domains = {
    torbox: ["gofile.io", "1fichier.com", "megadb.net"],
    realdebrid: ["gofile.io", "1fichier.com", "megadb.net"],
  };
  for (const settings of [
    { debridEnabled: true, torboxApiKey: "tb" },
    { debridEnabled: true, realDebridApiKey: "rd" },
  ]) {
    assert.equal(
      debrid.canUseForHost(settings, "custom-host", "https://1fichier.com/file", domains),
      true
    );
    assert.equal(
      debrid.canUseForHost(
        settings,
        "1fichier",
        "https://1fichier.com.evil.test/file",
        domains
      ),
      false
    );
    assert.equal(
      debrid.canUseForHost(settings, "gofile", "https://gofile.io/file", domains),
      false
    );
    const provider = debrid.getPreferredProvider(settings);
    assert.equal(
      debrid.canUseForHost(
        { ...settings, [provider.prioritizeSetting]: true },
        "gofile",
        "https://gofile.io/file",
        domains
      ),
      true
    );
    assert.equal(
      debrid.canUseForHost(settings, "direct", "https://1fichier.com/file", domains),
      false
    );
    assert.equal(
      debrid.canUseForHost(settings, "torrent", "https://1fichier.com/file", domains),
      false
    );
  }
  assert.equal(
    debrid.canUseForHost(
      { debridEnabled: true, torboxApiKey: "tb" },
      "megadb",
      "https://megadb.net/file",
      domains
    ),
    true
  );
  assert.equal(
    debrid.canUseForHost(
      { debridEnabled: true, realDebridApiKey: "rd" },
      "megadb",
      "https://megadb.net/file",
      domains
    ),
    false
  );
});

test("a third adapter works through the same interface without provider-specific branches", async t => {
  const { createDebridService } = await service;
  const storage = new Map();
  const originalStorage = global.localStorage;
  global.localStorage = {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
  };
  t.after(() => {
    if (originalStorage === undefined) delete global.localStorage;
    else global.localStorage = originalStorage;
  });
  const calls = [];
  const provider = {
    id: "third",
    name: "Third Provider",
    apiKeySetting: "thirdKey",
    torrentSetting: "thirdTorrents",
    prioritizeSetting: "thirdPriority",
    seamlessHosts: ["gofile"],
    downloadsPath: "/third-downloads",
    metadataStorageKey: "thirdMetadata",
    getSupportedHosts: async () => ["third.test"],
    isSupportedUrl: (url, domains = ["third.test"]) =>
      domains.includes(new URL(url).hostname),
    submitMagnet: async (link, apiKey, game) => {
      calls.push({ link, apiKey, game });
      return { id: "magnet1" };
    },
    resolveHost: async (link, apiKey) => {
      calls.push({ link, apiKey });
      return { id: "web1", status: "ready", url: "https://cdn.third.test/file.zip" };
    },
    serializeMetadata: ({ result, game, directory }) => ({
      [result.id]: { game, directory },
    }),
  };
  const debrid = createDebridService([provider]);
  const settings = { debridEnabled: true, thirdKey: " token ", debridProvider: "third" };
  const game = { game: "Example", isUpdating: true, gameID: "game1" };
  assert.equal(debrid.canDownloadTorrents(settings), true);
  assert.equal(debrid.canUseForHost(settings, "custom", "https://third.test/file"), true);
  assert.equal(debrid.canUseCloudTorrents({ ...settings, thirdTorrents: false }), false);
  const torrent = await debrid.submitMagnet(settings, "magnet:?xt=test", game, 2);
  assert.equal(torrent.downloadsPath, "/third-downloads");
  assert.equal(calls[0].apiKey, "token");
  const web = await debrid.resolveHost(settings, "//third.test/file", "custom", game, 2);
  assert.equal(web.url, "https://cdn.third.test/file.zip");
  assert.equal(calls[1].link, "https://third.test/file");
  assert.deepEqual(JSON.parse(storage.get("thirdMetadata")), {
    magnet1: { game, directory: 2 },
    web1: { game, directory: 2 },
  });
  await assert.rejects(
    debrid.resolveHost(settings, "https://unknown.test/file", "custom", game),
    /supports this URL/
  );
  assert.equal(calls.length, 2, "unsupported URLs must not reach the adapter");
  await assert.rejects(
    debrid.submitMagnet({ ...settings, thirdTorrents: false }, "magnet:?xt=test", game),
    /enabled for torrents/
  );
});

test("real adapters retain their API contracts and existing download metadata", async t => {
  const debrid = await service;
  const originalFetch = global.fetch;
  const originalStorage = global.localStorage;
  const storage = new Map();
  global.localStorage = {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
  };
  t.after(() => {
    global.fetch = originalFetch;
    if (originalStorage === undefined) delete global.localStorage;
    else global.localStorage = originalStorage;
  });
  global.fetch = async (url, options) => {
    const route = String(url);
    if (route === "/api/realdebrid/torrents/info/rd-torrent")
      return Response.json({ id: "rd-torrent", status: "magnet_conversion" });
    if (route.startsWith("/api/realdebrid/torrents?"))
      return Response.json([{ id: "rd-torrent", status: "magnet_conversion" }]);
    if (route === "/api/realdebrid/hosts/domains") return Response.json(["files.test"]);
    if (route === "/api/torbox/webdl/hosters")
      return Response.json({ success: true, data: [{ domains: ["files.test"] }] });
    assert.ok(options.headers.Authorization.startsWith("Bearer "));
    if (route === "/api/realdebrid/unrestrict/link")
      return Response.json({ id: "rd-web", download: "https://cdn.test/game.zip" });
    if (route === "/api/realdebrid/torrents/addMagnet")
      return Response.json({ id: "rd-torrent" }, { status: 201 });
    if (route === "/api/torbox/torrents/createtorrent")
      return Response.json({ success: true, data: { torrent_id: 42 } });
    if (route === "/api/torbox/webdl/createwebdownload")
      return Response.json({ success: true, data: { webdownload_id: 10 } });
    if (route === "https://app.test/api/torbox/webdl/mylist")
      return Response.json({
        success: true,
        data: [{ id: 10, download_state: "cached" }],
      });
    assert.fail(`Unexpected endpoint ${route}`);
  };
  const originalWindow = global.window;
  global.window = { location: { origin: "https://app.test" } };
  t.after(() => {
    if (originalWindow === undefined) delete global.window;
    else global.window = originalWindow;
  });
  const game = {
    game: "Example",
    version: "v1",
    isUpdating: true,
    gameID: "game1",
    category: ["Virtual Reality"],
  };
  await debrid.submitMagnet(
    { debridEnabled: true, realDebridApiKey: "rd" },
    "magnet:?xt=test",
    game,
    2
  );
  await debrid.submitMagnet(
    { debridEnabled: true, torboxApiKey: "tb" },
    "magnet:?xt=test",
    game,
    2
  );
  // Queue entries pin their original provider, even after the user's preference changes.
  const ready = await debrid.resolveHost(
    { debridEnabled: true, realDebridApiKey: "rd", torboxApiKey: "tb" },
    "https://files.test/file",
    "custom",
    game,
    2,
    "realdebrid"
  );
  assert.equal(ready.url, "https://cdn.test/game.zip");
  const cloud = await debrid.resolveHost(
    { debridEnabled: true, torboxApiKey: "tb" },
    "https://files.test/file",
    "custom",
    game,
    2
  );
  assert.equal(cloud.url, null);
  assert.equal(cloud.status, "ready");
  assert.equal(cloud.downloadsPath, "/torboxdownloads");
  await debrid.resumePendingTorrents({ debridEnabled: true, realDebridApiKey: "rd" });
  const rd = JSON.parse(storage.get("realDebridGameData"));
  assert.equal(rd["torrent:rd-torrent"].additionalDirIndex, 2);
  assert.equal(rd["torrent:rd-torrent"].autoHandoff, true);
  assert.equal(rd["download:rd-web"].isUpdating, true);
  const tb = JSON.parse(storage.get("torboxGameNames"));
  assert.equal(tb["torrent:42"].gameData.gameID, "game1");
  assert.equal(tb["torrent:42"].gameData.vr, true);
  assert.equal(tb["torrent:42"].autoHandoff, true);
  assert.equal(tb[10].gameData.isUpdating, true);
  assert.equal(tb[10].originalUrl, "https://files.test/file");
});

test("TorBox is first by default while saved orders and account availability are respected", async () => {
  const debrid = await service;
  const settings = {
    debridEnabled: true,
    torboxApiKey: "tb",
    realDebridApiKey: "rd",
    debridProvider: "realdebrid",
  };
  assert.deepEqual(
    debrid
      .getOrderedProviders(settings)
      .map(provider => provider.id)
      .slice(0, 2),
    ["torbox", "realdebrid"]
  );
  assert.equal(debrid.getPreferredProvider(settings).id, "torbox");
  assert.deepEqual(
    debrid
      .getOrderedProviders({ ...settings, debridProviderOrder: [] })
      .map(provider => provider.id)
      .slice(0, 2),
    ["torbox", "realdebrid"]
  );
  const custom = { ...settings, debridProviderOrder: ["realdebrid", "torbox"] };
  assert.deepEqual(
    debrid
      .getOrderedProviders(custom)
      .map(provider => provider.id)
      .slice(0, 2),
    ["realdebrid", "torbox"]
  );
  assert.equal(debrid.getPreferredProvider(custom).id, "realdebrid");
  const ordered = { ...settings, debridProviderOrder: ["missing", "torbox", "torbox"] };
  assert.deepEqual(
    debrid
      .getOrderedProviders(ordered)
      .map(provider => provider.id)
      .slice(0, 2),
    ["torbox", "realdebrid"]
  );
  assert.equal(debrid.getPreferredProvider(ordered).id, "torbox");
  assert.equal(
    debrid.getPreferredProvider({ ...ordered, debridProviderEnabled: { torbox: false } })
      .id,
    "realdebrid"
  );
  assert.equal(
    debrid.getPreferredProvider({ debridEnabled: true, ...ordered, torboxApiKey: "" }).id,
    "realdebrid"
  );
  assert.equal(
    debrid.getPreferredProvider({
      ...ordered,
      debridProviderEnabled: { torbox: false, realdebrid: false },
    }),
    null
  );
});

test("priority chooses the first compatible host or magnet handler without retrying failed submissions", async t => {
  const { createDebridService } = await service;
  const calls = [];
  const makeProvider = (id, domains) => ({
    id,
    name: id,
    apiKeySetting: `${id}Key`,
    torrentSetting: `${id}Torrents`,
    prioritizeSetting: `${id}Priority`,
    downloadsPath: `/${id}`,
    metadataStorageKey: `${id}Data`,
    serializeMetadata: () => ({}),
    getSupportedHosts: async () => domains,
    getCachedSupportedHosts: () => domains,
    isSupportedUrl: (link, hosts = domains) => hosts.includes(new URL(link).hostname),
    resolveHost: async () => {
      calls.push(id);
      return { id: "web", url: "https://cdn.test/file" };
    },
    submitMagnet: async () => {
      calls.push(id);
      return { id: "magnet" };
    },
  });
  const first = makeProvider("first", ["shared.test"]);
  const second = makeProvider("second", ["shared.test", "second.test"]);
  const debrid = createDebridService([first, second]);
  const originalStorage = global.localStorage;
  global.localStorage = { getItem: () => "{}", setItem: () => {} };
  t.after(() => {
    if (originalStorage === undefined) delete global.localStorage;
    else global.localStorage = originalStorage;
  });
  const settings = {
    debridEnabled: true,
    firstKey: "one",
    secondKey: "two",
    debridProviderOrder: ["first", "second"],
  };
  assert.equal(
    debrid.getHostProvider(settings, "custom", "https://shared.test/file").id,
    "first"
  );
  assert.equal(
    debrid.getHostProvider(
      { ...settings, debridProviderOrder: ["second", "first"] },
      "custom",
      "https://shared.test/file"
    ).id,
    "second"
  );
  const hosted = await debrid.resolveHost(settings, "https://second.test/file", "custom");
  assert.equal(hosted.providerId, "second");
  assert.deepEqual(calls, ["second"]);
  assert.equal(
    debrid.getTorrentProvider({ ...settings, firstTorrents: false }).id,
    "second"
  );
  const magnet = await debrid.submitMagnet(
    { ...settings, firstTorrents: false },
    "magnet:?xt=test",
    { game: "Example" }
  );
  assert.equal(magnet.providerId, "second");
  first.resolveHost = async () => {
    calls.push("first-failed");
    throw new Error("offline");
  };
  await assert.rejects(
    debrid.resolveHost(settings, "https://shared.test/file", "custom"),
    /offline/
  );
  assert.deepEqual(
    calls,
    ["second", "second", "first-failed"],
    "an API failure must not create another submission on a lower-priority account"
  );
});

test("removing finished torrents is opt-in per service", async t => {
  const saved = { window: global.window, localStorage: global.localStorage };
  t.after(() => Object.assign(global, saved));
  const records = {
    "torrent:x": { game: "G", autoHandoff: true, localDownloadStarted: true },
  };
  global.localStorage = {
    getItem: () => JSON.stringify(records),
    setItem: () => {},
  };
  global.window = { electron: { getGames: async () => [{ game: "G" }] } };
  const { createDebridService } = await loadModule(
    "src/services/downloads/debridService.js",
    {
      fresh: true,
    }
  );
  const removed = [];
  const provider = {
    id: "test",
    name: "Test",
    apiKeySetting: "testKey",
    torrentSetting: "useTest",
    removeAfterDoneSetting: "testRemoveAfterDone",
    metadataStorageKey: "testData",
    getTorrentGame: entry => entry,
    getTorrentDownload: async () => null,
    removeTorrent: async (_key, id) => removed.push(id),
  };
  const debrid = createDebridService([provider]);
  const settings = { debridEnabled: true, testKey: "k" };
  await debrid.resumePendingTorrents(settings);
  assert.deepEqual(removed, []);
  await debrid.resumePendingTorrents({ ...settings, testRemoveAfterDone: true });
  assert.deepEqual(removed, ["x"]);
});
