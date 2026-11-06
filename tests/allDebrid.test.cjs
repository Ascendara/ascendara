const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getProxyTarget } = require("../electron/modules/core/local-api-proxy");
const { loadModule } = require("./helpers/loadModule.cjs");

const load = () =>
  loadModule("src/services/downloads/allDebridService.js", { fresh: true });
const loadProvider = () =>
  loadModule("src/services/downloads/debrid/allDebridProvider.js", { fresh: true });
const ok = data => Response.json({ status: "success", data });
const fail = (code, message = code, status = 200) =>
  Response.json({ status: "error", error: { code, message } }, { status });

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

test("AllDebrid proxy stays on the official API", () => {
  assert.equal(
    getProxyTarget("/api/alldebrid/v4/link/unlock").href,
    "https://api.alldebrid.com/v4/link/unlock"
  );
  assert.equal(getProxyTarget("/api/alldebrid-evil/v4/user"), null);
});

test("AllDebrid sends the key as a bearer token and returns the account", async t => {
  const calls = stubFetch(t, () => ok({ user: { username: "me", isPremium: true } }));
  const ad = await load();
  const user = await ad.getUserInfo(" key ");
  assert.equal(user.username, "me");
  assert.equal(calls[0].url, "/api/alldebrid/v4/user");
  assert.equal(calls[0].options.headers.Authorization, "Bearer key");
});

test("AllDebrid errors come from the body, even with HTTP 200", async t => {
  const ad = await load();
  const cases = [
    [fail("AUTH_BAD_APIKEY"), /API key is invalid or expired/],
    [fail("AUTH_BLOCKED"), /blocked this location/],
    [fail("LINK_HOST_NOT_SUPPORTED"), /does not support this host/],
    [fail("SOMETHING_NEW", "Something new"), /AllDebrid: Something new/],
    [new Response("nope", { status: 401 }), /API key is invalid or expired/],
    [new Response("busy", { status: 429 }), /limiting requests/],
    [Response.json({ status: "success" }, { status: 500 }), /request failed \(500\)/],
  ];
  for (const [response, message] of cases) {
    stubFetch(t, () => response.clone());
    await assert.rejects(ad.getUserInfo("key"), message);
  }
  await assert.rejects(ad.getUserInfo(""), /API key is missing/);
});

test("AllDebrid host list is the public domain list", async t => {
  const calls = stubFetch(t, () =>
    ok({ hosts: ["1fichier.com", "Rapidgator.net"], streams: ["youtube.com"] })
  );
  const ad = await load();
  const hosts = await ad.getSupportedHosts();
  assert.deepEqual(hosts, ["1fichier.com", "rapidgator.net"]);
  assert.equal(calls[0].url, "/api/alldebrid/v4/hosts/domains");
  assert.equal(ad.isSupportedUrl("https://rapidgator.net/file/1", hosts), true);
  assert.equal(ad.isSupportedUrl("https://youtube.com/watch", hosts), false);
});

test("AllDebrid unlocks a link, waiting on a delayed one", async t => {
  const calls = stubFetch(t, (url, _options, body) => {
    if (url.endsWith("/v4/link/unlock")) {
      assert.equal(body.get("link"), "https://1fichier.com/?abc");
      return ok({ id: "u1", link: "", delayed: 77, filename: "game.rar" });
    }
    assert.equal(url, "/api/alldebrid/v4/link/delayed");
    assert.equal(body.get("id"), "77");
    return calls.length < 3 ? ok({ status: 1 }) : ok({ status: 2, link: "https://dl/x" });
  });
  const ad = await load();
  const waits = [];
  const result = await ad.unlockLink("https://1fichier.com/?abc", "key", async ms => {
    waits.push(ms);
  });
  assert.equal(result.link, "https://dl/x");
  assert.equal(result.filename, "game.rar");
  assert.deepEqual(waits, [5000, 5000]);

  stubFetch(t, url => (url.endsWith("/unlock") ? ok({ delayed: 1 }) : ok({ status: 3 })));
  await assert.rejects(
    ad.unlockLink("https://1fichier.com/?abc", "key", async () => {}),
    /could not prepare/
  );
  await assert.rejects(ad.unlockLink("ftp://host/file", "key"), /Invalid download link/);
});

test("AllDebrid adds a magnet and reports a per-magnet error", async t => {
  const calls = stubFetch(t, () => ok({ magnets: [{ id: 42, ready: false }] }));
  const ad = await load();
  const added = await ad.createTorrentFromMagnet("magnet:?xt=urn:btih:abc", "key");
  assert.equal(added.id, 42);
  assert.equal(calls[0].url, "/api/alldebrid/v4/magnet/upload");
  assert.equal(calls[0].body.get("magnets[]"), "magnet:?xt=urn:btih:abc");

  stubFetch(t, () =>
    ok({ magnets: [{ error: { code: "MAGNET_INVALID_URI", message: "bad" } }] })
  );
  await assert.rejects(
    ad.createTorrentFromMagnet("magnet:?xt=urn:btih:abc", "key"),
    /could not read this magnet/
  );
  await assert.rejects(ad.createTorrentFromMagnet("https://x", "key"), /magnet link/);
});

