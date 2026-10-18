const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const core = require("../electron/modules/privateSourceCore");
const bytes = Buffer.alloc(200000, 42);
const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
const game = { id: "test", title: "Test", path: "games/test.zip", type: "zip", size: bytes.length, sha256 };
const index = { version: 1, sourceId: "fixture", games: [game] };
async function temp(t) { const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ascendara-private-")); t.after(() => fs.rm(dir, { recursive: true, force: true })); return dir; }
async function server(t, handler) {
  const s = http.createServer(handler); await new Promise(r => s.listen(0, "127.0.0.1", r));
  t.after(() => { s.closeAllConnections(); return new Promise(r => s.close(r)); });
  return `http://127.0.0.1:${s.address().port}/index.json`;
}
test("filename cleaning preserves meaningful sequel numbers", () => {
  assert.equal(core.cleanTitle("Forza.Horizon.5.iso"), "Forza Horizon 5");
  assert.equal(core.cleanTitle("Cyberpunk.2077.Setup.exe"), "Cyberpunk 2077");
  assert.equal(core.cleanTitle("ELDEN_RING_v1.12.zip"), "ELDEN RING");
  assert.equal(core.cleanTitle("Portal.2.zip"), "Portal 2");
});
test("schema, duplicates, unsafe paths and artwork", () => {
  assert.equal(core.validateIndex(index).games[0].title, "Test");
  for (const ref of ["../secret.zip", "/secret.zip", "C:/secret.zip", "a\\b.zip", "%2e%2e/a.zip", "a/../b.zip", "a//b.zip", "CON.zip", "a.zip?x"])
    assert.throws(() => core.validateIndex({ ...index, games: [{ ...game, path: ref }] }));
  for (const bad of [{}, { ...index, version: 2 }, { ...index, games: [game, game] },
    { ...index, games: [{ ...game, size: -1 }] }, { ...index, games: [{ ...game, sha256: "bad" }] },
    { ...index, games: [{ ...game, artwork: { cover: "https://evil.test/a.png" } }] }]) assert.throws(() => core.validateIndex(bad));
  for (const url of ["file:///etc/passwd", "javascript:alert(1)", "http://user:pass@host/index.json"])
    assert.throws(() => core.httpUrl(url));
  assert.equal(core.resolveReference("http://localhost:8080/library/index.json", "games/Test Game.zip"), "http://localhost:8080/library/games/Test%20Game.zip");
});
test("recursive scan, exclusions, refresh, missing files and confinement", async t => {
  const root = await temp(t); await fs.mkdir(path.join(root, "nested"));
  await fs.writeFile(path.join(root, "nested", "Test.Setup.exe"), "inert");
  await fs.writeFile(path.join(root, "Readme.txt"), "readme");
  let result = await core.scan(root, "local"); assert.equal(result.games.length, 1); assert.equal(result.games[0].title, "Test");
  const id = result.games[0].id;
  assert.equal((await core.scan(root, "local")).games[0].id, id);
  assert.equal((await core.scan(root, "local", { exclude: ["nested"] })).games.length, 0);
  assert.equal((await core.scan(root, "local", { ignore: ["nested/Test.Setup.exe"] })).games.length, 0);
  await fs.unlink(path.join(root, "nested", "Test.Setup.exe"));
  assert.equal((await core.scan(root, "local")).games.length, 0);
  await assert.rejects(core.confined(root, "nested/Test.Setup.exe"));
  await assert.rejects(core.confined(root, "../escape"));
  await assert.rejects(core.scan(path.join(root, "missing-share"), "smb"));
});
test("symlink directory escapes are skipped and rejected", async t => {
  const root = await temp(t), outside = await temp(t);
  await fs.writeFile(path.join(outside, "secret.zip"), "secret");
  try { await fs.symlink(outside, path.join(root, "link"), process.platform === "win32" ? "junction" : "dir"); }
  catch (e) { if (e.code === "EPERM") return t.skip("OS does not permit symlinks"); throw e; }
  assert.equal((await core.scan(root, "local")).games.length, 0);
  await assert.rejects(core.confined(root, "link/secret.zip"), /pathEscapesRoot/);
});
test("metadata ranks exact titles and separates sequels", () => {
  const ranked = core.rankCandidates("Portal 2", [{ name: "Portal", id: 1 }, { name: "Portal 2", id: 2 }]);
  assert.equal(ranked[0].id, 2); assert.equal(ranked[0].confidence, 1); assert.ok(ranked[1].confidence < 0.9);
});
test("HTTP valid index, malformed JSON, authentication, redirects, size limit", async t => {
  let mode = "valid";
  const url = await server(t, (req, res) => {
    if (mode === "auth" && req.headers.authorization !== "Bearer test") { res.writeHead(401); return res.end(); }
    if (mode === "redirect") { res.writeHead(302, { Location: "http://example.com/" }); return res.end(); }
    res.end(mode === "json" ? "not json" : mode === "size" ? Buffer.alloc(100) : JSON.stringify(index));
  });
  assert.equal((await core.fetchIndex(url)).games.length, 1);
  mode = "json"; await assert.rejects(core.fetchIndex(url));
  mode = "auth"; await assert.rejects(core.fetchIndex(url), /"status":401/);
  assert.equal((await core.fetchIndex(url, { token: "test" })).games.length, 1);
  mode = "redirect"; await assert.rejects(core.fetchIndex(url), /redirectsNotAllowed/);
  mode = "size"; await assert.rejects(core.fetchBuffer(url, {}, 10), /responseTooLarge/);
});
test("offline source rejects", async () => {
  const s = http.createServer(); await new Promise(r => s.listen(0, "127.0.0.1", r));
  const port = s.address().port; await new Promise(r => s.close(r));
  await assert.rejects(core.fetchIndex(`http://127.0.0.1:${port}/index.json`));
});
test("HTTP transfer, progress, checksum and no-overwrite", async t => {
  const root = await temp(t), url = await server(t, (_, res) => res.end(bytes));
  const destination = path.join(root, "test.zip"); let progress = 0;
  await core.transfer({ source: { type: "http", location: url }, game, destination, onProgress: n => { progress = n; } });
  assert.equal(progress, bytes.length); assert.equal(await core.checksum(destination), sha256);
  await assert.rejects(core.transfer({ source: { type: "http", location: url }, game, destination }), /destinationExists/);
  await assert.rejects(core.transfer({ source: { type: "http", location: url }, game: { ...game, sha256: "0".repeat(64) }, destination: path.join(root, "bad.zip") }), /checksumMismatch/);
  await assert.rejects(core.transfer({ source: { type: "http", location: url }, game: { ...game, size: 1 }, destination: path.join(root, "size.zip") }), /sizeMismatch/);
});
test("Range resume and full-response fallback", async t => {
  const root = await temp(t); let range, honor = true;
  const url = await server(t, (req, res) => {
    range = req.headers.range;
    if (range && honor) { const offset = Number(range.match(/\d+/)[0]); res.writeHead(206, { "Content-Range": `bytes ${offset}-${bytes.length - 1}/${bytes.length}` }); res.end(bytes.subarray(offset)); }
    else res.end(bytes);
  });
  for (const name of ["resume.zip", "fallback.zip"]) {
    const destination = path.join(root, name); await fs.writeFile(destination + ".part", bytes.subarray(0, 1234));
    await core.transfer({ source: { type: "http", location: url }, game, destination });
    assert.equal(range, "bytes=1234-"); assert.equal(await core.checksum(destination), sha256); honor = false;
  }
});
test("cancellation retains partial and interrupted response fails", async t => {
  const root = await temp(t);
  const url = await server(t, (_, res) => { res.writeHead(200, { "Content-Length": bytes.length }); res.write(bytes.subarray(0, 100)); });
  const controller = new AbortController();
  await assert.rejects(core.transfer({ source: { type: "http", location: url }, game, destination: path.join(root, "cancel.zip"),
    signal: controller.signal, onProgress: () => controller.abort() }), /abort/i);
  const interrupted = await server(t, (_, res) => { res.writeHead(200, { "Content-Length": bytes.length }); res.write(bytes.subarray(0, 100)); setTimeout(() => res.destroy(), 10); });
  await assert.rejects(core.transfer({ source: { type: "http", location: interrupted }, game, destination: path.join(root, "broken.zip") }));
});
test("local copy validates size and checksum", async t => {
  const root = await temp(t), destination = path.join(await temp(t), "copy.zip");
  await fs.mkdir(path.join(root, "games")); await fs.writeFile(path.join(root, game.path), bytes);
  await core.transfer({ source: { type: "local", location: root }, game, destination });
  assert.equal(await core.checksum(destination), sha256);
  await assert.rejects(core.transfer({ source: { type: "smb", location: root }, game: { ...game, size: 1 }, destination: destination + "2" }), /sourceFileChanged/);
});
