// Torznab feed parsing and .torrent to magnet conversion. Free of Electron
// imports so it can be tested under plain node.
const crypto = require("node:crypto");

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeEntities(value) {
  return String(value ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
      if (code[0] === "#") {
        const n =
          code[1].toLowerCase() === "x"
            ? parseInt(code.slice(2), 16)
            : parseInt(code.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : match;
      }
      return ENTITIES[code.toLowerCase()] ?? match;
    })
    .trim();
}

const tagText = (xml, tag) => {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decodeEntities(m[1]) : "";
};

const attrOf = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  return m ? decodeEntities(m[2] ?? m[3]) : "";
};

const toNumber = value => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** The <error> a Torznab endpoint answers with, or null. */
function parseError(xml) {
  const tag = String(xml).match(/<error\s[^>]*>/i)?.[0];
  if (!tag) return null;
  return { code: attrOf(tag, "code"), description: attrOf(tag, "description") };
}

/**
 * Items of a Torznab (RSS) search response.
 * @returns {{ title, size, link, magnet, infoHash, seeders, peers, publishedAt, indexer, guid }[]}
 */
function parseFeed(xml, indexer = "") {
  const items = [];
  for (const [, body] of String(xml).matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
    const attrs = {};
    for (const [tag] of body.matchAll(/<(?:torznab|newznab):attr\s[^>]*>/gi)) {
      const name = attrOf(tag, "name").toLowerCase();
      if (name && !(name in attrs)) attrs[name] = attrOf(tag, "value");
    }
    const enclosure = body.match(/<enclosure\s[^>]*>/i)?.[0] || "";
    const link = tagText(body, "link") || attrOf(enclosure, "url");
    const guid = tagText(body, "guid");
    const magnet =
      [attrs.magneturl, link, guid].find(v => /^magnet:/i.test(v || "")) || "";
    const infoHash = (
      attrs.infohash ||
      magnet.match(/xt=urn:btih:([0-9a-z]+)/i)?.[1] ||
      ""
    ).toLowerCase();
    const title = tagText(body, "title");
    if (!title || (!link && !magnet)) continue;
    // Newznab (Usenet) items link an .nzb; Torznab items a torrent or magnet
    const usenet =
      !magnet &&
      (/nzb/i.test(attrOf(enclosure, "type")) ||
        /\.nzb(?:[?#]|$)/i.test(link) ||
        (/<newznab:attr\s/i.test(body) && !/<torznab:attr\s/i.test(body)));
    const seeders = toNumber(attrs.seeders);
    const peers = toNumber(attrs.peers);
    const published = Date.parse(tagText(body, "pubDate"));
    items.push({
      title,
      size:
        toNumber(tagText(body, "size")) ??
        toNumber(attrs.size) ??
        toNumber(attrOf(enclosure, "length")),
      link: /^https?:/i.test(link) ? link : "",
      magnet,
      infoHash,
      seeders,
      // Torznab "peers" counts seeders too
      leechers: peers != null && seeders != null ? Math.max(0, peers - seeders) : null,
      publishedAt: Number.isFinite(published) ? new Date(published).toISOString() : null,
      indexer: tagText(body, "jackettindexer") || indexer,
      guid,
      protocol: usenet ? "usenet" : "torrent",
    });
  }
  return items;
}

/** Results from every indexer as one list: duplicates dropped, best seeded first. */
function mergeResults(lists, limit = 100) {
  const byKey = new Map();
  for (const item of lists.flat()) {
    const key = item.infoHash || item.magnet || item.link || item.guid;
    const kept = byKey.get(key);
    if (!kept || (item.seeders ?? -1) > (kept.seeders ?? -1)) byKey.set(key, item);
  }
  return [...byKey.values()]
    .sort((a, b) => (b.seeders ?? -1) - (a.seeders ?? -1))
    .slice(0, limit);
}

// Minimal bencode reader that remembers where each value starts and ends, so
// the info dictionary's original bytes can be hashed.
function decodeBencode(buffer) {
  let pos = 0;
  const fail = () => {
    throw new Error("Invalid torrent file");
  };
  const readUntil = byte => {
    const end = buffer.indexOf(byte, pos);
    if (end === -1) fail();
    const text = buffer.toString("latin1", pos, end);
    pos = end + 1;
    return text;
  };
  const value = (depth = 0) => {
    if (depth > 64 || pos >= buffer.length) fail();
    const start = pos;
    const c = buffer[pos];
    if (c === 0x69) {
      pos++;
      const n = Number(readUntil(0x65));
      if (!Number.isFinite(n)) fail();
      return { value: n, start, end: pos };
    }
    if (c === 0x6c || c === 0x64) {
      pos++;
      const list = c === 0x6c ? [] : {};
      while (buffer[pos] !== 0x65) {
        if (pos >= buffer.length) fail();
        if (c === 0x6c) list.push(value(depth + 1));
        else {
          const key = value(depth + 1);
          if (!Buffer.isBuffer(key.value)) fail();
          list[key.value.toString("latin1")] = value(depth + 1);
        }
      }
      pos++;
      return { value: list, start, end: pos };
    }
    if (c >= 0x30 && c <= 0x39) {
      const length = Number(readUntil(0x3a));
      if (!Number.isSafeInteger(length) || pos + length > buffer.length) fail();
      const bytes = buffer.subarray(pos, pos + length);
      pos += length;
      return { value: bytes, start, end: pos };
    }
    return fail();
  };
  return value();
}

/** A magnet link for the contents of a .torrent file. */
function torrentToMagnet(buffer) {
  const root = decodeBencode(buffer).value;
  const info = root?.info;
  const isDict = v =>
    v && typeof v === "object" && !Array.isArray(v) && !Buffer.isBuffer(v);
  if (!isDict(root) || !isDict(info?.value)) {
    throw new Error("Invalid torrent file");
  }
  const hash = crypto
    .createHash("sha1")
    .update(buffer.subarray(info.start, info.end))
    .digest("hex");
  const params = [`xt=urn:btih:${hash}`];
  const name = info.value.name?.value;
  if (Buffer.isBuffer(name))
    params.push(`dn=${encodeURIComponent(name.toString("utf8"))}`);
  const trackers = new Set();
  const announce = root.announce?.value;
  if (Buffer.isBuffer(announce)) trackers.add(announce.toString("utf8"));
  for (const tier of root["announce-list"]?.value || []) {
    for (const url of Array.isArray(tier.value) ? tier.value : []) {
      if (Buffer.isBuffer(url.value)) trackers.add(url.value.toString("utf8"));
    }
  }
  for (const tr of trackers) params.push(`tr=${encodeURIComponent(tr)}`);
  return `magnet:?${params.join("&")}`;
}

/**
 * Where a configured URL points. A Prowlarr root lists its indexers through
 * its own API; anything else is taken as one Torznab endpoint (a Prowlarr
 * indexer feed, Jackett, ...).
 */
function describeEndpoint(raw) {
  const url = new URL(String(raw).trim());
  if (!/^https?:$/.test(url.protocol))
    throw new Error("URL must start with http:// or https://");
  url.hash = "";
  url.searchParams.delete("apikey");
  url.searchParams.delete("t");
  url.searchParams.delete("q");
  const path = url.pathname.replace(/\/+$/, "");
  const torznab = /\/api$/i.test(path) || /\/torznab(\/|$)/i.test(path);
  url.pathname = path || "/";
  return { torznab, url: url.toString().replace(/\/$/, "") };
}

module.exports = {
  decodeEntities,
  parseError,
  parseFeed,
  mergeResults,
  torrentToMagnet,
  describeEndpoint,
};
