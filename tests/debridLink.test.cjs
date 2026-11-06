const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getProxyTarget } = require("../electron/modules/core/local-api-proxy");
const { loadModule } = require("./helpers/loadModule.cjs");

const load = () =>
  loadModule("src/services/downloads/debridLinkService.js", { fresh: true });
const loadProvider = () =>
  loadModule("src/services/downloads/debrid/debridLinkProvider.js", { fresh: true });
const ok = value => Response.json({ success: true, value });
const fail = (error, status = 400, description) =>
  Response.json({ success: false, error, error_description: description }, { status });

function stubFetch(t, handler) {
  const originalFetch = global.fetch;
  const originalStorage = global.localStorage;
  const values = new Map();
  global.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
  const calls = [];
  global.fetch = async (url, options = {}) => {
    const body = options.body ? new URLSearchParams(options.body) : null;
    calls.push({ url: String(url), options, body });
    return handler(String(url), options, body);
  };
  t.after(() => {
    global.fetch = originalFetch;
    global.localStorage = originalStorage;
  });
  return calls;
}

test("Debrid-Link proxy stays on the official API", () => {
  assert.equal(
    getProxyTarget("/api/debridlink/downloader/add").href,
    "https://debrid-link.com/api/v2/downloader/add"
  );
  assert.equal(getProxyTarget("/api/debridlink-evil/account/infos"), null);
});

test("Debrid-Link sends the key as a bearer token and returns the account", async t => {
  const calls = stubFetch(t, () =>
    ok({ username: "me", accountType: 1, premiumLeft: 86400, pts: 12 })
  );
  const dl = await load();
  const user = await dl.getUserInfo(" key ");
  assert.equal(user.username, "me");
  assert.equal(calls[0].url, "/api/debridlink/account/infos");
  assert.equal(calls[0].options.headers.Authorization, "Bearer key");
  const provider = (await loadProvider()).default;
  const details = provider.describeAccount(user, key => key);
  assert.equal(details.plan, "debrid.planPremium");
  assert.ok(details.expiresAt > Date.now());
  assert.deepEqual(details.stats, [{ label: "debrid.points", value: 12 }]);
  const lifetime = provider.describeAccount(
    { username: "me", accountType: 2 },
    key => key
  );
  assert.equal(lifetime.expiresAt, null);
  assert.equal(lifetime.expiryNote, "debrid.lifetime");
  assert.equal(details.expiryNote, null);
});

test("Debrid-Link errors come from the body, including 200 answers", async t => {
  const dl = await load();
  const cases = [
    [fail("badToken", 401), /API key is invalid or expired/],
    [fail("hostNotValid"), /does not support this host/],
    [fail("floodDetected", 429), /limiting requests/],
    [fail("somethingNew", 400, "Something new."), /Debrid-Link: Something new\./],
    [Response.json({ success: false, error: "maxLink" }), /limit for this host/],
    [new Response("nope", { status: 401 }), /API key is invalid or expired/],
    [new Response("down", { status: 502 }), /request failed \(502\)/],
  ];
  for (const [response, message] of cases) {
    stubFetch(t, () => response.clone());
    await assert.rejects(dl.getUserInfo("key"), message);
  }
  await assert.rejects(dl.getUserInfo(""), /API key is missing/);
});

test("Debrid-Link host list is the public domain list", async t => {
  const calls = stubFetch(t, () =>
    ok([
      { domains: ["1fichier.com", "Alterupload.com"] },
      { domains: ["rapidgator.net"], status: 1 },
      { domains: ["down.example"], status: 0 },
      { name: "no domains" },
    ])
  );
  const dl = await load();
  const hosts = await dl.getSupportedHosts();
  assert.deepEqual(hosts, ["1fichier.com", "alterupload.com", "rapidgator.net"]);
  assert.equal(
    calls[0].url,
    "/api/debridlink/downloader/hosts?types=host&keys=domains,status"
  );
  assert.equal(calls[0].options.headers, undefined, "the host list is public");
  assert.equal(dl.isSupportedUrl("https://rapidgator.net/file/1", hosts), true);
});

test("Debrid-Link unlocks a link, waiting while it is processed", async t => {
  const calls = stubFetch(t, (url, _options, body) => {
    if (url.endsWith("/downloader/add")) {
      assert.equal(body.get("url"), "https://1fichier.com/?abc");
      return ok({ id: "l1", name: "game.rar" });
    }
    assert.equal(url, "/api/debridlink/downloader/list?ids=l1");
    return calls.length < 3
      ? ok([{ id: "l1" }])
      : ok([{ id: "l1", name: "game.rar", downloadUrl: "https://dl/x" }]);
  });
  const dl = await load();
  const waits = [];
  const added = await dl.addLink("https://1fichier.com/?abc", "key", async ms => {
    waits.push(ms);
  });
  assert.equal(added.downloadUrl, "https://dl/x");
  assert.deepEqual(waits, [5000, 5000]);

  stubFetch(t, () => ok([{ id: "a" }, { id: "b" }]));
  await assert.rejects(dl.addLink("https://1fichier.com/?a", "key"), /several files/);
  stubFetch(t, () => ok({}));
  await assert.rejects(dl.addLink("https://1fichier.com/?a", "key"), /did not return/);
  await assert.rejects(dl.addLink("ftp://host/file", "key"), /Invalid download link/);
});

