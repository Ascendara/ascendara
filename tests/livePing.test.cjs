const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

const LIVE_PING = path.join(__dirname, "..", "electron/modules/app/livePing.js");

async function withLivePing(run) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "ascendara-live-"));
  const settings = { livePing: null };
  const state = { playing: false };
  const sent = [];
  const realLoad = Module._load;
  const realFetch = globalThis.fetch;
  Module._load = function (request, ...rest) {
    if (request === "electron") return { app: { getPath: () => userData } };
    if (request === "../core/config") return { API_URL: "https://api.test" };
    if (request === "../core/settings")
      return { getSettingsManager: () => ({ getSettings: () => settings }) };
    if (request === "../core/auth-helper")
      return {
        authenticatedFetch: async () => ({
          ok: true,
          json: async () => ({ token: "t" }),
        }),
      };
    if (request === "../library/games") return { hasRunningGames: () => state.playing };
    return realLoad.call(this, request, ...rest);
  };
  globalThis.fetch = async (url, options) => {
    sent.push({ url, auth: options.headers.Authorization, ...JSON.parse(options.body) });
    return { ok: true };
  };
  delete require.cache[LIVE_PING];
  try {
    await run({ livePing: require(LIVE_PING), settings, state, sent, userData });
  } finally {
    Module._load = realLoad;
    globalThis.fetch = realFetch;
    delete require.cache[LIVE_PING];
    fs.rmSync(userData, { recursive: true, force: true });
  }
}

test("nothing is sent until the user opts in", async () => {
  await withLivePing(async ({ livePing, settings, sent }) => {
    await livePing.refreshLivePing();
    settings.livePing = false;
    await livePing.refreshLivePing();
    assert.deepEqual(sent, []);
  });
});

test("an opted-in install pings with a random ID and whether a game is running", async () => {
  await withLivePing(async ({ livePing, settings, state, sent, userData }) => {
    settings.livePing = true;
    await livePing.refreshLivePing();
    state.playing = true;
    await livePing.refreshLivePing();
    assert.equal(sent.length, 2);
    assert.equal(sent[0].url, "https://api.test/stats/live");
    assert.equal(sent[0].auth, "Bearer t");
    assert.match(sent[0].id, /^[0-9a-f-]{36}$/);
    assert.equal(sent[1].id, sent[0].id, "the same ID every time");
    assert.deepEqual(
      sent.map(ping => ping.playing),
      [false, true]
    );
    assert.equal(
      fs.readFileSync(path.join(userData, "live-ping-id"), "utf8"),
      sent[0].id
    );
  });
});

test("opting out takes the install off the count once", async () => {
  await withLivePing(async ({ livePing, settings, sent }) => {
    settings.livePing = true;
    await livePing.refreshLivePing();
    settings.livePing = false;
    await livePing.refreshLivePing();
    await livePing.refreshLivePing();
    assert.equal(sent.length, 2);
    assert.equal(sent[1].offline, true);
    assert.equal(sent[1].playing, undefined);
  });
});
