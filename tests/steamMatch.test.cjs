const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("./helpers/loadModule.cjs");

const load = () => loadModule("src/lib/steamMatch.js", { fresh: true });

const STEAM_MINIMUM =
  "Minimum:Requires a 64-bit processor and operating systemOS *: Windows 10Processor: Intel Core i5-4590 / AMD FX 8350Memory: 8 GB RAMGraphics: NVIDIA GeForce GTX 970 / AMD Radeon R9 290DirectX: Version 11Storage: 10 GB available spaceAdditional Notes: SSD recommended";

const steamGame = name => ({
  name,
  system_requirements: { minimum: STEAM_MINIMUM, recommended: "" },
});

test("index names lose bundle, soundtrack, bonus, edition, version and repack tags", async () => {
  const { cleanGameTitle } = await load();
  const cases = {
    "Lightyear Frontier & Soundtrack Bundle – -Bonuses": "Lightyear Frontier",
    "Hades II + Soundtrack": "Hades II",
    "Cyberpunk 2077 + All DLCs": "Cyberpunk 2077",
    "Stray - Bonuses": "Stray",
    "Elden Ring Deluxe Edition": "Elden Ring",
    "The Witcher 3: Wild Hunt Game of the Year Edition": "The Witcher 3: Wild Hunt",
    "Borderlands 2 GOTY": "Borderlands 2",
    "Palworld v0.3.11 (Build 16232543)": "Palworld",
    "Dredge v1.5.3 Repack by FitGirl": "Dredge",
    "Hollow Knight [FitGirl Repack]": "Hollow Knight",
    "Hitman 3-CODEX": "Hitman 3",
    "Stardew Valley™ Update 1.6": "Stardew Valley",
    "Age of Empires II: Definitive Edition": "Age of Empires II: Definitive Edition",
    "Half-Life 2": "Half-Life 2",
    "Spider-Man Remastered": "Spider-Man Remastered",
    "Dungeons & Dragons": "Dungeons & Dragons",
  };
  for (const [raw, clean] of Object.entries(cases)) {
    assert.equal(cleanGameTitle(raw), clean, raw);
  }
  assert.equal(cleanGameTitle(undefined), "");
});

test("FitGirl extras, language tags and more edition names come off too", async () => {
  const { cleanGameTitle } = await load();
  const cases = {
    "Game Name: Deluxe Edition - v1.2.3 + 5 DLCs + Bonus": "Game Name",
    "ELDEN RING NIGHTREIGN Deluxe Edition,-v1.03.1 -Bonuses": "ELDEN RING NIGHTREIGN",
    "Enshrouded Deluxe Edition – -Bonuses": "Enshrouded",
    "Split Fiction, v1.0.2.0 + Friend's Pass": "Split Fiction",
    "Dead Island 2: Ultimate Edition, v1.1.2 + 5 DLCs, MULTi15": "Dead Island 2",
    "Stardew Valley MULTi12": "Stardew Valley",
    "Persona 3 Reload: Digital Premium Edition, v1.0.0.0 + 23 DLCs": "Persona 3 Reload",
    "Warhammer 40,000: Space Marine 2 – Ultra Edition, v4.0 + 8 DLCs":
      "Warhammer 40,000: Space Marine 2",
    "Sid Meier's Civilization VII: Founders Edition, v1.0.1 + 7 DLCs":
      "Sid Meier's Civilization VII",
    "Dredge Digital Deluxe": "Dredge",
    "Atomfall: Deluxe Edition, Build 18031628 + 2 DLCs": "Atomfall",
    "The Last of Us Part II Remastered, v1.0 + Bonus Content":
      "The Last of Us Part II Remastered",
    "Ghost of Tsushima: Director's Cut, v1053.6.0718.1532 + 2 DLCs":
      "Ghost of Tsushima: Director's Cut",
    "Age of Empires II: Definitive Edition, Build 125283 + 6 DLCs":
      "Age of Empires II: Definitive Edition",
  };
  for (const [raw, clean] of Object.entries(cases)) {
    assert.equal(cleanGameTitle(raw), clean, raw);
  }
});

