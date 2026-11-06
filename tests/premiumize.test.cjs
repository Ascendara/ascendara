const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getProxyTarget } = require("../electron/modules/core/local-api-proxy");
const { loadModule } = require("./helpers/loadModule.cjs");

const load = () =>
  loadModule("src/services/downloads/premiumizeService.js", { fresh: true });
const loadProvider = () =>
  loadModule("src/services/downloads/debrid/premiumizeProvider.js", { fresh: true });
const ok = data => Response.json({ status: "success", ...data });
const fail = (code, message = code, status = 200) =>
  Response.json({ status: "error", code, message }, { status });

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

test("Premiumize proxy stays on the official API", () => {
  assert.equal(
    getProxyTarget("/api/premiumize/transfer/directdl").href,
    "https://www.premiumize.me/api/transfer/directdl"
  );
  assert.equal(getProxyTarget("/api/premiumize-evil/account/info"), null);
});

test("Premiumize sends the key as a bearer token and returns the account", async t => {
  const calls = stubFetch(t, () => ok({ customer_id: 7, premium_until: 4102444800 }));
  const pm = await load();
  const user = await pm.getUserInfo(" key ");
  assert.equal(user.customer_id, 7);
  assert.equal(calls[0].url, "/api/premiumize/account/info");
  assert.equal(calls[0].options.headers.Authorization, "Bearer key");
  const provider = (await loadProvider()).default;
  const details = provider.describeAccount(user, key => key);
  assert.equal(details.plan, "debrid.planPremium");
  assert.equal(details.expiresAt, 4102444800000);
  assert.deepEqual(
    provider.describeAccount({ ...user, limit_used: 0.256 }, key => key).stats,
    [{ label: "debrid.fairUse", value: "26%" }]
  );
  assert.equal(
    provider.describeAccount({ premium_until: 0 }, key => key).expiresAt,
    null
  );
});

test("Premiumize errors come from the body, even with HTTP 200", async t => {
  const pm = await load();
  const cases = [
    [fail("authentication_failed", "Not logged in."), /API key is invalid or expired/],
    [fail("service_unsupported"), /does not support this host/],
    [fail("rate_limit_reached"), /limiting requests/],
    [fail("something_new", "Something new"), /Premiumize: Something new/],
    [new Response("nope", { status: 401 }), /API key is invalid or expired/],
    [new Response("down", { status: 502 }), /request failed \(502\)/],
  ];
  for (const [response, message] of cases) {
    stubFetch(t, () => response.clone());
    await assert.rejects(pm.getUserInfo("key"), message);
  }
  await assert.rejects(pm.getUserInfo(" "), /API key is missing/);
});

test("Premiumize host list keeps direct-download services and their aliases", async t => {
  const calls = stubFetch(t, () =>
    ok({
      directdl: ["1fichier.com", "rapidrar.com", "notadomain"],
      queue: ["gofile.io"],
      aliases: { "rapidrar.com": ["rapidrar.com", "rapidrar.cr"] },
    })
  );
  const pm = await load();
  const hosts = await pm.getSupportedHosts();
  assert.deepEqual(hosts, ["1fichier.com", "rapidrar.com", "rapidrar.cr"]);
  assert.equal(calls[0].url, "/api/premiumize/services/list");
  assert.equal(calls[0].options.headers, undefined, "the host list is public");
  assert.equal(pm.isSupportedUrl("https://gofile.io/d/x", hosts), false);
});

test("Premiumize turns a host link into one direct download", async t => {
  const calls = stubFetch(t, () =>
    ok({ content: [{ path: "dir/game.rar", size: 5, link: "https://dl.pm/x" }] })
  );
  const pm = await load();
  const file = await pm.getDirectDownload("https://1fichier.com/?abc", "key");
  assert.equal(file.link, "https://dl.pm/x");
  assert.equal(calls[0].url, "/api/premiumize/transfer/directdl");
  assert.equal(calls[0].body.get("src"), "https://1fichier.com/?abc");

  stubFetch(t, () => ok({ content: [{ link: "https://a" }, { link: "https://b" }] }));
  await assert.rejects(pm.getDirectDownload("https://1fichier.com/?a", "key"), /several/);
  stubFetch(t, () => ok({ content: [] }));
  await assert.rejects(pm.getDirectDownload("https://1fichier.com/?a", "key"), /did not/);
  await assert.rejects(pm.getDirectDownload("ftp://host/file", "key"), /Invalid/);
});

test("Premiumize adds a magnet as a transfer", async t => {
  const calls = stubFetch(t, () => ok({ id: "tr1", name: "Game" }));
  const pm = await load();
  assert.equal(
    (await pm.createTorrentFromMagnet("magnet:?xt=urn:btih:a", "key")).id,
    "tr1"
  );
  assert.equal(calls[0].url, "/api/premiumize/transfer/create");
  assert.equal(calls[0].body.get("src"), "magnet:?xt=urn:btih:a");
  await assert.rejects(pm.createTorrentFromMagnet("https://x", "key"), /magnet link/);
});

