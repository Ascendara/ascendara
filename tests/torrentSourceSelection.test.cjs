const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { parse } = require("@babel/parser");
const traverse = require("@babel/traverse").default;

const component = fs.readFileSync(
  path.join(__dirname, "../src/components/GameIndexManager.jsx"),
  "utf8"
);
const functions = {};
traverse(parse(component, { sourceType: "module", plugins: ["jsx"] }), {
  VariableDeclarator(nodePath) {
    const { id, init } = nodePath.node;
    if (
      [
        "isSourceMetaTorrentOnly",
        "isTorrentOnlyDataset",
        "maybeWarnTorrentOnly",
        "handleSelectCustomSource",
      ].includes(id.name)
    ) {
      functions[id.name] = component.slice(init.start, init.end);
    }
  },
});
const { loadModule } = require("./helpers/loadModule.cjs");
const support = loadModule("src/services/downloads/debridService.js");

async function sourceActions(settings) {
  let warning = false;
  let selected = null;
  const context = vm.createContext({
    ...(await support),
    window: { electron: { getSettings: async () => settings } },
    console,
    activeCustomList: null,
    customSource: null,
    previousCustomSourceRef: { current: null },
    setTorrentWarningSource: () => {},
    setTorrentWarningOpen: value => {
      warning = value;
    },
    setCustomSource: value => {
      selected = value;
    },
    setCustomSourceLastSynced: () => {},
    setCustomSourceGameCount: () => {},
    setSourceBrowserOpen: () => {},
    updateSetting: async () => {},
    upsertLibraryEntry: async () => {},
    enableCustomSourcesMode: async () => {},
    handleSyncCustomSource: async () => {},
    toast: { success: () => {} },
    t: () => "Selected source",
  });
  for (const [name, code] of Object.entries(functions)) {
    vm.runInContext(`var ${name} = (${code});`, context);
  }
  return { context, warning: () => warning, selected: () => selected };
}

const fitgirl = {
  id: "fitgirl",
  title: "FitGirl",
  url: "https://example.test/source.json",
  topDownloadOption: [{ name: "torrent" }],
};

test("torrent-only source selection accepts the configured active magnet handler", async t => {
  for (const [name, settings] of [
    ["TorBox", { debridEnabled: true, torboxApiKey: "tb", torrentEnabled: false }],
    [
      "Real-Debrid",
      { debridEnabled: true, realDebridApiKey: "rd", torrentEnabled: false },
    ],
    [
      "preferred Real-Debrid",
      {
        debridEnabled: true,
        realDebridApiKey: "rd",
        torboxApiKey: "tb",
        debridProvider: "realdebrid",
        useTorboxForTorrents: false,
      },
    ],
    ["qBittorrent", { torrentEnabled: true }],
  ]) {
    await t.test(name, async () => {
      const actions = await sourceActions(settings);
      await actions.context.handleSelectCustomSource(fitgirl);
      assert.equal(actions.warning(), false, "should not show the torrent-only popup");
      assert.equal(
        actions.selected()?.id,
        "fitgirl",
        "should commit the selected source"
      );
      await actions.context.maybeWarnTorrentOnly(fitgirl, []);
      assert.equal(actions.warning(), false, "sync must not reopen the popup");
      await actions.context.maybeWarnTorrentOnly({ name: "Detected torrent source" }, [
        { download_links: { torrent: ["magnet:?xt=test"] } },
      ]);
      assert.equal(
        actions.warning(),
        false,
        "dataset detection must also accept cloud torrents"
      );
    });
  }
});

test("torrent-only sources remain blocked when no enabled handler is available", async t => {
  for (const settings of [
    {},
    { debridEnabled: true, torboxApiKey: "   " },
    { debridEnabled: true, torboxApiKey: "tb", useTorboxForTorrents: false },
    { debridEnabled: true, realDebridApiKey: "rd", useRealDebridForTorrents: false },
    {
      debridEnabled: true,
      torboxApiKey: "tb",
      realDebridApiKey: "rd",
      debridProvider: "realdebrid",
      useRealDebridForTorrents: false,
      useTorboxForTorrents: false,
    },
  ]) {
    await t.test(JSON.stringify(settings), async () => {
      const actions = await sourceActions(settings);
      await actions.context.handleSelectCustomSource(fitgirl);
      assert.equal(actions.warning(), true);
      assert.equal(actions.selected(), null);
    });
  }
});

test("a cloud handler lets local torrenting be disabled while a torrent source is selected", async () => {
  const settingsComponent = fs.readFileSync(
    path.join(__dirname, "../src/pages/Settings.jsx"),
    "utf8"
  );
  let disabledExpression;
  traverse(parse(settingsComponent, { sourceType: "module", plugins: ["jsx"] }), {
    JSXOpeningElement(nodePath) {
      const { name, attributes } = nodePath.node;
      if (name.name !== "Switch") return;
      const checked = attributes.find(attribute => attribute.name?.name === "checked");
      const expression = checked?.value?.expression;
      if (
        expression?.object?.name !== "settings" ||
        expression?.property?.name !== "torrentEnabled"
      )
        return;
      const disabled = attributes.find(attribute => attribute.name?.name === "disabled")
        .value.expression;
      disabledExpression = settingsComponent.slice(disabled.start, disabled.end);
    },
  });
  assert.ok(disabledExpression, "find the actual local-torrent toggle guard");
  const base = {
    customSourcesMode: true,
    customSource: { torrentOnly: true },
    torrentEnabled: true,
  };
  const policy = await support;
  const disabled = settings =>
    vm.runInNewContext(disabledExpression, { ...policy, settings, isOnWindows: true });
  assert.equal(
    disabled(base),
    true,
    "keep local torrenting enabled when it is the only handler"
  );
  assert.equal(disabled({ debridEnabled: true, ...base, torboxApiKey: "tb" }), false);
  assert.equal(disabled({ debridEnabled: true, ...base, realDebridApiKey: "rd" }), false);
  assert.equal(
    disabled({
      debridEnabled: true,
      ...base,
      realDebridApiKey: "rd",
      useRealDebridForTorrents: false,
    }),
    true
  );
});
