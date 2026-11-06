const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs-extra");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { runAutoInstall } = require("../electron/modules/downloads/fitgirlAutoInstall");

const md5 = text => crypto.createHash("md5").update(text).digest("hex");

function makePack({ badPart = false } = {}) {
  const gameDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "fg-auto-"));
  const packDir = path.join(gameDirectory, "pack");
  fs.mkdirpSync(path.join(packDir, "MD5"));
  fs.writeFileSync(path.join(packDir, "fg-01.bin"), "one");
  fs.writeFileSync(path.join(packDir, "setup.exe"), "setup");
  fs.writeFileSync(
    path.join(packDir, "MD5", "fitgirl-bins.md5"),
    `${md5(badPart ? "other" : "one")} *fg-01.bin\r\n`
  );
  return { gameDirectory, packDir, installerPath: path.join(packDir, "setup.exe") };
}

const options = { verify: true, silent: true, limitRam: false, deletePack: true };

test("auto-install verifies, runs setup with args, finishes and cleans the pack", async () => {
  const pack = makePack();
  const stages = [];
  let ranWith;
  const result = await runAutoInstall({
    ...pack,
    gameName: "Game",
    options,
    onStage: update => stages.push(update.stage),
    runSetup: async (installer, args) => {
      ranWith = { installer, args };
      fs.outputFileSync(path.join(pack.gameDirectory, "Game", "game.exe"), "x");
      return 0;
    },
    completeInstall: async () => ({ success: true }),
  });
  assert.equal(result.success, true);
  assert.equal(ranWith.installer, pack.installerPath);
  assert.ok(ranWith.args.includes("/SILENT"));
  assert.ok(ranWith.args.includes(`/DIR="${path.join(pack.gameDirectory, "Game")}"`));
  assert.deepEqual([...new Set(stages)], ["verifying", "installing", "cleaning", "done"]);
  assert.equal(fs.existsSync(path.join(pack.packDir, "fg-01.bin")), false);
  assert.equal(fs.existsSync(pack.installerPath), false);
  assert.equal(fs.existsSync(path.join(pack.gameDirectory, "Game", "game.exe")), true);
});

test("a bad part stops before setup and keeps the pack", async () => {
  const pack = makePack({ badPart: true });
  let ran = false;
  const result = await runAutoInstall({
    ...pack,
    gameName: "Game",
    options,
    runSetup: async () => (ran = true),
    completeInstall: async () => ({ success: true }),
  });
  assert.equal(result.success, false);
  assert.equal(result.stage, "verifying");
  assert.match(result.error, /fg-01\.bin/);
  assert.equal(ran, false);
  assert.equal(fs.existsSync(path.join(pack.packDir, "fg-01.bin")), true);
});

test("setup failure or a declined admin prompt keeps the pack and gives a reason", async () => {
  for (const [code, reason] of [
    [2, /code 2/],
    [1223, /declined/],
  ]) {
    const pack = makePack();
    let completed = false;
    const result = await runAutoInstall({
      ...pack,
      gameName: "Game",
      options,
      runSetup: async () => code,
      completeInstall: async () => (completed = true),
    });
    assert.equal(result.success, false);
    assert.match(result.error, reason);
    assert.equal(completed, false);
    assert.equal(fs.existsSync(pack.installerPath), true);
  }
});

test("an unknown exit code counts only when the game folder has an exe", async () => {
  const pack = makePack();
  const missing = await runAutoInstall({
    ...pack,
    gameName: "Game",
    options: { ...options, verify: false },
    runSetup: async () => null,
    completeInstall: async () => ({ success: true }),
  });
  assert.equal(missing.success, false);
  assert.match(missing.error, /No game found/);

  const found = await runAutoInstall({
    ...pack,
    gameName: "Game",
    options: { ...options, verify: false, deletePack: false },
    runSetup: async () => {
      fs.outputFileSync(path.join(pack.gameDirectory, "Game", "bin", "game.exe"), "x");
      return null;
    },
    completeInstall: async () => ({ success: true }),
  });
  assert.equal(found.success, true);
  assert.equal(fs.existsSync(pack.installerPath), true);
});

test("the RAM limit option runs setup with its own window", async () => {
  const pack = makePack();
  let args;
  await runAutoInstall({
    ...pack,
    gameName: "Game",
    options: { ...options, limitRam: true },
    runSetup: async (_, setupArgs) => ((args = setupArgs), 1),
    completeInstall: async () => ({ success: true }),
  });
  assert.equal(args.includes("/SILENT"), false);
});

test("an installer outside the download folder never runs", async () => {
  const pack = makePack();
  let ran = false;
  const result = await runAutoInstall({
    ...pack,
    installerPath: path.join(os.tmpdir(), "setup.exe"),
    gameName: "Game",
    options,
    runSetup: async () => (ran = true),
    completeInstall: async () => ({ success: true }),
  });
  assert.equal(result.success, false);
  assert.equal(ran, false);
});
