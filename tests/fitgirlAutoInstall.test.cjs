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

// Silent runs go through the takeover; adapt a runSetup-style fake to it.
const asTakeover = runSetup => async (installer, args) => {
  const code = await runSetup(installer, args);
  if (code === 1223) return { code, result: null };
  return {
    code: 0,
    result: { succeeded: code === 0 || code === null, exitCode: code, extras: [] },
  };
};

test("auto-install verifies, runs setup with args, finishes and cleans the pack", async () => {
  const pack = makePack();
  const stages = [];
  let ranWith;
  const result = await runAutoInstall({
    ...pack,
    gameName: "Game",
    options,
    onStage: update => stages.push(update.stage),
    runTakeover: asTakeover(async (installer, args) => {
      ranWith = { installer, args };
      fs.outputFileSync(path.join(pack.gameDirectory, "Game", "game.exe"), "x");
      return 0;
    }),
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
  const updates = [];
  const result = await runAutoInstall({
    ...pack,
    gameName: "Game",
    options,
    runTakeover: asTakeover(async () => (ran = true)),
    completeInstall: async () => ({ success: true }),
    onStage: update => updates.push(update),
  });
  assert.equal(result.success, false);
  assert.equal(result.stage, "verifying");
  assert.deepEqual(updates.at(-1), {
    stage: "failed",
    failedStage: "verifying",
    error: result.error,
  });
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
      runTakeover: asTakeover(async () => code),
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
    runTakeover: asTakeover(async () => null),
    completeInstall: async () => ({ success: true }),
  });
  assert.equal(missing.success, false);
  assert.match(missing.error, /No game found/);

  const found = await runAutoInstall({
    ...pack,
    gameName: "Game",
    options: { ...options, verify: false, deletePack: false },
    runTakeover: asTakeover(async () => {
      fs.outputFileSync(path.join(pack.gameDirectory, "Game", "bin", "game.exe"), "x");
      return null;
    }),
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

for (const [label, override] of [
  ["silent off", { silent: false }],
  ["RAM limit on", { limitRam: true }],
]) {
  test(`${label} uses the visible wizard, never the takeover`, async () => {
    const pack = makePack();
    let tookOver = false;
    let ranSetup = false;
    await runAutoInstall({
      ...pack,
      gameName: "Game",
      options: { ...options, ...override, redists: true, hostsRedirect: true },
      runSetup: async () => ((ranSetup = true), 0),
      runTakeover: async () => ((tookOver = true), { code: 0, result: null }),
      completeInstall: async () => ({ success: true }),
    });
    assert.equal(ranSetup, true);
    assert.equal(tookOver, false);
  });
}

test("an installer outside the download folder never runs", async () => {
  const pack = makePack();
  let ran = false;
  const result = await runAutoInstall({
    ...pack,
    installerPath: path.join(os.tmpdir(), "setup.exe"),
    gameName: "Game",
    options,
    runTakeover: asTakeover(async () => (ran = true)),
    completeInstall: async () => ({ success: true }),
  });
  assert.equal(result.success, false);
  assert.equal(ran, false);
});

test("setup path and arguments never enter the PowerShell script text", async () => {
  const {
    runElevatedSetup,
  } = require("../electron/modules/downloads/fitgirlAutoInstall");
  const { EventEmitter } = require("node:events");
  const installer = "C:\\Games\\Bob\u2019s Game'; calc\\setup.exe";
  const args = ["/SP-", '/DIR="C:\\Games\\Bob\u2019s Game"'];
  let seen;
  const spawnProcess = (file, argv, opts) => {
    seen = { file, argv, opts };
    const child = new EventEmitter();
    setImmediate(() => child.emit("exit", 0));
    return child;
  };
  assert.equal(await runElevatedSetup(installer, args, spawnProcess), 0);
  const script = Buffer.from(seen.argv.at(-1), "base64").toString("utf16le");
  assert.equal(script.includes("Bob"), false);
  assert.equal(seen.opts.env.ASCENDARA_FG_SETUP, installer);
  assert.deepEqual(seen.opts.env.ASCENDARA_FG_ARGS.split("\n"), args);
  await assert.rejects(runElevatedSetup("C:\\a\nb\\setup.exe", [], spawnProcess));
});

// Fake takeover that installs game.exe (and the installed MD5 list when given).
const installs = (pack, list, calls = []) =>
  asTakeover(async (_, args) => {
    calls.push("setup");
    const dir = path.join(pack.gameDirectory, "Game");
    fs.outputFileSync(path.join(dir, "bin", "game.exe"), "game");
    if (list) fs.outputFileSync(path.join(dir, "_Redist", "fitgirl.md5"), list);
    return 0;
  });

test("installed files are checked against _Redist\\fitgirl.md5, ..\\ paths included", async () => {
  const pack = makePack();
  const stages = [];
  const result = await runAutoInstall({
    ...pack,
    gameName: "Game",
    options: { ...options, verifyInstalled: true, deletePack: false },
    onStage: update => stages.push(update.stage),
    runTakeover: installs(pack, `; QuickSFV\r\n${md5("game")} *..\\bin\\game.exe\r\n`),
    completeInstall: async () => ({ success: true }),
  });
  assert.equal(result.success, true);
  assert.deepEqual(result.verifyInstalled.passed, [path.join("bin", "game.exe")]);
  assert.deepEqual(
    [...new Set(stages)],
    ["verifying", "installing", "verifyingInstall", "done"]
  );
});

test("a bad installed file fails like a bad part and keeps the pack", async () => {
  const pack = makePack();
  let completed = false;
  const updates = [];
  const result = await runAutoInstall({
    ...pack,
    gameName: "Game",
    options: { ...options, verifyInstalled: true },
    onStage: update => updates.push(update),
    runTakeover: installs(pack, `${md5("other")} *..\\bin\\game.exe\r\n`),
    completeInstall: async () => (completed = true),
  });
  assert.equal(result.success, false);
  assert.equal(result.stage, "verifyingInstall");
  assert.match(result.error, /Files failed the MD5 check: bin[\\/]game\.exe/);
  assert.equal(updates.at(-1).failedStage, "verifyingInstall");
  assert.equal(completed, false);
  assert.equal(fs.existsSync(pack.installerPath), true);
});

test("a missing installed MD5 list skips the check; off skips it too", async () => {
  for (const [verifyInstalled, list] of [
    [true, null],
    [false, `${md5("other")} *..\\bin\\game.exe\r\n`],
  ]) {
    const pack = makePack();
    const result = await runAutoInstall({
      ...pack,
      gameName: "Game",
      options: { ...options, verifyInstalled },
      runTakeover: installs(pack, list),
      completeInstall: async () => ({ success: true }),
    });
    assert.equal(result.success, true);
    assert.equal(result.verifyInstalled, undefined);
  }
});

test("order: setup, installed check, finish, open site, delete pack", async () => {
  const pack = makePack();
  const calls = [];
  const result = await runAutoInstall({
    ...pack,
    gameName: "Game",
    options: { ...options, verifyInstalled: true, openSite: true },
    onStage: update => calls.push(update.stage),
    runTakeover: installs(pack, `${md5("game")} *..\\bin\\game.exe\r\n`, calls),
    completeInstall: async () => (calls.push("complete"), { success: true }),
    openExternal: async url => calls.push(url),
  });
  assert.equal(result.success, true);
  assert.deepEqual(
    calls.filter((call, i) => call !== calls[i - 1]),
    [
      "verifying",
      "installing",
      "setup",
      "verifyingInstall",
      "complete",
      "https://fitgirl-repacks.site",
      "cleaning",
      "done",
    ]
  );
});

test("the site opens only when on and after a good install; an open error is logged", async () => {
  for (const [openSite, fails, expected] of [
    [false, false, 0],
    [true, true, 1],
  ]) {
    const pack = makePack();
    let opened = 0;
    const result = await runAutoInstall({
      ...pack,
      gameName: "Game",
      options: { ...options, openSite },
      runTakeover: installs(pack),
      completeInstall: async () => ({ success: true }),
      openExternal: async () => {
        opened += 1;
        if (fails) throw new Error("no browser");
      },
    });
    assert.equal(result.success, true);
    assert.equal(opened, expected);
  }
  const pack = makePack();
  let opened = false;
  await runAutoInstall({
    ...pack,
    gameName: "Game",
    options: { ...options, openSite: true },
    runTakeover: asTakeover(async () => 2),
    completeInstall: async () => ({ success: true }),
    openExternal: async () => (opened = true),
  });
  assert.equal(opened, false);
});

test("redists and hosts redirect reach the takeover script options", async () => {
  for (const flags of [
    { redists: true, hostsRedirect: false },
    { redists: false, hostsRedirect: true },
    {},
  ]) {
    const pack = makePack();
    let seen;
    await runAutoInstall({
      ...pack,
      gameName: "Game",
      options: { ...options, ...flags },
      runTakeover: async (installer, args, config) => {
        seen = config;
        return { code: 0, result: { succeeded: false, exitCode: 1, extras: [] } };
      },
      completeInstall: async () => ({ success: true }),
    });
    assert.equal(seen.redists, flags.redists === true);
    assert.equal(seen.hostsRedirect, flags.hostsRedirect === true);
  }
});
