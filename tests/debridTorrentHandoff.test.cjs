const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("./helpers/loadModule.cjs");

const realNow = Date.now;

test("Real-Debrid may package several selected torrent files into one archive link", async t => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async url =>
    url.includes("/torrents/info/")
      ? Response.json({
          status: "downloaded",
          files: [
            { selected: 1, path: "/setup.exe", bytes: 10 },
            { selected: 1, path: "/data.bin", bytes: 20 },
          ],
          links: ["https://real-debrid.com/d/archive"],
        })
      : Response.json({
          download: "https://cdn.example/archive.rar",
          filename: "Example.rar",
          filesize: 35,
        });
  const { default: provider } = await loadModule(
    "src/services/downloads/debrid/realDebridProvider.js"
  );
  assert.deepEqual(await provider.getTorrentDownload("key", "ready"), [
    { url: "https://cdn.example/archive.rar", filename: "Example.rar", size: 35 },
  ]);
});

test("TorBox completed torrents provide a ZIP to the shared handoff", async t => {
  const saved = { fetch: global.fetch, window: global.window };
  t.after(() => Object.assign(global, saved));
  global.window = { location: { origin: "http://localhost:5173" } };
  let finished = true;
  let state = "uploading";
  global.fetch = async raw => {
    const url = new URL(raw);
    if (url.pathname.endsWith("/webdl/mylist"))
      return Response.json({ success: true, data: [] });
    if (url.pathname.endsWith("/torrents/mylist")) {
      assert.equal(url.searchParams.get("bypass_cache"), "true");
      assert.ok(url.searchParams.get("id"));
      return Response.json({
        success: true,
        data: [
          {
            id: 5,
            download_state: state,
            download_finished: finished,
            download_present: true,
          },
        ],
      });
    }
    assert.ok(url.pathname.endsWith("/torrents/requestdl"));
    assert.equal(url.searchParams.get("zip_link"), "true");
    assert.equal(url.searchParams.get("torrent_id"), "5");
    return Response.json({ success: true, data: "https://cdn.example/torrent.zip" });
  };
  const { default: provider } = await loadModule(
    "src/services/downloads/debrid/torboxProvider.js"
  );
  assert.deepEqual(await provider.getTorrentDownload("key", "5"), [
    { url: "https://cdn.example/torrent.zip", filename: "torrent.zip", size: null },
  ]);
  assert.equal(await provider.getTorrentDownload("key", "unknown"), "missing");
  finished = false;
  state = "completed";
  assert.equal(
    await provider.getTorrentDownload("key", "5"),
    null,
    "completion labels must not override unfinished torrent data"
  );
});

test("completed Ascendara torrents hand all files to one local download, once", async t => {
  const saved = {
    fetch: global.fetch,
    window: global.window,
    localStorage: global.localStorage,
  };
  const storage = new Map([
    [
      "realDebridGameData",
      JSON.stringify({
        "torrent:ready": {
          game: "Example",
          additionalDirIndex: 2,
          autoStartPending: false,
          autoHandoff: true,
        },
      }),
    ],
  ]);
  global.localStorage = {
    getItem: k => storage.get(k) || null,
    setItem: (k, v) => storage.set(k, v),
  };
  const calls = [];
  global.window = {
    electron: {
      getGames: async () => [],
      downloadFile: async (...args) => {
        calls.push(args);
        return { success: true };
      },
    },
  };
  global.fetch = async (url, options) => {
    if (url === "/api/realdebrid/torrents/info/ready")
      return Response.json({
        status: "downloaded",
        files: [
          { path: "/Example/setup.exe", bytes: 20, selected: 1 },
          { path: "/Example/data.bin", bytes: 40, selected: 1 },
        ],
        links: ["https://real-debrid.com/d/one", "https://real-debrid.com/d/two"],
      });
    assert.equal(url, "/api/realdebrid/unrestrict/link");
    return Response.json({
      download: `https://cdn.example/${options.body.get("link").split("/").pop()}`,
    });
  };
  t.after(() => Object.assign(global, saved));
  const debrid = await loadModule("src/services/downloads/debridService.js", {
    fresh: true,
  });
  const settings = { debridEnabled: true, realDebridApiKey: "rd" };
  await Promise.all([
    debrid.resumePendingTorrents(settings),
    debrid.resumePendingTorrents(settings),
  ]);
  assert.equal(
    calls.length,
    1,
    "cloud completion must start a local transfer without a click"
  );
  assert.equal(calls[0][0].files.length, 2);
  assert.equal(calls[0][0].files[1].filename, "Example/data.bin");
  assert.equal(calls[0][9], 2, "preserve selected library");
  await debrid.resumePendingTorrents(settings);
  assert.equal(
    calls.length,
    1,
    "polling/restart must not duplicate a handed-off torrent"
  );
});

