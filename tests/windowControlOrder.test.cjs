const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadModule } = require("./helpers/loadModule.cjs");

test("window-control action order is invariant across style for both sides", async () => {
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
      expected: ["close", "fullscreen", "minimize"],
    },
  ];

  for (const { variant, mirrored, expected } of cases) {
    assert.deepEqual(
      getWindowControlOrder(mirrored),
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

  assert.match(component, /const controlOrder = getWindowControlOrder\(mirrored\);/);
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
