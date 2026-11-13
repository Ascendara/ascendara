const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadModule } = require("./helpers/loadModule.cjs");

const read = relative => fs.readFileSync(path.join(__dirname, "..", relative), "utf8");

test("compact MenuBar policy preserves critical controls and collapses simultaneous status badges", async () => {
  const {
    MENU_BAR_MIN_WIDTH_PX,
    MENU_BAR_BALANCED_WIDTH_PX,
    MENU_BAR_FULL_WIDTH_PX,
    MENU_BAR_PRIORITY,
    getMenuBarMode,
    getMenuBarResponsivePolicy,
    getMenuBarItemPresentation,
  } = await loadModule("src/lib/menuBarResponsivePolicy.js");

  assert.equal(MENU_BAR_MIN_WIDTH_PX, 600);
  assert.equal(MENU_BAR_BALANCED_WIDTH_PX, 1280);
  assert.equal(MENU_BAR_FULL_WIDTH_PX, 1536);
  assert.equal(getMenuBarMode(600), "compact");
  assert.equal(getMenuBarMode(800), "compact");

  const activeItems = [
    ["torrent-warning", MENU_BAR_PRIORITY.CRITICAL],
    ["outdated-update", MENU_BAR_PRIORITY.CRITICAL],
    ["library-backup", MENU_BAR_PRIORITY.ACTIVITY],
    ["audio-download", MENU_BAR_PRIORITY.ACTIVITY],
    ["experimental-branch", MENU_BAR_PRIORITY.SECONDARY],
    ["development-mode", MENU_BAR_PRIORITY.SECONDARY],
  ];

  const at800 = Object.fromEntries(
    activeItems.map(([id, priority]) => [id, getMenuBarItemPresentation(800, priority)])
  );

  assert.deepEqual(at800["torrent-warning"], { visible: true, showLabel: false });
  assert.deepEqual(at800["outdated-update"], { visible: true, showLabel: false });
  assert.deepEqual(at800["library-backup"], { visible: true, showLabel: false });
  assert.deepEqual(at800["audio-download"], { visible: true, showLabel: false });
  assert.deepEqual(at800["experimental-branch"], { visible: false, showLabel: false });
  assert.deepEqual(at800["development-mode"], { visible: false, showLabel: false });

  const compact = getMenuBarResponsivePolicy(600);
  assert.equal(compact.showSearchLabel, false);
  assert.equal(compact.showSearchShortcut, false);
  assert.equal(compact.showBrandLabel, false);
  assert.equal(
    compact.showBranchIdentity,
    true,
    "release-channel identity must collapse to an icon instead of disappearing"
  );
});

test("MenuBar source protects one-row critical controls from flex shrink and wrapping", async () => {
  const { MENU_BAR_MIN_WIDTH_PX } = await loadModule(
    "src/lib/menuBarResponsivePolicy.js"
  );
  const menuBar = read("src/components/MenuBar.jsx");
  const controls = read("src/components/WindowControls.jsx");
  const windowSource = read("electron/modules/app/window.js");

  assert.match(
    windowSource,
    new RegExp(`setMinimumSize\\(${MENU_BAR_MIN_WIDTH_PX}, 400\\)`)
  );
  assert.match(menuBar, /getMenuBarResponsivePolicy/);
  assert.match(
    menuBar,
    /responsivePolicy\.showBranchIdentity && appBranch === "experimental"/
  );
  assert.match(menuBar, /responsivePolicy\.showCriticalLabels/);
  assert.match(menuBar, /responsivePolicy\.showActivityLabels/);
  assert.match(menuBar, /responsivePolicy\.showSearchShortcut/);
  assert.match(menuBar, /className="[^"]*shrink-0[^"]*whitespace-nowrap[^"]*"/);
  assert.match(
    menuBar,
    /className="[^"]*shrink-0[^"]*"[^>]*aria-label=\{t\("globalSearch\.placeholder\.global"\)\}/s
  );
  assert.match(controls, /window-controls[^\n"]*shrink-0/);
});