test("handoff waits for readiness and active local jobs, respects disabling, and retries rejected starts", async t => {
  const saved = { window: global.window, localStorage: global.localStorage };
  t.after(() => Object.assign(global, saved));
  for (const scenario of ["processing", "busy", "disabled", "failed"]) {
    let stored = JSON.stringify({
      "torrent:ready": { game: "Example", autoHandoff: true },
    });
    global.localStorage = {
      getItem: () => stored,
      setItem: (_k, value) => {
        stored = value;
      },
    };
    const calls = [];
    global.window = {
      electron: {
        getGames: async () =>
          scenario === "busy" ? [{ downloadingData: { downloading: true } }] : [],
        getSettings: async () => ({
          debridEnabled: scenario !== "disabled",
          key: "token",
        }),
        downloadFile: async (...args) => {
          calls.push(args);
          return { success: calls.length > 1, error: "start failed" };
        },
      },
    };
    const worker = await loadModule("src/services/downloads/debridTorrentHandoff.js", {
      fresh: true,
    });
    const provider = {
      id: "test",
      apiKeySetting: "key",
      metadataStorageKey: "metadata",
      getTorrentGame: entry => entry,
      getTorrentDownload: async () =>
        scenario === "processing"
          ? null
          : [{ url: "https://example.com/file", filename: "data.bin", size: 10 }],
    };
    if (scenario === "failed") {
      await assert.rejects(worker.handoffTorrents(provider, "token"), /start failed/);
      assert.equal(JSON.parse(stored)["torrent:ready"].localDownloadStarted, undefined);
      await assert.rejects(worker.handoffTorrents(provider, "token"), /start failed/);
      assert.equal(calls.length, 1, "the next poll waits");
      t.mock.method(Date, "now", () => realNow() + 5 * 60 * 1000);
      await worker.handoffTorrents(provider, "token");
      assert.equal(JSON.parse(stored)["torrent:ready"].localDownloadStarted, true);
      t.mock.restoreAll();
    } else {
      await worker.handoffTorrents(provider, "token");
      assert.equal(calls.length, 0, scenario);
    }
  }
});

test("handoff skips legacy records and stops polling torrents removed from the cloud", async t => {
  const saved = { window: global.window, localStorage: global.localStorage };
  t.after(() => Object.assign(global, saved));
  let stored = JSON.stringify({
    "torrent:legacy": { game: "Old" },
    "torrent:gone": { game: "Gone", autoHandoff: true },
  });
  global.localStorage = {
    getItem: () => stored,
    setItem: (_k, value) => {
      stored = value;
    },
  };
  const calls = [];
  global.window = {
    electron: {
      getGames: async () => [],
      downloadFile: async (...args) => {
        calls.push(args);
        return { success: true };
      },
    },
  };
  const worker = await loadModule("src/services/downloads/debridTorrentHandoff.js", {
    fresh: true,
  });
  const lookups = [];
  const provider = {
    id: "test",
    apiKeySetting: "key",
    metadataStorageKey: "metadata",
    getTorrentGame: entry => entry,
    getTorrentDownload: async (_key, id) => {
      lookups.push(id);
      return "missing";
    },
  };
  await worker.handoffTorrents(provider, "token");
  await worker.handoffTorrents(provider, "token");
  assert.deepEqual(lookups, ["gone"], "legacy skipped, missing torrent checked once");
  assert.equal(calls.length, 0);
  assert.equal(JSON.parse(stored)["torrent:gone"].cloudTorrentMissing, true);
});

