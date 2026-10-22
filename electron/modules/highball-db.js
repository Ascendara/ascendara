/**
 * Highball compatibility database
 * Looks up how a Windows game runs on Apple Silicon in highball-db
 * (https://github.com/gauthierpiarrette/highball-db):
 * - curated entries (CC0): status, recommended renderer, known issues, launch arguments
 * - predictions (ODbL, derived from ProtonDB): odds only, never verified on a Mac
 * Bulk lists are cached for a day; a copy bundled at build time covers offline use.
 */

const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const axios = require("axios");
const { ipcMain } = require("electron");
const { isDev } = require("./config");

const DATA_URL = "https://gethighball.com/data";
const CACHE_DIR = path.join(
  os.homedir(),
  "Library/Application Support/ascendara/highball/compat-db"
);
const MAX_AGE = 24 * 60 * 60 * 1000;
const PREDICTION_ATTRIBUTION =
  "Prediction from ProtonDB community reports (ODbL) and AreWeAntiCheatYet (MIT), computed by Highball. Not verified on a Mac.";

let index = null;
let loading = null;

function bundledDir() {
  return isDev
    ? path.resolve(__dirname, "../../binaries/Highball/dist")
    : path.join(process.resourcesPath, "Highball");
}

/**
 * Normalize a title for matching: "Schedule I™" and "schedule i" both give "schedulei".
 */
function normalizeTitle(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[™®©]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

async function readList(name) {
  const cached = path.join(CACHE_DIR, `${name}.json`);
  let stale = true;
  try {
    stale = Date.now() - (await fs.stat(cached)).mtimeMs > MAX_AGE;
  } catch {}

  if (stale) {
    try {
      const { data } = await axios.get(`${DATA_URL}/${name}.json`, { timeout: 15000 });
      if (!data?.games) throw new Error(`Unexpected ${name}.json format`);
      await fs.ensureDir(CACHE_DIR);
      await fs.writeJson(cached, data);
      return data;
    } catch (error) {
      console.warn(`[HighballDB] Could not refresh ${name}:`, error.message);
    }
  }
  for (const file of [cached, path.join(bundledDir(), `compat-${name}.json`)]) {
    try {
      return await fs.readJson(file);
    } catch {}
  }
  return { games: name === "games" ? [] : {} };
}

async function loadIndex() {
  if (index && Date.now() - index.loadedAt < MAX_AGE) return index;
  if (loading) return loading;
  loading = (async () => {
    const [games, predictions] = await Promise.all([
      readList("games"),
      readList("predictions"),
    ]);
    const next = {
      loadedAt: Date.now(),
      curatedByAppId: new Map(),
      curatedByTitle: new Map(),
      predictionsByAppId: new Map(),
      predictionsByTitle: new Map(),
    };
    for (const entry of games.games || []) {
      if (entry.steam_appid) next.curatedByAppId.set(String(entry.steam_appid), entry);
      next.curatedByTitle.set(normalizeTitle(entry.title), entry);
    }
    for (const [appid, entry] of Object.entries(predictions.games || {})) {
      const prediction = { ...entry, appid };
      next.predictionsByAppId.set(appid, prediction);
      next.predictionsByTitle.set(normalizeTitle(entry.t), prediction);
    }
    index = next;
    return index;
  })().finally(() => {
    loading = null;
  });
  return loading;
}

/**
 * Full curated entry (known issues, launch arguments) for one Steam game.
 */
async function fetchDetail(appid) {
  const cached = path.join(CACHE_DIR, "steam", `${appid}.json`);
  try {
    if (Date.now() - (await fs.stat(cached)).mtimeMs < MAX_AGE) {
      return await fs.readJson(cached);
    }
  } catch {}
  try {
    const { data } = await axios.get(`${DATA_URL}/steam/${appid}.json`, {
      timeout: 10000,
    });
    await fs.ensureDir(path.dirname(cached));
    await fs.writeJson(cached, data);
    return data;
  } catch {
    try {
      return await fs.readJson(cached);
    } catch {
      return null;
    }
  }
}

/**
 * Find a game by Steam app id, falling back to its title.
 * Returns a curated result, a prediction, or null when nothing is known.
 */
async function lookup({ steamAppId, title } = {}, { detail = false } = {}) {
  const db = await loadIndex();
  const appid = steamAppId ? String(steamAppId) : null;
  const key = normalizeTitle(title);

  const curated =
    (appid && db.curatedByAppId.get(appid)) || (key && db.curatedByTitle.get(key));
  if (curated) {
    const result = {
      kind: "curated",
      title: curated.title,
      steamAppId: curated.steam_appid || null,
      status: curated.status,
      renderer: curated.renderer || null,
      anticheat: curated.anticheat || null,
      notes: curated.notes || "",
      lastVerified: curated.lastVerified || null,
      reports: curated.reports || 0,
      url: curated.url,
      // Blocked titles cannot run under any compatibility layer
      downloadWarning: String(curated.status).startsWith("blocked") ? "blocked" : null,
      knownIssues: [],
      launchArgs: [],
    };
    if (detail && curated.steam_appid) {
      const game = (await fetchDetail(curated.steam_appid))?.game;
      if (game) {
        result.knownIssues = game.knownIssues || [];
        result.launchArgs = Array.isArray(game.launchArgs) ? game.launchArgs : [];
        result.renderer = game.renderer || result.renderer;
      }
    }
    return result;
  }

  const prediction =
    (appid && db.predictionsByAppId.get(appid)) ||
    (key && db.predictionsByTitle.get(key));
  if (prediction) {
    return {
      kind: "prediction",
      title: prediction.t,
      steamAppId: Number(prediction.appid),
      verdict: prediction.c, // good | warn | bad
      label: prediction.p,
      protonTier: prediction.pt,
      reports: prediction.n,
      url: `https://gethighball.com/games/${prediction.s}/`,
      downloadWarning: prediction.c === "bad" ? "unlikely" : null,
      attribution: PREDICTION_ATTRIBUTION,
    };
  }
  return null;
}

function registerHighballDbHandlers() {
  ipcMain.handle("highball-db-lookup", async (_, query, options) => {
    try {
      return await lookup(query, options);
    } catch (error) {
      console.warn("[HighballDB] Lookup failed:", error.message);
      return null;
    }
  });
  // Warm the cache so the first game page opens without waiting on the network
  loadIndex().catch(() => {});
}

module.exports = { lookup, normalizeTitle, registerHighballDbHandlers };
