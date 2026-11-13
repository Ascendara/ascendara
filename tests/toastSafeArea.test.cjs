const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadModule } = require("./helpers/loadModule.cjs");

const read = relative => fs.readFileSync(path.join(__dirname, "..", relative), "utf8");

test("global top toasts derive their safe area from MenuBar geometry", async () => {
  const { MENU_BAR_HEIGHT_PX } = await loadModule("src/lib/appChromeGeometry.js");
  const { GLOBAL_TOAST_CHROME_GAP_PX, GLOBAL_TOAST_SAFE_AREA_OFFSET } = await loadModule(
    "src/lib/toastSafeArea.js"
  );

  assert.equal(GLOBAL_TOAST_CHROME_GAP_PX, 12);
  assert.deepEqual(GLOBAL_TOAST_SAFE_AREA_OFFSET, {
    top: MENU_BAR_HEIGHT_PX + GLOBAL_TOAST_CHROME_GAP_PX,
  });
  assert.ok(GLOBAL_TOAST_SAFE_AREA_OFFSET.top > MENU_BAR_HEIGHT_PX);
  assert.equal(Object.isFrozen(GLOBAL_TOAST_SAFE_AREA_OFFSET), true);

  const toastSafeArea = read("src/lib/toastSafeArea.js");
  assert.match(
    toastSafeArea,
    /import \{ MENU_BAR_HEIGHT_PX \} from "\.\/appChromeGeometry";/
  );
  assert.match(toastSafeArea, /top: MENU_BAR_HEIGHT_PX \+ GLOBAL_TOAST_CHROME_GAP_PX/);

  const app = read("src/app.jsx");
  assert.match(
    app,
    /import \{ GLOBAL_TOAST_SAFE_AREA_OFFSET \} from "@\/lib\/toastSafeArea";/
  );
  assert.match(app, /position="top-right"/);
  assert.match(app, /offset=\{GLOBAL_TOAST_SAFE_AREA_OFFSET\}/);
  assert.match(app, /mobileOffset=\{GLOBAL_TOAST_SAFE_AREA_OFFSET\}/);
});

test("Big Picture keeps its intentionally separate toaster surface", () => {
  const bigPicture = read("src/pages/BigPicture.jsx");

  assert.match(bigPicture, /<Toaster\s+position="top-center"/);
  assert.doesNotMatch(bigPicture, /GLOBAL_TOAST_SAFE_AREA_OFFSET/);
  assert.doesNotMatch(bigPicture, /toastSafeArea/);
});
