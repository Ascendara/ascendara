const test = require("node:test");
const assert = require("node:assert/strict");

const { linkForLog } = require("../electron/modules/core/log-safe.js");

test("a download link is logged by host only", () => {
  assert.equal(linkForLog("https://h.test/dl/abc?token=secret"), "https://h.test/...");
  assert.equal(linkForLog("magnet:?xt=urn:btih:abc"), "magnet:...");
  assert.equal(linkForLog("not a link"), "(not a URL)");
  assert.equal(linkForLog(undefined), "(not a URL)");
});
