const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadModule } = require("./helpers/loadModule.cjs");

const read = relative => fs.readFileSync(path.join(__dirname, "..", relative), "utf8");

test("MenuBar and routed layout consume one vertical chrome geometry contract", async () => {
  const {
    MENU_BAR_HEIGHT_PX,
    MENU_BAR_HEIGHT_STYLE,
    PAGE_CONTENT_TOP_OFFSET_PX,
    PAGE_CONTENT_TOP_OFFSET_STYLE,
  } = await loadModule("src/lib/appChromeGeometry.js");

  assert.equal(MENU_BAR_HEIGHT_PX, 48);
  assert.deepEqual(MENU_BAR_HEIGHT_STYLE, { height: 48 });
  assert.equal(Object.isFrozen(MENU_BAR_HEIGHT_STYLE), true);
  assert.equal(PAGE_CONTENT_TOP_OFFSET_PX, 40);
  assert.deepEqual(PAGE_CONTENT_TOP_OFFSET_STYLE, { height: 40 });
  assert.equal(Object.isFrozen(PAGE_CONTENT_TOP_OFFSET_STYLE), true);

  const menuBar = read("src/components/MenuBar.jsx");
  const layout = read("src/components/Layout.jsx");

  assert.match(
    menuBar,
    /import \{ MENU_BAR_HEIGHT_STYLE \} from "@\/lib\/appChromeGeometry";/
  );
  assert.match(
    layout,
    /import \{ PAGE_CONTENT_TOP_OFFSET_STYLE \} from "@\/lib\/appChromeGeometry";/
  );
  assert.match(
    menuBar,
    /style=\{\{ \.\.\.MENU_BAR_HEIGHT_STYLE, WebkitAppRegion: "drag" \}\}/
  );
  assert.match(
    layout,
    /<div\s+className="shrink-0"\s+aria-hidden="true"\s+style=\{PAGE_CONTENT_TOP_OFFSET_STYLE\}\s*\/>/
  );
});
