const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadModule } = require("./helpers/loadModule.cjs");

const read = relative => fs.readFileSync(path.join(__dirname, "..", relative), "utf8");

function flexOrder(className) {
  if (!className) return 0;
  if (className === "order-first") return -9999;
  if (className === "order-last") return 9999;

  const arbitrary = className.match(/^order-\[(-?\d+)\]$/);
  if (arbitrary) return Number(arbitrary[1]);

  const numbered = className.match(/^order-(\d+)$/);
  if (numbered) return Number(numbered[1]);

  throw new Error(`Unsupported flex order class in test: ${className}`);
}

function visualOrder(layoutOrder) {
  return [
    ["brand", layoutOrder.brand],
    ["server-status", ""],
    ["branch-badge", ""],
    ["torrent-warning", ""],
    ["update-state", ""],
    ["spacer", layoutOrder.spacer],
    ["dev-action", layoutOrder.devAction],
    ["search", layoutOrder.search],
  ]
    .map(([id, className], sourceIndex) => ({
      id,
      sourceIndex,
      order: flexOrder(className),
    }))
    .sort((a, b) => a.order - b.order || a.sourceIndex - b.sourceIndex)
    .map(item => item.id);
}

test("menu bar side changes move regions without reversing status content", async () => {
  const { getMenuBarLayoutOrder } = await loadModule("src/lib/menuBarLayout.js");

  const left = visualOrder(getMenuBarLayoutOrder("left"));
  const right = visualOrder(getMenuBarLayoutOrder("right"));

  const statuses = order =>
    order.filter(id =>
      ["server-status", "branch-badge", "torrent-warning", "update-state"].includes(id)
    );

  assert.deepEqual(statuses(left), [
    "server-status",
    "branch-badge",
    "torrent-warning",
    "update-state",
  ]);
  assert.deepEqual(statuses(right), statuses(left));

  assert.equal(left[0], "brand");
  assert.equal(right.at(-1), "brand");
  assert.ok(right.indexOf("search") < right.indexOf("server-status"));
});

test("MenuBar uses explicit region ordering instead of reversing its primary row", () => {
  const source = read("src/components/MenuBar.jsx");

  assert.match(source, /getMenuBarLayoutOrder/);
  assert.match(source, /const layoutOrder = getMenuBarLayoutOrder\(settings\.menuBarSide\)/);
  assert.match(
    source,
    /<div className="flex h-full flex-1 items-center gap-2 px-3" data-boot-row>/
  );
  assert.match(source, /layoutOrder\.brand/);
  assert.match(source, /layoutOrder\.spacer/);
  assert.match(source, /layoutOrder\.devAction/);
  assert.match(source, /layoutOrder\.search/);

  // Inner brand mirroring and WindowControls edge placement stay intentional.
  assert.match(source, /gap-2 \$\{mirrored \? "flex-row-reverse" : ""\}/);
  assert.match(source, /mirrored=\{mirrored\}/);
  assert.match(source, /mirrored\s*\?\s*"order-first ml-4"/s);
});
