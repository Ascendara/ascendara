const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "..", "src/pages/Settings.jsx"),
  "utf8"
);

function openingTagForId(id) {
  const idIndex = source.indexOf(`id="${id}"`);
  assert.notEqual(idIndex, -1, `missing Settings row #${id}`);
  const start = source.lastIndexOf("<div", idIndex);
  const end = source.indexOf(">", idIndex);
  return source.slice(start, end + 1);
}

for (const id of ["default-landing-page", "controller-type", "keyboard-layout"]) {
  test(`#${id} stacks fixed-width controls in narrow Settings layouts`, () => {
    const tag = openingTagForId(id);
    assert.match(tag, /flex-col/);
    assert.match(tag, /items-start/);
    assert.match(tag, /xl:flex-row/);
    assert.match(tag, /xl:justify-between/);
  });
}

test("post-download behavior stacks its selector in narrow Settings layouts", () => {
  const idIndex = source.indexOf('id="post-download-behavior"');
  assert.notEqual(idIndex, -1);
  const inner = source.slice(idIndex, source.indexOf("</div>", idIndex) + 6);
  assert.match(inner, /flex flex-col items-start gap-3 xl:flex-row xl:items-center xl:justify-between/);
});

test("fixed Settings selectors use full width before the wide breakpoint", () => {
  assert.equal(
    (source.match(/SelectTrigger className="w-full bg-background xl:w-\[180px\]"/g) || []).length,
    2
  );
  assert.equal(
    (source.match(/SelectTrigger className="w-full bg-background xl:w-\[150px\] xl:shrink-0"/g) || []).length,
    2
  );
});
