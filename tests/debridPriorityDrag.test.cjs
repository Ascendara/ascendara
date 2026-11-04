const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { parse } = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const { loadModule } = require("./helpers/loadModule.cjs");

const source = fs.readFileSync(
  path.join(__dirname, "../src/components/DebridSettings.jsx"),
  "utf8"
);
const handlers = {};
let move;
traverse(parse(source, { sourceType: "module", plugins: ["jsx"] }), {
  VariableDeclarator(nodePath) {
    const { id, init } = nodePath.node;
    if (id.name === "move") move = source.slice(init.start, init.end);
  },
  JSXAttribute(nodePath) {
    const { name, value } = nodePath.node;
    if (["onDragStart", "onDragOver", "onDrop", "onDragEnd"].includes(name.name)) {
      handlers[name.name] = source.slice(value.expression.start, value.expression.end);
    }
  },
});

test("dragging a priority row saves its new order only when dropped", async () => {
  const { createDebridService } = await loadModule(
    "src/services/downloads/debridService.js"
  );
  const { getOrderedProviders } = createDebridService([{ id: "torbox" }, { id: "realdebrid" }]);
  let settings = { debridEnabled: true, debridProviderOrder: ["torbox", "realdebrid"] };
  let writes = 0;
  const context = vm.createContext({
    getOrderedProviders,
    item: { id: "realdebrid" },
    draggedId: null,
    dragTargetId: null,
    setSettings: update => {
      settings = update(settings);
      writes++;
    },
    setDraggedId: id => {
      context.draggedId = id;
    },
    setDragTargetId: id => {
      context.dragTargetId = id;
    },
  });
  context.move = vm.runInContext(`(${move})`, context);
  const actions = Object.fromEntries(
    Object.entries(handlers).map(([name, code]) => [
      name,
      vm.runInContext(`(${code})`, context),
    ])
  );
  let prevented = false;
  const event = {
    preventDefault: () => {
      prevented = true;
    },
    dataTransfer: { setData: () => {}, effectAllowed: "", dropEffect: "" },
  };
  actions.onDragStart(event);
  assert.equal(event.dataTransfer.effectAllowed, "move");
  context.item = { id: "torbox" };
  actions.onDragOver(event);
  assert.equal(prevented, true);
  assert.equal(context.dragTargetId, "torbox");
  assert.equal(writes, 0);
  actions.onDrop(event);
  assert.equal(writes, 1);
  assert.deepEqual(Array.from(settings.debridProviderOrder), ["realdebrid", "torbox"]);
  assert.equal(settings.debridProvider, "realdebrid");
  assert.equal(context.draggedId, null);
  assert.equal(context.dragTargetId, null);
  actions.onDrop(event);
  assert.equal(writes, 1, "external drops cannot change the order");
  context.item = { id: "torbox" };
  actions.onDragStart(event);
  actions.onDragEnd();
  assert.equal(context.draggedId, null);
  assert.equal(writes, 1, "cancelled drags must not save");
});
