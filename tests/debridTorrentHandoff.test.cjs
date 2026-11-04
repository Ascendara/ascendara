const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("./helpers/loadModule.cjs");

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
  assert.equal(await provider.getTorrentDownload("key", "unknown"), null);
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
    let stored = JSON.stringify({ "torrent:ready": { game: "Example" } });
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
      await worker.handoffTorrents(provider, "token");
      assert.equal(JSON.parse(stored)["torrent:ready"].localDownloadStarted, true);
    } else {
      await worker.handoffTorrents(provider, "token");
      assert.equal(calls.length, 0, scenario);
    }
  }
});
