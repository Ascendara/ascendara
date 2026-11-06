const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("./helpers/loadModule.cjs");
const service = loadModule("src/services/downloads/debridService.js");

test("the per-download picker lists default, each set-up service, then none", async () => {
  const debrid = await service;
  assert.deepEqual(debrid.getPickerOptions({}), ["default", "none"]);
  const settings = {
    debridEnabled: true,
    torboxApiKey: "tb",
    realDebridApiKey: "rd",
    debridProviderOrder: ["realdebrid", "torbox"],
  };
  assert.deepEqual(debrid.getPickerOptions(settings), [
    "default",
    "realdebrid",
    "torbox",
    "none",
  ]);
  assert.deepEqual(
    debrid.getPickerOptions({ ...settings, debridProviderEnabled: { torbox: false } }),
    ["default", "realdebrid", "none"]
  );
  assert.deepEqual(settings.debridProviderOrder, ["realdebrid", "torbox"]);
});

test("a picked service overrides the order for one host or magnet and flags what it can't take", async t => {
  const { createDebridService } = await service;
  const calls = [];
  const makeProvider = (id, domains, magnets = true) => ({
    id,
    name: id,
    apiKeySetting: `${id}Key`,
    torrentSetting: `${id}Torrents`,
    seamlessHosts: ["gofile"],
    downloadsPath: `/${id}`,
    metadataStorageKey: `${id}Data`,
    serializeMetadata: () => ({}),
    getSupportedHosts: async () => domains,
    isSupportedUrl: (link, hosts = domains) => hosts.includes(new URL(link).hostname),
    resolveHost: async () => {
      calls.push(`host:${id}`);
      return { id: "web", url: "https://cdn.test/file" };
    },
    ...(magnets && {
      submitMagnet: async () => {
        calls.push(`magnet:${id}`);
        return { id: "magnet" };
      },
    }),
  });
  const first = makeProvider("first", ["shared.test"]);
  const second = makeProvider("second", ["shared.test", "second.test"], false);
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
  const link = "https://shared.test/file";
  const pick = p => debrid.getPickedHostProvider(settings, p, "custom", link);
  assert.equal(pick("default").provider.id, "first");
  assert.equal(pick("default").supported, true);
  assert.equal(pick(undefined).provider.id, "first");
  assert.deepEqual(pick("none"), { provider: null, supported: true });
  assert.equal(pick("second").provider.id, "second");
  assert.equal(pick("second").supported, true);
  const unsupported = debrid.getPickedHostProvider(
    settings,
    "first",
    "custom",
    "https://second.test/file"
  );
  assert.equal(unsupported.provider.id, "first");
  assert.equal(unsupported.supported, false);
  assert.equal(
    debrid.getPickedHostProvider(settings, "first", "torrent", link).supported,
    false
  );
  assert.deepEqual(
    debrid.getPickedHostProvider({ ...settings, firstKey: "" }, "first", "custom", link),
    { provider: null, supported: false },
    "a service that isn't set up can't be picked"
  );
  // An explicit pick ignores the seamless-host skip the default order applies
  assert.equal(
    debrid.getPickedHostProvider(settings, "first", "gofile", link).supported,
    true
  );
  assert.equal(
    debrid.getPickedHostProvider(settings, "default", "gofile", link).provider,
    null
  );

  assert.equal(debrid.getPickedTorrentProvider(settings, "default").provider.id, "first");
  assert.deepEqual(debrid.getPickedTorrentProvider(settings, "none"), {
    provider: null,
    supported: true,
  });
  assert.equal(debrid.getPickedTorrentProvider(settings, "second").supported, false);
  assert.equal(
    debrid.getPickedTorrentProvider({ ...settings, firstTorrents: false }, "first")
      .supported,
    false
  );
  assert.equal(debrid.getPickedTorrentProvider(settings, "first").supported, true);

  const magnet = await debrid.submitMagnet(settings, "magnet:?xt=test", null, 0, "first");
  assert.equal(magnet.providerId, "first");
  await assert.rejects(
    debrid.submitMagnet(settings, "magnet:?xt=test", null, 0, "second"),
    /enabled for torrents/
  );
  const hosted = await debrid.resolveHost(settings, link, "custom", null, 0, "second");
  assert.equal(hosted.providerId, "second");
  assert.deepEqual(calls, ["magnet:first", "host:second"]);
  assert.deepEqual(settings.debridProviderOrder, ["first", "second"]);
});
