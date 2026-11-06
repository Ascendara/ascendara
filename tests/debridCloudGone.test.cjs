const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("./helpers/loadModule.cjs");

test("a TorBox torrent deleted in the cloud counts as missing, other errors still throw", async t => {
  const saved = { fetch: global.fetch, window: global.window };
  t.after(() => Object.assign(global, saved));
  global.window = { location: { origin: "http://localhost:5173" } };
  let detail = "No torrents found for this user.";
  global.fetch = async () => Response.json({ success: false, detail });
  const { default: provider } = await loadModule(
    "src/services/downloads/debrid/torboxProvider.js",
    { fresh: true }
  );
  assert.equal(await provider.getTorrentDownload("key", "7"), "missing");
  detail = "Service unavailable";
  await assert.rejects(provider.getTorrentDownload("key", "7"), {
    message: "Service unavailable",
  });
});

test("a Real-Debrid torrent deleted in the cloud (404 or unknown_ressource) counts as missing", async t => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  let status = 404;
  let body = { error: "unknown_ressource", error_code: 7 };
  global.fetch = async () => Response.json(body, { status });
  const { default: provider } = await loadModule(
    "src/services/downloads/debrid/realDebridProvider.js",
    { fresh: true }
  );
  assert.equal(await provider.getTorrentDownload("key", "gone"), "missing");
  status = 400;
  assert.equal(await provider.getTorrentDownload("key", "gone"), "missing");
  body = { error: "service_unavailable", error_code: 25 };
  status = 503;
  await assert.rejects(provider.getTorrentDownload("key", "gone"));
});
