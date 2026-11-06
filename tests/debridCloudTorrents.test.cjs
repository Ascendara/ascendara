const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("./helpers/loadModule.cjs");

// localStorage and the Electron bridge for one test, restored afterwards.
function setup(t, records, games = []) {
  const saved = { window: global.window, localStorage: global.localStorage };
  t.after(() => Object.assign(global, saved));
  const store = { data: JSON.stringify(records) };
  global.localStorage = {
    getItem: () => store.data,
    setItem: (_key, value) => {
      store.data = value;
    },
  };
  const started = [];
  global.window = {
    electron: {
      getGames: async () => games,
      downloadFile: async (...args) => {
        started.push(args);
        return { success: true };
      },
    },
  };
  return { record: id => JSON.parse(store.data)[id], started };
}

const fakeProvider = overrides => ({
  id: "test",
  name: "Test",
  apiKeySetting: "testKey",
  torrentSetting: "useTest",
  removeAfterDoneSetting: "testRemoveAfterDone",
  metadataStorageKey: "testData",
  getTorrentGame: entry => entry,
  getTorrentDownload: async () => null,
  ...overrides,
});

test("a torrent the service gave up on is reported once, then left for Remove", async t => {
  const { record } = setup(t, { "torrent:dead": { game: "Dead", autoHandoff: true } });
  const worker = await loadModule("src/services/downloads/debridTorrentHandoff.js", {
    fresh: true,
  });
  let checks = 0;
  const provider = fakeProvider({
    getTorrentDownload: async () => {
      checks++;
      throw Object.assign(new Error("Test could not download this torrent (bad)."), {
        terminal: true,
      });
    },
  });
  await assert.rejects(
    worker.handoffTorrents(provider, "key"),
    /Dead: Test could not download this torrent \(bad\)\. Remove it from Downloads/
  );
  assert.equal(record("torrent:dead").cloudTorrentFailed, true);
  await worker.handoffTorrents(provider, "key");
  assert.equal(checks, 1, "not polled again");

  const records = await loadModule("src/services/downloads/debridRecords.js", {
    fresh: true,
  });
  assert.deepEqual(
    records.pendingTorrents(provider).map(item => item.id),
    ["dead"],
    "still listed so the user can remove it"
  );
});

test("removing finished torrents still runs when another torrent at the service fails", async t => {
  const { record } = setup(
    t,
    {
      "torrent:dead": { game: "Dead", autoHandoff: true },
      "torrent:done": { game: "Done", autoHandoff: true, localDownloadStarted: true },
    },
    [{ game: "Done" }]
  );
  const { createDebridService } = await loadModule(
    "src/services/downloads/debridService.js",
    {
      fresh: true,
    }
  );
  const removed = [];
  const debrid = createDebridService([
    fakeProvider({
      getTorrentDownload: async () => {
        throw new Error("temporary outage");
      },
      removeTorrent: async (_key, id) => removed.push(id),
    }),
  ]);
  const settings = {
    debridEnabled: true,
    testKey: "k",
    testRemoveAfterDone: true,
    useTest: false,
  };
  await debrid.resumePendingTorrents(settings);
  assert.deepEqual(removed, ["done"], "torrents off still cleans up");
  assert.equal(record("torrent:done").cloudTorrentCleaned, true);
});

test("a game deleted locally keeps its cloud copy and stops being checked", async t => {
  const old = Date.now() - 60 * 60 * 1000;
  const { record } = setup(t, {
    "torrent:gone": {
      game: "Gone",
      autoHandoff: true,
      localDownloadStarted: true,
      localDownloadStartedAt: old,
    },
    "torrent:new": {
      game: "New",
      autoHandoff: true,
      localDownloadStarted: true,
      localDownloadStartedAt: Date.now(),
    },
  });
  const worker = await loadModule("src/services/downloads/debridTorrentHandoff.js", {
    fresh: true,
  });
  const removed = [];
  await worker.removeFinishedTorrents(
    fakeProvider({ removeTorrent: async (_key, id) => removed.push(id) }),
    "key"
  );
  assert.deepEqual(removed, []);
  assert.equal(record("torrent:gone").cloudTorrentKept, true);
  assert.equal(
    record("torrent:new").cloudTorrentKept,
    undefined,
    "may not have appeared yet"
  );
});

test("services can ask the handoff to poll less often", async t => {
  setup(t, { "torrent:slow": { game: "Slow", autoHandoff: true } });
  const worker = await loadModule("src/services/downloads/debridTorrentHandoff.js", {
    fresh: true,
  });
  let checks = 0;
  const provider = fakeProvider({
    pollIntervalMs: 30 * 1000,
    getTorrentDownload: async () => {
      checks++;
      return null;
    },
  });
  await worker.handoffTorrents(provider, "key");
  await worker.handoffTorrents(provider, "key");
  assert.equal(checks, 1);
});

test("Remove deletes nothing once the torrent already started downloading", async t => {
  const { record } = setup(t, {
    "torrent:wait": { game: "Wait", autoHandoff: true },
    "torrent:busy": { game: "Busy", autoHandoff: true, localDownloadStarted: true },
  });
  const records = await loadModule("src/services/downloads/debridRecords.js", {
    fresh: true,
  });
  const removed = [];
  const provider = fakeProvider({ removeTorrent: async (_key, id) => removed.push(id) });
  assert.equal(
    await records.removePendingTorrent(provider, "key", "torrent:busy"),
    false
  );
  assert.equal(await records.removePendingTorrent(provider, "key", "torrent:wait"), true);
  assert.deepEqual(removed, ["wait"]);
  assert.equal(record("torrent:wait").cloudTorrentRemoved, true);
  assert.deepEqual(records.pendingTorrents(provider), []);
});
