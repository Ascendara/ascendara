const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadModule } = require("./helpers/loadModule.cjs");

test("close sits at the outer edge, and left-side traffic lights keep the macOS order", async () => {
  const { getWindowControlOrder } = await loadModule("src/lib/windowControlOrder.js");

  const cases = [
    {
      variant: "icons",
      mirrored: false,
      expected: ["minimize", "fullscreen", "close"],
    },
    {
      variant: "traffic",
      mirrored: false,
      expected: ["minimize", "fullscreen", "close"],
    },
    {
      variant: "icons",
      mirrored: true,
      expected: ["close", "fullscreen", "minimize"],
    },
    {
      variant: "traffic",
      mirrored: true,
      expected: ["close", "minimize", "fullscreen"],
    },
  ];

  for (const { variant, mirrored, expected } of cases) {
    assert.deepEqual(
      getWindowControlOrder(mirrored, variant),
      expected,
      `${variant} controls should preserve the ${mirrored ? "left" : "right"}-side action policy`
    );
  }
});

test("both WindowControls styles render from the shared action order", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "src/components/WindowControls.jsx"),
    "utf8"
  );
  const start = source.indexOf("export function WindowControls");
  const end = source.indexOf("/** A row of small option cards", start);
  const component = source.slice(start, end);

  assert.match(component, /const controlOrder = getWindowControlOrder\(mirrored, variant\);/);
  assert.equal(
    (component.match(/controlOrder\.map\(id =>/g) || []).length,
    2,
    "traffic-light and icon branches should both consume controlOrder"
  );
  assert.doesNotMatch(
    component,
    /flex-row-reverse/,
    "WindowControls should not apply a second branch-specific reversal"
  );
});

test("window-control style previews follow the selected menu-bar side", () => {
  const root = path.join(__dirname, "..");
  const component = fs.readFileSync(
    path.join(root, "src/components/WindowControls.jsx"),
    "utf8"
  );
  const settings = fs.readFileSync(path.join(root, "src/pages/Settings.jsx"), "utf8");
  const welcome = fs.readFileSync(path.join(root, "src/pages/Welcome.jsx"), "utf8");

  const start = component.indexOf("export function WindowControlsStylePicker");
  const end = component.indexOf("// A sketch of the menu bar", start);
  const picker = component.slice(start, end);

  assert.match(picker, /getWindowControlOrder\(side === "right", "icons"\)/);
  assert.match(picker, /getWindowControlOrder\(side === "right", "traffic"\)/);
  assert.match(picker, /iconOrder\.map\(id =>/);
  assert.match(picker, /trafficOrder\.map\(id =>/);
  assert.match(settings, /side=\{settings\.menuBarSide\}/);
  assert.match(welcome, /side=\{appSettings\.menuBarSide\}/);
});
