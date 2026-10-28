const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getKhinsiderUrl, requestKhinsider } = require("../electron/modules/library/khinsider");

test("soundtrack requests only allow KHInsider search and album pages", () => {
  assert.equal(getKhinsiderUrl("/search?search=ASTRONEER"), "https://downloads.khinsider.com/search?search=ASTRONEER");
  for (const path of ["https://example.com/search", "//localhost/search", "/admin", "/game-soundtracks/album/../../admin", "https://user@downloads.khinsider.com/search", null]) {
    assert.throws(() => getKhinsiderUrl(path));
  }
});

test("browser requests return HTML and prohibit redirects outside validation", async () => {
  const result = await requestKhinsider("/search?search=ASTRONEER", {
    fetch: async (url, options) => {
      assert.equal(url, "https://downloads.khinsider.com/search?search=ASTRONEER");
      assert.equal(options.redirect, "error");
      assert.ok(options.signal instanceof AbortSignal);
      return new Response("<table class='albumList'></table>");
    },
  });
  assert.equal(result.success, true);
  assert.match(result.data, /albumList/);
});

test("blocked and failed requests remain errors rather than empty soundtracks", async () => {
  const blocked = await requestKhinsider("/search", { fetch: async () => new Response("blocked", { status: 403 }) });
  assert.deepEqual(blocked, { success: false, status: 403 });
  const failed = await requestKhinsider("/search", { fetch: async () => { throw new Error("offline"); } });
  assert.deepEqual(failed, { success: false, error: "offline" });
  const invalid = await requestKhinsider("https://example.com/search", { fetch: () => assert.fail("must not fetch") });
  assert.equal(invalid.success, false);
});