test("Debrid-Link adds a magnet to the seedbox", async t => {
  const calls = stubFetch(t, () => ok({ id: "t1", name: "Game" }));
  const dl = await load();
  assert.equal(
    (await dl.createTorrentFromMagnet("magnet:?xt=urn:btih:a", "key")).id,
    "t1"
  );
  assert.equal(calls[0].url, "/api/debridlink/seedbox/add");
  assert.equal(calls[0].body.get("url"), "magnet:?xt=urn:btih:a");
  stubFetch(t, () => fail("maxTorrent"));
  await assert.rejects(
    dl.createTorrentFromMagnet("magnet:?xt=urn:btih:a", "key"),
    /limit of new torrents/
  );
  await assert.rejects(dl.createTorrentFromMagnet("https://x", "key"), /magnet link/);
});

test("Debrid-Link torrents hand off once every file is at 100 percent", async t => {
  const provider = (await loadProvider()).default;
  const files = [
    { name: "setup.exe", size: 3, downloadPercent: 100, downloadUrl: "https://dl/a" },
    { name: "data.bin", size: 4, downloadPercent: 40, downloadUrl: "https://dl/b" },
  ];
  const calls = stubFetch(t, () => ok([{ id: "t1", files }]));
  assert.equal(await provider.getTorrentDownload("key", "t1"), null);
  assert.equal(calls[0].url, "/api/debridlink/seedbox/list?ids=t1&structureType=tree");
  files[1].downloadPercent = 100;
  assert.deepEqual(await provider.getTorrentDownload("key", "t1"), [
    { url: "https://dl/a", filename: "setup.exe", size: 3 },
    { url: "https://dl/b", filename: "data.bin", size: 4 },
  ]);
  stubFetch(t, () => ok([]));
  assert.equal(await provider.getTorrentDownload("key", "t1"), "missing");
  stubFetch(t, () => fail("badId"));
  assert.equal(await provider.getTorrentDownload("key", "t1"), "missing");
});

test("Debrid-Link plugs into the debrid service for host links", async t => {
  stubFetch(t, url => {
    if (url.includes("/downloader/hosts")) return ok([{ domains: ["1fichier.com"] }]);
    return ok({ id: "l1", downloadUrl: "https://dl.debrid-link.com/x" });
  });
  const { createDebridService } = await loadModule(
    "src/services/downloads/debridService.js",
    { fresh: true }
  );
  const provider = (await loadProvider()).default;
  const debrid = createDebridService([provider]);
  const settings = { debridEnabled: true, debridLinkApiKey: "key" };
  const result = await debrid.resolveHost(
    settings,
    "https://1fichier.com/?a",
    "1fichier"
  );
  assert.equal(result.url, "https://dl.debrid-link.com/x");
  assert.equal(result.providerId, "debridlink");
  assert.equal(debrid.canUseCloudTorrents(settings), true);
});

test("Debrid-Link torrent files keep their folders", async t => {
  stubFetch(t, () =>
    ok([
      {
        id: "t2",
        files: [
          {
            type: "folder",
            name: "Game",
            files: [
              {
                type: "file",
                name: "readme.txt",
                downloadPercent: 100,
                downloadUrl: "https://dl/1",
              },
              {
                type: "folder",
                name: "Extras",
                files: [
                  {
                    type: "file",
                    name: "readme.txt",
                    downloadPercent: 100,
                    downloadUrl: "https://dl/2",
                  },
                ],
              },
            ],
          },
        ],
      },
    ])
  );
  const provider = (await loadProvider()).default;
  const files = await provider.getTorrentDownload("key", "t2");
  assert.deepEqual(
    files.map(file => file.filename),
    ["Game/readme.txt", "Game/Extras/readme.txt"]
  );
});

test("Debrid-Link waits while a link is still processing", async t => {
  const calls = stubFetch(t, url =>
    url.endsWith("/downloader/add")
      ? ok({ id: "l2", isProcessing: true, downloadUrl: "https://dl/early" })
      : ok([
          { id: "l2", isProcessing: calls.length < 3, downloadUrl: "https://dl/ready" },
        ])
  );
  const dl = await load();
  const added = await dl.addLink("https://1fichier.com/?a", "key", async () => {});
  assert.equal(added.downloadUrl, "https://dl/ready");
  assert.equal(calls.length, 3);
});

test("Debrid-Link keeps a record only for torrents", async () => {
  const provider = (await loadProvider()).default;
  const save = kind =>
    provider.serializeMetadata({
      result: { id: 3 },
      kind,
      game: { game: "G" },
      directory: 0,
    });
  assert.deepEqual(save("download"), {});
  assert.equal(save("torrent")["torrent:3"].autoHandoff, true);
  const debrid = await loadModule("src/services/downloads/debridService.js", {
    fresh: true,
  });
  assert.ok(debrid.getOrderedProviders({}).some(item => item.id === "debridlink"));
});

test("Debrid-Link torrent status and removal for the in-cloud list", async t => {
  const provider = (await loadProvider()).default;
  assert.equal(provider.hasDownloadsPage, false);
  stubFetch(t, () =>
    ok([
      {
        id: "t",
        status: 4,
        downloadPercent: 61.4,
        files: [{ name: "a", downloadPercent: 61 }],
      },
    ])
  );
  assert.deepEqual(await provider.getTorrentStatus("key", "t"), {
    status: "downloading",
    progress: 61,
  });
  const calls = stubFetch(t, () => ok(["t"]));
  await provider.removeTorrent("key", "t");
  assert.equal(calls[0].url, "/api/debridlink/seedbox/t/remove");
  assert.equal(calls[0].options.method, "DELETE");
});

test("removing a Debrid-Link torrent that is already gone is not an error", async t => {
  const provider = (await loadProvider()).default;
  assert.equal(provider.removeAfterDoneSetting, "debridLinkRemoveAfterDone");
  stubFetch(t, () => fail("badId"));
  await provider.removeTorrent("key", "t");
  stubFetch(t, () => fail("badToken", 401));
  await assert.rejects(provider.removeTorrent("key", "t"), /API key is invalid/);
});