// Misses from the FitGirl index sample (reports/2026-11-07-steam-misses.md):
// [index name, name the app passes after its own tag cleaning, expected]
const INDEX_MISSES = [
  [
    "STAR WARS: Galactic Racer – Deluxe Edition, vCL386500 + 3 DLCs/Bonuses",
    "STAR WARS: Galactic Racer – Deluxe Edition, vCL386500 /Bonuses",
    "STAR WARS: Galactic Racer",
  ],
  [
    "The Mound: Omen of Cthulhu – Deluxe Edition, v.CL34308 + 4 DLCs/Bonuses",
    "The Mound: Omen of Cthulhu – Deluxe Edition, v.CL34308 /Bonuses",
    "The Mound: Omen of Cthulhu",
  ],
  [
    "Deep Rock Galactic: Deluxe Edition, v1.40.158958.0 + 13 DLCs/Bonuses",
    "Deep Rock Galactic: Deluxe Edition, /Bonuses",
    "Deep Rock Galactic",
  ],
  [
    "Ravenswatch: Year One Edition, v1.06.00.04.27511 + 12 DLCs/Bonuses",
    "Ravenswatch: Year One Edition, /Bonuses",
    "Ravenswatch",
  ],
  [
    "GUILTY GEAR -STRIVE- 2.0 Starter Edition, Build 23538523 + 39 DLC/Bonuses",
    "GUILTY GEAR -STRIVE- 2.0 Starter Edition, /Bonuses",
    "GUILTY GEAR -STRIVE-",
  ],
  [
    "Graviteam Tactics: Mius-Front, v6.00.3598/1 + 29 DLCs",
    "Graviteam Tactics: Mius-Front,/1",
    "Graviteam Tactics: Mius-Front",
  ],
  [
    "Red Dead Redemption 2: Ultimate Edition, Build 1491.50 + UE Unlocker + Bonus Content",
    "Red Dead Redemption 2: Ultimate Edition, .50 + UE Unlocker + Bonus Content",
    "Red Dead Redemption 2",
  ],
  [
    "HITMAN 3, v3.10.0/v3.10.1 (Update 2) + H1/H2 Missions + Unlocker",
    "HITMAN 3,/v3.10.1 + H1/H2 Missions + Unlocker",
    "HITMAN 3",
  ],
  [
    "Monster Hunter Stories 3: Twisted Reflection – Premium Deluxe Edition, v1.1.01 + 27 DLCs",
    "Monster Hunter Stories 3: Twisted Reflection – Premium Deluxe Edition,",
    "Monster Hunter Stories 3: Twisted Reflection",
  ],
  [
    "Onimusha: Way of the Sword – Premium Deluxe Edition, v01.000.001 + 23 DLCs",
    "Onimusha: Way of the Sword – Premium Deluxe Edition,",
    "Onimusha: Way of the Sword",
  ],
  [
    "Hunting Simulator 2: Elite Edition, v1.0.0.311.66949 + 4 DLCs",
    "Hunting Simulator 2: Elite Edition,",
    "Hunting Simulator 2",
  ],
  [
    "You Are Empty: Absolute Edition Complete – Hotfix 3 + Bonus OST",
    "You Are Empty: Absolute Edition Complete – Hotfix 3 + Bonus OST",
    "You Are Empty",
  ],
  [
    "Puyo Puyo Tetris 2: Launch Edition + Skill Battle Booster Pack DLC",
    "Puyo Puyo Tetris 2: Launch Edition + Skill Battle Booster Pack DLC",
    "Puyo Puyo Tetris 2",
  ],
  ["Ascend to ZERO – MS Store v1.0.4.0", "Ascend to ZERO – MS Store", "Ascend to ZERO"],
  ["Backpack Dungeon – 2.0.1", "Backpack Dungeon – 2.0.1", "Backpack Dungeon"],
  [
    "Horizon: Forbidden West – Complete Edition  Updates posted",
    "Horizon: Forbidden West – Complete Edition Updates posted",
    "Horizon: Forbidden West",
  ],
  [
    "The Cursed Tape + Windows 7 Fix",
    "The Cursed Tape + Windows 7 Fix",
    "The Cursed Tape",
  ],
  [
    "Backrooms Break + Windows 7 Fix",
    "Backrooms Break + Windows 7 Fix",
    "Backrooms Break",
  ],
  [
    "Eiyuden Chronicle: Hundred Heroes + 4 DLCs + Lam Bug Fix",
    "Eiyuden Chronicle: Hundred Heroes + Lam Bug Fix",
    "Eiyuden Chronicle: Hundred Heroes",
  ],
  [
    "Dying Light 2: Stay Human – Ultimate Edition, v1.30.0 + 31 DLCs + Bonus Content + Windows 7 Fix",
    "Dying Light 2: Stay Human – Ultimate Edition, + Bonus Content + Windows 7 Fix",
    "Dying Light 2: Stay Human",
  ],
  [
    "Forza Horizon 4: Ultimate Edition, v1.465.282.0 Steam + All DLCs + Multiplayer",
    "Forza Horizon 4: Ultimate Edition, Steam + Multiplayer",
    "Forza Horizon 4",
  ],
  [
    "DRIVECLUB, v1.28 EU/US + All DLCs (Recompiled for PC v0.2.5)",
    "DRIVECLUB, EU/US",
    "DRIVECLUB",
  ],
  ["Anno.1800.Crackfix-EMPRESS", "Anno.1800.Crackfix-EMPRESS", "Anno 1800"],
  [
    "Fallout 4: High Resolution Texture Pack – for v1.10.980.0+",
    "Fallout 4: High Resolution Texture Pack – for+",
    "Fallout 4: High Resolution Texture Pack",
  ],
  [
    "Little Kitty, Big City, v1.24.5.8_3487 + Bonus Soundtrack",
    "Little Kitty, Big City, + Bonus Soundtrack",
    "Little Kitty, Big City",
  ],
];

