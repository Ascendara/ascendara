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

let moduleInstance = 0;
async function loadGeometry() {
  const url = `data:text/javascript;base64,${Buffer.from(geometrySource).toString("base64")}#${moduleInstance++}`;
  return import(url);
}

test("compact navigation safe area clears the dock footprint on Settings", async () => {
  const geometry = await loadGeometry();
  const compactFootprint =
    geometry.NAVIGATION_EDGE_PADDING_PX +
    Math.max(
      geometry.NAVIGATION_COMPACT_ITEM_HEIGHT_PX,
      geometry.NAVIGATION_COMPACT_SEPARATOR_HEIGHT_PX
    ) +
    geometry.NAVIGATION_COMPACT_PADDING_Y_PX * 2 +
    geometry.NAVIGATION_SHELL_BORDER_PX * 2;

  assert.equal(
    geometry.NAVIGATION_COMPACT_SAFE_AREA_PX,
    compactFootprint + geometry.NAVIGATION_COMPACT_SAFE_GAP_PX
  );
  assert.ok(
    geometry.NAVIGATION_COMPACT_SAFE_AREA_PX > compactFootprint,
    "the Settings scrollport must stop above the fixed compact dock"
  );

  assert.equal(
    geometry.getNavigationBottomSafeArea("/settings", true),
    geometry.NAVIGATION_COMPACT_SAFE_AREA_PX
  );
  assert.equal(
    geometry.getNavigationBottomSafeArea("/settings", undefined),
    geometry.NAVIGATION_COMPACT_SAFE_AREA_PX
  );
  assert.equal(geometry.getNavigationBottomSafeArea("/settings", false), 0);
});

test("other pages keep their full scrollport height", async () => {
  const { getNavigationBottomSafeArea } = await loadGeometry();

  for (const pathname of ["/", "/search", "/library", "/downloads", "/ascend"]) {
    assert.equal(getNavigationBottomSafeArea(pathname, true), 0, pathname);
  }
});

test("Layout and Navigation share the compact-dock geometry contract", () => {
  assert.match(
    layoutSource,
    /getNavigationBottomSafeArea\(\s*location\.pathname,\s*settings\?\.compactDockOnScroll\s*\)/
  );
  assert.match(layoutSource, /marginBottom: navigationBottomSafeArea \|\| undefined/);
  assert.match(
    layoutSource,
    /className="flex min-h-screen flex-col bg-background text-foreground"/
  );
  assert.doesNotMatch(layoutSource, /h-screen overflow-hidden/);
  assert.doesNotMatch(layoutSource, /hasNavigationBottomSafeArea/);

  for (const token of [
    "NAVIGATION_EDGE_PADDING_PX",
    "NAVIGATION_COMPACT_ITEM_HEIGHT_PX",
    "NAVIGATION_COMPACT_SEPARATOR_HEIGHT_PX",
    "NAVIGATION_COMPACT_PADDING_Y_PX",
  ]) {
    assert.match(navigationSource, new RegExp(token));
  }
});