test("a finished AllDebrid torrent becomes unlocked local files", async t => {
  stubFetch(t, (url, _options, body) => {
    if (url.endsWith("/v4.1/magnet/status")) {
      assert.equal(body.get("id"), "42");
      return ok({ magnets: { id: 42, statusCode: 4, status: "Ready" } });
    }
    if (url.endsWith("/v4/magnet/files")) {
      assert.equal(body.get("id[]"), "42");
      return ok({
        magnets: [
          {
            id: "42",
            files: [
              {
                n: "Game",
                e: [{ n: "setup.exe", s: 10, l: "https://alldebrid.com/f/1" }],
              },
              { n: "readme.txt", s: 2, l: "https://alldebrid.com/f/2" },
            ],
          },
        ],
      });
    }
    assert.equal(url, "/api/alldebrid/v4/link/unlock");
    return ok({ link: `${body.get("link")}/direct`, filesize: 11 });
  });
  const provider = (await loadProvider()).default;
  assert.deepEqual(await provider.getTorrentDownload("key", "42"), [
    { url: "https://alldebrid.com/f/1/direct", filename: "Game/setup.exe", size: 11 },
    { url: "https://alldebrid.com/f/2/direct", filename: "readme.txt", size: 11 },
  ]);
});

test("AllDebrid torrent states map to wait, missing and failure", async t => {
  const provider = (await loadProvider()).default;
  stubFetch(t, () => ok({ magnets: { id: 1, statusCode: 1, status: "Downloading" } }));
  assert.equal(await provider.getTorrentDownload("key", "1"), null);
  stubFetch(t, () => fail("MAGNET_INVALID_ID"));
  assert.equal(await provider.getTorrentDownload("key", "1"), "missing");
  stubFetch(t, () =>
    ok({ magnets: { id: 1, statusCode: 7, status: "Download took too long" } })
  );
  await assert.rejects(provider.getTorrentDownload("key", "1"), /took too long/);
});

test("AllDebrid plugs into the debrid service for host links", async t => {
  stubFetch(t, url => {
    if (url.endsWith("/v4/hosts/domains")) return ok({ hosts: ["1fichier.com"] });
    return ok({ id: "u1", link: "https://dl.alldebrid.com/x", filename: "g.rar" });
  });
  const { createDebridService } = await loadModule(
    "src/services/downloads/debridService.js",
    { fresh: true }
  );
  const provider = (await loadProvider()).default;
  const debrid = createDebridService([provider]);
  const settings = { debridEnabled: true, allDebridApiKey: "key" };
  const hosts = await debrid.getSupportedHosts(settings);
  assert.equal(
    debrid.getHostProvider(settings, "1fichier", "https://1fichier.com/?a", hosts).id,
    "alldebrid"
  );
  const result = await debrid.resolveHost(
    settings,
    "https://1fichier.com/?a",
    "1fichier"
  );
  assert.equal(result.url, "https://dl.alldebrid.com/x");
  assert.equal(result.providerId, "alldebrid");
  assert.equal(debrid.canUseCloudTorrents(settings), true);
});

test("AllDebrid uses the file tree from the magnet status when it is there", async t => {
  const calls = stubFetch(t, (url, _options, body) => {
    if (url.endsWith("/v4.1/magnet/status"))
      return ok({
        magnets: {
          id: 5,
          statusCode: 4,
          files: [{ n: "game.iso", s: 4, l: "https://alldebrid.com/f/9" }],
        },
      });
    return ok({ link: `${body.get("link")}/direct`, filesize: 4 });
  });
  const provider = (await loadProvider()).default;
  assert.deepEqual(await provider.getTorrentDownload("key", "5"), [
    { url: "https://alldebrid.com/f/9/direct", filename: "game.iso", size: 4 },
  ]);
  assert.equal(calls.filter(call => call.url.endsWith("/magnet/files")).length, 0);
});

test("AllDebrid keeps a record only for torrents, and comes after the existing services", async () => {
  const provider = (await loadProvider()).default;
  const game = { game: "Game" };
  const save = kind =>
    provider.serializeMetadata({ result: { id: 3 }, kind, game, directory: 1 });
  assert.deepEqual(save("download"), {});
  assert.deepEqual(save("torrent"), {
    "torrent:3": { game: "Game", additionalDirIndex: 1, autoHandoff: true },
  });
  const debrid = await loadModule("src/services/downloads/debridService.js", {
    fresh: true,
  });
  const ids = debrid.getOrderedProviders({}).map(item => item.id);
  assert.deepEqual(ids.slice(0, 3), ["torbox", "realdebrid", "alldebrid"]);
});

test("AllDebrid torrent status and removal for the in-cloud list", async t => {
  const provider = (await loadProvider()).default;
  assert.equal(provider.hasDownloadsPage, false);
  stubFetch(t, () =>
    ok({
      magnets: { id: 1, statusCode: 1, size: 200, downloaded: 50, status: "Downloading" },
    })
  );
  assert.deepEqual(await provider.getTorrentStatus("key", "1"), {
    status: "downloading",
    progress: 25,
  });
  stubFetch(t, () => ok({ magnets: { id: 1, statusCode: 8, status: "Too many files" } }));
  assert.deepEqual(await provider.getTorrentStatus("key", "1"), {
    status: "failed",
    message: "Too many files",
  });
  const calls = stubFetch(t, () => ok({ message: "Magnet was successfully deleted" }));
  await provider.removeTorrent("key", "1");
  assert.equal(calls[0].url, "/api/alldebrid/v4/magnet/delete");
  assert.equal(calls[0].body.get("id"), "1");
});
