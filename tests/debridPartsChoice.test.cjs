const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("./helpers/loadModule.cjs");

const parts = [
  "setup.exe",
  "fg-01.bin",
  "fg-selective-english.bin",
  "fg-selective-french.bin",
  "fg-selective-german.bin",
  "fg-optional-bonus.bin",
  "Game OST.zip",
  "Digital Artbook.pdf",
].map((name, id) => ({ id, name, size: 100 }));
const names = list => list.map(file => file.name);

const memoryStorage = (t, initial) => {
  const original = global.localStorage;
  const data = { ...initial };
  global.localStorage = {
    getItem: key => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
  };
  t.after(() => {
    if (original === undefined) delete global.localStorage;
    else global.localStorage = original;
  });
  return key => JSON.parse(data[key] || "{}");
};

test("the setting decides the parts: ask waits, all keeps, skip filters", async () => {
  const { resolveTorrentParts } = await loadModule(
    "src/services/downloads/debridParts.js"
  );
  assert.equal(resolveTorrentParts(parts, {}, "ask", "fr-FR"), null, "ask waits");
  assert.equal(
    resolveTorrentParts(parts, {}, undefined, "fr-FR"),
    null,
    "ask by default"
  );
  assert.equal(resolveTorrentParts(parts, {}, "all", "fr-FR"), parts);
  assert.deepEqual(names(resolveTorrentParts(parts, {}, "skipExtras", "fr-FR")), [
    "setup.exe",
    "fg-01.bin",
    "fg-selective-english.bin",
    "fg-selective-french.bin",
  ]);
  assert.deepEqual(
    names(resolveTorrentParts(parts, {}, "skipExtras", "en-GB")),
    ["setup.exe", "fg-01.bin", "fg-selective-english.bin"],
    "English systems keep only English"
  );
  const single = [parts[0]];
  assert.equal(
    resolveTorrentParts(single, {}, "ask", "en-US"),
    single,
    "one part never asks"
  );
});

test("a saved choice wins over the setting", async () => {
  const { resolveTorrentParts } = await loadModule(
    "src/services/downloads/debridParts.js"
  );
  const entry = { chosenFileIds: [1, "6"] };
  for (const mode of ["ask", "all", "skipExtras"])
    assert.deepEqual(names(resolveTorrentParts(parts, entry, mode, "en-US")), [
      "fg-01.bin",
      "Game OST.zip",
    ]);
});

test("when every part looks like an extra, skipping extras downloads them all", async () => {
  const { resolveTorrentParts } = await loadModule(
    "src/services/downloads/debridParts.js"
  );
  const extras = ["Soundtrack.zip", "Bonus Content.zip", "fg-selective-german.bin"].map(
    (name, id) => ({ id, name, size: 1 })
  );
  assert.equal(resolveTorrentParts(extras, {}, "skipExtras", "en-US"), extras);
});

test("a part choice is stored, listed while waiting, and cleared once saved", async t => {
  const read = memoryStorage(t, {
    torboxGameNames: JSON.stringify({
      "torrent:5": { gameData: { game: "Example" }, autoHandoff: true },
      "torrent:6": { game: "Sent", partFiles: [], localDownloadStarted: true },
      7: { partFiles: [] },
    }),
  });
  const { requestPartChoice, getPendingPartChoices, saveTorrentPartChoice } =
    await loadModule("src/services/downloads/debridParts.js");
  requestPartChoice("torboxGameNames", "torrent:5", [{ id: 1, name: "a", extra: 1 }]);
  requestPartChoice("torboxGameNames", "torrent:missing", parts);
  assert.deepEqual(getPendingPartChoices(["torboxGameNames", "realDebridGameData"]), [
    {
      storageKey: "torboxGameNames",
      recordKey: "torrent:5",
      name: "Example",
      files: [{ id: 1, name: "a", size: null }],
    },
  ]);
  saveTorrentPartChoice("torboxGameNames", "torrent:5", [1]);
  const record = read("torboxGameNames")["torrent:5"];
  assert.deepEqual(record.chosenFileIds, [1]);
  assert.equal(record.partFiles, undefined);
  assert.equal(record.autoHandoff, true, "the rest of the record is kept");
  assert.deepEqual(getPendingPartChoices(["torboxGameNames"]), []);
});

test("Real-Debrid waits for a choice, then selects only the chosen files", async t => {
  const read = memoryStorage(t, {
    realDebridGameData: JSON.stringify({ "torrent:rd1": { game: "Example" } }),
  });
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  const selections = [];
  global.fetch = async (url, options = {}) => {
    if (String(url).startsWith("/api/realdebrid/torrents?"))
      return Response.json([{ id: "rd1", status: "waiting_files_selection" }]);
    if (url === "/api/realdebrid/torrents/info/rd1")
      return Response.json({
        id: "rd1",
        status: "waiting_files_selection",
        files: [
          { id: 1, path: "/setup.exe", bytes: 10 },
          { id: 2, path: "/Soundtrack.zip", bytes: 5 },
        ],
      });
    assert.equal(url, "/api/realdebrid/torrents/selectFiles/rd1");
    selections.push(new URLSearchParams(String(options.body)).get("files"));
    return new Response(null, { status: 204 });
  };
  const worker = await loadModule("src/services/downloads/realDebridTorrentStartup.js", {
    fresh: true,
  });
  await worker.resumePendingTorrents("key", { debridTorrentParts: "ask" });
  assert.deepEqual(selections, [], "nothing is selected before the user picks");
  assert.deepEqual(
    read("realDebridGameData")["torrent:rd1"].partFiles.map(file => file.name),
    ["setup.exe", "Soundtrack.zip"]
  );
  const { saveTorrentPartChoice } = await loadModule(
    "src/services/downloads/debridParts.js"
  );
  saveTorrentPartChoice("realDebridGameData", "torrent:rd1", [1]);
  await worker.resumePendingTorrents("key", { debridTorrentParts: "ask" });
  assert.deepEqual(selections, ["1"]);
});

test("TorBox asks, then links each chosen file, or one zip for every part", async t => {
  const saved = { fetch: global.fetch, window: global.window };
  t.after(() => Object.assign(global, saved));
  global.window = { location: { origin: "http://localhost:5173" } };
  const requested = [];
  global.fetch = async raw => {
    const url = new URL(raw);
    if (url.pathname.endsWith("/torrents/mylist"))
      return Response.json({
        success: true,
        data: [
          {
            id: 5,
            download_finished: true,
            download_present: true,
            files: [
              { id: 11, name: "Game/setup.exe", size: 10 },
              { id: 12, name: "Game/Soundtrack.zip", size: 5 },
            ],
          },
        ],
      });
    assert.ok(url.pathname.endsWith("/torrents/requestdl"));
    requested.push(
      url.searchParams.get("file_id") ?? `zip:${url.searchParams.get("zip_link")}`
    );
    return Response.json({ success: true, data: "https://cdn.example/file" });
  };
  const { default: provider } = await loadModule(
    "src/services/downloads/debrid/torboxProvider.js"
  );
  const asked = await provider.getTorrentDownload("key", "5", () => null);
  assert.deepEqual(names(asked.chooseFrom), ["setup.exe", "Soundtrack.zip"]);
  assert.deepEqual(requested, [], "no link before a choice");
  const one = await provider.getTorrentDownload("key", "5", files => [files[0]]);
  assert.deepEqual(requested, ["11"]);
  assert.equal(one[0].filename, "setup.exe");
  await provider.getTorrentDownload("key", "5", files => files);
  assert.deepEqual(requested, ["11", "zip:true"]);
});
