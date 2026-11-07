const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadModule } = require("./helpers/loadModule.cjs");

let instance = 0;
// gameInfoService with its app imports stubbed, so fetch can be mocked
const loadService = async cached => {
  const source = fs
    .readFileSync(
      path.resolve(__dirname, "../src/services/games/gameInfoService.js"),
      "utf8"
    )
    .replace(
      /^import gameApiCache.*$/m,
      "const gameApiCache = globalThis.__steamTestCache;"
    )
    .replace(/^import \{ API_URL \}.*$/m, 'const API_URL = "https://api.test";')
    .replace(/^import i18n.*$/m, 'const i18n = { language: "en" };')
    .replace(/import\.meta\.env\.DEV/g, "false");
  globalThis.__steamTestCache = {
    getCachedGame: () => null,
    cacheGame: (name, data) => cached.push(name),
  };
  const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}#${instance++}`;
  return import(url);
};

const json = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => null },
  json: async () => body,
});
const details = {
  42: { success: true, data: { steam_appid: 42, name: "Yakuza 4 Remastered" } },
};

// Mock fetch from a list of answers per endpoint; retries wait 0 ms
const withFetch = async (answers, run) => {
  const calls = [];
  const realFetch = globalThis.fetch;
  const realTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, _ms, ...args) => realTimeout(fn, 0, ...args);
  globalThis.fetch = async url => {
    const kind = url.includes("/search") ? "search" : "details";
    calls.push(kind);
    // Out of scripted answers: Steam answers with no results
    const next = answers[kind].length ? answers[kind].shift() : json({ items: [] });
    if (next instanceof Error) throw next;
    return next;
  };
  try {
    await run(calls);
  } finally {
    globalThis.fetch = realFetch;
    globalThis.setTimeout = realTimeout;
  }
};

test("a rate-limited search is retried once and then finds the game", async () => {
  const cached = [];
  const service = (await loadService(cached)).default;
  await withFetch(
    {
      search: [
        json(null, 429),
        json({ items: [{ id: 42, name: "Yakuza 4 Remastered" }] }),
      ],
      details: [json(details)],
    },
    async calls => {
      const data = await service.getGameDetails("Yakuza 4 Remastered");
      assert.equal(data.name, "Yakuza 4 Remastered");
      assert.deepEqual(calls, ["search", "search", "details"]);
    }
  );
});

test("a proxy that keeps failing throws a lookup error and nothing is cached", async () => {
  const cached = [];
  const module = await loadService(cached);
  await withFetch(
    { search: [json(null, 503), new Error("socket hang up")], details: [] },
    async calls => {
      await assert.rejects(
        module.default.getGameDetails("Persona 5 Strikers"),
        error => error instanceof module.SteamLookupError
      );
      assert.deepEqual(calls, ["search", "search"], "two tries, no more variations");
      assert.deepEqual(cached, []);
    }
  );
});

test("a details call that fails is a lookup error, not a miss", async () => {
  const module = await loadService([]);
  await withFetch(
    {
      search: [json({ items: [{ id: 42, name: "Yakuza 4 Remastered" }] })],
      details: [json(null, 500), json(null, 502)],
    },
    async () => {
      await assert.rejects(
        module.default.getGameDetails("Yakuza 4 Remastered"),
        module.SteamLookupError
      );
    }
  );
});

test("a real miss still answers null", async () => {
  const service = (await loadService([])).default;
  await withFetch({ search: [], details: [] }, async () => {
    assert.equal(await service.getGameDetails("Bloodborne"), null);
  });
});

test("findGameDetails passes a failure on and does not remember it", async () => {
  const { findGameDetails } = await loadModule("src/lib/steamMatch.js", { fresh: true });
  const busy = async () => {
    throw new Error("Steam proxy error: 429");
  };
  await assert.rejects(findGameDetails("Dead Age 2", busy), /429/);
  await assert.rejects(findGameDetails("Dead Age 2, v1.0 + 2 DLCs", busy), /429/);
  const found = await findGameDetails("Dead Age 2, v1.0 + 2 DLCs", async name =>
    name === "Dead Age 2" ? { name: "Dead Age 2" } : null
  );
  assert.equal(found.name, "Dead Age 2");
});