test("index sample misses clean to the Steam name", async () => {
  const { cleanGameTitle } = await load();
  for (const [indexName, appName, clean] of INDEX_MISSES) {
    assert.equal(cleanGameTitle(indexName), clean, indexName);
    assert.equal(cleanGameTitle(appName), clean, appName);
  }
});

test("long repeated edition words clean quickly", async () => {
  const { cleanGameTitle } = await load();
  const start = Date.now();
  cleanGameTitle(`Game ${"founders ".repeat(40)}x`);
  cleanGameTitle(`Game ${"premium deluxe ".repeat(40)}Edition`);
  assert.ok(Date.now() - start < 200);
});

test("only the same name after cleaning counts as a match", async () => {
  const { isConfidentMatch } = await load();
  assert.ok(
    isConfidentMatch("Lightyear Frontier & Soundtrack Bundle", "Lightyear Frontier")
  );
  assert.ok(isConfidentMatch("Stardew Valley", "Stardew Valley™"));
  assert.ok(isConfidentMatch("Ratchet and Clank", "Ratchet & Clank"));
  assert.ok(isConfidentMatch("Pokemon Legends", "Pokémon Legends"));
  assert.ok(isConfidentMatch("Assassins Creed Mirage", "Assassin's Creed Mirage"));
  assert.ok(!isConfidentMatch("Lightyear Frontier", "Lightyear Frontier 2"));
  assert.ok(!isConfidentMatch("Hades", "Hades II"));
  assert.ok(!isConfidentMatch("Portal", "Portal 2"));
  assert.ok(
    !isConfidentMatch(
      "Split Fiction, v1.0 + Friend's Pass",
      "Split Fiction Friend's Pass"
    )
  );
  assert.ok(!isConfidentMatch("", ""));
});

test("a subtitle Steam adds counts only when Steam calls it a game", async () => {
  const { isConfidentMatch } = await load();
  assert.ok(isConfidentMatch("The Witcher 3", "The Witcher 3: Wild Hunt", "game"));
  assert.ok(isConfidentMatch("Batman Arkham Knight", "Batman™: Arkham Knight", "game"));
  assert.ok(isConfidentMatch("Dying Light 2", "Dying Light 2 - Stay Human", "game"));
  assert.ok(!isConfidentMatch("The Witcher 3", "The Witcher 3: Wild Hunt"));
  assert.ok(!isConfidentMatch("Split Fiction", "Split Fiction: Friend's Pass", "dlc"));
  assert.ok(!isConfidentMatch("Hades", "Hades II: Early Access", "game"));
  assert.ok(!isConfidentMatch("Game", "Game: Soundtrack", "music"));
});

