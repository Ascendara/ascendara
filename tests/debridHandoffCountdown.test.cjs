const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("./helpers/loadModule.cjs");

// Echoes the key and its values so each case shows which string it picked.
const t = (key, vars = {}) =>
  [key, ...Object.entries(vars).map(([name, value]) => `${name}=${value}`)].join(" ");
const now = 1_000_000;

async function describe(entry) {
  const { describeHandoffWait } = await loadModule(
    "src/services/downloads/handoffCountdown.js"
  );
  return describeHandoffWait(entry, now, t);
}

test("each wait reason gets its own line", async () => {
  assert.deepEqual(
    await describe({ handoffWaitReason: "starting", nextHandoffAt: now + 10_000 }),
    { text: "debrid.handoff.startingIn seconds=10", secondsLeft: 10 }
  );
  assert.deepEqual(
    await describe({ handoffWaitReason: "retrying", nextHandoffAt: now + 15_000 }),
    { text: "debrid.handoff.retryingIn seconds=15", secondsLeft: 15 }
  );
  assert.deepEqual(
    await describe({
      handoffWaitReason: "waiting-for:Other Game",
      nextHandoffAt: now + 5_000,
    }),
    { text: "debrid.handoff.waitingFor game=Other Game", secondsLeft: 5 }
  );
  assert.deepEqual(
    await describe({ handoffWaitReason: "folder-has-install", nextHandoffAt: now }),
    { text: "debrid.handoff.folderHasInstall", secondsLeft: 0 }
  );
});

test("part of a second left rounds up, so it never reads 0 s too early", async () => {
  assert.deepEqual(
    await describe({ handoffWaitReason: "starting", nextHandoffAt: now + 4_001 }),
    { text: "debrid.handoff.startingIn seconds=5", secondsLeft: 5 }
  );
  assert.deepEqual(
    await describe({ handoffWaitReason: "retrying", nextHandoffAt: now + 1 }),
    { text: "debrid.handoff.retryingIn seconds=1", secondsLeft: 1 }
  );
});

test("a past-due or undated try shows Starting now", async () => {
  for (const entry of [
    { handoffWaitReason: "starting", nextHandoffAt: now - 3_000 },
    { handoffWaitReason: "retrying", nextHandoffAt: now },
    { handoffWaitReason: "starting" },
  ])
    assert.deepEqual(await describe(entry), {
      text: "debrid.handoff.startingNow",
      secondsLeft: 0,
    });
});

test("nothing shows once the PC download started or when nothing waits", async () => {
  assert.equal(await describe(undefined), null);
  assert.equal(await describe({ autoHandoff: true }), null);
  assert.equal(
    await describe({
      handoffWaitReason: "retrying",
      nextHandoffAt: now + 5_000,
      localDownloadStarted: true,
    }),
    null
  );
  assert.equal(await describe({ handoffWaitReason: "unknown" }), null);
});
