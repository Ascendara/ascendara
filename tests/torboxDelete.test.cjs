const { test } = require("node:test");
const assert = require("node:assert/strict");

const { loadModule } = require("./helpers/loadModule.cjs");

// A deleted hosted link stayed in Ready because TorBox's mylist cache still listed it.
test("TorBox delete keeps a web download out of a stale cached list", async t => {
  const originalFetch = global.fetch;
  const originalWindow = global.window;
  t.after(() => {
    global.fetch = originalFetch;
    if (originalWindow === undefined) delete global.window;
    else global.window = originalWindow;
  });
  global.window = { location: { origin: "https://app.test" } };

  const webdl = [
    { id: 11, name: "wvU6sDO6" },
    { id: 12, name: "vGjcpS" },
  ];
  let cachedWebdl = webdl;
  const listUrls = [];
  global.fetch = async url => {
    if (url.includes("/mylist")) {
      listUrls.push(url);
      const fresh = url.includes("bypass_cache=true");
      const data = url.includes("/torrents/") ? [] : fresh ? webdl : cachedWebdl;
      return { ok: true, json: async () => ({ success: true, data }) };
    }
    if (url.endsWith("/webdl/controlwebdownload")) {
      webdl.splice(0, 1); // TorBox removes it, the cached copy does not change
      return { ok: true, json: async () => ({ success: true }) };
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const { getAllDownloads, controlDownload } = await loadModule(
    "src/services/downloads/torboxService.js",
    { fresh: true }
  );
  const names = list => list.map(item => item.name);

  const before = await getAllDownloads("key");
  assert.deepEqual(names(before), ["wvU6sDO6", "vGjcpS"]);
  assert.equal(before[0]._torboxType, "webdl");

  await controlDownload("key", before[0], "delete");

  // The 10s poll still reads the stale cache: the item must not come back.
  assert.deepEqual(names(await getAllDownloads("key")), ["vGjcpS"]);
  // The fresh read after delete and on refresh bypasses the cache.
  assert.deepEqual(names(await getAllDownloads("key", { fresh: true })), ["vGjcpS"]);
  assert.ok(listUrls.at(-1).includes("bypass_cache=true"));
  assert.ok(!listUrls[0].includes("bypass_cache"));

  // Once a list arrives without it, the hide entry is cleared (a new item with that id shows).
  cachedWebdl = [{ id: 11, name: "re-added" }];
  assert.deepEqual(names(await getAllDownloads("key")), ["re-added"]);
});
