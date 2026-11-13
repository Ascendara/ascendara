const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const settingsSource = fs.readFileSync(
  path.join(__dirname, "../src/pages/Settings.jsx"),
  "utf8"
);

function classNameForRow(id) {
  const idIndex = settingsSource.indexOf(`id="${id}"`);
  assert.notEqual(idIndex, -1, `missing Settings row #${id}`);

  const tagStart = settingsSource.lastIndexOf("<div", idIndex);
  const tagEnd = settingsSource.indexOf(">", idIndex);
  assert.notEqual(tagStart, -1);
  assert.notEqual(tagEnd, -1);

  const openingTag = settingsSource.slice(tagStart, tagEnd + 1);
  const match = openingTag.match(/className="([^"]+)"/);
  assert.ok(match, `missing className on Settings row #${id}`);
  return match[1].split(/\s+/);
}

for (const id of ["window-controls", "menu-bar-side"]) {
  test(`#${id} stacks its picker until a wide Settings layout`, () => {
    const classes = classNameForRow(id);

    assert.ok(classes.includes("flex"));
    assert.ok(classes.includes("flex-col"));
    assert.ok(classes.includes("items-start"));
    assert.ok(classes.includes("gap-3"));

    assert.ok(classes.includes("xl:flex-row"));
    assert.ok(classes.includes("xl:items-center"));
    assert.ok(classes.includes("xl:justify-between"));
    assert.ok(classes.includes("xl:gap-4"));

    assert.equal(
      classes.includes("justify-between"),
      false,
      "narrow layouts must not force the label and fixed-width picker onto one row"
    );
  });
}
