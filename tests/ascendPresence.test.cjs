const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Load the status service against a fake firebaseService so each write is counted.
const stub = `
export const auth = { get currentUser() { return globalThis.__presence.user; } };
export const updateUserStatus = (...args) => globalThis.__presence.update(...args);
export const getUserStatus = (...args) => globalThis.__presence.get(...args);
`;
let instance = 0;
function loadStatusService() {
  const source = fs
    .readFileSync(
      path.resolve(__dirname, "../src/services/ascend/ascendStatusService.js"),
      "utf8"
    )
    .replace(
      /from\s+["']\.\.\/firebase\/firebaseService["']/,
      `from "data:text/javascript;base64,${Buffer.from(stub).toString("base64")}"`
    );
  const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  return import(`${url}#${instance++}`);
}

function setup(t, stored = { preferredStatus: "online" }) {
  const writes = [];
  const handlers = {};
  globalThis.__presence = {
    user: { uid: "u1" },
    update: async status => {
      writes.push(status);
      return { success: true, error: null };
    },
    get: async () => ({ data: stored, error: null }),
  };
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
    electron: {
      onAppClose: fn => ((handlers.close = fn), () => {}),
      onAppHidden: fn => ((handlers.hidden = fn), () => {}),
      onAppShown: fn => ((handlers.shown = fn), () => {}),
    },
  };
  t.mock.timers.enable({ apis: ["setInterval"] });
  t.after(() => {
    delete globalThis.window;
    delete globalThis.__presence;
  });
  return { writes, handlers };
}

const settle = () => new Promise(resolve => setImmediate(resolve));

test("presence refreshes every few minutes, not every minute", async t => {
  const { writes } = setup(t);
  const service = await loadStatusService();
  await service.initializeStatusService(null, "u1");
  assert.deepEqual(writes, ["online"]);

  t.mock.timers.tick(60_000);
  await settle();
  assert.equal(writes.length, 1);

  t.mock.timers.tick(service.PRESENCE_REFRESH_MS - 60_000);
  await settle();
  assert.deepEqual(writes, ["online", "online"]);
  // Still well inside the API's ten minute expiry.
  assert.ok(service.PRESENCE_REFRESH_MS <= 5 * 60_000);
  service.cleanupStatusService();
});

test("a hidden app writes offline once and then stays quiet", async t => {
  const { writes, handlers } = setup(t);
  const service = await loadStatusService();
  await service.initializeStatusService(null, "u1");
  handlers.hidden();
  await settle();
  assert.deepEqual(writes, ["online", "offline"]);

  t.mock.timers.tick(service.PRESENCE_REFRESH_MS * 10);
  await settle();
  assert.deepEqual(writes, ["online", "offline"]);

  handlers.shown();
  await settle();
  assert.deepEqual(writes, ["online", "offline", "online"]);
  service.cleanupStatusService();
});

test("playing a game while hidden keeps presence fresh", async t => {
  const { writes, handlers } = setup(t);
  const service = await loadStatusService();
  await service.initializeStatusService(null, "u1");
  service.setGamePlayingState(true);
  handlers.hidden();
  await settle();
  writes.length = 0;

  t.mock.timers.tick(service.PRESENCE_REFRESH_MS * 2);
  await settle();
  assert.deepEqual(writes, ["online", "online"]);
  service.setGamePlayingState(false);
  service.cleanupStatusService();
});

test("invisible is written once since it never expires", async t => {
  const { writes } = setup(t, { preferredStatus: "invisible" });
  const service = await loadStatusService();
  await service.initializeStatusService(null, "u1");
  t.mock.timers.tick(service.PRESENCE_REFRESH_MS * 5);
  await settle();
  assert.deepEqual(writes, ["invisible"]);
  service.cleanupStatusService();
});

test("closing the app always writes offline", async t => {
  const { writes, handlers } = setup(t);
  const service = await loadStatusService();
  await service.initializeStatusService(null, "u1");
  handlers.hidden();
  await settle();
  await handlers.close();
  assert.deepEqual(writes, ["online", "offline", "offline"]);
  service.cleanupStatusService();
});
