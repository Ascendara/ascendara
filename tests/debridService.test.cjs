const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("./helpers/loadModule.cjs");
const service = loadModule("src/services/downloads/debridService.js");

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
