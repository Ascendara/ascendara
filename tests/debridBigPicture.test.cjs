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
let handler;
traverse(parse(source, { sourceType: "module", plugins: ["jsx"] }), {
  VariableDeclarator(nodePath) {
    if (nodePath.node.id.name === "handleStartDownload") {
      handler = source.slice(nodePath.node.init.start, nodePath.node.init.end);
    }
  },
});

test("Big Picture respects normal host priority and hands any adapter's cloud downloads to desktop", async t => {
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
    resolveHost: async () => {},
    submitMagnet: async () => {},
  };
  const debrid = createDebridService([provider]);
  for (const [name, extraSettings, preferredHost, links, expected] of [
    [
      "normal seamless priority",
      {},
      null,
      { custom: ["https://files.test/file"], gofile: ["https://gofile.io/d/file"] },
      "direct",
    ],
    [
      "debrid priority",
      { thirdPriority: true },
      null,
      { custom: ["https://files.test/file"], gofile: ["https://gofile.io/d/file"] },
      "cloud",
    ],
    [
      "explicit hosted selection",
      {},
      "custom",
      { custom: ["https://files.test/file"], gofile: ["https://gofile.io/d/file"] },
      "cloud",
    ],
    ["cloud torrent", {}, null, { torrent: ["magnet:?xt=test"] }, "cloud"],
  ]) {
    await t.test(name, async () => {
      const downloads = [];
      let exited = false;
      const context = vm.createContext({
        settings: { debridEnabled: true, thirdKey: "key", ...extraSettings },
        debrid,
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
        toast: { success: () => {}, error: message => assert.fail(message) },
      });
      const start = vm.runInContext(`(${handler})`, context);
      await start({ game: "Example", download_links: links }, preferredHost);
      assert.equal(exited, expected === "cloud");
      assert.equal(downloads.length, expected === "direct" ? 1 : 0);
      if (downloads.length) assert.equal(downloads[0][0], "https://gofile.io/d/file");
    });
  }
});
