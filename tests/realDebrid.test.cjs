const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getProxyTarget } = require("../electron/modules/core/local-api-proxy");

const { loadModule } = require("./helpers/loadModule.cjs");
const service = loadModule("src/services/downloads/realDebridService.js");

test("download history replaces stale conversion status with the torrent's current details", async t => {
  const rd = await service;
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async url => {
    if (String(url).startsWith("/api/realdebrid/torrents?"))
      return Response.json([{ id: "ready", status: "magnet_conversion", progress: 0 }]);
    if (String(url).startsWith("/api/realdebrid/downloads?")) return Response.json([]);
    assert.equal(url, "/api/realdebrid/torrents/info/ready");
    return Response.json({
      id: "ready",
      status: "downloaded",
      progress: 100,
      files: [{ id: 1, selected: 1 }],
    });
  };
  const items = await rd.getAllDownloads("key");
  assert.equal(items[0].status, "downloaded");
  assert.equal(items[0].progress, 100);
  assert.equal(items[0].type, "torrent");
});

test("Real-Debrid proxies stay on the official API", () => {
  assert.equal(
    getProxyTarget("/api/realdebrid/unrestrict/link").href,
    "https://api.real-debrid.com/rest/1.0/unrestrict/link"
  );
  assert.equal(
    getProxyTarget("/api/realdebrid/torrents?limit=100&page=2").href,
    "https://api.real-debrid.com/rest/1.0/torrents?limit=100&page=2"
  );
  assert.equal(getProxyTarget("/api/realdebrid-evil/user"), null);
});

test("supported hosts govern routing using the actual URL", async () => {
  const rd = await service;
  const domains = ["1fichier.com", "rapidgator.net", "rg.to"];
  for (const url of [
    "https://1fichier.com/?file",
    "//cdn.1fichier.com/file",
    "https://RG.TO/file",
    "http://rapidgator.net./file",
  ]) {
    assert.equal(rd.isSupportedUrl(url, domains), true, url);
  }
  for (const url of [
    "https://1fichier.com.evil.test/file",
    "https://evil1fichier.com/file",
    "https://evil.test/1fichier.com",
    "https://1fichier.com@evil.test/file",
    "https://user:pass@1fichier.com/file",
    "ftp://1fichier.com/file",
    "magnet:?xt=test",
    "not a URL",
    null,
  ]) {
    assert.equal(rd.isSupportedUrl(url, domains), false, String(url));
  }
});

test("supported host cache", async t => {
  const originalFetch = global.fetch;
  const originalStorage = global.localStorage;
  const originalNow = Date.now;
  let now = 1800000000000;
  Date.now = () => now;
  t.after(() => {
    global.fetch = originalFetch;
    Date.now = originalNow;
    if (originalStorage === undefined) delete global.localStorage;
    else global.localStorage = originalStorage;
  });
  const key = "realDebridSupportedHosts";
  const ttl = 24 * 60 * 60 * 1000;
  const freshService = () =>
    loadModule("src/services/downloads/realDebridService.js", { fresh: true });
  const storage = contents => {
    const values = new Map(contents ? [[key, contents]] : []);
    global.localStorage = {
      getItem: name => values.get(name) ?? null,
      setItem: (name, value) => values.set(name, value),
    };
    return values;
  };

  await t.test("one public request populates memory and persistent cache", async () => {
    const values = storage();
    let calls = 0;
    global.fetch = async (url, options) => {
      calls++;
      assert.equal(url, "/api/realdebrid/hosts/domains");
      assert.equal(options.headers?.Authorization, undefined);
      return Response.json(["1fichier.com", "RG.TO", "rg.to"]);
    };
    const rd = await freshService();
    const lists = await Promise.all(
      Array.from({ length: 20 }, () => rd.getSupportedHosts())
    );
    assert.equal(calls, 1);
    assert.deepEqual(lists[0], ["1fichier.com", "rg.to"]);
    assert.deepEqual(rd.getCachedSupportedHosts(), lists[0]);
    await rd.getSupportedHosts();
    assert.equal(calls, 1);
    assert.deepEqual(JSON.parse(values.get(key)), { domains: lists[0], fetchedAt: now });
    const reloaded = await freshService();
    assert.deepEqual(await reloaded.getSupportedHosts(), lists[0]);
    assert.equal(calls, 1, "fresh disk cache survives a renderer restart");
  });

  await t.test("expiry refreshes the list, including removed hosts", async () => {
    const values = storage(
      JSON.stringify({ domains: ["removed.test"], fetchedAt: now - ttl })
    );
    global.fetch = async () => Response.json(["new.test"]);
    const rd = await freshService();
    assert.deepEqual(rd.getCachedSupportedHosts(), ["removed.test"]);
    assert.deepEqual(await rd.getSupportedHosts(), ["new.test"]);
    assert.equal(rd.isSupportedUrl("https://removed.test/file"), false);
    assert.equal(rd.isSupportedUrl("https://new.test/file"), true);
    assert.equal(JSON.parse(values.get(key)).fetchedAt, now);
  });

  await t.test(
    "offline refresh preserves stale data and backs off for five minutes",
    async () => {
      const saved = JSON.stringify({ domains: ["1fichier.com"], fetchedAt: now - ttl });
      const values = storage(saved);
      let calls = 0;
      global.fetch = async () => {
        calls++;
        throw new Error("offline");
      };
      const rd = await freshService();
      assert.deepEqual(await rd.getSupportedHosts(), ["1fichier.com"]);
      assert.deepEqual(await rd.getSupportedHosts(), ["1fichier.com"]);
      assert.equal(calls, 1);
      assert.equal(values.get(key), saved, "failure must not extend the cache freshness");
      now += 5 * 60 * 1000;
      await rd.getSupportedHosts();
      assert.equal(calls, 2);
    }
  );

  await t.test(
    "corrupt cache and failed cold requests never assume host support",
    async () => {
      for (const contents of [
        "{broken",
        JSON.stringify({ domains: ["https://evil.test/path"], fetchedAt: now }),
        JSON.stringify({ domains: ["1fichier.com"], fetchedAt: now + ttl }),
      ]) {
        storage(contents);
        global.fetch = async () =>
          Response.json({ error: "unavailable" }, { status: 503 });
        const rd = await freshService();
        assert.deepEqual(await rd.getSupportedHosts(), []);
        assert.equal(rd.isSupportedUrl("https://1fichier.com/file"), false);
      }
    }
  );

  await t.test("invalid API payload leaves the last valid list intact", async () => {
    const saved = JSON.stringify({ domains: ["1fichier.com"], fetchedAt: now - ttl });
    const values = storage(saved);
    global.fetch = async () => Response.json(["1fichier.com", { domain: "evil.test" }]);
    const rd = await freshService();
    assert.deepEqual(await rd.getSupportedHosts(), ["1fichier.com"]);
    assert.equal(values.get(key), saved);
  });

  await t.test("blocked local storage still allows an in-memory cache", async () => {
    global.localStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    let calls = 0;
    global.fetch = async () => {
      calls++;
      return Response.json(["1fichier.com"]);
    };
    const rd = await freshService();
    await rd.getSupportedHosts();
    await rd.getSupportedHosts();
    assert.equal(calls, 1);
    assert.equal(rd.isSupportedUrl("https://1fichier.com/file"), true);
  });
});

