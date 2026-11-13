const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const geometrySource = fs.readFileSync(
  path.join(root, "src/lib/navigationGeometry.js"),
  "utf8"
);
const layoutSource = fs.readFileSync(
  path.join(root, "src/components/Layout.jsx"),
  "utf8"
);
const navigationSource = fs.readFileSync(
  path.join(root, "src/components/Navigation.jsx"),
  "utf8"
);
const settingsSource = fs.readFileSync(
  path.join(root, "src/pages/Settings.jsx"),
  "utf8"
);

let moduleInstance = 0;
async function loadGeometry() {
  const url = `data:text/javascript;base64,${Buffer.from(geometrySource).toString("base64")}#${moduleInstance++}`;
  return import(url);
}

test("Settings safe area clears every dock presentation state", async () => {
  const geometry = await loadGeometry();

  assert.equal(
    geometry.NAVIGATION_COMPACT_FOOTPRINT_PX,
    geometry.NAVIGATION_EDGE_PADDING_PX +
      Math.max(
        geometry.NAVIGATION_COMPACT_ITEM_HEIGHT_PX,
        geometry.NAVIGATION_COMPACT_SEPARATOR_HEIGHT_PX
      ) +
      geometry.NAVIGATION_COMPACT_PADDING_Y_PX * 2 +
      geometry.NAVIGATION_SHELL_BORDER_PX * 2
  );
  assert.equal(
    geometry.NAVIGATION_EXPANDED_FOOTPRINT_PX,
    geometry.NAVIGATION_EDGE_PADDING_PX +
      Math.max(
        geometry.NAVIGATION_EXPANDED_ITEM_HEIGHT_PX,
        geometry.NAVIGATION_EXPANDED_SEPARATOR_HEIGHT_PX
      ) +
      geometry.NAVIGATION_EXPANDED_PADDING_Y_PX * 2 +
      geometry.NAVIGATION_SHELL_BORDER_PX * 2
  );
  assert.equal(
    geometry.NAVIGATION_SETTINGS_SAFE_AREA_PX,
    Math.max(
      geometry.NAVIGATION_COMPACT_FOOTPRINT_PX,
      geometry.NAVIGATION_EXPANDED_FOOTPRINT_PX
    ) + geometry.NAVIGATION_SAFE_GAP_PX
  );
  assert.ok(
    geometry.NAVIGATION_SETTINGS_SAFE_AREA_PX >
      geometry.NAVIGATION_EXPANDED_FOOTPRINT_PX,
    "the Settings scrollport must stop above even an expanded/engaged fixed dock"
  );

  assert.equal(
    geometry.getNavigationBottomSafeArea("/settings"),
    geometry.NAVIGATION_SETTINGS_SAFE_AREA_PX
  );
});

test("other pages keep their full scrollport height", async () => {
  const { getNavigationBottomSafeArea } = await loadGeometry();

  for (const pathname of ["/", "/search", "/library", "/downloads", "/ascend"]) {
    assert.equal(getNavigationBottomSafeArea(pathname, true), 0, pathname);
  }
});

test("Layout reserves a persistent Settings viewport exclusion zone", () => {
  assert.match(
    layoutSource,
    /getNavigationBottomSafeArea\(location\.pathname\)/
  );
  assert.match(layoutSource, /const hasNavigationBottomSafeArea = navigationBottomSafeArea > 0/);
  assert.match(
    layoutSource,
    /hasNavigationBottomSafeArea \? "h-screen overflow-hidden" : "min-h-screen"/
  );
  assert.match(layoutSource, /data-route-scroll-container/);
  assert.match(layoutSource, /style=\{MENU_BAR_HEIGHT_STYLE\}/);
  assert.match(layoutSource, /hasNavigationBottomSafeArea \? "min-h-0" : ""/);
  assert.match(layoutSource, /marginBottom: navigationBottomSafeArea \|\| undefined/);

  // The safe-area value is applied to the bounded scrollport's layout box,
  // not as trailing document content. That means its viewport ends above the
  // dock for every scroll position.
  const mainIndex = layoutSource.indexOf("data-route-scroll-container");
  const navIndex = layoutSource.indexOf("<Navigation", mainIndex);
  const mainBlock = layoutSource.slice(mainIndex, navIndex);
  assert.match(mainBlock, /overflow-y-auto/);
  assert.match(mainBlock, /marginBottom: navigationBottomSafeArea/);

  for (const token of [
    "NAVIGATION_EDGE_PADDING_PX",
    "NAVIGATION_COMPACT_ITEM_HEIGHT_PX",
    "NAVIGATION_COMPACT_SEPARATOR_HEIGHT_PX",
    "NAVIGATION_COMPACT_PADDING_Y_PX",
    "NAVIGATION_EXPANDED_ITEM_HEIGHT_PX",
    "NAVIGATION_EXPANDED_SEPARATOR_HEIGHT_PX",
    "NAVIGATION_EXPANDED_PADDING_Y_PX",
  ]) {
    assert.match(navigationSource, new RegExp(token));
  }
});

test("Settings treats the bounded route scrollport as its scroll authority", () => {
  assert.match(
    settingsSource,
    /settingsRootRef\.current\?\.closest\("\[data-route-scroll-container\]"\)/
  );
  assert.match(settingsSource, /scrollContainer\.scrollTo\(\{ top: 0, behavior \}\)/);
  assert.match(settingsSource, /scrollContainer\.scrollTop/);
  assert.match(settingsSource, /scrollContainer\.scrollHeight - scrollContainer\.clientHeight/);
  assert.match(settingsSource, /scrollContainer\.addEventListener\("scrollend", onArrive\)/);
  assert.match(settingsSource, /scrollToElement\(element, scrollContainer\)/);
  // The route scrollport begins below the 48px MenuBar. A 36px sticky
  // inset preserves the sidebar's former 84px absolute viewport position.
  assert.match(settingsSource, /space-y-6 lg:sticky lg:top-\[36px\]/);

  assert.doesNotMatch(settingsSource, /window\.scrollTo\(/);
  assert.doesNotMatch(settingsSource, /window\.scrollY/);
  assert.doesNotMatch(settingsSource, /document\.documentElement\.scrollHeight/);
  assert.doesNotMatch(settingsSource, /window\.addEventListener\("scrollend"/);
});
