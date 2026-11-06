const { test } = require("node:test");
const assert = require("node:assert/strict");

const { loadModule } = require("./helpers/loadModule.cjs");

test("TorBox stop and delete send documented control requests", async t => {
  const originalFetch = global.fetch;
  const originalWindow = global.window;
  t.after(() => {
    global.fetch = originalFetch;
    if (originalWindow === undefined) delete global.window;
    else global.window = originalWindow;
  });
  global.window = { location: { origin: "https://app.test" } };
  const calls = [];
  let reply = { success: true };
  global.fetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return { ok: reply.success, json: async () => reply };
  };
  const { controlDownload, controlTorrent } = await loadModule(
    "src/services/downloads/torboxService.js",
    { fresh: true }
  );
  const torrent = { id: "42", _torboxType: "torrent" };
  const webdl = { id: 7, _torboxType: "webdl" };

  await controlDownload("key", torrent, "stop");
  await controlDownload("key", torrent, "delete");
  await controlDownload("key", webdl, "stop");
  await controlTorrent("key", { all: true, operation: "delete" });

  assert.deepEqual(
    calls.map(call => [call.url, call.body]),
    [
      ["/api/torbox/torrents/controltorrent", { torrent_id: 42, operation: "delete" }],
      ["/api/torbox/torrents/controltorrent", { torrent_id: 42, operation: "delete" }],
      [
        "https://app.test/api/torbox/webdl/controlwebdownload",
        { webdl_id: 7, operation: "delete" },
      ],
      ["/api/torbox/torrents/controltorrent", { all: true, operation: "delete" }],
    ]
  );
  for (const call of calls) {
    assert.equal(call.init.method, "POST");
    assert.equal(call.init.headers["Content-Type"], "application/json");
    assert.equal(call.init.headers.Authorization, "Bearer key");
  }

  reply = { success: false, error: "UNKNOWN_ERROR", detail: "Torrent is busy." };
  await assert.rejects(
    controlDownload("key", torrent, "delete"),
    /UNKNOWN_ERROR: Torrent is busy\./
  );
});