test("a FitGirl name finds its Steam page through the cleaned name", async () => {
  const { findGameDetails } = await load();
  const asked = [];
  const lookup = async name => {
    asked.push(name);
    return name === "Game Name" ? steamGame("Game Name") : null;
  };
  const raw = "Game Name: Deluxe Edition - v1.2.3 + 5 DLCs + Bonus";
  const details = await findGameDetails(raw, lookup);
  assert.equal(details.name, "Game Name");
  assert.deepEqual(asked, [raw, "Game Name"]);

  // The same title later reuses the session answer for the cleaned name
  await findGameDetails(raw, lookup);
  assert.deepEqual(asked, [raw, "Game Name", raw]);
});

test("index answers win when they fit, loose ones give way to the cleaned match", async () => {
  const { findGameDetails } = await load();
  const found = steamGame("Official Game");
  assert.equal(await findGameDetails("Official Game", async () => found), found);

  // A clean name is not asked twice
  let calls = 0;
  const none = async () => {
    calls += 1;
    return null;
  };
  assert.equal(await findGameDetails("Clean Name", none), null);
  assert.equal(calls, 1);

  // Steam's own matcher picked the Friend's Pass app for the raw name
  const split = await findGameDetails(
    "Split Fiction, v1.0.2.0 + Friend's Pass",
    async name =>
      name === "Split Fiction"
        ? steamGame("Split Fiction")
        : steamGame("Split Fiction Friend's Pass")
  );
  assert.equal(split.name, "Split Fiction");

  // Nothing better from the cleaned name keeps the old answer
  const kept = await findGameDetails("Dredge Deluxe Edition", async name =>
    name === "Dredge" ? null : steamGame("DREDGE Digital Deluxe")
  );
  assert.equal(kept.name, "DREDGE Digital Deluxe");

  // A loose cleaned-name hit is dropped
  assert.equal(
    await findGameDetails("Hades + Soundtrack", async name =>
      name === "Hades" ? steamGame("Hades II") : null
    ),
    null
  );
});

test("a failed cleaned-name lookup is tried again later", async () => {
  const { findGameDetails } = await load();
  let fail = true;
  const lookup = async name => {
    if (name === "Flaky Game" && fail) throw new Error("offline");
    return name === "Flaky Game" ? steamGame("Flaky Game") : null;
  };
  await assert.rejects(findGameDetails("Flaky Game v1.0", lookup), /offline/);
  fail = false;
  const retried = await findGameDetails("Flaky Game v1.0", lookup);
  assert.equal(retried.name, "Flaky Game");
});

// Wrong matches the index sample showed (report 2026-11-07-steam-misses):
// [index name, Steam answer for the raw name, answer for the cleaned name,
// name shown or null]. "You Are Empty Demo" stands in for the near name seen.
const wrongMatchRows = [
  ["Backpack Dungeon – 2.0.1", "Backpack Dungeon Demo", "Backpack Dungeon Demo", null],
  [
    "Backpack Dungeon – 2.0.1",
    "Backpack Dungeon Demo",
    "Backpack Dungeon",
    "Backpack Dungeon",
  ],
  ["Fallout 4: High Resolution Texture Pack", "Fallout 4", "Fallout 4", null],
  [
    "Fallout 4: High Resolution Texture Pack",
    "Fallout 4: High Resolution Texture Pack",
    null,
    "Fallout 4: High Resolution Texture Pack",
  ],
  ["MEMORIAPOLIS: Fish & Ships Pack", "MEMORIAPOLIS", "MEMORIAPOLIS", null],
  [
    "You Are Empty: Absolute Edition Complete – Hotfix 3 + Bonus OST",
    "You Are Empty Demo",
    "You Are Empty",
    "You Are Empty",
  ],
  [
    "Monster Hunter Stories 3: Twisted Reflection – Premium Deluxe Edition, v1.1.01 + 27 DLCs",
    "Monster Hunter Stories 3: Twisted Reflection Soundtrack",
    "Monster Hunter Stories 3: Twisted Reflection",
    "Monster Hunter Stories 3: Twisted Reflection",
  ],
  [
    "Hunting Simulator 2: Elite Edition, v1.0.0.311.66949 + 4 DLCs",
    "Hunting Simulator 2 Playtest",
    null,
    null,
  ],
  ["Hades + Soundtrack", "Hades Soundtrack", "Hades Soundtrack", null],
  ["Hades", "Hades II", null, null],
  ["Cyberpunk 2077", "Cyberpunk 2077 DLC", null, null],
  [
    "Cyberpunk 2077: Phantom Liberty DLC",
    "Cyberpunk 2077 - Phantom Liberty DLC",
    null,
    "Cyberpunk 2077 - Phantom Liberty DLC",
  ],
];

