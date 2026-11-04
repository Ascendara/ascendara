const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("./helpers/loadModule.cjs");

test("stale torrent lists must not prevent ready files from being selected", async t => {
  const originalFetch = global.fetch;
  const originalStorage = global.localStorage;
  let stored = JSON.stringify({
    "torrent:stale-list": { game: "Example", autoStartPending: true },
  });
  let selections = 0;
  global.localStorage = {
    getItem: () => stored,
    setItem: (_key, value) => {
      stored = value;
    },
  };
  global.fetch = async url => {
    if (String(url).startsWith("/api/realdebrid/torrents?"))
      return Response.json([{ id: "stale-list", status: "magnet_conversion" }]);
    if (url === "/api/realdebrid/torrents/info/stale-list")
      return Response.json({
        id: "stale-list",
        status: "waiting_files_selection",
        files: [{ id: 1, selected: 0 }],
      });
    assert.equal(url, "/api/realdebrid/torrents/selectFiles/stale-list");
    selections++;
    return new Response(null, { status: 204 });
  };
  t.after(() => {
    global.fetch = originalFetch;
    if (originalStorage === undefined) delete global.localStorage;
    else global.localStorage = originalStorage;
  });
  const worker = await loadModule("src/services/downloads/realDebridTorrentStartup.js", {
    fresh: true,
  });
  await worker.resumePendingTorrents("key");
  assert.equal(
    selections,
    1,
    "the detail endpoint is ready even though the torrent list is stale"
  );
});

test("submitting a Real-Debrid magnet selects ready files without mounting its downloads page", async t => {
  const debrid = await loadModule("src/services/downloads/debridService.js");
  const originalFetch = global.fetch;
  const originalStorage = global.localStorage;
  const storage = new Map();
  const selected = [];
  global.localStorage = {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
  };
  global.fetch = async (url, options) => {
    if (url === "/api/realdebrid/torrents/addMagnet")
      return Response.json({ id: "new-torrent" }, { status: 201 });
    if (url === "/api/realdebrid/torrents/info/new-torrent")
      return Response.json({ id: "new-torrent", status: "waiting_files_selection" });
    if (url === "/api/realdebrid/torrents/selectFiles/new-torrent") {
      assert.equal(options.method, "POST");
      assert.equal(options.body.get("files"), "all");
      selected.push("new-torrent");
      return new Response(null, { status: 204 });
    }
    assert.fail(`Unexpected endpoint ${url}`);
  };
  t.after(() => {
    global.fetch = originalFetch;
    if (originalStorage === undefined) delete global.localStorage;
    else global.localStorage = originalStorage;
  });
  await debrid.submitMagnet(
    { debridEnabled: true, realDebridApiKey: "rd" },
    "magnet:?xt=urn:btih:test",
    { game: "Example" }
  );
  await new Promise(setImmediate);
  assert.deepEqual(
    selected,
    ["new-torrent"],
    "Ascendara must select files to start the cloud torrent without a website confirmation"
  );
});

test("metadata conversion resumes after restart and only starts Ascendara's torrents", async t => {
  const originalFetch = global.fetch;
  const originalStorage = global.localStorage;
  let stored = JSON.stringify({
    "torrent:converting": { game: "Example", autoStartPending: true },
    "torrent:legacy": { game: "Previously added" },
    "torrent:running": { game: "Already running" },
    "download:web": { game: "Hosted link" },
  });
  global.localStorage = {
    getItem: () => stored,
    setItem: (_key, value) => {
      stored = value;
    },
  };
  let status = "magnet_conversion";
  let lists = 0;
  const selected = [];
  global.fetch = async url => {
    if (String(url).startsWith("/api/realdebrid/torrents/info/")) {
      lists++;
      const id = url.split("/").pop();
      const statuses = {
        converting: status,
        legacy: "waiting_files_selection",
        running: "downloading",
      };
      assert.ok(id in statuses, "must not inspect unrelated torrents");
      return Response.json({ id, status: statuses[id] });
    }
    if (url.startsWith("/api/realdebrid/torrents/selectFiles/")) {
      selected.push(url.split("/").pop());
      return new Response(null, { status: 204 });
    }
    assert.fail(`Unexpected endpoint ${url}`);
  };
  t.after(() => {
    global.fetch = originalFetch;
    if (originalStorage === undefined) delete global.localStorage;
    else global.localStorage = originalStorage;
  });
  const beforeRestart = await loadModule(
    "src/services/downloads/realDebridTorrentStartup.js",
    { fresh: true }
  );
  await beforeRestart.resumePendingTorrents("key");
  assert.deepEqual(selected, ["legacy"]);
  assert.equal(JSON.parse(stored)["torrent:converting"].autoStartPending, true);
  assert.equal(JSON.parse(stored)["torrent:running"].autoStartPending, false);
  status = "waiting_files_selection";
  const afterRestart = await loadModule(
    "src/services/downloads/realDebridTorrentStartup.js",
    { fresh: true }
  );
  await afterRestart.resumePendingTorrents("key");
  assert.deepEqual(selected, ["legacy", "converting"]);
  assert.equal(JSON.parse(stored)["torrent:converting"].autoStartPending, false);
  await afterRestart.resumePendingTorrents("key");
  assert.equal(lists, 4, "completed startup jobs must stop polling the account");
});

