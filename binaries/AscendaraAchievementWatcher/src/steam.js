"use strict";

const path = require("path");
const urlParser = require("url");
const fs = require("fs").promises;
const https = require("https");
const http = require("http");
const { join } = require("path");
const { createWriteStream } = require("fs");
const os = require("os");

const appData =
  process.env["APPDATA"] ||
  path.join(
    process.env.HOME || os.homedir(),
    process.platform === "darwin" ? "Library/Application Support" : ".config"
  );

const FETCH_TIMEOUT_MS = 15000;
const FETCH_ATTEMPTS = 3;

// 4xx means the request itself is bad (unknown appid, no achievements),
// so retrying or retrying later won't help.
class FetchError extends Error {
  constructor(message, permanent) {
    super(message);
    this.permanent = permanent;
  }
}

function fetchJsonOnce(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url, res => {
      let data = "";
      res.on("data", chunk => (data += chunk));
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(
            new FetchError(
              `HTTP ${res.statusCode} from ${url}`,
              res.statusCode >= 400 && res.statusCode < 500 && res.statusCode !== 429
            )
          );
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(new FetchError(`Invalid JSON from ${url}`, false));
        }
      });
      res.on("error", reject);
    });
    req.setTimeout(FETCH_TIMEOUT_MS, () =>
      req.destroy(new FetchError(`Timed out fetching ${url}`, false))
    );
    req.on("error", reject);
  });
}

// The schema proxy times out when Steam is slow, so retry transient failures
async function fetchJson(url) {
  let lastErr;
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
    try {
      return await fetchJsonOnce(url);
    } catch (err) {
      lastErr = err;
      if (err.permanent) break;
      if (attempt < FETCH_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
      }
    }
  }
  throw lastErr;
}

const steamLang = require("./steam.json");

async function downloadFile(url, destFolder) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const filename = url.split("/").pop();
    const dest = join(destFolder, filename);
    const file = createWriteStream(dest);
    lib
      .get(url, res => {
        if (res.statusCode !== 200) {
          reject(new Error("Failed to get file: " + res.statusCode));
          return;
        }
        res.pipe(file);
        file.on("finish", () => {
          file.close(() => resolve(dest));
        });
      })
      .on("error", err => {
        file.close();
        reject(err);
      });
  });
}

async function existsAndIsYoungerThan(filePath, { timeUnit = "M", time = 6 }) {
  // timeUnit: 'M' = months, 'd' = days, 'h' = hours, 'm' = minutes, 's' = seconds
  const now = Date.now();
  let msAgo;
  switch (timeUnit) {
    case "M":
      msAgo = time * 30 * 24 * 60 * 60 * 1000;
      break;
    case "d":
      msAgo = time * 24 * 60 * 60 * 1000;
      break;
    case "h":
      msAgo = time * 60 * 60 * 1000;
      break;
    case "m":
      msAgo = time * 60 * 1000;
      break;
    case "s":
      msAgo = time * 1000;
      break;
    default:
      msAgo = time * 1000;
      break;
  }
  try {
    const stats = await fs.stat(filePath);
    return now - stats.mtimeMs < msAgo;
  } catch (err) {
    if (err.code === "ENOENT") return false;
    throw err;
  }
}

// Steam schemas may return icons as bare hash filenames or legacy
// /steamcommunity/public/images/apps/ URLs, which 404 for newer apps.
// Point both at community_assets, which serves every app.
const STEAM_ICON_BASE =
  "https://shared.akamai.steamstatic.com/community_assets/images/apps";