test("a first answer that is a different game, demo, soundtrack or DLC is never shown", async () => {
  for (const [index, rawAnswer, cleanAnswer, shown] of wrongMatchRows) {
    const { findGameDetails } = await load();
    const clean = (await load()).cleanGameTitle(index);
    const details = await findGameDetails(index, async name => {
      const answer = name === clean && name !== index ? cleanAnswer : rawAnswer;
      return answer ? steamGame(answer) : null;
    });
    assert.equal(details?.name ?? null, shown, index);
  }
});

test("Steam minimum text with run-together labels splits into card fields", async () => {
  const { parseSteamMinimum } = await load();
  assert.deepEqual(parseSteamMinimum(STEAM_MINIMUM), {
    os: "Windows 10",
    cpu: "Intel Core i5-4590 / AMD FX 8350",
    ram: "8 GB RAM",
    gpu: "NVIDIA GeForce GTX 970 / AMD Radeon R9 290",
    directx: "Version 11",
    storage: "10 GB available space",
  });
  assert.deepEqual(
    parseSteamMinimum("Minimum:OS: Windows 7Hard Drive: 2 GB available space"),
    {
      os: "Windows 7",
      storage: "2 GB available space",
    }
  );
  assert.equal(parseSteamMinimum("Minimum: a potato"), null);
  assert.equal(parseSteamMinimum(""), null);
  assert.equal(parseSteamMinimum(undefined), null);
});

test("the lookup gets the cleaned name and its answer must match strictly", async () => {
  const { matchRequirements } = await load();
  const asked = [];
  const lookup = async name => {
    asked.push(name);
    return steamGame("Lightyear Frontier");
  };
  const match = await matchRequirements(
    "Lightyear Frontier & Soundtrack Bundle – -Bonuses",
    {
      lookup,
    }
  );
  assert.deepEqual(asked, ["Lightyear Frontier"]);
  assert.equal(match.name, "Lightyear Frontier");
  assert.equal(match.minReqs.ram, "8 GB RAM");

  // Steam's own matcher accepts loose hits; those show nothing
  const loose = await matchRequirements("Hades", {
    lookup: async () => steamGame("Hades II"),
  });
  assert.equal(loose, null);
  assert.equal(
    await matchRequirements("Nothing Here", { lookup: async () => null }),
    null
  );
  assert.equal(
    await matchRequirements("No Specs", {
      lookup: async () => ({ name: "No Specs", system_requirements: { minimum: "" } }),
    }),
    null
  );
});

test("page data is used first, and each title is looked up once per session", async () => {
  const { matchRequirements } = await load();
  let calls = 0;
  const lookup = async () => {
    calls += 1;
    return steamGame("Dredge");
  };
  const fromKnown = await matchRequirements("Dredge Deluxe Edition", {
    known: steamGame("DREDGE"),
    lookup,
  });
  assert.equal(fromKnown.name, "DREDGE");
  assert.equal(calls, 0);

  // A wrong page match falls through to the lookup, then is cached
  const first = await matchRequirements("Dome Keeper", {
    known: steamGame("Dome Keeper 2"),
    lookup: async () => {
      calls += 1;
      return steamGame("Dome Keeper");
    },
  });
  const again = await matchRequirements("Dome Keeper v4.2", { lookup });
  assert.equal(first.name, "Dome Keeper");
  assert.deepEqual(again, first);
  assert.equal(calls, 1);
});

