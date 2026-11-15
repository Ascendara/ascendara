const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { parse } = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const { loadModule } = require("./helpers/loadModule.cjs");

const source = fs.readFileSync(
  path.join(__dirname, "../src/pages/big-picture/useBigPicturePage.js"),
  "utf8"
);
// handleStartDownload and the helpers it calls to start a download
const extracted = {};
const wanted = [
  "handleStartDownload",
  "downloadDataFor",
  "startResolvedDownload",
  "launchDownload",
  "startDebridDownload",
  "startTorrentDownload",
];
traverse(parse(source, { sourceType: "module", plugins: ["jsx"] }), {
  VariableDeclarator(nodePath) {
    const name = nodePath.node.id.name;
    if (wanted.includes(name)) {
      extracted[name] = source.slice(nodePath.node.init.start, nodePath.node.init.end);
    }
  },
});

test("Big Picture respects host priority and starts debrid and torrent downloads itself", async t => {
  const { createDebridService } = await loadModule(
    "src/services/downloads/debridService.js"
  );
  const provider = {
    id: "third",
    apiKeySetting: "thirdKey",
    torrentSetting: "thirdTorrents",
    prioritizeSetting: "thirdPriority",
    seamlessHosts: ["gofile"],
    getSupportedHosts: async () => ["files.test", "gofile.io"],
    isSupportedUrl: (url, domains) => domains.includes(new URL(url).hostname),
    hostDownloadMode: "direct",
    resolveHost: async () => ({ url: "https://cdn.test/resolved" }),
    submitMagnet: async () => ({ id: 1 }),
  };
  const debrid = createDebridService([provider]);
  const { isMagnetLink, isTorrentLink, pickTorrentLink } = await loadModule(
    "src/services/downloads/torrentLink.js"
  );
  const canDownloadTorrentLinks = (links, settings) =>
    (settings?.torrentEnabled === true && links.some(isTorrentLink)) ||
    (debrid.canUseCloudTorrents(settings) && links.some(isMagnetLink));

  const hosted = {
    custom: ["https://files.test/file"],
    gofile: ["https://gofile.io/d/file"],
  };
  // expected: the URL handed to the downloader, "cloud", or "handoff" (exit dialog)
  for (const [name, extraSettings, preferredHost, links, expected] of [
    ["normal seamless priority", {}, null, hosted, "https://gofile.io/d/file"],
    [
      "debrid priority",
      { thirdPriority: true },
      null,
      hosted,
      "https://cdn.test/resolved",
    ],
    ["explicit hosted selection", {}, "custom", hosted, "https://cdn.test/resolved"],
    ["cloud torrent", {}, null, { torrent: ["magnet:?xt=test"] }, "cloud"],
    [
      "local raw torrent",
      { torrentEnabled: true, thirdTorrents: false },
      null,
      { torrent: ["https://example.test/game.torrent"] },
      "https://example.test/game.torrent",
    ],
    [
      "host without a debrid route",
      {},
      "other",
      { other: ["https://other.test/file"] },
      "handoff",
    ],
  ]) {
    await t.test(name, async () => {
      const downloads = [];
      let exited = false;
      const context = vm.createContext({
        settings: { debridEnabled: true, thirdKey: "key", ...extraSettings },
        debrid,
        canDownloadTorrentLinks,
        isMagnetLink,
        pickTorrentLink,
        isMagicLink: () => false,
        isAuthenticated: true,
        setPendingDownloadData: () => {},
        setShowQueuePrompt: () => {},
        SEAMLESS_PROVIDERS: ["gofile", "pixeldrain"],
        hasActiveDownloads: async () => false,
        sanitizeText: value => value,
        window: {
          electron: {
            downloadFile: async (...args) => {
              downloads.push(args);
              return { success: true };
            },
          },
        },
        setDownloadingGame: () => {},
        setShowExitDialog: value => {
          exited = value;
        },
        changeView: () => {},
        t: key => key,
        console,
        toast: {
          success: () => {},
          info: () => {},
          loading: () => {},
          dismiss: () => {},
          error: message => assert.fail(message),
        },
      });
      vm.runInContext(
        wanted
          .slice(1)
          .map(name => `var ${name} = ${extracted[name]};`)
          .join("\n"),
        context
      );
      const start = vm.runInContext(`(${extracted.handleStartDownload})`, context);
      await start({ game: "Example", download_links: links }, preferredHost);
      assert.equal(exited, expected === "handoff");
      const startsHere = !["cloud", "handoff"].includes(expected);
      assert.equal(downloads.length, startsHere ? 1 : 0);
      if (startsHere) assert.equal(downloads[0][0], expected);
    });
  }
});

test("Big Picture resume surfaces the main-process error instead of hiding it", () => {
  assert.match(
    source,
    /toast\.error\(result\.error \|\| t\("downloads\.resumeError"\)\)/
  );
  assert.match(
    source,
    /toast\.error\(error\.message \|\| t\("downloads\.resumeError"\)\)/
  );
});