test("concurrent startup checks share one selection and failed selections retry without adding a torrent", async t => {
  const originalFetch = global.fetch;
  const originalStorage = global.localStorage;
  let stored = JSON.stringify({
    "torrent:pending": { game: "Example", autoStartPending: true },
  });
  global.localStorage = {
    getItem: () => stored,
    setItem: (_key, value) => {
      stored = value;
    },
  };
  let lists = 0;
  let selections = 0;
  let failSelection = true;
  global.fetch = async url => {
    if (url === "/api/realdebrid/torrents/info/pending") {
      lists++;
      return Response.json({ id: "pending", status: "waiting_files_selection" });
    }
    assert.equal(
      url,
      "/api/realdebrid/torrents/selectFiles/pending",
      "must retry file selection, never addMagnet"
    );
    selections++;
    return failSelection
      ? Response.json({ error: "service_unavailable" }, { status: 503 })
      : new Response(null, { status: 204 });
  };
  t.after(() => {
    global.fetch = originalFetch;
    if (originalStorage === undefined) delete global.localStorage;
    else global.localStorage = originalStorage;
  });
  const worker = await loadModule("src/services/downloads/realDebridTorrentStartup.js", {
    fresh: true,
  });
  const first = worker.resumePendingTorrents("key");
  const second = worker.resumePendingTorrents("key");
  await assert.rejects(Promise.all([first, second]), /service_unavailable/);
  assert.equal(lists, 1);
  assert.equal(selections, 1);
  assert.equal(JSON.parse(stored)["torrent:pending"].autoStartPending, true);
  failSelection = false;
  await worker.resumePendingTorrents("key");
  assert.equal(selections, 2);
  assert.equal(JSON.parse(stored)["torrent:pending"].autoStartPending, false);
});

test("background startup respects the master switch, service toggle and torrent toggle", async () => {
  const { createDebridService } = await loadModule(
    "src/services/downloads/debridService.js"
  );
  const calls = [];
  const debrid = createDebridService([
    {
      id: "test",
      apiKeySetting: "key",
      torrentSetting: "magnets",
      resumePendingTorrents: async key => calls.push(key),
    },
  ]);
  await debrid.resumePendingTorrents({ key: "token" });
  await debrid.resumePendingTorrents({
    debridEnabled: true,
    key: "token",
    magnets: false,
  });
  await debrid.resumePendingTorrents({
    debridEnabled: true,
    key: "token",
    debridProviderEnabled: { test: false },
  });
  assert.deepEqual(calls, []);
  await debrid.resumePendingTorrents({ debridEnabled: true, key: "token" });
  assert.deepEqual(calls, ["token"]);
});

test("a deleted pending torrent stops polling without selecting files", async t => {
  const originalFetch = global.fetch;
  const originalStorage = global.localStorage;
  let stored = JSON.stringify({
    "torrent:removed": { game: "Example", autoStartPending: true },
  });
  let calls = 0;
  global.localStorage = {
    getItem: () => stored,
    setItem: (_key, value) => {
      stored = value;
    },
  };
  global.fetch = async url => {
    calls++;
    assert.equal(url, "/api/realdebrid/torrents/info/removed");
    return Response.json({ error: "unknown_resource" }, { status: 404 });
  };
  t.after(() => {
    global.fetch = originalFetch;
    if (originalStorage === undefined) delete global.localStorage;
    else global.localStorage = originalStorage;
  });
  const worker = await loadModule("src/services/downloads/realDebridTorrentStartup.js", {
    fresh: true,
  });
  await worker.resumePendingTorrents("key");
  await worker.resumePendingTorrents("key");
  assert.equal(calls, 1);
  assert.equal(JSON.parse(stored)["torrent:removed"].autoStartPending, false);
});
