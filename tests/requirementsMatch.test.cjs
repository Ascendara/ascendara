const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("./helpers/loadModule.cjs");

const load = () => loadModule("src/lib/requirementsMatch.js", { fresh: true });

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
  assert.ok(!isConfidentMatch("", ""));
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
  assert.equal(again, first);
  assert.equal(calls, 1);
});

test("page details fall back to the cleaned name and share its lookup", async () => {
  const { findGameDetails, matchRequirements } = await load();
  const asked = [];
  const lookup = async name => {
    asked.push(name);
    return name === "Enshrouded" ? steamGame("Enshrouded") : null;
  };
  const raw = "Enshrouded Deluxe Edition – -Bonuses";
  const details = await findGameDetails(raw, lookup);
  assert.equal(details.name, "Enshrouded");
  assert.deepEqual(asked, [raw, "Enshrouded"]);

  // The requirements card reuses that answer instead of asking Steam again
  const match = await matchRequirements(raw, { lookup });
  assert.equal(match.minReqs.ram, "8 GB RAM");
  assert.deepEqual(asked, [raw, "Enshrouded"]);

  // The raw answer wins, a clean name is not asked twice, loose hits are dropped
  const found = steamGame("Official Game");
  assert.equal(await findGameDetails("Official Game", async () => found), found);
  let calls = 0;
  const none = async () => {
    calls += 1;
    return null;
  };
  assert.equal(await findGameDetails("Clean Name", none), null);
  assert.equal(calls, 1);
  assert.equal(
    await findGameDetails("Hades + Soundtrack", async name =>
      name === "Hades" ? steamGame("Hades II") : null
    ),
    null
  );
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
