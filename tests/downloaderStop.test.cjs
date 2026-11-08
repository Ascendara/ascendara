const { test } = require("node:test");
const assert = require("node:assert/strict");
const { stopHelpers } = require("../electron/modules/downloads/downloadControl");

const BOOTLOADER = 101;
const CHILD = 102;

// Simulates "taskkill /F /T" on a PyInstaller onefile helper: killing the
// bootloader ends the child too, but the child stays listed while it exits.
function onefileHelper({ lingerMs = 400, failListings = 0 } = {}) {
  const alive = new Map([
    [BOOTLOADER, Infinity],
    [CHILD, Infinity],
  ]);
  const kills = [];
  return {
    kills,
    list: async () => {
      if (failListings-- > 0) throw new Error("WMI call timed out");
      const now = Date.now();
      return [...alive]
        .filter(([, until]) => until > now)
        .map(([pid]) => ({ pid, command: "AscendaraDownloader.exe" }));
    },
    kill: async pid => {
      kills.push(pid);
      if (alive.get(pid) !== Infinity) throw new Error(`process ${pid} not found`);
      const exitsAt = Date.now() + lingerMs;
      alive.set(BOOTLOADER, Math.min(alive.get(BOOTLOADER), Date.now()));
      alive.set(CHILD, Math.min(alive.get(CHILD), exitsAt));
    },
  };
}

const stop = (helper, options = {}) =>
  stopHelpers("Game", "C:\\Games\\Game", [BOOTLOADER, CHILD], {
    cooperative: false,
    list: helper.list,
    kill: helper.kill,
    exitMs: 3000,
    ...options,
  });

test("a child still exiting after its tree was killed does not fail the stop", async () => {
  const helper = onefileHelper();
  await stop(helper);
  assert.equal(helper.kills[0], BOOTLOADER);
});

test("a failed process listing is retried instead of failing the stop", async () => {
  const helper = onefileHelper({ failListings: 2 });
  await stop(helper);
});

test("a helper that never exits still fails the stop", async () => {
  const helper = {
    list: async () => [{ pid: BOOTLOADER, command: "AscendaraDownloader.exe" }],
    kill: async () => {},
  };
  await assert.rejects(stop(helper, { exitMs: 300 }), /still running/);
});

test("a helper that exits cooperatively is not killed", async () => {
  const helper = onefileHelper();
  let listings = 0;
  const list = async () => (++listings > 2 ? [] : helper.list());
  await stop(helper, { cooperative: true, list, graceMs: 2000 });
  assert.deepEqual(helper.kills, []);
});