test("a refused torrent asks Real-Debrid for its links once per retry, not on every poll", async t => {
  const saved = {
    fetch: global.fetch,
    window: global.window,
    localStorage: global.localStorage,
  };
  t.after(() => Object.assign(global, saved));
  let stored = JSON.stringify({ "torrent:big": { game: "Big", autoHandoff: true } });
  global.localStorage = { getItem: () => stored, setItem: () => {} };
  const links = Array.from({ length: 30 }, (_, i) => `https://real-debrid.com/d/${i}`);
  let requests = 0;
  global.fetch = async url => {
    requests += 1;
    return url.includes("/torrents/info/")
      ? Response.json({
          status: "downloaded",
          files: links.map((_, i) => ({ selected: 1, path: `/${i}.bin`, bytes: 1 })),
          links,
        })
      : Response.json({ download: "https://cdn.example/f", filesize: 1 });
  };
  global.window = {
    electron: {
      getGames: async () => [],
      downloadFile: async () => ({ success: false, error: "Folder already exists" }),
    },
  };
  const worker = await loadModule("src/services/downloads/debridTorrentHandoff.js", {
    fresh: true,
  });
  const { default: provider } = await loadModule(
    "src/services/downloads/debrid/realDebridProvider.js"
  );

  let now = realNow();
  t.mock.method(Date, "now", () => now);
  // One minute of the 5 second background poll.
  for (let poll = 0; poll < 12; poll++) {
    await assert.rejects(
      worker.handoffTorrents(provider, "key"),
      /Folder already exists/
    );
    now += 5000;
  }
  assert.equal(requests, 31);

  now += 5 * 60 * 1000;
  await assert.rejects(worker.handoffTorrents(provider, "key"), /Folder already exists/);
  assert.equal(requests, 62);
});

test("a torrent that can not start does not hold back the ones behind it", async t => {
  const saved = { window: global.window, localStorage: global.localStorage };
  t.after(() => Object.assign(global, saved));
  for (const failure of ["refused", "cloud error"]) {
    let stored = JSON.stringify({
      "torrent:first": { game: "First", autoHandoff: true },
      "torrent:second": { game: "Second", autoHandoff: true },
    });
    global.localStorage = {
      getItem: () => stored,
      setItem: (_k, value) => {
        stored = value;
      },
    };
    const started = [];
    global.window = {
      electron: {
        getGames: async () => [],
        downloadFile: async (_data, game) => {
          if (game === "First") return { success: false, error: "refused" };
          started.push(game);
          return { success: true };
        },
      },
    };
    const worker = await loadModule("src/services/downloads/debridTorrentHandoff.js", {
      fresh: true,
    });
    const provider = {
      id: "test",
      metadataStorageKey: "metadata",
      getTorrentGame: entry => entry,
      getTorrentDownload: async (_key, id) => {
        if (failure === "cloud error" && id === "first") throw new Error("cloud error");
        return [{ url: "https://example.com/file", filename: "data.bin", size: 10 }];
      },
    };
    assert.deepEqual(await worker.handoffTorrents(provider, "key"), {
      game: "Second",
      providerId: "test",
    });
    assert.deepEqual(started, ["Second"]);
    assert.equal(JSON.parse(stored)["torrent:first"].localDownloadStarted, undefined);
    // The one that failed still reaches the user once the new download has had its start.
    t.mock.method(Date, "now", () => realNow() + 20000);
    await assert.rejects(worker.handoffTorrents(provider, "key"), new RegExp(failure));
    t.mock.restoreAll();
  }
});
