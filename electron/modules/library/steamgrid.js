const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const authHelper = require("../core/auth-helper");
const { API_URL } = require("../core/config");

const PROXY_BASE_URL = `${API_URL}/api/proxy/steamgrid`;

// ---------------------------------------------------------------------------
// Request throttling - the upstream proxy rate-limits us hard when browsing
// lots of custom-source games. A small concurrency window + 429 backoff keeps
// things well under the limit.
// ---------------------------------------------------------------------------
const MAX_CONCURRENT = 2;
const MIN_GAP_MS = 120; // minimum spacing between successive requests
let inFlight = 0;
let lastRequestAt = 0;
const waiters = [];
let rateLimitedUntil = 0;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function acquireSlot() {
  while (true) {
    const now = Date.now();
    if (rateLimitedUntil && now < rateLimitedUntil) {
      await sleep(rateLimitedUntil - now);
      continue;
    }
    if (inFlight < MAX_CONCURRENT) {
      const gap = now - lastRequestAt;
      if (gap < MIN_GAP_MS) await sleep(MIN_GAP_MS - gap);
      inFlight++;
      lastRequestAt = Date.now();
      return;
    }
    await new Promise(resolve => waiters.push(resolve));
  }
}

function releaseSlot() {
  inFlight = Math.max(0, inFlight - 1);
  const next = waiters.shift();
  if (next) next();
}

async function throttledGet(url, headers) {
  await acquireSlot();
  try {
    return await axios.get(url, { headers, timeout: 15000 });
  } catch (err) {
    if (err.response?.status === 429) {
      // Proxy asked us to slow down - back off for 60s globally
      rateLimitedUntil = Date.now() + 60_000;
    }
    throw err;
  } finally {
    releaseSlot();
  }
}

// A zero-byte or half-written file from an interrupted download counts as
// missing, otherwise it would block the asset from ever being fetched again
function findAsset(gameDir, baseName) {
  for (const ext of [".jpg", ".jpeg", ".png"]) {
    const file = path.join(gameDir, baseName + ext);
    try {
      if (fs.statSync(file).size > 0) return file;
      fs.unlinkSync(file);
    } catch {
      /* not there */
    }
  }
  return null;
}

// Writes to a temp file first so a failed or stalled download never leaves a
// broken image behind
async function downloadAsset(url, finalFilePath) {
  const tempPath = `${finalFilePath}.part`;
  try {
    const response = await axios({
      url,
      method: "GET",
      responseType: "arraybuffer",
      timeout: 30000,
    });
    const buffer = Buffer.from(response.data);
    if (!buffer.length) throw new Error("Empty image response");
    await fs.promises.writeFile(tempPath, buffer);
    await fs.promises.rename(tempPath, finalFilePath);
  } catch (error) {
    await fs.promises.unlink(tempPath).catch(() => {});
    throw error;
  }
}

