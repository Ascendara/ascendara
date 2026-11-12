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
const torrentSupport = loadModule("src/services/downloads/torrentCapability.js");

async function sourceActions(settings) {
  let warning = false;
  let selected = null;
  const context = vm.createContext({
    ...(await torrentSupport),
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
    ["Ascendara built-in torrent client", { torrentEnabled: true }],
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

test("a synced raw .torrent-only source warns cloud-only users", async () => {
  const actions = await sourceActions({
    debridEnabled: true,
    torboxApiKey: "tb",
    torrentEnabled: false,
  });

  await actions.context.maybeWarnTorrentOnly(
    { name: "Raw torrent source", torrentOnly: true },
    [{ download_links: { torrent: ["https://example.test/game.torrent"] } }]
  );

  assert.equal(
    actions.warning(),
    true,
    "cloud magnet support must not claim a raw .torrent-only source is usable"
  );
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

test("Download auto-selection and cloud UI use link-level torrent capability", () => {
  const downloadPage = fs.readFileSync(
    path.join(__dirname, "../src/pages/Download.jsx"),
    "utf8"
  );

  assert.match(
    downloadPage,
    /canDownloadTorrentLinks\(gameData\.download_links\.torrent, settings\)/,
    "automatic torrent selection must use the actual torrent links"
  );
  assert.match(
    downloadPage,
    /const cloudTorrentAvailable =[\s\S]*activeTorrentLinks\.some\(isMagnetLink\)/,
    "cloud torrent UI must only activate for an actual magnet route"
  );
  assert.match(
    downloadPage,
    /cloudTorrent=\{cloudTorrentAvailable\}/,
    "DownloadPanel must receive the link-level cloud capability"
  );
  assert.match(
    downloadPage,
    /allowsTorrentFallback\(settings, pickedTorrent\.provider\?\.id\)/,
    "local fallback must follow the provider picked for this download"
  );
  assert.ok(
    downloadPage.indexOf("const resolvedTorrentLink") <
      downloadPage.indexOf("const hasActive = await hasActiveDownloads()"),
    "the concrete torrent URL must be resolved before queue policy runs"
  );
  assert.match(
    downloadPage,
    /if \(hasActive && !forceStart && !isTorrentRequest && !cloudHostRequest\)/,
    "torrent requests must bypass the generic queue branch and enter torrent lifecycle policy"
  );
  assert.match(
    downloadPage,
    /const queueLocalTorrentIfBusy =[\s\S]*createLocalTorrentQueueData\(\{[\s\S]*torrentLink,/,
    "queued local torrents must use the first-class torrent queue serializer"
  );
  assert.match(
    downloadPage,
    /if \(isTorrentRequest\) \{[\s\S]*queueTorrentInDebrid\(resolvedTorrentLink\)[\s\S]*startOrQueueLocalTorrent\(resolvedTorrentLink\)/,
    "cloud failure and direct local torrents must converge on the same local queue/start path"
  );
  assert.match(
    downloadPage,
    /const startOrQueueLocalTorrent =[\s\S]*await queueLocalTorrentIfBusy\(torrentLink\)[\s\S]*window\.electron\.downloadFile\(/,
    "local torrent execution must re-check queue policy immediately before starting"
  );
  assert.doesNotMatch(
    downloadPage,
    /availableProviders\.includes\("torrent"\)[\s\S]{0,120}canDownloadTorrents\(settings\)/,
    "the old coarse automatic-selection policy must not return"
  );
});

test("Big Picture delegates torrent route availability to shared link capability", () => {
  const bigPicture = fs.readFileSync(
    path.join(__dirname, "../src/pages/big-picture/useBigPicturePage.js"),
    "utf8"
  );

  assert.match(
    bigPicture,
    /import \{ canDownloadTorrentLinks \} from "@\/services\/downloads\/torrentCapability";/
  );
  assert.match(
    bigPicture,
    /const torrentRouteAvailable = canDownloadTorrentLinks\([\s\S]*torrentCandidates,[\s\S]*settings[\s\S]*\)/
  );
  assert.doesNotMatch(
    bigPicture,
    /canUseCloudTorrents\(settings\)[\s\S]{0,80}firstLink\("torrent"\)/,
    "Big Picture must not maintain a second coarse torrent capability rule"
  );
});

test("the local torrent toggle uses persisted source link capability", async () => {
  const settingsComponent = fs.readFileSync(
    path.join(__dirname, "../src/pages/Settings.jsx"),
    "utf8"
  );
  let guardExpression;
  let switchDisabledExpression;
  traverse(parse(settingsComponent, { sourceType: "module", plugins: ["jsx"] }), {
    VariableDeclarator(nodePath) {
      const { id, init } = nodePath.node;
      if (id.name === "localTorrentRequiredBySource") {
        guardExpression = settingsComponent.slice(init.start, init.end);
      }
    },
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
        ?.value?.expression;
      if (disabled)
        switchDisabledExpression = settingsComponent.slice(disabled.start, disabled.end);
    },
  });

  assert.ok(guardExpression, "find the local-torrent source capability guard");
  assert.equal(
    switchDisabledExpression,
    "localTorrentRequiredBySource",
    "the actual Settings toggle must use the source capability guard"
  );
  assert.doesNotMatch(
    guardExpression,
    /isOnWindows/,
    "the built-in torrent client must not retain the legacy Windows-only guard"
  );

  const policy = await torrentSupport;
  const disabled = settings =>
    vm.runInNewContext(guardExpression, { ...policy, settings });
  const base = {
    customSourcesMode: true,
    customSource: { torrentOnly: true },
    torrentEnabled: true,
  };

  assert.equal(
    disabled(base),
    true,
    "keep local torrenting enabled when it is the only handler"
  );
  assert.equal(
    disabled({ debridEnabled: true, ...base, torboxApiKey: "tb" }),
    true,
    "saved metadata-only sources stay conservative until their links are summarized"
  );

  const rawOnly = {
    ...base,
    customSource: {
      torrentOnly: true,
      torrentSupport: {
        hasMagnet: false,
        hasTorrentFile: true,
        cloudCompatible: false,
      },
    },
  };
  assert.equal(
    disabled({ debridEnabled: true, ...rawOnly, torboxApiKey: "tb" }),
    true,
    "a synced raw .torrent source must keep the local client enabled"
  );

  const magnetCovered = {
    ...base,
    customSource: {
      torrentOnly: true,
      torrentSupport: {
        hasMagnet: true,
        hasTorrentFile: true,
        cloudCompatible: true,
      },
    },
  };
  assert.equal(
    disabled({ debridEnabled: true, ...magnetCovered, torboxApiKey: "tb" }),
    false,
    "local torrenting may be disabled when every game has a cloud-compatible magnet"
  );
  assert.equal(
    disabled({
      debridEnabled: true,
      ...magnetCovered,
      realDebridApiKey: "rd",
      useRealDebridForTorrents: false,
    }),
    true
  );
});
