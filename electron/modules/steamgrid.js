const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const authHelper = require("./auth-helper");

const PROXY_BASE_URL = "https://api.ascendara.app/api/proxy/steamgrid";

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

async function fetchGameAssets(gameName, gameDir) {
  // Check if we already have all the new assets
  const expectedFiles = [
    "grid.ascendara.jpg",
    "hero.ascendara.jpg",
    "logo.ascendara.png",
  ];

  // Verify if all files already exist
  const allExist = expectedFiles.every(file => {
    const base = file.split(".")[0]; // 'grid', 'hero', 'logo'
    return (
      fs.existsSync(path.join(gameDir, base + ".ascendara.jpg")) ||
      fs.existsSync(path.join(gameDir, base + ".ascendara.png")) ||
      fs.existsSync(path.join(gameDir, base + ".ascendara.jpeg"))
    );
  });

  if (allExist) {
    return true;
  }

  // Check if game has legacy header.ascendara image
  const hasLegacyHeader =
    fs.existsSync(path.join(gameDir, "header.ascendara.jpg")) ||
    fs.existsSync(path.join(gameDir, "header.ascendara.png")) ||
    fs.existsSync(path.join(gameDir, "header.ascendara.jpeg"));

  if (hasLegacyHeader) {
    console.log(
      `[SteamGrid] Found legacy header for "${gameName}", downloading missing assets`
    );
  }
  const authHeaders = authHelper.generateAuthHeaders();
  let gameId = null;

  try {
    const cleanName = gameName
      .replace(/ v[\d\.]+.*$/i, "")
      .replace(/ premium edition/i, "")
      .trim();
    console.log(`[SteamGrid] Searching for: "${cleanName}"`);

    const searchRes = await axios.get(
      `${PROXY_BASE_URL}/search/autocomplete/${encodeURIComponent(cleanName)}`,
      { headers: authHeaders }
    );

    if (searchRes.data.success && searchRes.data.data.length > 0) {
      gameId = searchRes.data.data[0].id;
      console.log(`[SteamGrid] Found GameID ${gameId}`);
    }

    if (!gameId) return false;

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
      // 1. Check if the file already exists (with any extension)
      const extensions = [".jpg", ".jpeg", ".png"];
      let alreadyExists = false;
      for (const ext of extensions) {
        if (fs.existsSync(path.join(gameDir, item.baseName + ext))) {
          alreadyExists = true;
          break;
        }
      }
      if (alreadyExists) continue;

      // 2. Craft the request
      let url = `${PROXY_BASE_URL}/${item.type}/game/${gameId}?styles=${item.styles}&sort=score`;
      if (item.dimensions) url += `&dimensions=${item.dimensions.join(",")}`;
      if (item.type !== "logos") url += `&mimes=image/jpeg,image/png`;

      try {
        let res = await axios.get(url, { headers: authHeaders });

        // For logos, if white style returns no results, try official as fallback
        if (item.type === "logos" && (!res.data.success || res.data.data.length === 0)) {
          console.log(`[SteamGrid] No white logos found, trying official...`);
          url = `${PROXY_BASE_URL}/${item.type}/game/${gameId}?styles=official&sort=score`;
          res = await axios.get(url, { headers: authHeaders });
        }

        if (res.data.success && res.data.data.length > 0) {
          const imageUrl = res.data.data[0].url;

          // 3. Detect extension and craft final name
          let ext = path.extname(imageUrl).split("?")[0];
          if (!ext) ext = ".jpg"; // Fallback

          const finalFileName = item.baseName + ext;
          const finalFilePath = path.join(gameDir, finalFileName);

          // 4. Download
          const writer = fs.createWriteStream(finalFilePath);
          const response = await axios({
            url: imageUrl,
            method: "GET",
            responseType: "stream",
          });

          response.data.pipe(writer);

          await new Promise((resolve, reject) => {
            writer.on("finish", resolve);
            writer.on("error", reject);
          });
          console.log(`[SteamGrid] Downloaded ${finalFileName}`);
        }
      } catch (e) {
        console.warn(`[SteamGrid] Failed to get ${item.type}: ${e.message}`);
      }
    }
    return true;
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
    .replace(/ v[\d\.]+.*$/i, "")
    .replace(/ premium edition/i, "")
    .replace(/\(\s*\)/g, "") // strip empty parentheses from mangled Hydra titles
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function resolveGameId(gameName, authHeaders) {
  const cleanName = cleanGameName(gameName);
  if (!cleanName) return null;
  try {
    const searchRes = await throttledGet(
      `${PROXY_BASE_URL}/search/autocomplete/${encodeURIComponent(cleanName)}`,
      authHeaders
    );
    if (searchRes.data?.success && searchRes.data.data?.length > 0) {
      return searchRes.data.data[0].id;
    }
  } catch (e) {
    console.warn(`[SteamGrid] URL search failed for "${cleanName}":`, e.message);
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
  const gameId = await resolveGameId(gameName, authHeaders);
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
      // Stop early on rate-limit; caller will retry later via frontend cache expiry
      if (e.response?.status === 429) break;
    }
  }
  return { gameId, url: null };
}

/**
 * Full asset URL resolve (grid + hero + logo + header). Heavier - 1 search
 * + up to 4 asset queries. Only call this when you actually need all four
 * variants (e.g. populating an installed game directory).
 */
async function getImageUrls(gameName) {
  if (!gameName || typeof gameName !== "string") {
    return { gameId: null, grid: null, hero: null, logo: null, header: null };
  }
  const authHeaders = authHelper.generateAuthHeaders();
  const gameId = await resolveGameId(gameName, authHeaders);
  const result = { gameId, grid: null, hero: null, logo: null, header: null };
  if (!gameId) return result;

  const queries = [
    { key: "grid", url: `${PROXY_BASE_URL}/grids/game/${gameId}?styles=alternate&dimensions=600x900&mimes=image/jpeg,image/png&sort=score` },
    { key: "hero", url: `${PROXY_BASE_URL}/heroes/game/${gameId}?styles=alternate&dimensions=1920x620,3840x1240&mimes=image/jpeg,image/png&sort=score` },
    { key: "logo", url: `${PROXY_BASE_URL}/logos/game/${gameId}?styles=white&sort=score` },
    { key: "header", url: `${PROXY_BASE_URL}/grids/game/${gameId}?dimensions=460x215&mimes=image/jpeg,image/png&sort=score` },
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
      if (e.response?.status === 429) break; // stop early when rate-limited
    }
  }

  if (!result.header) result.header = result.grid;
  return result;
}

module.exports = { fetchGameAssets, getImageUrls, getHeaderUrl };
