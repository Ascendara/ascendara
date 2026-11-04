const { test } = require("node:test");
const assert = require("node:assert/strict");

const { loadModule } = require("./helpers/loadModule.cjs");
const loadService = () =>
  loadModule("src/services/downloads/torboxService.js", { fresh: true });

test("TorBox host routing and cache", async t => {
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
  const key = "torboxSupportedHosts";
  const ttl = 24 * 60 * 60 * 1000;
  const storage = saved => {
    const values = new Map(saved ? [[key, saved]] : []);
    global.localStorage = {
      getItem: name => values.get(name) ?? null,
      setItem: (name, value) => values.set(name, value),
    };
    return values;
  };
  const payload = {
    success: true,
    data: [
      {
        name: "Display names can change",
        domains: ["rapidgator.net", "RG.TO"],
        status: true,
      },
      { name: "GoFile", domains: ["gofile.io"], status: true },
      { name: "MegaDB", domains: ["megadb.net", "megadb.xyz"], status: false },
    ],
  };

  await t.test(
    "public host list is flattened, shared, persisted and reused after restart",
    async () => {
      const values = storage();
      let calls = 0;
      global.fetch = async (url, options) => {
        calls++;
        assert.equal(url, "/api/torbox/webdl/hosters");
        assert.equal(options.headers?.Authorization, undefined);
        return Response.json(payload);
      };
      const tb = await loadService();
      await Promise.all(Array.from({ length: 20 }, () => tb.getSupportedHosts()));
      assert.equal(calls, 1);
      assert.deepEqual(tb.getCachedSupportedHosts(), [
        "rapidgator.net",
        "rg.to",
        "gofile.io",
        "megadb.net",
        "megadb.xyz",
      ]);
      assert.equal(JSON.parse(values.get(key)).fetchedAt, now);
      const reloaded = await loadService();
      await reloaded.getSupportedHosts();
      assert.equal(calls, 1);
    }
  );

  await t.test("URL matching replaces display-name and provider lists", async () => {
    storage();
    global.fetch = async () => Response.json(payload);
    const tb = await loadService();
    await tb.getSupportedHosts();
    for (const link of [
      "https://rg.to/file",
      "//cdn.rapidgator.net/file",
      "https://megadb.xyz/file",
    ]) {
      assert.equal(tb.isSupportedUrl(link), true);
    }
    for (const link of [
      "https://rg.to.evil.test/file",
      "https://evilrg.to/file",
      "https://evil.test/rg.to",
      "https://rg.to@evil.test/file",
      "ftp://rg.to/file",
      null,
    ]) {
      assert.equal(tb.isSupportedUrl(link), false);
    }
  });

  await t.test(
    "expired list refresh removes hosts and keeps services' cache keys separate",
    async () => {
      const values = storage(
        JSON.stringify({ domains: ["old.test"], fetchedAt: now - ttl })
      );
      const rdCache = JSON.stringify({ domains: ["rd-only.test"], fetchedAt: now });
      values.set("realDebridSupportedHosts", rdCache);
      global.fetch = async () => Response.json(payload);
      const tb = await loadService();
      assert.equal(tb.isSupportedUrl("https://old.test/file"), true);
      await tb.getSupportedHosts();
      assert.equal(tb.isSupportedUrl("https://old.test/file"), false);
      assert.equal(tb.isSupportedUrl("https://rg.to/file"), true);
      assert.equal(values.get("realDebridSupportedHosts"), rdCache);
    }
  );

  await t.test(
    "failed and malformed responses retain stale cache with retry backoff",
    async () => {
      for (const response of [
        () => Response.json({ success: false, data: [] }),
        () => Response.json({ success: true, data: [{ name: "Missing domains" }] }),
        () =>
          Response.json({
            success: true,
            data: [{ domains: ["https://invalid.test/path"] }],
          }),
        () => Response.json(payload, { status: 503 }),
      ]) {
        const saved = JSON.stringify({ domains: ["rg.to"], fetchedAt: now - ttl });
        const values = storage(saved);
        let calls = 0;
        global.fetch = async () => {
          calls++;
          return response();
        };
        const tb = await loadService();
        assert.deepEqual(await tb.getSupportedHosts(), ["rg.to"]);
        await tb.getSupportedHosts();
        assert.equal(calls, 1);
        assert.equal(values.get(key), saved);
        now += 5 * 60 * 1000;
        await tb.getSupportedHosts();
        assert.equal(calls, 2);
      }
    }
  );

  await t.test("internationalized domains match Unicode and punycode URLs", async () => {
    storage();
    global.fetch = async () =>
      Response.json({ success: true, data: [{ domains: ["файлообменник.рф"] }] });
    const tb = await loadService();
    await tb.getSupportedHosts();
    assert.equal(tb.isSupportedUrl("https://файлообменник.рф/file"), true);
    assert.equal(tb.isSupportedUrl(new URL("https://файлообменник.рф/file").href), true);
    assert.equal(tb.isSupportedUrl("https://файлообменник.рф.evil.test/file"), false);
  });

  await t.test("cold-start failure never enables unsupported routing", async () => {
    storage("{corrupt");
    global.fetch = async () => {
      throw new Error("offline");
    };
    const tb = await loadService();
    assert.deepEqual(await tb.getSupportedHosts(), []);
    assert.equal(tb.isSupportedUrl("https://1fichier.com/?file"), false);
  });

  await t.test(
    "submission rechecks support and never posts an unsupported URL",
    async () => {
      storage();
      const calls = [];
      global.fetch = async (url, options) => {
        calls.push(url);
        if (url.endsWith("/hosters")) return Response.json(payload);
        assert.equal(options.headers.Authorization, "Bearer secret");
        assert.equal(options.body.get("link"), "https://rg.to/file");
        return Response.json({ success: true, data: { webdownload_id: 123 } });
      };
      const tb = await loadService();
      await assert.rejects(
        tb.createPremiumDownloadLink("https://unknown.test/file", "secret"),
        error => error.code === "UNSUPPORTED_SITE"
      );
      assert.deepEqual(calls, ["/api/torbox/webdl/hosters"]);
      const result = await tb.createPremiumDownloadLink("https://rg.to/file", "secret");
      assert.equal(result.data.webdownload_id, 123);
      assert.deepEqual(calls, [
        "/api/torbox/webdl/hosters",
        "/api/torbox/webdl/createwebdownload",
      ]);
    }
  );
});
