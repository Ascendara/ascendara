// Live game searches through Prowlarr (or any Torznab feed, such as Jackett).
// Requests run here because Prowlarr does not answer the renderer's CORS checks.
const { ipcMain } = require("electron");
const core = require("./torznab-core");
const { getSettingsManager } = require("../core/settings");

const GAMES_CATEGORY = "4000";
const SEARCH_TIMEOUT_MS = 20000;
const MAX_TORRENT_BYTES = 10 * 1024 * 1024;
const INDEXER_CACHE_MS = 5 * 60 * 1000;

// Download links handed to the renderer; resolve() fetches nothing else.
const knownLinks = new Set();
let indexerCache = null;

const fail = code => Object.assign(new Error(code), { code });

function config() {
  const s = getSettingsManager().getSettings();
  if (!s.torznabEnabled || !s.torznabUrl) throw fail("notConfigured");
  let endpoint;
  try {
    endpoint = core.describeEndpoint(s.torznabUrl);
  } catch {
    throw fail("invalidUrl");
  }
  return {
    ...endpoint,
    apiKey: String(s.torznabApiKey || "").trim(),
    // Usenet results are only useful with a download client to send them to
    usenet: !!(s.usenetEnabled && s.usenetClient && s.usenetUrl),
  };
}

async function request(
  url,
  { headers = {}, redirect = "follow", timeout = SEARCH_TIMEOUT_MS } = {}
) {
  let res;
  try {
    res = await fetch(url, { headers, redirect, signal: AbortSignal.timeout(timeout) });
  } catch (e) {
    throw fail(e?.name === "TimeoutError" ? "timeout" : "unreachable");
  }
  if (res.status === 401 || res.status === 403) throw fail("unauthorized");
  return res;
}

/** The Torznab feeds to search: each torrent indexer of a Prowlarr, or the one URL. */
async function endpoints(cfg) {
  if (cfg.torznab) return [{ name: "", url: cfg.url, protocol: null }];
  const key = `${cfg.url}|${cfg.apiKey}|${cfg.usenet}`;
  if (indexerCache?.key === key && Date.now() - indexerCache.at < INDEXER_CACHE_MS) {
    return indexerCache.list;
  }
  const res = await request(`${cfg.url}/api/v1/indexer`, {
    headers: { "X-Api-Key": cfg.apiKey, Accept: "application/json" },
  });
  if (!res.ok) throw fail(res.status === 404 ? "notProwlarr" : "badResponse");
  let indexers;
  try {
    indexers = await res.json();
  } catch {
    throw fail("notProwlarr");
  }
  if (!Array.isArray(indexers)) throw fail("notProwlarr");
  const list = indexers
    .filter(
      i =>
        i?.enable &&
        (i.protocol === "torrent" || (cfg.usenet && i.protocol === "usenet")) &&
        Number.isSafeInteger(i.id)
    )
    .map(i => ({
      name: String(i.name || ""),
      url: `${cfg.url}/${i.id}/api`,
      protocol: i.protocol,
    }));
  if (!list.length) throw fail("noIndexers");
  indexerCache = { key, at: Date.now(), list };
  return list;
}

async function searchEndpoint(endpoint, cfg, query) {
  const url = new URL(endpoint.url);
  url.searchParams.set("t", "search");
  url.searchParams.set("cat", GAMES_CATEGORY);
  url.searchParams.set("q", query);
  if (cfg.apiKey) url.searchParams.set("apikey", cfg.apiKey);
  const res = await request(url.toString(), {
    headers: { Accept: "application/rss+xml, application/xml" },
  });
  const body = await res.text();
  const error = core.parseError(body);
  // Torznab code 100-102 are API key errors
  if (error) throw fail(/^10[0-2]$/.test(error.code) ? "unauthorized" : "badResponse");
  if (!res.ok) throw fail("badResponse");
  const items = core.parseFeed(body, endpoint.name);
  return endpoint.protocol
    ? items.map(i => ({ ...i, protocol: endpoint.protocol }))
    : items;
}