test("a finished Premiumize transfer becomes its folder's files", async t => {
  stubFetch(t, url => {
    if (url === "/api/premiumize/transfer/list")
      return ok({
        transfers: [
          { id: "tr1", status: "finished", name: "Game", folder_id: "root" },
          { id: "tr2", status: "running", name: "Other" },
        ],
      });
    if (url === "/api/premiumize/folder/list?id=root")
      return ok({
        name: "root",
        content: [
          { id: "f1", type: "folder", name: "Game" },
          { id: "x", type: "file", name: "unrelated.zip", link: "https://dl/u" },
        ],
      });
    assert.equal(url, "/api/premiumize/folder/list?id=f1");
    return ok({
      name: "Game",
      content: [
        { id: "a", type: "file", name: "setup.exe", size: 3, link: "https://dl/a" },
      ],
    });
  });
  const provider = (await loadProvider()).default;
  assert.deepEqual(await provider.getTorrentDownload("key", "tr1"), [
    { url: "https://dl/a", filename: "Game/setup.exe", size: 3 },
  ]);
  assert.equal(await provider.getTorrentDownload("key", "tr2"), null);
  assert.equal(await provider.getTorrentDownload("key", "gone"), "missing");
});

test("a single-file Premiumize transfer uses its item link, a failed one reports why", async t => {
  stubFetch(t, url => {
    if (url === "/api/premiumize/transfer/list")
      return ok({
        transfers: [
          { id: "one", status: "seeding", name: "game.iso", file_id: "file 1" },
          { id: "bad", status: "error", message: "Not enough seeders" },
        ],
      });
    assert.equal(url, "/api/premiumize/item/details?id=file%201");
    return ok({ id: "file 1", name: "game.iso", size: 9, link: "https://dl/iso" });
  });
  const provider = (await loadProvider()).default;
  assert.deepEqual(await provider.getTorrentDownload("key", "one"), [
    { url: "https://dl/iso", filename: "game.iso", size: 9 },
  ]);
  await assert.rejects(provider.getTorrentDownload("key", "bad"), /Not enough seeders/);
});

test("Premiumize plugs into the debrid service for host links", async t => {
  stubFetch(t, url => {
    if (url.endsWith("/services/list")) return ok({ directdl: ["1fichier.com"] });
    return ok({ content: [{ link: "https://dl.pm/x" }] });
  });
  const { createDebridService } = await loadModule(
    "src/services/downloads/debridService.js",
    { fresh: true }
  );
  const provider = (await loadProvider()).default;
  const debrid = createDebridService([provider]);
  const settings = { debridEnabled: true, premiumizeApiKey: "key" };
  const result = await debrid.resolveHost(
    settings,
    "https://1fichier.com/?a",
    "1fichier"
  );
  assert.equal(result.url, "https://dl.pm/x");
  assert.equal(result.providerId, "premiumize");
  assert.equal(debrid.canUseCloudTorrents(settings), true);
});

test("a Premiumize folder that contains itself stops instead of looping", async t => {
  stubFetch(t, url => {
    if (url === "/api/premiumize/transfer/list")
      return ok({
        transfers: [{ id: "tr", status: "finished", name: "Loop", folder_id: "f" }],
      });
    return ok({ name: "Loop", content: [{ id: "f", type: "folder", name: "Loop" }] });
  });
  const provider = (await loadProvider()).default;
  await assert.rejects(provider.getTorrentDownload("key", "tr"), /loops/);
});

test("Premiumize keeps a record only for torrents, and comes after the existing services", async () => {
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
  const ids = debrid.getOrderedProviders({}).map(item => item.id);
  assert.deepEqual(ids.slice(0, 2), ["torbox", "realdebrid"]);
  assert.ok(ids.includes("premiumize"));
});

test("Premiumize torrent status for the in-cloud list", async t => {
  const provider = (await loadProvider()).default;
  assert.equal(provider.hasDownloadsPage, false);
  stubFetch(t, () => ok({ transfers: [{ id: "a", status: "running", progress: 0.42 }] }));
  assert.deepEqual(await provider.getTorrentStatus("key", "a"), {
    status: "downloading",
    progress: 42,
  });
});

const removal = async (t, transfer, folder) => {
  const calls = stubFetch(t, url => {
    if (url === "/api/premiumize/transfer/list") return ok({ transfers: [transfer] });
    if (url === "/api/premiumize/folder/list")
      return ok({ folder_id: "root", name: "root" });
    if (url.startsWith("/api/premiumize/folder/list?id=")) return ok(folder);
    return ok({});
  });
  const provider = (await loadProvider()).default;
  await provider.removeTorrent("key", transfer.id);
  return calls.filter(call => call.body).map(call => [call.url, call.body.get("id")]);
};

test("Premiumize removal deletes only what Premiumize ties to the transfer", async t => {
  const done = { id: "a", status: "finished", name: "Game" };
  assert.deepEqual(await removal(t, { ...done, file_id: "f" }), [
    ["/api/premiumize/item/delete", "f"],
    ["/api/premiumize/transfer/delete", "a"],
  ]);
  assert.deepEqual(await removal(t, { ...done, folder_id: "own" }, { name: "Game" }), [
    ["/api/premiumize/folder/delete", "own"],
    ["/api/premiumize/transfer/delete", "a"],
  ]);
  // Landed in a parent folder: a same-named entry there might be the user's own.
  const parent = { name: "root", content: [{ id: "g", type: "folder", name: "Game" }] };
  assert.deepEqual(await removal(t, { ...done, folder_id: "root" }, parent), [
    ["/api/premiumize/transfer/delete", "a"],
  ]);
  // The root folder is never deleted, even if its name matches.
  assert.deepEqual(
    await removal(t, { ...done, name: "root", folder_id: "root" }, parent),
    [["/api/premiumize/transfer/delete", "a"]]
  );
  assert.deepEqual(await removal(t, { id: "a", status: "running", folder_id: "own" }), [
    ["/api/premiumize/transfer/delete", "a"],
  ]);
});
