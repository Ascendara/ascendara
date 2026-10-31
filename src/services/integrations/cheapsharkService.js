const CHEAPSHARK_API_BASE = "https://www.cheapshark.com/api/1.0";
const STEAM_STORE_ID = "1";
const REQUEST_DELAY_MS = 250;
const DETAILS_BATCH_SIZE = 25;
const MIN_MATCH_SCORE = 70;

const ROMAN_NUMERALS = {
  ii: "2",
  iii: "3",
  iv: "4",
  v: "5",
  vi: "6",
  vii: "7",
  viii: "8",
  ix: "9",
  x: "10",
  xi: "11",
  xii: "12",
  xiii: "13",
  xiv: "14",
  xv: "15",
  xvi: "16",
};

// Words that mark a result as an add-on rather than the game itself
const ADDON_WORDS = new Set([
  "soundtrack",
  "ost",
  "dlc",
  "season",
  "expansion",
  "pack",
  "bundle",
  "upgrade",
  "artbook",
  "card",
  "skin",
  "skins",
  "costume",
  "costumes",
  "pass",
  "coins",
  "points",
  "currency",
  "demo",
]);

// Extra words that don't change which game a result is
const EDITION_WORDS = new Set([
  "the",
  "a",
  "of",
  "and",
  "edition",
  "goty",
  "game",
  "year",
  "enhanced",
  "remastered",
  "definitive",
  "complete",
  "deluxe",
  "digital",
  "standard",
  "ultimate",
  "gold",
  "premium",
  "anniversary",
  "directors",
  "cut",
]);

// Release/uploader noise found in downloaded game folder names
const VERSION_RE = /\(v[^)]*\)|\[v[^\]]*\]|\bv\d+(?:[.\-_]\w+)*\b/gi;
const BUILD_RE = /\bbuild\s*\d+\b/gi;
const BRACKET_RE = /\[[^\]]*\]|\{[^}]*\}|\([^)]*\)/g;
const NOISE_RE =
  /\b(free\s+download|full\s+version|repack|pc\s+game|fitgirl|dodi|elamigos|steamrip|skidrow|empress|tenoke|razor1911|multi\d*)\b|\+\s*(all\s+|\d+\s+)?dlcs?\b.*$/gi;
const EDITION_RE =
  /[\s:\-–—]+(game\s+of\s+the\s+year|goty|digital\s+deluxe|deluxe|ultimate|complete|definitive|gold|premium|standard|anniversary|collector'?s|director'?s\s+cut|legendary|special|enhanced)(\s+edition)?\b.*$/i;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function cheapsharkRequest(path, params) {
  // Go through the main process so CheapShark gets a descriptive User-Agent;
  // it rejects requests that send a generic one.
  if (window.electron?.cheapsharkRequest) {
    const res = await window.electron.cheapsharkRequest(path, params);
    if (!res?.success) throw new Error(res?.error || "CheapShark request failed");
    return res.data;
  }
  const query = new URLSearchParams(params).toString();
  const response = await fetch(`${CHEAPSHARK_API_BASE}${path}?${query}`);
  if (!response.ok) throw new Error(`CheapShark HTTP ${response.status}`);
  return response.json();
}

/**
 * Strip version tags, release group names and other folder-name noise from a title
 * @param {string} title
 * @returns {string}
 */
export function cleanTitle(title) {
  if (!title) return "";
  return title
    .replace(/[™®©]/g, "")
    .replace(VERSION_RE, " ")
    .replace(BUILD_RE, " ")
    .replace(/[._]+/g, " ")
    .replace(BRACKET_RE, " ")
    .replace(NOISE_RE, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s\-–—:|+]+|[\s\-–—:|+]+$/g, "")
    .trim();
}