async function fetchGameAssets(gameName, gameDir, selectedGameId, selectedLogoId) {
  if (
    selectedGameId != null &&
    (!Number.isSafeInteger(selectedGameId) || selectedGameId <= 0)
  ) {
    throw new Error("Invalid artwork game selection");
  }
  if (
    selectedLogoId != null &&
    (!Number.isSafeInteger(selectedLogoId) || selectedLogoId <= 0 || !selectedGameId)
  ) {
    throw new Error("Invalid artwork logo selection");
  }
  const baseNames = ["grid.ascendara", "hero.ascendara", "logo.ascendara"];
  if (baseNames.every(baseName => findAsset(gameDir, baseName))) {
    return true;
  }

  if (findAsset(gameDir, "header.ascendara")) {
    console.log(
      `[SteamGrid] Found legacy header for "${gameName}", downloading missing assets`
    );
  }
  const authHeaders = authHelper.generateAuthHeaders();

  try {
    // Shared, throttled search so a library full of imported games doesn't
    // burst the proxy into rate limiting
    const gameId = selectedGameId ?? (await resolveGameId(gameName, authHeaders, true));
    if (!gameId) return false;
    console.log(`[SteamGrid] Found GameID ${gameId} for "${gameName}"`);

    // Definition of types (without extension in the filename for now)
    const downloads = [
      {
        type: "grids",
        dimensions: ["600x900"],
        baseName: "grid.ascendara",
        styles: "alternate",
      },
      {
        type: "heroes",
        dimensions: ["1920x620", "3840x1240"],
        baseName: "hero.ascendara",
        styles: "alternate",
      },
      { type: "logos", baseName: "logo.ascendara", styles: "white" },
    ];

    for (const item of downloads) {
      if (findAsset(gameDir, item.baseName)) continue;

      let url = `${PROXY_BASE_URL}/${item.type}/game/${gameId}?styles=${item.styles}&sort=score`;
      if (item.dimensions) url += `&dimensions=${item.dimensions.join(",")}`;
      if (item.type !== "logos") url += `&mimes=image/jpeg,image/png`;

      try {
        const res = await throttledGet(url, authHeaders);
        let assets = res.data?.success && Array.isArray(res.data.data) ? res.data.data : [];

        // Prefer English logos even when the white-style results contain other languages.
        if (
          item.type === "logos" &&
          (selectedLogoId || !assets.some(asset => asset.language === "en"))
        ) {
          try {
            const official = await throttledGet(
              `${PROXY_BASE_URL}/${item.type}/game/${gameId}?styles=official&sort=score`,
              authHeaders
            );
            if (official.data?.success && Array.isArray(official.data.data)) {
              assets = [...assets, ...official.data.data];
            }
          } catch (error) {
            if (!assets.length) throw error;
          }
        }

        const selected = item.type === "logos"
          ? assets.find(asset => asset.id === selectedLogoId) ||
            assets.find(asset => asset.language === "en") ||
            assets.find(asset => !asset.language) ||
            assets[0]
          : assets[0];
        if (selected?.url) {
          let ext = path.extname(selected.url).split("?")[0];
          if (!ext) ext = ".jpg"; // Fallback

          const finalFileName = item.baseName + ext;
          await downloadAsset(selected.url, path.join(gameDir, finalFileName));
          console.log(`[SteamGrid] Downloaded ${finalFileName}`);
        }
      } catch (e) {
        console.warn(`[SteamGrid] Failed to get ${item.type}: ${e.message}`);
        if (e.response?.status === 429) break; // retried on the next visit
      }
    }
    return baseNames.some(baseName => findAsset(gameDir, baseName));
  } catch (error) {
    console.error(`[SteamGrid] Error:`, error.message);
    return false;
  }
}

/**
 * Resolve SteamGrid image URLs for a game by name, WITHOUT downloading anything
 * to disk. Used by the renderer to display cover art for custom-source games
 * (which don't carry an Ascendara imgID).
 *
 * Returns { gameId, grid, hero, logo, header } where any field may be null.
 */
function cleanGameName(gameName) {
  return gameName
    .replace(/\[[^\]]*\]/g, "") // repack tags like [FitGirl Repack]
    .replace(/[\s,]+v\d[\d.]*.*$/i, "") // "Title v1.2" and FitGirl's "Title, v1.2 + DLCs"
    .replace(/ premium edition/i, "")
    .replace(/\(\s*\)/g, "") // strip empty parentheses from mangled Hydra titles
    .replace(/\s{2,}/g, " ")
    .trim();
}

// cleanName -> SteamGridDB game id (or null), so header, cover and full lookups
// for the same game share one search
const gameIdCache = new Map();
const GAME_ID_CACHE_LIMIT = 2000;

