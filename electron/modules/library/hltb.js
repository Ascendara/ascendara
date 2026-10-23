/**
 * HowLongToBeat Module
 * Looks up game completion times from HowLongToBeat.
 *
 */

const axios = require("axios");
const { ipcMain } = require("electron");

const BASE_URL = "https://howlongtobeat.com";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const REQUEST_TIMEOUT_MS = 15000;
const TOKEN_TTL_MS = 5 * 60 * 1000;
const MIN_SIMILARITY = 0.85;

const baseHeaders = { "User-Agent": USER_AGENT, Referer: `${BASE_URL}/` };

let cachedSearchPath = null;
let cachedAuth = null;
let authExpiresAt = 0;
// Per-session results, including misses, keyed by normalized name
const resultCache = new Map();

const http = axios.create({
  baseURL: BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: baseHeaders,
});

function invalidate() {
  cachedSearchPath = null;
  cachedAuth = null;
  authExpiresAt = 0;
}

function collectApiPaths(content, paths) {
  for (const match of content.matchAll(/["'`](\/api\/[a-zA-Z0-9_/-]+)/g)) {
    paths.add(match[1]);
  }
}

// The search endpoint is the only API route with a matching /init handshake route
function findSearchPath(paths) {
  return [...paths]
    .filter(apiPath => !apiPath.endsWith("/init") && paths.has(`${apiPath}/init`))
    .sort()[0];
}

async function getSearchPath() {
  if (cachedSearchPath) return cachedSearchPath;

  const { data: homepage } = await http.get("/", { responseType: "text" });
  const paths = new Set();

  const manifest = homepage.match(/["'](\/_next\/static\/[^"']+\/_buildManifest\.js)["']/);
  if (manifest) {
    const { data } = await http.get(manifest[1], { responseType: "text" });
    collectApiPaths(data, paths);
  }

  // Older builds only reference the API routes from the page chunks
  if (!findSearchPath(paths)) {
    const chunks = new Set(
      [...homepage.matchAll(/["'](\/_next\/static\/chunks\/[^"']+\.js)["']/g)].map(m => m[1])
    );
    for (const chunk of chunks) {
      try {
        const { data } = await http.get(chunk, { responseType: "text" });
        collectApiPaths(data, paths);
      } catch {
        // Skip chunks that fail to load
      }
    }
  }

  const searchPath = findSearchPath(paths);
  if (!searchPath) throw new Error("Could not find HLTB search endpoint");

  cachedSearchPath = searchPath;
  return searchPath;
}

async function getAuth() {
  if (cachedAuth && Date.now() < authExpiresAt) return cachedAuth;

  const searchPath = await getSearchPath();
  const { data } = await http.get(`${searchPath}/init`, { params: { t: Date.now() } });
  if (!data?.token) throw new Error("No token in HLTB init response");

  cachedAuth = { token: data.token, key: data.hpKey, value: data.hpVal };
  authExpiresAt = Date.now() + TOKEN_TTL_MS;
  return cachedAuth;
}

async function searchOnce(query) {
  const auth = await getAuth();
  const searchPath = await getSearchPath();

  const payload = {
    searchType: "games",
    searchTerms: query.split(/\s+/).filter(Boolean),
    searchPage: 1,
    size: 20,
    searchOptions: {
      games: {
        userId: 0,
        platform: "",
        sortCategory: "popular",
        rangeCategory: "main",
        rangeTime: { min: 0, max: 0 },
        gameplay: { perspective: "", flow: "", genre: "", difficulty: "" },
        rangeYear: { max: "", min: "" },
        modifier: "",
      },
      users: { sortCategory: "postcount" },
      lists: { sortCategory: "follows" },
      filter: "",
      sort: 0,
      randomizer: 0,
    },
    useCache: true,
  };
  const headers = { Origin: BASE_URL, "x-auth-token": auth.token };
  if (auth.key && auth.value) {
    payload[String(auth.key)] = auth.value;
    headers["x-hp-key"] = String(auth.key);
    headers["x-hp-val"] = String(auth.value);
  }

  const { data } = await http.post(searchPath, payload, { headers });
  if (!Array.isArray(data?.data)) throw new Error("Unexpected HLTB search response");
  return data.data;
}

// A failed search usually means the token expired or HLTB renamed the endpoint,
// so rediscover everything and retry once.
async function search(query) {
  try {
    return await searchOnce(query);
  } catch (error) {
    console.warn(`[HLTB] Search failed (${error.message}), rediscovering endpoint`);
    invalidate();
    return searchOnce(query);
  }
}

function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[™®©]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[b.length];
}

// Showing another game's times is worse than showing none, so only accept an
// exact (normalized) name match or a very close one.
function pickMatch(results, gameName) {
  const target = normalizeName(gameName);
  if (!target) return null;

  let best = null;
  let bestScore = 0;
  for (const result of results) {
    const candidate = normalizeName(result.game_name);
    if (!candidate) continue;
    const score =
      candidate === target
        ? 1
        : 1 - levenshtein(target, candidate) / Math.max(target.length, candidate.length);
    // Results are sorted by popularity, so ties keep the more popular entry
    if (score > bestScore) {
      best = result;
      bestScore = score;
    }
  }
  return bestScore >= MIN_SIMILARITY ? best : null;
}

function formatResult(result) {
  const main = result.comp_main || 0;
  const plus = result.comp_plus || 0;
  const full = result.comp_100 || 0;
  if (!main && !plus && !full) return null;
  return {
    id: result.game_id,
    name: result.game_name,
    // Seconds
    main,
    plus,
    full,
    url: `${BASE_URL}/game/${result.game_id}`,
  };
}

/**
 * Get completion times for a game by name
 * @param {string} gameName
 * @returns {Promise<Object|null>} { id, name, main, plus, full, url } with times in seconds
 */
async function getGameTimes(gameName) {
  const key = normalizeName(gameName);
  if (!key) return null;
  if (resultCache.has(key)) return resultCache.get(key);

  // Names like "Grand Theft Auto V - GTA 5" only match without the suffix
  const queries = [gameName];
  const dashMatch = gameName.match(/^(.+?)\s+[-–—]\s+.+$/);
  if (dashMatch) queries.push(dashMatch[1]);

  let times = null;
  for (const query of queries) {
    const searchTerms = normalizeName(query);
    if (!searchTerms) continue;
    const match = pickMatch(await search(searchTerms), query);
    times = match ? formatResult(match) : null;
    if (times) break;
  }

  resultCache.set(key, times);
  return times;
}

function registerHltbHandlers() {
  ipcMain.handle("hltb-get-game-times", async (_, gameName) => {
    try {
      if (typeof gameName !== "string") return null;
      return await getGameTimes(gameName.slice(0, 200));
    } catch (error) {
      console.error("[HLTB] getGameTimes IPC error:", error.message);
      return null;
    }
  });
}

module.exports = {
  getGameTimes,
  registerHltbHandlers,
};
