const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

test("private source changes notify mounted catalog consumers and invalidate cached entries", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/services/gameService.js"), "utf8")
    .replace('import { sanitizeText } from "@/lib/utils";', "const sanitizeText = value => value;")
    .replace("export default gameService;", "globalThis.service = gameService;");
  const settings = { customSourcesMode: true, customSource: {
    name: "Local fixture", url: "private:fixture", privateSourceId: "fixture",
  } };
  let title = "First package", calls = 0;
  const events = new EventTarget();
  const context = vm.createContext({ console, URL, Date, Map, Set, Symbol,
    CustomEvent: class extends Event { constructor(type, options) { super(type); this.detail = options.detail; } },
    localStorage: { setItem() {}, getItem() { return null; }, removeItem() {} },
    window: {
      dispatchEvent: event => events.dispatchEvent(event),
      electron: {
        getSettings: async () => settings,
        privateSources: { catalog: async id => {
          assert.equal(id, "fixture"); calls++;
          return { games: [{ game: title }], metadata: { customSource: true } };
        } },
      },
    },
  });
  vm.runInContext(source, context);
  const service = context.service;
  // Search may already hold the official catalog when the source changes.
  await service.updateCache({ games: [{ game: "Public game" }], metadata: {} });
  let reload;
  events.addEventListener("index-refreshed", () => { reload = service.getAllGames(); });
  service.notifySourceChanged();
  assert.ok(reload, "mounted Search receives its existing index-refreshed event");
  assert.equal((await reload).games[0].game, "First package");
  title = "Refreshed package";
  assert.equal((await service.getAllGames()).games[0].game, "First package");
  service.notifySourceChanged();
  assert.equal((await reload).games[0].game, "Refreshed package");
  assert.equal(calls, 2);
});