async function resolveGameId(gameName, authHeaders, reportErrors = false) {
  const cleanName = cleanGameName(gameName);
  if (!cleanName) return null;
  if (gameIdCache.has(cleanName)) return gameIdCache.get(cleanName);
  try {
    const searchRes = await throttledGet(
      `${PROXY_BASE_URL}/search/autocomplete/${encodeURIComponent(cleanName)}`,
      authHeaders
    );
    const gameId =
      searchRes.data?.success && searchRes.data.data?.length > 0
        ? searchRes.data.data[0].id
        : null;
    if (gameIdCache.size >= GAME_ID_CACHE_LIMIT) {
      gameIdCache.delete(gameIdCache.keys().next().value);
    }
    gameIdCache.set(cleanName, gameId);
    return gameId;
  } catch (e) {
    console.warn(`[SteamGrid] URL search failed for "${cleanName}":`, e.message);
    if (reportErrors) throw e;
  }
  return null;
}

/**
 * Lightweight lookup: one search + one asset query. Returns a single header
 * image URL (or null). Use this for browse/search UI where we don't need
 * hero/logo/portrait variants - only the card cover.
 */
async function getHeaderUrl(gameName) {
  if (!gameName || typeof gameName !== "string") return { gameId: null, url: null };
  const authHeaders = authHelper.generateAuthHeaders();
  let gameId;
  try {
    gameId = await resolveGameId(gameName, authHeaders, true);
  } catch {
    // Flagged so the renderer doesn't cache a rate limit as "no artwork"
    return { gameId: null, url: null, failed: true };
  }
  if (!gameId) return { gameId: null, url: null };

  // 460x215 header-style grid matches Steam's header image aspect ratio.
  // Falls back to any portrait grid if the 460x215 variant isn't published.
  const attempts = [
    `${PROXY_BASE_URL}/grids/game/${gameId}?dimensions=460x215&mimes=image/jpeg,image/png&sort=score`,
    `${PROXY_BASE_URL}/grids/game/${gameId}?dimensions=920x430&mimes=image/jpeg,image/png&sort=score`,
    `${PROXY_BASE_URL}/grids/game/${gameId}?styles=alternate&dimensions=600x900&mimes=image/jpeg,image/png&sort=score`,
  ];
  for (const url of attempts) {
    try {
      const res = await throttledGet(url, authHeaders);
      if (res.data?.success && res.data.data?.length > 0) {
        return { gameId, url: res.data.data[0].url || null };
      }
    } catch (e) {
      // Stop early on rate-limit; caller will retry later
      if (e.response?.status === 429) return { gameId, url: null, failed: true };
    }
  }
  return { gameId, url: null };
}

/**
 * Portrait cover only: one search + one asset query. For the game detail page,
 * which shows the 600x900 grid and nothing else from SteamGridDB.
 */
async function getGridUrl(gameName) {
  if (!gameName || typeof gameName !== "string") return { gameId: null, url: null };
  const authHeaders = authHelper.generateAuthHeaders();
  const gameId = await resolveGameId(gameName, authHeaders);
  if (!gameId) return { gameId: null, url: null };
  try {
    const res = await throttledGet(
      `${PROXY_BASE_URL}/grids/game/${gameId}?styles=alternate&dimensions=600x900&mimes=image/jpeg,image/png&sort=score`,
      authHeaders
    );
    if (res.data?.success && res.data.data?.length > 0) {
      return { gameId, url: res.data.data[0].url || null };
    }
  } catch (e) {
    console.warn(`[SteamGrid] Cover fetch failed for "${gameName}":`, e.message);
  }
  return { gameId, url: null };
}

/**
 * Full asset URL resolve (grid + hero + logo + header). Heavier - 1 search
 * + up to 4 asset queries. Only call this when you actually need all four
 * variants (e.g. populating an installed game directory).
 */
