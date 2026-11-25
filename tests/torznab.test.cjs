const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const core = require("../electron/modules/sources/torznab-core");

const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:torznab="http://torznab.com/schemas/2015/feed">
<channel>
  <item>
    <title>Hades II v1.0 &amp; DLC</title>
    <guid>https://tracker.test/details/1</guid>
    <link>http://localhost:9696/3/download?apikey=k&amp;link=abc</link>
    <size>12884901888</size>
    <pubDate>Mon, 10 Nov 2025 12:00:00 +0000</pubDate>
    <torznab:attr name="seeders" value="40" />
    <torznab:attr name="peers" value="45" />
    <torznab:attr name="infohash" value="ABCDEF0123456789ABCDEF0123456789ABCDEF01" />
  </item>
  <item>
    <title><![CDATA[Hades II [Repack]]]></title>
    <link>magnet:?xt=urn:btih:1111111111111111111111111111111111111111&amp;dn=x</link>
    <torznab:attr name="seeders" value="90" />
  </item>
  <item><title>No link</title></item>
</channel></rss>`;

test("parseFeed reads Torznab items and attributes", () => {
  const items = core.parseFeed(feed, "Tracker");
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Hades II v1.0 & DLC");
  assert.equal(items[0].link, "http://localhost:9696/3/download?apikey=k&link=abc");
  assert.equal(items[0].size, 12884901888);
  assert.equal(items[0].seeders, 40);
  assert.equal(items[0].leechers, 5);
  assert.equal(items[0].infoHash, "abcdef0123456789abcdef0123456789abcdef01");
  assert.equal(items[0].indexer, "Tracker");
  assert.equal(items[1].title, "Hades II [Repack]");
  assert.match(items[1].magnet, /^magnet:\?xt=urn:btih:1{40}&dn=x$/);
  assert.equal(items[1].infoHash, "1".repeat(40));
});

test("parseError reads Torznab error responses", () => {
  assert.deepEqual(
    core.parseError('<error code="100" description="Invalid API Key" />'),
    {
      code: "100",
      description: "Invalid API Key",
    }
  );
  assert.equal(core.parseError(feed), null);
});

test("mergeResults drops duplicates and sorts by seeders", () => {
  const a = { title: "A", infoHash: "h1", seeders: 3 };
  const b = { title: "B", infoHash: "h1", seeders: 9 };
  const c = { title: "C", link: "http://x/2", seeders: null };
  const d = { title: "D", link: "http://x/3", seeders: 20 };
  assert.deepEqual(
    core
      .mergeResults([
        [a, c],
        [b, d],
      ])
      .map(r => r.title),
    ["D", "B", "C"]
  );
});

const bencode = v =>
  typeof v === "number"
    ? `i${v}e`
    : typeof v === "string"
      ? `${Buffer.byteLength(v, "latin1")}:${v}`
      : Array.isArray(v)
        ? `l${v.map(bencode).join("")}e`
        : `d${Object.keys(v)
            .sort()
            .map(k => bencode(k) + bencode(v[k]))
            .join("")}e`;

test("torrentToMagnet hashes the original info dictionary bytes", () => {
  const info = bencode({
    length: 1024,
    name: "Game Name",
    "piece length": 16384,
    pieces: "x".repeat(20),
  });
  const torrent = Buffer.from(
    `d${bencode("announce")}${bencode("udp://tracker.test:80")}${bencode("announce-list")}${bencode([["udp://tracker.test:80"], ["http://other.test/an"]])}${bencode("info")}${info}e`,
    "latin1"
  );
  const hash = crypto
    .createHash("sha1")
    .update(Buffer.from(info, "latin1"))
    .digest("hex");
  assert.equal(
    core.torrentToMagnet(torrent),
    `magnet:?xt=urn:btih:${hash}&dn=Game%20Name&tr=${encodeURIComponent("udp://tracker.test:80")}&tr=${encodeURIComponent("http://other.test/an")}`
  );
  assert.throws(() => core.torrentToMagnet(Buffer.from("<html>nope</html>")));
  assert.throws(() => core.torrentToMagnet(Buffer.from("d4:infoi1ee")));
});

test("describeEndpoint tells a Prowlarr root from a Torznab feed", () => {
  assert.deepEqual(core.describeEndpoint("http://localhost:9696/"), {
    torznab: false,
    url: "http://localhost:9696",
  });
  assert.deepEqual(core.describeEndpoint("http://localhost:9696/5/api?apikey=x&t=caps"), {
    torznab: true,
    url: "http://localhost:9696/5/api",
  });
  assert.equal(
    core.describeEndpoint("http://jackett:9117/api/v2.0/indexers/all/results/torznab/")
      .torznab,
    true
  );
  assert.throws(() => core.describeEndpoint("ftp://x"));
  assert.throws(() => core.describeEndpoint("not a url"));
});
