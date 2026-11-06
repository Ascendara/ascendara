const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("./helpers/loadModule.cjs");

test("a queued download does not go through a service that was paused since", async () => {
  const { createDebridService } = await loadModule(
    "src/services/downloads/debridService.js",
    {
      fresh: true,
    }
  );
  const fake = id => ({
    id,
    name: id,
    apiKeySetting: `${id}Key`,
    getSupportedHosts: async () => ["files.test"],
    isSupportedUrl: () => true,
    resolveHost: async () => ({
      id: "x",
      status: "ready",
      url: `https://${id}.test/file`,
    }),
  });
  const debrid = createDebridService([fake("first"), fake("second")]);
  const settings = { debridEnabled: true, firstKey: "a", secondKey: "b" };
  const link = "https://files.test/game";
  // The queue sends no host name, only the service it saved.
  const route = async extra =>
    (await debrid.resolveHost({ ...settings, ...extra }, link, null, null, 0, "second"))
      .providerId;
  assert.equal(await route({}), "second");
  assert.equal(await route({ debridProviderEnabled: { second: false } }), "first");
  assert.equal(await route({ secondKey: "" }), "first");
  await assert.rejects(
    route({ debridProviderEnabled: { first: false, second: false } }),
    /No configured debrid service/
  );
});
