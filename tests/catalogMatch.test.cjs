const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("./helpers/loadModule.cjs");

const load = () => loadModule("src/lib/catalogMatch.js", { fresh: true });

test("editions, extras and build suffixes leave the comparison title", async () => {
  const { normalizeCatalogTitle } = await load();
  const cases = {
    "Cyberpunk 2077": "cyberpunk 2077",
    "Cyberpunk 2077 Ultimate Edition + Bonus Content + REDmod": "cyberpunk 2077",
    "Schedule I 0.4.6f13": "schedule i",
    "Schedule I v0.4.5f2": "schedule i",
    "Hades II + Soundtrack": "hades ii",
    "Dredge v1.5.3 Repack by FitGirl": "dredge",
    "The Witcher 3: Wild Hunt": "the witcher 3 wild hunt",
    "Age of Empires II: Definitive Edition": "age of empires ii definitive edition",
  };
  for (const [raw, normalized] of Object.entries(cases)) {
    assert.equal(normalizeCatalogTitle(raw), normalized, raw);
  }
});

test("close titles match but sequels and numbered entries stay apart", async () => {
  const { titlesMatch } = await load();
  assert.ok(
    titlesMatch("Cyberpunk 2077", "Cyberpunk 2077 Ultimate Edition + Bonus Content")
  );
  assert.ok(titlesMatch("Schedule I", "Schedule I 0.4.6f13"));
  assert.ok(titlesMatch("Schedule I", "Schedule I v0.4.5f2"));
  assert.ok(titlesMatch("Grand Theft Auto V", "Grand Theft Auto 5"));
  assert.ok(
    titlesMatch("Red Dead Redemption 2", "Red Dead Redemption 2 - .50 + UE Unlocker")
  );

  assert.ok(!titlesMatch("Schedule I", "Schedule II"));
  assert.ok(!titlesMatch("Far Cry", "Far Cry Primal"));
  assert.ok(!titlesMatch("Assassin's Creed", "Assassin's Creed Unity"));
  assert.ok(!titlesMatch("Marvel's Spider-Man", "Marvel's Spider-Man Miles Morales"));
  assert.ok(!titlesMatch("Tomb Raider", "Rise of the Tomb Raider"));
  assert.ok(!titlesMatch("Hades", "Hades II"));
  assert.ok(!titlesMatch("Portal", "Portal 2"));
  assert.ok(!titlesMatch("The Witcher 3", "The Witcher 3.5"));
  assert.ok(!titlesMatch("The Room", "Room"));
  assert.ok(!titlesMatch("Final Fantasy VII Remake", "Final Fantasy VII Rebirth"));
  assert.ok(
    !titlesMatch("Red Dead Redemption", "Red Dead Redemption 2 - .50 + UE Unlocker")
  );
});

test("build versions compare numerically and releases beat prereleases", async () => {
  const { compareVersions, parseVersion, extractVersionFromTitle } = await load();
  assert.ok(compareVersions("0.4.6f13", "0.4.5f2") > 0);
  assert.ok(compareVersions("Build 18031628", "Build 18031627") > 0);
  assert.equal(compareVersions("v1.2", "1.2.0"), 0);
  assert.ok(compareVersions("1.0.0", "1.0.0-beta") > 0);
  assert.equal(compareVersions(null, null), 0);

  assert.deepEqual(parseVersion("0.4.6f13").parts, [0, 4, 6, 13]);
  assert.equal(extractVersionFromTitle("Schedule I 0.4.6f13"), "0.4.6f13");
  assert.equal(extractVersionFromTitle("Atomfall Build 18031628"), "Build 18031628");
  assert.equal(extractVersionFromTitle("Cyberpunk 2077"), null);
});

test("patch lists collapse into one card with the newest version on top", async () => {
  const { groupCatalogGames } = await load();
  const { games, groups } = groupCatalogGames([
    { game: "Schedule I 0.4.5f2", sourceRank: 1, customSource: "FitGirl" },
    { game: "Schedule I 0.4.6f13", sourceRank: 1, customSource: "FitGirl" },
    { game: "Schedule II 0.1.0", sourceRank: 1, customSource: "FitGirl" },
  ]);

  assert.deepEqual(
    games.map(game => game.game),
    ["Schedule I", "Schedule II"]
  );
  assert.equal(games[0].version, "0.4.6f13");
  assert.equal(games[0].groupKey, "schedule i");
  assert.deepEqual(
    groups.get("schedule i").map(entry => entry.version),
    ["0.4.6f13", "0.4.5f2"]
  );
});