const LEGACY_STEAM_ICON =
  /^https?:\/\/[^/]*(?:steamstatic\.com|akamaihd\.net)\/steamcommunity\/public\/images\/apps\/(\d+)\/([^/?#]+)/i;
function resolveIconUrl(icon, appID) {
  if (!icon || typeof icon !== "string") return icon;
  const legacy = icon.match(LEGACY_STEAM_ICON);
  if (legacy) return `${STEAM_ICON_BASE}/${legacy[1]}/${legacy[2]}`;
  if (/^(https?|file|data):/i.test(icon) || path.isAbsolute(icon)) return icon;
  const file = /\.\w+$/.test(icon) ? icon : `${icon}.jpg`;
  return `${STEAM_ICON_BASE}/${appID}/${file}`;
}
module.exports.resolveIconUrl = resolveIconUrl;

// Bumped when cached schemas need refreshing (v1: names come from the store)
const SCHEMA_CACHE_VERSION = 1;

module.exports.loadSteamData = async (appID, lang) => {
  if (!steamLang.some(language => language.api === lang)) {
    throw new FetchError("Unsupported API language code", true);
  }

  const cache = path.join(appData, "Achievement Watcher/steam_cache/schema", lang);
  const filePath = path.join(cache, `${appID}.db`);
  let result;

  try {
    if (await existsAndIsYoungerThan(filePath, { timeUnit: "M", time: 6 })) {
      result = JSON.parse(await fs.readFile(filePath));
    }
  } catch (err) {
    result = null;
  }

  if (!result || result.cacheVersion !== SCHEMA_CACHE_VERSION) {
    try {
      if (result) {
        // Older cache: the schema is fine, only the name needs fixing
        const storeName = await getStoreName(appID);
        if (!storeName) return withIcons(result, appID);
        result.name = storeName;
        result.cacheVersion = SCHEMA_CACHE_VERSION;
      } else {
        result = await getSteamData(appID, lang);
      }
      await fs.mkdir(cache, { recursive: true });
      fs.writeFile(filePath, JSON.stringify(result, null, 2)).catch(err => {
        console.log(err);
      });
    } catch (err) {
      if (!result) {
        const wrapped = new FetchError(
          `Could not load Steam data for ${appID} - ${lang}: ${err.message || err}`,
          !!err.permanent
        );
        throw wrapped;
      }
    }
  }

  return withIcons(result, appID);
};

function withIcons(result, appID) {
  if (Array.isArray(result?.achievement?.list)) {
    for (const ach of result.achievement.list) {
      ach.icon = resolveIconUrl(ach.icon, appID);
      ach.icongray = resolveIconUrl(ach.icongray, appID);
    }
  }
  return result;
}

module.exports.fetchIcon = async (url, appID) => {
  try {
    const cache = path.join(appData, `Achievement Watcher/steam_cache/icon/${appID}`);

    const filename = path.parse(urlParser.parse(url).pathname).base;

    let filePath = path.join(cache, filename);

    if (await fs.exists(filePath)) {
      return filePath;
    } else {
      return await downloadFile(url, cache);
    }
  } catch (err) {
    return url;
  }
};

async function getSteamData(appID, lang) {
  // Use backend API proxy instead of direct Steam API call
  const url = `https://api.ascendara.app/api/proxy/steam/achievements?appid=${appID}&lang=${lang}`;

  const data = await fetchJson(url);

  const schema = data?.game?.availableGameStats;
  if (!(schema && schema.achievements && schema.achievements.length > 0))
    throw new FetchError("Schema doesn't have any achievement", true);

  // Browse achievements to manage hidden achievements without descriptions
  schema.achievements.forEach(ach => {
    if (ach.hidden === 1 && !ach.description) {
      ach.description = "[Hidden achievement]";
    }
  });

  const storeName = await getStoreName(appID);
  return {
    name: storeName || data.game.gameName || `AppID ${appID}`,
    appid: appID,
    // Without a store name, leave the cache outdated so the name is retried
    cacheVersion: storeName ? SCHEMA_CACHE_VERSION : 0,
    binary: null,
    img: {
      header: `https://cdn.akamai.steamstatic.com/steam/apps/${appID}/header.jpg`,
      background: `https://cdn.akamai.steamstatic.com/steam/apps/${appID}/page_bg_generated_v6b.jpg`,
      portrait: `https://cdn.akamai.steamstatic.com/steam/apps/${appID}/library_600x900.jpg`,
      icon: null,
    },
    achievement: {
      total: schema.achievements.length,
      list: schema.achievements,
    },
  };
}

// The schema's gameName is the developer's internal name, which is often a
// codename (Salt and Sacrifice is "Project Mage (DEPRECATED ASK FOR NEW KEY)").
// Games are matched to library folders by name, so use the store name.
async function getStoreName(appID) {
  try {
    const url = `https://api.ascendara.app/api/proxy/steam/appdetails?appids=${appID}`;
    const data = await fetchJson(url);
    const name = data?.[appID]?.data?.name;
    if (name) return name;
  } catch (err) {
    console.warn(`Store name lookup failed for ${appID}:`, err.message || err);
  }
  return null;
}