async function getImageUrls(gameName, { reportErrors = false } = {}) {
  if (!gameName || typeof gameName !== "string") {
    return { gameId: null, grid: null, hero: null, logo: null, header: null };
  }
  const authHeaders = authHelper.generateAuthHeaders();
  const gameId = await resolveGameId(gameName, authHeaders, reportErrors);
  const result = { gameId, grid: null, hero: null, logo: null, header: null };
  if (!gameId) return result;

  const queries = [
    {
      key: "grid",
      url: `${PROXY_BASE_URL}/grids/game/${gameId}?styles=alternate&dimensions=600x900&mimes=image/jpeg,image/png&sort=score`,
    },
    {
      key: "hero",
      url: `${PROXY_BASE_URL}/heroes/game/${gameId}?styles=alternate&dimensions=1920x620,3840x1240&mimes=image/jpeg,image/png&sort=score`,
    },
    {
      key: "logo",
      url: `${PROXY_BASE_URL}/logos/game/${gameId}?styles=white&sort=score`,
    },
    {
      key: "header",
      url: `${PROXY_BASE_URL}/grids/game/${gameId}?dimensions=460x215&mimes=image/jpeg,image/png&sort=score`,
    },
  ];

  // Serialize rather than Promise.all - the throttler already limits concurrency
  // but this keeps ordering predictable and avoids burst bookkeeping.
  for (const { key, url } of queries) {
    try {
      let res = await throttledGet(url, authHeaders);
      if (key === "logo" && (!res.data?.success || !(res.data.data?.length > 0))) {
        res = await throttledGet(
          `${PROXY_BASE_URL}/logos/game/${gameId}?styles=official&sort=score`,
          authHeaders
        );
      }
      if (res.data?.success && res.data.data?.length > 0) {
        result[key] = res.data.data[0].url || null;
      }
    } catch (e) {
      console.warn(`[SteamGrid] URL fetch failed (${key}) for "${gameName}":`, e.message);
      if (reportErrors) result.failed = true;
      if (e.response?.status === 429) break; // stop early when rate-limited
    }
  }

  if (!result.header) result.header = result.grid;
  return result;
}

/**
 * SteamGridDB games matching a name, for the artwork correction picker.
 * Returns [{ id, name, year, verified }].
 */
async function searchGames(term) {
  const cleanName = typeof term === "string" ? cleanGameName(term) : "";
  if (!cleanName) return [];
  const res = await throttledGet(
    `${PROXY_BASE_URL}/search/autocomplete/${encodeURIComponent(cleanName)}`,
    authHelper.generateAuthHeaders()
  );
  if (!res.data?.success || !Array.isArray(res.data.data)) return [];
  return res.data.data.slice(0, 12).map(game => ({
    id: game.id,
    name: game.name,
    year: game.release_date ? new Date(game.release_date * 1000).getFullYear() : null,
    verified: !!game.verified,
  }));
}

/**
 * Portrait covers (600x900) and the top banner for one SteamGridDB game, for
 * the artwork correction picker. Returns { grids: [{ id, url, thumb }], hero }.
 */
async function getGameArtwork(gameId) {
  if (!Number.isSafeInteger(gameId) || gameId <= 0) {
    throw new Error("Invalid SteamGridDB game id");
  }
  const authHeaders = authHelper.generateAuthHeaders();
  const gridsRes = await throttledGet(
    `${PROXY_BASE_URL}/grids/game/${gameId}?dimensions=600x900&mimes=image/jpeg,image/png&sort=score`,
    authHeaders
  );
  const grids = gridsRes.data?.success && Array.isArray(gridsRes.data.data)
    ? gridsRes.data.data
        .filter(grid => grid?.url)
        .slice(0, 24)
        .map(grid => ({ id: grid.id, url: grid.url, thumb: grid.thumb || grid.url }))
    : [];

  let hero = null;
  try {
    const heroRes = await throttledGet(
      `${PROXY_BASE_URL}/heroes/game/${gameId}?dimensions=1920x620,3840x1240&mimes=image/jpeg,image/png&sort=score`,
      authHeaders
    );
    const top = heroRes.data?.success ? heroRes.data.data?.[0] : null;
    if (top?.url) hero = { id: top.id, url: top.url };
  } catch (e) {
    console.warn(`[SteamGrid] Hero lookup failed for game ${gameId}:`, e.message);
  }
  return { grids, hero };
}

module.exports = {
  fetchGameAssets,
  getImageUrls,
  getGridUrl,
  getHeaderUrl,
  searchGames,
  getGameArtwork,
};