function tokenize(title) {
  return title
    .toLowerCase()
    .replace(/[™®©]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map(token => ROMAN_NUMERALS[token] || token);
}

function scoreMatch(queryTokens, result, rank) {
  const resultTokens = tokenize(result.external || "");
  if (resultTokens.length === 0) return -Infinity;
  if (resultTokens.join(" ") === queryTokens.join(" ")) return 1000 - rank;

  const resultSet = new Set(resultTokens);
  const querySet = new Set(queryTokens);
  const covered = queryTokens.filter(token => resultSet.has(token)).length;
  const coverage = covered / queryTokens.length;
  if (coverage < 0.75) return -Infinity;

  const firstMatch = resultTokens.findIndex(token => querySet.has(token));
  let score = 100 * coverage;
  let isAddon = false;
  resultTokens.forEach((token, index) => {
    if (querySet.has(token)) return;
    if (ADDON_WORDS.has(token)) isAddon = true;
    if (EDITION_WORDS.has(token)) score -= 4;
    // An extra number usually means a different entry in the series
    else if (/^\d+$/.test(token)) score -= 40;
    // A leading franchise/publisher word ("Marvels", "Tom Clancys") is common,
    // a trailing subtitle usually means a spin-off or add-on
    else if (index < firstMatch) score -= 12;
    else score -= 40;
  });
  if (isAddon) score -= 40;
  // Base games are usually the entries tied to a Steam app
  if (result.steamAppID) score += 5;
  return score - rank * 0.5;
}

function buildQueries(title) {
  const cleaned = cleanTitle(title);
  const queries = [cleaned, cleaned.replace(EDITION_RE, "").trim()];
  const separatorIndex = cleaned.search(/\s[-–—:|]\s|:\s/);
  if (separatorIndex > 2) queries.push(cleaned.slice(0, separatorIndex).trim());
  return [...new Set(queries.filter(q => tokenize(q).length > 0))];
}

/**
 * Search for a game by title and return the best matching CheapShark entry
 * @param {string} title - Game title to search for
 * @returns {Promise<Object|null>} CheapShark search result or null if not found
 */
export async function searchGame(title) {
  const queries = buildQueries(title);
  for (let i = 0; i < queries.length; i++) {
    if (i > 0) await delay(REQUEST_DELAY_MS);
    let results;
    try {
      results = await cheapsharkRequest("/games", { title: queries[i], limit: 60 });
    } catch (error) {
      console.error("CheapShark search error:", error);
      continue;
    }
    if (!Array.isArray(results) || results.length === 0) continue;

    const queryTokens = tokenize(queries[i]);
    let best = null;
    let bestScore = -Infinity;
    results.forEach((result, rank) => {
      const score = scoreMatch(queryTokens, result, rank);
      if (score > bestScore) {
        best = result;
        bestScore = score;
      }
    });
    if (best && bestScore >= MIN_MATCH_SCORE) return best;
  }
  return null;
}

/**
 * Get detailed info for several games at once
 * @param {string[]} gameIds - CheapShark game IDs (at most 25)
 * @returns {Promise<Object>} Map of game ID to details
 */
export async function getGamesDetails(gameIds) {
  if (gameIds.length === 0) return {};
  try {
    const data = await cheapsharkRequest("/games", { ids: gameIds.join(",") });
    return data && typeof data === "object" ? data : {};
  } catch (error) {
    console.error("CheapShark game details error:", error);
    return {};
  }
}

/**
 * Get detailed game info including all deals
 * @param {string} gameId - CheapShark game ID
 * @returns {Promise<Object|null>} Detailed game info with deals
 */
export async function getGameDetails(gameId) {
  try {
    return await cheapsharkRequest("/games", { id: gameId });
  } catch (error) {
    console.error("CheapShark game details error:", error);
    return null;
  }
}

/**
 * Pick the retail (non-sale) price from a game's deals: Steam's when listed,
 * otherwise the price most stores agree on, so one store's outlier can't skew it
 */
function pickRetailPrice(details, fallback) {
  const deals = (details?.deals || [])
    .map(deal => ({ storeID: deal.storeID, price: parseFloat(deal.retailPrice) }))
    .filter(deal => deal.price > 0);
  if (deals.length === 0) return parseFloat(fallback) || 0;

  const steamDeal = deals.find(deal => deal.storeID === STEAM_STORE_ID);
  if (steamDeal) return steamDeal.price;

  const counts = new Map();
  for (const { price } of deals) counts.set(price, (counts.get(price) || 0) + 1);
  let retail = 0;
  let retailCount = 0;
  for (const [price, count] of counts) {
    if (count > retailCount || (count === retailCount && price > retail)) {
      retail = price;
      retailCount = count;
    }
  }
  return retail;
}

/**
 * Get the retail (non-sale) price for a game
 * @param {string} title - Game title
 * @returns {Promise<{price: number, title: string}|null>} Price info or null
 */
export async function getRetailPrice(title) {
  const game = await searchGame(title);
  if (!game) return null;
  const details = await getGameDetails(game.gameID);
  return {
    price: pickRetailPrice(details, game.cheapest),
    title: details?.info?.title || game.external,
    gameId: game.gameID,
    thumb: details?.info?.thumb || game.thumb,
  };
}

/**
 * Calculate total library value for multiple games
 * @param {string[]} gameTitles - Array of game titles
 * @param {function} onProgress - Optional callback for progress updates (current, total, gameName, price)
 * @returns {Promise<{totalValue: number, games: Array, notFound: string[]}>}
 */
export async function calculateLibraryValue(gameTitles, onProgress) {
  const results = {
    totalValue: 0,
    games: [],
    notFound: [],
  };

  // The same game can appear more than once (e.g. in folders); only count it once
  const seen = new Set();
  const titles = gameTitles.filter(title => {
    const key = tokenize(cleanTitle(title || "")).join(" ");
    if (!title || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const matches = [];
  for (let i = 0; i < titles.length; i++) {
    const title = titles[i];
    if (i > 0) await delay(REQUEST_DELAY_MS);

    const game = await searchGame(title);
    if (game) matches.push({ originalTitle: title, game });
    else results.notFound.push(title);

    if (onProgress) onProgress(i + 1, titles.length, title, 0);
  }

  // Look up deals in batches instead of one request per game
  const uniqueIds = [...new Set(matches.map(match => match.game.gameID))];
  const details = {};
  for (let i = 0; i < uniqueIds.length; i += DETAILS_BATCH_SIZE) {
    await delay(REQUEST_DELAY_MS);
    Object.assign(
      details,
      await getGamesDetails(uniqueIds.slice(i, i + DETAILS_BATCH_SIZE))
    );
  }

  const counted = new Set();
  for (const { originalTitle, game } of matches) {
    // Two differently named folders can resolve to the same game
    if (counted.has(game.gameID)) continue;
    counted.add(game.gameID);

    const info = details[game.gameID];
    const price = pickRetailPrice(info, game.cheapest);
    if (price <= 0) {
      results.notFound.push(originalTitle);
      continue;
    }
    results.games.push({
      title: info?.info?.title || game.external,
      originalTitle,
      price,
      gameId: game.gameID,
      thumb: info?.info?.thumb || game.thumb,
    });
    results.totalValue += price;
  }

  return results;
}

export default {
  cleanTitle,
  searchGame,
  getGameDetails,
  getGamesDetails,
  getRetailPrice,
  calculateLibraryValue,
};
