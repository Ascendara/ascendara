const { test } = require("node:test");
const assert = require("node:assert/strict");
const core = require("../electron/modules/downloads/usenet-core");
const torznab = require("../electron/modules/sources/torznab-core");

// A fetch that answers from a route table and records each request
function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, init = {}) => {
    calls.push({ url, init });
    const answer = routes(new URL(url), init);
    if (answer instanceof Error) throw answer;
    const { status = 200, body } = answer;
    return { ok: status < 400, status, json: async () => body };
  };
  return { impl, calls };
}

test("SABnzbd adds an NZB and follows it from queue to history", async () => {
  let stage = "queue";
  const { impl, calls } = fakeFetch(url => {
    const mode = url.searchParams.get("mode");
    if (mode === "addfile") return { body: { status: true, nzo_ids: ["SAB_1"] } };
    if (mode === "queue" && stage === "queue")
      return {
        body: {
          queue: {
            status: "Downloading",
            kbpersec: "2048",
            slots: [
              {
                nzo_id: "SAB_1",
                status: "Downloading",
                percentage: "42",
                timeleft: "0:01:30",
              },
            ],
          },
        },
      };
    if (mode === "queue") return { body: { queue: { slots: [] } } };
    if (mode === "history")
      return {
        body: {
          history: {
            slots: [
              { nzo_id: "SAB_1", status: "Completed", storage: "/downloads/games/Hades" },
            ],
          },
        },
      };
    return { body: {} };
  });
  const sab = core.sabnzbd(
    { url: "http://sab:8080/", apiKey: "k", category: "games" },
    impl
  );
  assert.equal(await sab.add(Buffer.from("<nzb/>"), "Hades"), "SAB_1");
  const add = new URL(calls[0].url);
  assert.equal(add.pathname, "/api");
  assert.equal(add.searchParams.get("apikey"), "k");
  assert.equal(add.searchParams.get("cat"), "games");
  assert.equal(calls[0].init.method, "POST");
  assert.ok(calls[0].init.body instanceof FormData);

  assert.deepEqual(await sab.job("SAB_1"), {
    state: "downloading",
    progress: 42,
    speed: 2048 * 1024,
    eta: 90,
  });
  stage = "done";
  assert.deepEqual(await sab.job("SAB_1"), {
    state: "completed",
    progress: 100,
    path: "/downloads/games/Hades",
  });
});

test("SABnzbd reports a bad API key as unauthorized", async () => {
  const { impl } = fakeFetch(() => ({
    body: { status: false, error: "API Key Incorrect" },
  }));
  await assert.rejects(core.sabnzbd({ url: "http://sab", apiKey: "x" }, impl).test(), {
    code: "unauthorized",
  });
});

test("NZBGet appends over JSON-RPC and reads failed history", async () => {
  const { impl, calls } = fakeFetch((url, init) => {
    const { method } = JSON.parse(init.body);
    if (method === "append") return { body: { result: 17 } };
    if (method === "listgroups") return { body: { result: [] } };
    if (method === "history")
      return { body: { result: [{ NZBID: 17, Status: "FAILURE/PAR" }] } };
    return { body: { result: null } };
  });
  const nzbget = core.nzbget(
    { url: "http://nzbget:6789", username: "u", password: "p", category: "games" },
    impl
  );
  assert.equal(await nzbget.add(Buffer.from("<nzb/>"), "Hades"), "17");
  const append = JSON.parse(calls[0].init.body);
  assert.equal(calls[0].url, "http://nzbget:6789/jsonrpc");
  assert.equal(
    calls[0].init.headers.Authorization,
    `Basic ${Buffer.from("u:p").toString("base64")}`
  );
  assert.equal(append.params[0], "Hades.nzb");
  assert.equal(Buffer.from(append.params[1], "base64").toString(), "<nzb/>");
  assert.equal(append.params[2], "games");
  assert.deepEqual(await nzbget.job("17"), { state: "failed", message: "FAILURE/PAR" });
  assert.deepEqual(await nzbget.job("99"), { state: "missing" });
});

test("NZBGet progress comes from remaining size", async () => {
  const { impl } = fakeFetch((url, init) => {
    const { method } = JSON.parse(init.body);
    if (method === "listgroups")
      return {
        body: {
          result: [
            { NZBID: 5, Status: "DOWNLOADING", FileSizeMB: 1000, RemainingSizeMB: 250 },
          ],
        },
      };
    if (method === "status") return { body: { result: { DownloadRate: 1048576 * 10 } } };
    return { body: { result: null } };
  });
  const job = await core.nzbget({ url: "http://n" }, impl).job("5");
  assert.equal(job.state, "downloading");
  assert.equal(job.progress, 75);
  assert.equal(job.eta, 25);
});

test("client errors read as codes", async () => {
  const unreachable = fakeFetch(() => new TypeError("fetch failed")).impl;
  await assert.rejects(core.sabnzbd({ url: "http://x" }, unreachable).test(), {
    code: "unreachable",
  });
  const denied = fakeFetch(() => ({ status: 401, body: {} })).impl;
  await assert.rejects(core.nzbget({ url: "http://x" }, denied).test(), {
    code: "unauthorized",
  });
  assert.throws(() => core.createClient({ usenetClient: "sabnzbd", usenetUrl: "" }), {
    code: "notConfigured",
  });
  assert.throws(() => core.sabnzbd({ url: "ftp://x" }), { code: "invalidUrl" });
});

test("mapPath swaps the client's folder for the local one", () => {
  assert.equal(
    core.mapPath("/downloads/games/Hades", "/downloads", "/mnt/nas/downloads", "/"),
    "/mnt/nas/downloads/games/Hades"
  );
  assert.equal(
    core.mapPath("/downloads/games/Hades", "/downloads/", "Z:\\usenet", "\\"),
    "Z:\\usenet\\games\\Hades"
  );
  assert.equal(core.mapPath("/downloadsX/a", "/downloads", "/mnt", "/"), "/downloadsX/a");
  assert.equal(
    core.mapPath("D:\\Usenet\\Game", "d:\\usenet", "/mnt/u", "/"),
    "/mnt/u/Game"
  );
  assert.equal(core.mapPath("/data/x", "", "", "/"), "/data/x");
});

test("formatting helpers", () => {
  assert.equal(core.clockSeconds("1:02:03"), 3723);
  assert.equal(core.formatEta(3723), "1h 2m");
  assert.equal(core.formatEta(65), "1m 5s");
  assert.equal(core.formatSpeed(1048576 * 3), "3.00 MB/s");
});

test("parseFeed tells Usenet results from torrents", () => {
  const items = torznab.parseFeed(`<rss><channel>
    <item><title>Game.NZB</title><link>http://p/1/download?id=1</link>
      <enclosure url="http://p/1/download?id=1" length="10" type="application/x-nzb" /></item>
    <item><title>Game.Torrent</title><link>http://p/2/download?id=2</link>
      <torznab:attr name="seeders" value="1" /></item>
  </channel></rss>`);
  assert.deepEqual(
    items.map(i => i.protocol),
    ["usenet", "torrent"]
  );
});