test("official and external listings merge, and equal versions keep the official card", async () => {
  const { groupCatalogGames } = await load();
  const { games } = groupCatalogGames([
    {
      game: "Cyberpunk 2077",
      version: "2.30",
      sourceRank: 0,
    },
    {
      game: "Cyberpunk 2077 Ultimate Edition + Bonus Content + REDmod",
      version: "2.30",
      sourceRank: 1,
      customSource: "FitGirl",
    },
  ]);

  assert.equal(games.length, 1);
  assert.equal(games[0].game, "Cyberpunk 2077");
  assert.equal(games[0].customSource, undefined);
});

test("an external listing can never replace the official card as primary", async () => {
  const { groupCatalogGames } = await load();
  const { games, groups } = groupCatalogGames([
    { game: "Grand Theft Auto V Enhanced", sourceRank: 0 },
    {
      game: "Grand Theft Auto V Enhanced - .20 Online 1.72",
      sourceRank: 1,
      customSource: "SteamRIP",
    },
  ]);

  assert.equal(games.length, 1);
  assert.equal(games[0].game, "Grand Theft Auto V Enhanced");
  assert.equal(games[0].customSource, undefined);
  assert.equal(games[0].version, undefined);
  assert.equal(groups.get("grand theft auto v enhanced").length, 2);
  assert.equal(
    groups.get("grand theft auto v enhanced")[1].game,
    "Grand Theft Auto V Enhanced - .20 Online 1.72"
  );
});

test("leading-dot version tails still merge with the base game", async () => {
  const { groupCatalogGames } = await load();
  const { games, groups } = groupCatalogGames([
    { game: "Red Dead Redemption 2", version: "1491.50", sourceRank: 0 },
    {
      game: "Red Dead Redemption 2 - .50 + UE Unlocker",
      sourceRank: 1,
      customSource: "SteamRIP",
    },
    { game: "Red Dead Redemption", version: "1.0", sourceRank: 0 },
  ]);

  assert.equal(games.length, 2);
  assert.ok(games.some(game => game.game === "Red Dead Redemption 2"));
  assert.ok(games.some(game => game.game === "Red Dead Redemption"));
  assert.equal(groups.get("red dead redemption 2")?.length, 2);
});

test("official stays the default card even when an external version is newer", async () => {
  const { groupCatalogGames } = await load();
  const { games, groups } = groupCatalogGames([
    { game: "Cyberpunk 2077", version: "2.21", sourceRank: 0 },
    {
      game: "Cyberpunk 2077 Ultimate Edition + Bonus Content",
      version: "2.30",
      sourceRank: 1,
      customSource: "FitGirl",
    },
    { game: "Hades", version: "1.0", sourceRank: 0 },
    { game: "Hades II", version: "0.9", sourceRank: 1, customSource: "FitGirl" },
    { game: "Probably Stolen", version: "1.0", sourceRank: 1, customSource: "SteamRIP" },
    {
      game: "Probably Stolen Cyberpunk Shopkeeper Sim",
      version: "1.1",
      sourceRank: 1,
      customSource: "FitGirl",
    },
  ]);

  assert.equal(games.length, 5);
  const cyberpunk = games.find(game => game.groupKey === "cyberpunk 2077");
  assert.equal(cyberpunk.game, "Cyberpunk 2077");
  assert.equal(cyberpunk.version, "2.21");
  assert.equal(cyberpunk.customSource, undefined);
  assert.deepEqual(
    groups.get("cyberpunk 2077").map(entry => entry.version),
    ["2.21", "2.30"]
  );
  assert.ok(games.some(game => game.game === "Hades"));
  assert.ok(games.some(game => game.game === "Hades II"));
  assert.ok(games.some(game => game.game === "Probably Stolen"));
  assert.ok(games.some(game => game.game === "Probably Stolen Cyberpunk Shopkeeper Sim"));
  assert.equal(groups.get("probably stolen"), undefined);
});
