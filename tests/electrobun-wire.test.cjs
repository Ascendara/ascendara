const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../electrobun/shared/wire.js");

test("IPC values survive the JSON transport like structured clone", async () => {
  const { decode, encode } = await load();
  const value = {
    bytes: Buffer.from("ascendara"),
    when: new Date(1700000000000),
    tags: new Set(["a", "b"]),
    sizes: new Map([["game", 42]]),
    missing: undefined,
    list: [1, undefined, NaN, Infinity],
    big: 10n,
  };
  const roundTrip = decode(JSON.parse(JSON.stringify(encode(value))));
  assert.deepEqual([...roundTrip.bytes], [...value.bytes]);
  assert.equal(roundTrip.when.getTime(), value.when.getTime());
  assert.deepEqual([...roundTrip.tags], ["a", "b"]);
  assert.equal(roundTrip.sizes.get("game"), 42);
  assert.ok("missing" in roundTrip && roundTrip.missing === undefined);
  assert.equal(roundTrip.list[1], undefined);
  assert.ok(Number.isNaN(roundTrip.list[2]));
  assert.equal(roundTrip.list[3], Infinity);
  assert.equal(roundTrip.big, 10n);
});

test("functions are dropped and cycles do not hang", async () => {
  const { decode, encode } = await load();
  const value = { keep: 1, drop: () => {} };
  value.self = value;
  const roundTrip = decode(JSON.parse(JSON.stringify(encode(value))));
  assert.deepEqual(roundTrip, { keep: 1, self: null });
});

test("errors keep their message", async () => {
  const { decode, encode } = await load();
  const error = decode(JSON.parse(JSON.stringify(encode(new TypeError("bad input")))));
  assert.ok(error instanceof Error);
  assert.equal(error.name, "TypeError");
  assert.equal(error.message, "bad input");
});