test("Real-Debrid API contracts", async t => {
  const rd = await service;
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });

  await t.test(
    "unrestrict encodes host URLs and keeps credentials out of URLs",
    async () => {
      global.fetch = async (url, options) => {
        assert.equal(url, "/api/realdebrid/unrestrict/link");
        assert.equal(options.headers.Authorization, "Bearer secret");
        assert.equal(options.method, "POST");
        assert.equal(options.body.get("link"), "https://1fichier.com/?a&b=c");
        return Response.json({
          id: "web1",
          download: "https://download.example/archive.zip",
        });
      };
      assert.equal(
        (await rd.unrestrictLink("https://1fichier.com/?a&b=c", " secret ")).download,
        "https://download.example/archive.zip"
      );
      await assert.rejects(
        rd.unrestrictLink("file:///tmp/archive", "secret"),
        /Invalid download/
      );
    }
  );

  await t.test("magnet submission waits for metadata before file selection", async () => {
    const calls = [];
    global.fetch = async (url, options) => {
      calls.push(url);
      assert.equal(options.body.get("magnet"), "magnet:?xt=urn:btih:test&dn=Test");
      return Response.json({ id: "torrent1" }, { status: 201 });
    };
    assert.equal(
      (await rd.createTorrentFromMagnet("magnet:?xt=urn:btih:test&dn=Test", "secret")).id,
      "torrent1"
    );
    assert.deepEqual(calls, ["/api/realdebrid/torrents/addMagnet"]);
    await assert.rejects(
      rd.createTorrentFromMagnet("https://example.com/file.torrent", "secret"),
      /magnet link/
    );
  });

  await t.test(
    "file selection and deletion accept empty successful responses",
    async () => {
      global.fetch = async (url, options) => {
        if (url.includes("selectFiles")) {
          assert.equal(options.body.get("files"), "all");
          assert.equal(options.method, "POST");
        } else {
          assert.equal(url, "/api/realdebrid/torrents/delete/same-id");
          assert.equal(options.method, "DELETE");
        }
        return new Response(null, { status: 204 });
      };
      assert.equal(await rd.selectFiles("secret", "same-id"), null);
      assert.equal(
        await rd.deleteDownload("secret", { type: "torrent", id: "same-id" }),
        null
      );
    }
  );

  await t.test("API errors and invalid download responses are surfaced", async () => {
    global.fetch = async () =>
      Response.json({ error: "bad_token", error_code: 8 }, { status: 401 });
    await assert.rejects(rd.getUserInfo("secret"), /invalid or expired/);
    global.fetch = async () =>
      Response.json({ error: "hoster_unsupported", error_code: 16 }, { status: 503 });
    await assert.rejects(
      rd.unrestrictLink("https://example.com/file", "secret"),
      error => error.code === 16 && /hoster_unsupported/.test(error.message)
    );
    global.fetch = async () => Response.json({ download: "javascript:alert(1)" });
    await assert.rejects(
      rd.unrestrictLink("https://example.com/file", "secret"),
      /download URL/
    );
  });

  await t.test(
    "history pagination preserves colliding torrent and download IDs",
    async () => {
      global.fetch = async url => {
        if (url.includes("/torrents?"))
          return Response.json([{ id: "same-id", status: "downloaded" }]);
        if (url.endsWith("page=1"))
          return Response.json(
            Array.from({ length: 100 }, (_, index) => ({
              id: index === 0 ? "same-id" : `web${index}`,
            }))
          );
        assert.ok(url.endsWith("page=2"));
        return Response.json([{ id: "last" }]);
      };
      const items = await rd.getAllDownloads("secret");
      assert.equal(items.length, 102);
      assert.equal(items[0].type, "torrent");
      assert.equal(items[1].type, "download");
      assert.equal(items.at(-1).id, "last");
    }
  );
});
