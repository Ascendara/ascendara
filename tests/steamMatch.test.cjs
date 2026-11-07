const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("./helpers/loadModule.cjs");

const load = () => loadModule("src/lib/steamMatch.js", { fresh: true });

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

const steamGame = name => ({
  name,
  system_requirements: { minimum: "", recommended: "" },
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
