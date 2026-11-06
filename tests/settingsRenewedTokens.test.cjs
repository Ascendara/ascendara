const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("./helpers/loadModule.cjs");

// The same steps SettingsContext takes for a broadcast and for a save.
const context = async initial => {
  const { keepRenewedTokens, noteRenewedTokens } = await loadModule(
    "src/context/renewedTokens.js"
  );
  let current = { ...initial };
  const renewed = {};
  return {
    get current() {
      return current;
    },
    broadcast(incoming) {
      noteRenewedTokens(renewed, current, incoming);
      current = { ...current, ...incoming };
    },
    save(next) {
      const updated = keepRenewedTokens(next, current, renewed);
      const changes = Object.fromEntries(
        Object.entries(updated).filter(([key, value]) => !Object.is(value, current[key]))
      );
      current = updated;
      return changes;
    },
  };
};

const signedIn = {
  theme: "purple",
  realDebridApiKey: "old-token",
  realDebridOauthRefreshToken: "old-refresh",
};

test("a snapshot from before a token renewal does not write the old tokens back", async () => {
  const settings = await context(signedIn);
  const snapshot = settings.current;
  settings.broadcast({
    ...signedIn,
    realDebridApiKey: "new-token",
    realDebridOauthRefreshToken: "new-refresh",
  });

  const changes = settings.save({ ...snapshot, theme: "blue" });

  assert.deepEqual(changes, { theme: "blue" });
  assert.equal(settings.current.realDebridApiKey, "new-token");
  assert.equal(settings.current.realDebridOauthRefreshToken, "new-refresh");
});

test("signing out or in after a renewal still saves the new tokens", async () => {
  const settings = await context(signedIn);
  settings.broadcast({ realDebridApiKey: "new-token" });

  assert.deepEqual(settings.save({ ...settings.current, realDebridApiKey: "" }), {
    realDebridApiKey: "",
  });
  // The old key pasted again after signing out is a deliberate choice.
  assert.deepEqual(
    settings.save({ ...settings.current, realDebridApiKey: "old-token" }),
    {
      realDebridApiKey: "old-token",
    }
  );
});
