const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("./helpers/loadModule.cjs");

function makeStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

for (const [label, torrentLink] of [
  ["magnet", "magnet:?xt=urn:btih:queued-blocked"],
  ["torrent file", "https://example.test/game.torrent?download=1#mirror"],
]) {
  test(`queued local ${label} waits while torrenting is disabled and starts after re-enable`, async () => {
    global.localStorage = makeStorage();

    const settings = { torrentEnabled: true, debridEnabled: false };
    const starts = [];
    const removedImports = [];
    let startedGame = null;

    global.window = {
      electron: {
        getSettings: async () => ({ ...settings }),
        getGames: async () =>
          startedGame
            ? [{ game: startedGame, downloadingData: { downloading: true } }]
            : [],
        downloadFile: async (url, gameName) => {
          starts.push({ url, gameName });
          startedGame = gameName;
          return { success: true, game: gameName };
        },
        removeCustomGame: async gameName => {
          removedImports.push(gameName);
        },
      },
    };

    const queue = await loadModule(
      "src/services/downloads/downloadQueueService.js",
      { fresh: true }
    );

    const gameName = `Queued ${label}`;
    queue.addToQueue({
      url: torrentLink,
      directUrl: torrentLink,
      gameName,
    });
    localStorage.setItem(
      "ascendara_pending_launcher_swaps",
      JSON.stringify({ [gameName]: `Imported ${label}` })
    );

    settings.torrentEnabled = false;
    assert.equal(
      queue.getQueueBlockReason(queue.getDownloadQueue()[0], settings),
      "TORRENT_DISABLED"
    );
    assert.equal(await queue.processNextInQueue(), null);
    assert.equal(starts.length, 0, "blocked torrent must not start");
    assert.equal(queue.getDownloadQueue().length, 1, "blocked torrent must remain queued");
    assert.deepEqual(removedImports, [], "blocked torrent must not consume launcher swap");
    assert.equal(
      JSON.parse(localStorage.getItem("ascendara_pending_launcher_swaps"))[gameName],
      `Imported ${label}`
    );

    settings.torrentEnabled = true;
    const started = await queue.processNextInQueue();
    assert.equal(started?.gameName, gameName);
    assert.deepEqual(starts, [{ url: torrentLink, gameName }]);
    assert.equal(queue.getDownloadQueue().length, 0, "started torrent leaves the queue");
    assert.deepEqual(removedImports, [`Imported ${label}`]);
  });
}

test("typed TORRENT_DISABLED race response also leaves the queued item intact", async () => {
  global.localStorage = makeStorage();

  const torrentLink = "magnet:?xt=urn:btih:race-blocked";
  global.window = {
    electron: {
      getSettings: async () => ({ torrentEnabled: true }),
      getGames: async () => [],
      downloadFile: async () => ({
        success: false,
        blocked: true,
        code: "TORRENT_DISABLED",
        error: "Local torrenting is disabled. Enable torrenting in Settings to continue.",
      }),
      removeCustomGame: async () => {
        assert.fail("blocked race must not consume launcher swap");
      },
    },
  };

  const queue = await loadModule(
    "src/services/downloads/downloadQueueService.js",
    { fresh: true }
  );
  queue.addToQueue({ url: torrentLink, directUrl: torrentLink, gameName: "Race" });

  assert.equal(await queue.processNextInQueue(), null);
  assert.equal(queue.getDownloadQueue().length, 1);
});