async function search(query) {
  const text = String(query || "")
    .trim()
    .slice(0, 200);
  if (!text) return { results: [], failed: [] };
  const cfg = config();
  const list = await endpoints(cfg);
  const settled = await Promise.allSettled(list.map(e => searchEndpoint(e, cfg, text)));
  const failed = [];
  const lists = settled.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    failed.push({ indexer: list[i].name, code: r.reason?.code || "badResponse" });
    return [];
  });
  // Every feed failing the same way is a setup problem, not a quiet empty search
  if (failed.length === list.length && list.length) throw fail(failed[0].code);
  const results = core.mergeResults(
    cfg.usenet ? lists : lists.map(l => l.filter(r => r.protocol !== "usenet"))
  );
  if (knownLinks.size > 5000) knownLinks.clear();
  for (const r of results) if (r.link) knownLinks.add(r.link);
  return { results, failed, indexers: list.length };
}

/** A magnet for a search result, following Prowlarr's download proxy. */
async function resolve(result) {
  if (result?.magnet && /^magnet:/i.test(result.magnet)) return result.magnet;
  let url = result?.link;
  if (!url || !knownLinks.has(url)) throw fail("unknownResult");
  for (let hop = 0; hop < 5; hop++) {
    const res = await request(url, { redirect: "manual" });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      if (/^magnet:/i.test(location)) return location;
      url = new URL(location, url).toString();
      if (!/^https?:/i.test(url)) throw fail("badResponse");
      continue;
    }
    if (!res.ok) throw fail("badResponse");
    const length = Number(res.headers.get("content-length"));
    if (length > MAX_TORRENT_BYTES) throw fail("badResponse");
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > MAX_TORRENT_BYTES) throw fail("badResponse");
    const asText = buffer.subarray(0, 2048).toString("utf8").trim();
    if (/^magnet:/i.test(asText)) return asText.split(/\s/)[0];
    try {
      return core.torrentToMagnet(buffer);
    } catch {
      throw fail("badTorrent");
    }
  }
  throw fail("badResponse");
}

/** The .nzb file of a Usenet search result. */
async function fetchNzb(result) {
  const url = result?.link;
  if (!url || !knownLinks.has(url)) throw fail("unknownResult");
  const res = await request(url);
  if (!res.ok) throw fail("badResponse");
  const length = Number(res.headers.get("content-length"));
  if (length > MAX_TORRENT_BYTES * 5) throw fail("badResponse");
  const buffer = Buffer.from(await res.arrayBuffer());
  if (
    buffer.length > MAX_TORRENT_BYTES * 5 ||
    !/<nzb[\s>]/i.test(buffer.subarray(0, 4096).toString("utf8"))
  ) {
    throw fail("badNzb");
  }
  return buffer;
}

/** Checks the saved settings: how many feeds answer. */
async function test() {
  indexerCache = null;
  const cfg = config();
  const list = await endpoints(cfg);
  const usenetCount = list.filter(e => e.protocol === "usenet").length;
  if (cfg.torznab) {
    const url = new URL(cfg.url);
    url.searchParams.set("t", "caps");
    if (cfg.apiKey) url.searchParams.set("apikey", cfg.apiKey);
    const res = await request(url.toString());
    const body = await res.text();
    const error = core.parseError(body);
    if (error) throw fail(/^10[0-2]$/.test(error.code) ? "unauthorized" : "badResponse");
    if (!res.ok || !/<caps[\s>]/i.test(body)) throw fail("badResponse");
  }
  return {
    prowlarr: !cfg.torznab,
    indexers: list.map(e => e.name).filter(Boolean),
    count: list.length - usenetCount,
    usenetCount,
  };
}

// Errors cross IPC as { error: code } so the renderer can translate them
const wrap =
  fn =>
  async (_event, ...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      if (!e?.code) console.error("[Torznab]", e);
      return { error: e?.code || "badResponse" };
    }
  };

function registerTorznabHandlers() {
  ipcMain.handle("torznab-search", wrap(search));
  ipcMain.handle("torznab-resolve", wrap(resolve));
  ipcMain.handle("torznab-test", wrap(test));
}

module.exports = { registerTorznabHandlers, search, resolve, fetchNzb, test };