test("a failed lookup shows nothing and is tried again later", async () => {
  const { matchRequirements } = await load();
  const original = console.error;
  console.error = () => {};
  try {
    const failed = await matchRequirements("Flaky Game", {
      lookup: async () => {
        throw new Error("offline");
      },
    });
    assert.equal(failed, null);
  } finally {
    console.error = original;
  }
  const retried = await matchRequirements("Flaky Game", {
    lookup: async () => steamGame("Flaky Game"),
  });
  assert.equal(retried.name, "Flaky Game");
});

// Edition names from Victor's Windows test (2026-11-08): [index name,
// Steam answer per looked-up name, name shown or null]
const editionRows = [
  [
    "Victoria 3 Ultimate Bundle, -Bonuses + Windows 7 Fix",
    { "Victoria 3": "Victoria 3" },
    "Victoria 3",
  ],
  [
    "Crusader Kings III Grand Edition Bundle",
    { "Crusader Kings III": "Crusader Kings III" },
    "Crusader Kings III",
  ],
  [
    "The Witcher Enhanced Edition",
    { "The Witcher": "The Witcher: Enhanced Edition Director's Cut" },
    "The Witcher: Enhanced Edition Director's Cut",
  ],
  [
    "The Witcher 2 Assassins of Kings Enhanced Edition",
    {
      "The Witcher 2 Assassins of Kings Enhanced Edition":
        "The Witcher 2: Assassins of Kings Enhanced Edition",
    },
    "The Witcher 2: Assassins of Kings Enhanced Edition",
  ],
  [
    "The Witcher 2 Assassins of Kings Enhanced Edition",
    {
      "The Witcher 2 Assassins of Kings":
        "The Witcher 2: Assassins of Kings Enhanced Edition",
    },
    "The Witcher 2: Assassins of Kings Enhanced Edition",
  ],
  [
    "The Elder Scrolls V: Skyrim Special Edition",
    {
      "The Elder Scrolls V: Skyrim Special Edition":
        "The Elder Scrolls V: Skyrim Special Edition",
      "The Elder Scrolls V: Skyrim": "The Elder Scrolls V: Skyrim",
    },
    "The Elder Scrolls V: Skyrim Special Edition",
  ],
  [
    "The Witcher 3",
    { "The Witcher 3": "The Witcher 3: Wild Hunt" },
    "The Witcher 3: Wild Hunt",
  ],
  // The fallback never takes a demo, soundtrack, another game or a non-game
  ["The Witcher Enhanced Edition", { "The Witcher": "The Witcher 3: Wild Hunt" }, null],
  ["Hades Enhanced Edition", { Hades: "Hades Soundtrack" }, null],
  ["Hades Enhanced Edition", { Hades: "Hades Demo" }, null],
  ["Hades Enhanced Edition", { Hades: ["Hades: Extra Story", "dlc"] }, null],
];

test("edition bundles clean off and edition names get one edition-less lookup", async () => {
  for (const [index, answers, shown] of editionRows) {
    const { findGameDetails } = await load();
    const asked = [];
    const details = await findGameDetails(index, async name => {
      asked.push(name);
      const answer = answers[name];
      if (!answer) return null;
      const [found, type] = Array.isArray(answer) ? answer : [answer, "game"];
      return { ...steamGame(found), type };
    });
    assert.equal(details?.name ?? null, shown, index);
    assert.ok(asked.length <= 3, `${index}: ${asked.join(" | ")}`);
  }
});

test("requirements accept the page's edition-less Steam match", async () => {
  const { matchRequirements, stripEditionWords } = await load();
  assert.equal(
    stripEditionWords("The Witcher: Enhanced Edition Director's Cut"),
    "The Witcher"
  );
  assert.equal(stripEditionWords("Hades"), "Hades");
  const match = await matchRequirements("The Witcher Enhanced Edition", {
    known: { ...steamGame("The Witcher: Enhanced Edition Director's Cut"), type: "game" },
    lookup: async () => null,
  });
  assert.equal(match.name, "The Witcher: Enhanced Edition Director's Cut");
});
