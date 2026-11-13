const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("READY update action participates in the compact critical-state policy", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "src/components/MenuBar.jsx"),
    "utf8"
  );

  const start = source.indexOf("updatePhase === UPDATE_PHASES.READY");
  const end = source.indexOf("layoutOrder.spacer", start);
  assert.notEqual(start, -1, "READY lifecycle UI is missing");
  assert.notEqual(end, -1, "READY lifecycle UI must remain before the layout spacer");

  const ready = source.slice(start, end);
  assert.match(ready, /shrink-0/);
  assert.match(ready, /whitespace-nowrap/);
  assert.match(ready, /data-menubar-priority="critical"/);
  assert.match(ready, /responsivePolicy\.showCriticalLabels/);
  assert.match(ready, /sr-only/);
});

test("responsive MenuBar keeps lifecycle state and explicit region ordering", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "src/components/MenuBar.jsx"),
    "utf8"
  );

  assert.match(source, /updatePhase === UPDATE_PHASES\.DOWNLOADING/);
  assert.match(source, /updatePhase === UPDATE_PHASES\.AVAILABLE/);
  assert.match(source, /updatePhase === UPDATE_PHASES\.READY/);
  assert.match(source, /layoutOrder\.brand/);
  assert.match(source, /layoutOrder\.spacer/);
  assert.match(source, /layoutOrder\.devAction/);
  assert.match(source, /layoutOrder\.search/);
  assert.doesNotMatch(source, /!isLatest && !isDownloadingUpdate/);
});
