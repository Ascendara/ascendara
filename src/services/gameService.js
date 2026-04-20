import { sanitizeText } from "@/lib/utils";

const API_URL = "https://api.ascendara.app";
const CACHE_KEY = "ascendara_games_cache";
const CACHE_TIMESTAMP_KEY = "local_ascendara_games_timestamp";
const METADATA_CACHE_KEY = "local_ascendara_metadata_cache";
const LAST_UPDATED_KEY = "local_ascendara_last_updated";
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

// Custom (Hydra Library) source cache keys - scoped per source URL
const CUSTOM_SOURCE_CACHE_PREFIX = "ascendara_custom_source_cache::";
const CUSTOM_SOURCE_CACHE_DURATION = 12 * 60 * 60 * 1000; // 12 hours
const CUSTOM_SOURCE_REQUEST_TIMEOUT = 30000;

// Memory cache to avoid localStorage reads
let memoryCache = {
  games: null,
  metadata: null,
  timestamp: null,
  lastUpdated: null,
  imageIdMap: null, // Cache for image ID lookups
  gameIdMap: null, // Cache for game ID lookups
  isLocalIndex: false, // Track if using local index
  localIndexPath: null, // Path to local index
  customSourceUrl: null, // Active custom source URL (Hydra Library)
};

// ---------------------------------------------------------------------------
// Hydra Library helpers
// ---------------------------------------------------------------------------

const HYDRA_VERSION_RE = /\(v[^)]+\)|\[v[^\]]+\]|\sv\d[\w.\-]*/i;
const HYDRA_BUILD_RE = /Build\s*\d+/i;
const HYDRA_NOISE_RE =
  /\s*(free\s+download|full\s+version|repack|pc\s+game|\+\s*all\s+dlcs?|\+\s*\d+\s+dlcs?)\s*/gi;
const HYDRA_BRACKET_RE = /\[[^\]]*\]|\{[^}]*\}/g;

function extractHydraVersion(title) {
  if (!title) return null;
  const m = title.match(HYDRA_VERSION_RE);
  if (m) {
    let raw = m[0].trim().replace(/^[(\[]|[)\]]$/g, "").trim();
    if (raw.toLowerCase().startsWith("v")) raw = raw.slice(1);
    return raw.trim() || null;
  }
  const b = title.match(HYDRA_BUILD_RE);
  return b ? b[0].trim() : null;
}

function cleanHydraTitle(title) {
  if (!title) return "";
  return title
    .replace(HYDRA_VERSION_RE, "")
    .replace(HYDRA_BUILD_RE, "")
    .replace(HYDRA_BRACKET_RE, "")
    .replace(HYDRA_NOISE_RE, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s\-–—:|]+|[\s\-–—:|]+$/g, "")
    .trim();
}

function hydraHostKey(uri) {
  if (!uri) return null;
  const low = uri.trim().toLowerCase();
  if (low.startsWith("magnet:")) return "torrent";
  try {
    let host = new URL(uri).hostname.toLowerCase();
    if (host.startsWith("www.")) host = host.slice(4);
    if (!host) return null;
    const parts = host.split(".");
    if (parts.length >= 2) return parts[parts.length - 2];
    return host;
  } catch {
    return null;
  }
}

function parseHydraDate(value) {
  if (!value) return null;
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

// Deterministic 6-char id derived from an arbitrary stable string.
function deriveStableGameId(seed) {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz"; // matches Python encode_game_id charset
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  // Mix for better distribution
  let n = Math.abs(hash);
  let out = "";
  for (let i = 0; i < 6; i++) {
    out = chars[n % chars.length] + out;
    n = Math.floor(n / chars.length) + (i + 1) * 2971;
  }
  return out;
}

/**
 * Map a single Hydra download entry to the Ascendara game schema.
 * Fields not supplied by Hydra (imgID, category, weight, minReqs) are left null/empty
 * so GameCard/Search render placeholder states gracefully.
 */
function mapHydraDownload(download, sourceLabel) {
  if (!download || !download.title) return null;
  const rawTitle = String(download.title);
  const cleanName = cleanHydraTitle(rawTitle) || rawTitle;
  const version = extractHydraVersion(rawTitle);

  const uris = Array.isArray(download.uris) ? download.uris.filter(Boolean) : [];
  const downloadLinks = {};
  for (const uri of uris) {
    const key = hydraHostKey(uri);
    if (!key) continue;
    if (!downloadLinks[key]) downloadLinks[key] = [];
    downloadLinks[key].push(uri);
  }

  const seed = `${sourceLabel}::${rawTitle}::${uris.join("|")}`;
  const gameID = deriveStableGameId(seed);

  return {
    game: sanitizeText(cleanName),
    name: sanitizeText(cleanName),
    gameID,
    imgID: null,
    category: [],
    version: version || null,
    size: download.fileSize || null,
    online: false,
    dlc: false,
    dirlink: null,
    minReqs: null,
    releasedBy: sourceLabel || null,
    latest_update: parseHydraDate(download.uploadDate),
    download_links: downloadLinks,
    weight: null,
    customSource: sourceLabel || true,
  };
}

async function fetchCustomSourceJson(url) {
  if (!url) throw new Error("Missing custom source URL");
  // Use the electron-bridged https helper to bypass CORS restrictions.
  if (window.electron?.request) {
    const res = await window.electron.request(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://ascendara.app/",
      },
      timeout: CUSTOM_SOURCE_REQUEST_TIMEOUT,
    });
    if (!res.ok) {
      let errorMsg = `Custom source HTTP ${res.status}`;
      if (res.status === 403) {
        errorMsg += " - Access forbidden. This source may require authentication or have geographic restrictions.";
      } else if (res.status === 404) {
        errorMsg += " - Source not found. The URL may be incorrect or the source may have been removed.";
      } else if (res.status === 429) {
        errorMsg += " - Too many requests. Please wait before trying again.";
      }
      throw new Error(errorMsg);
    }
    return JSON.parse(res.data);
  }
  // Browser fallback (dev)
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });
  if (!res.ok) {
    let errorMsg = `Custom source HTTP ${res.status}`;
    if (res.status === 403) {
      errorMsg += " - Access forbidden. This source may require authentication or have geographic restrictions.";
    } else if (res.status === 404) {
      errorMsg += " - Source not found. The URL may be incorrect or the source may have been removed.";
    } else if (res.status === 429) {
      errorMsg += " - Too many requests. Please wait before trying again.";
    } else {
      errorMsg += ` - An error occurred while fetching the custom source. Status code: ${res.status}`;
    }
    throw new Error(errorMsg);
  }
  return res.json();
}

function readCustomSourceCache(url) {
  try {
    const raw = localStorage.getItem(CUSTOM_SOURCE_CACHE_PREFIX + url);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.timestamp || !parsed?.games) return null;
    if (Date.now() - parsed.timestamp > CUSTOM_SOURCE_CACHE_DURATION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCustomSourceCache(url, payload) {
  try {
    localStorage.setItem(
      CUSTOM_SOURCE_CACHE_PREFIX + url,
      JSON.stringify({ ...payload, timestamp: Date.now() })
    );
  } catch (e) {
    console.warn("[GameService] Failed to persist custom source cache:", e);
  }
}

const gameService = {
  parseDateString(dateStr) {
    if (!dateStr) return null;
    return new Date(dateStr).getTime();
  },

  async getCachedData() {
    console.log("[GameService] getCachedData called");

    // Get settings first so we can branch on Custom Sources Mode before touching cache
    const settings = await window.electron.getSettings();
    const customMode = !!settings?.customSourcesMode;
    const customSource = settings?.customSource;
    const activeCustomUrl = customMode && customSource?.url ? customSource.url : null;

    // Check memory cache FIRST - no async, instant return
    const now = Date.now();
    if (
      memoryCache.games &&
      memoryCache.metadata &&
      memoryCache.timestamp &&
      memoryCache.customSourceUrl === activeCustomUrl
    ) {
      const age = now - memoryCache.timestamp;
      if (age < CACHE_DURATION) {
        console.log(
          "[GameService] Returning from memory cache:",
          memoryCache.games.length,
          "games"
        );
        return {
          games: memoryCache.games,
          metadata: memoryCache.metadata,
        };
      }
    }

    // Custom Sources Mode: fetch directly from a Hydra-compatible JSON source.
    // No local index, no images, no Python scraper - just fetch + map + cache.
    if (activeCustomUrl) {
      try {
        const data = await this._loadCustomSourceData(customSource);
        await this.updateCache(data, false, null, activeCustomUrl);
        return data;
      } catch (error) {
        console.error("[GameService] Failed to load custom source:", error);
        return {
          games: [],
          metadata: {
            local: false,
            games: 0,
            source: customSource?.name || "CUSTOM",
            getDate: "Not available",
            customSource: true,
            error: error.message || String(error),
          },
        };
      }
    }

    // Local index path (default, official index mode)
    const localIndexPath = settings?.localIndex;

    console.log("[GameService] Settings loaded:", {
      localIndex: localIndexPath,
    });

    // If local index path changed, invalidate cache
    if (memoryCache.localIndexPath !== localIndexPath) {
      console.log("[GameService] Local index path changed, invalidating cache");
      memoryCache = {
        games: null,
        metadata: null,
        timestamp: null,
        lastUpdated: null,
        imageIdMap: null,
        gameIdMap: null,
        isLocalIndex: true,
        localIndexPath: localIndexPath,
        customSourceUrl: null,
      };
    }

    // Always load from local index
    if (localIndexPath) {
      console.log(
        "[GameService] Attempting to load local index from:",
        localIndexPath
      );
      try {
        const data = await this.fetchDataFromLocalIndex(localIndexPath);
        console.log("[GameService] Local index loaded:", {
          hasData: !!data,
          hasGames: !!data?.games,
          gamesCount: data?.games?.length || 0,
          metadata: data?.metadata,
        });

        if (data && data.games && data.games.length > 0) {
          console.log(
            "[GameService] Successfully loaded",
            data.games.length,
            "games from local index"
          );
          await this.updateCache(data, true, localIndexPath);
          return data;
        }
        console.warn("[GameService] Local index file empty or not found");
        return {
          games: [],
          metadata: {
            local: true,
            games: 0,
            source: "LOCAL",
            getDate: "Not available",
          },
        };
      } catch (error) {
        console.error("[GameService] Error loading local index:", error);
        return {
          games: [],
          metadata: {
            local: true,
            games: 0,
            source: "LOCAL",
            getDate: "Not available",
          },
        };
      }
    }

    // No local index path configured
    console.warn("[GameService] No local index path configured");
    return {
      games: [],
      metadata: {
        local: true,
        games: 0,
        source: "LOCAL",
        getDate: "Not available",
      },
    };
  },

  async fetchDataFromLocalIndex(localIndexPath) {
    try {
      console.log("[GameService] Loading local index from:", localIndexPath);
      const filePath = `${localIndexPath}/ascendara_games.json`;
      const fileContent = await window.electron.ipcRenderer.readFile(filePath);
      const data = JSON.parse(fileContent);

      // Sanitize game titles
      if (data.games) {
        data.games = data.games.map(game => ({
          ...game,
          name: sanitizeText(game.name || game.game),
          game: sanitizeText(game.game),
        }));
      }

      return {
        games: data.games,
        metadata: {
          ...data.metadata,
          games: data.games?.length,
          local: true,
          localIndexPath: localIndexPath,
        },
      };
    } catch (error) {
      console.error("[GameService] Error reading local index file:", error);
      throw error;
    }
  },

  /**
   * Load & map a Hydra-compatible custom source.
   * Uses a 12h localStorage cache keyed by source URL; force=true bypasses the cache.
   */
  async _loadCustomSourceData(customSource, { force = false } = {}) {
    const url = customSource?.url;
    if (!url) throw new Error("Missing custom source URL");
    const label =
      customSource?.name || customSource?.title || customSource?.label || "Custom";

    if (!force) {
      const cached = readCustomSourceCache(url);
      if (cached) {
        console.log(
          "[GameService] Using cached custom source:",
          label,
          cached.games.length,
          "games"
        );
        return { games: cached.games, metadata: cached.metadata };
      }
    }

    console.log("[GameService] Fetching custom source JSON:", url);
    const raw = await fetchCustomSourceJson(url);
    return this._mapAndCacheHydraJson(raw, { url, label });
  },

  /**
   * Shared mapping + caching step for Hydra JSON payloads. Used by both the
   * automatic fetch path and the manual-paste fallback (when the upstream host
   * returns 403/Cloudflare-challenged HTML).
   */
  _mapAndCacheHydraJson(raw, { url, label }) {
    const downloads = Array.isArray(raw?.downloads) ? raw.downloads : [];
    const sourceLabel = raw?.name || label;
    const games = [];
    const seenIds = new Set();
    for (const entry of downloads) {
      const mapped = mapHydraDownload(entry, sourceLabel);
      if (!mapped) continue;
      // Ensure gameID uniqueness within the source
      if (seenIds.has(mapped.gameID)) {
        mapped.gameID = deriveStableGameId(
          `${mapped.gameID}-${seenIds.size}-${mapped.game}`
        );
      }
      seenIds.add(mapped.gameID);
      games.push(mapped);
    }

    const metadata = {
      local: false,
      customSource: true,
      source: String(sourceLabel).toUpperCase(),
      sourceName: sourceLabel,
      sourceUrl: url,
      games: games.length,
      getDate: new Date().toLocaleString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }),
      listVersion: "hydra-1.0",
    };

    if (url) writeCustomSourceCache(url, { games, metadata });
    console.log(
      "[GameService] Custom source loaded:",
      label,
      games.length,
      "games"
    );
    return { games, metadata };
  },

  /**
   * Ingest a manually-pasted Hydra JSON blob (string or object) for the active
   * custom source. Used as a fallback when upstream returns 403/Cloudflare.
   */
  async ingestCustomSourceJson(rawInput) {
    const settings = await window.electron.getSettings();
    if (!settings?.customSourcesMode) {
      throw new Error("Custom Sources Mode is not enabled");
    }
    const customSource = settings?.customSource;
    if (!customSource?.url) {
      throw new Error("No custom source is selected");
    }
    let parsed;
    if (typeof rawInput === "string") {
      const trimmed = rawInput.trim();
      if (!trimmed) throw new Error("Pasted JSON is empty");
      try {
        parsed = JSON.parse(trimmed);
      } catch (e) {
        throw new Error("Invalid JSON: " + (e?.message || String(e)));
      }
    } else if (rawInput && typeof rawInput === "object") {
      parsed = rawInput;
    } else {
      throw new Error("Pasted JSON is empty");
    }
    if (!Array.isArray(parsed?.downloads)) {
      throw new Error(
        "JSON is missing a 'downloads' array - is this a Hydra source?"
      );
    }
    const label =
      customSource?.name ||
      customSource?.title ||
      customSource?.label ||
      "Custom";
    const data = this._mapAndCacheHydraJson(parsed, {
      url: customSource.url,
      label,
    });
    await this.updateCache(data, false, null, customSource.url);
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(CACHE_TIMESTAMP_KEY);
    localStorage.removeItem(METADATA_CACHE_KEY);
    return data;
  },

  /**
   * Force a re-fetch of the active custom source, bypassing cache.
   * Returns the fresh { games, metadata } payload.
   */
  async refreshCustomSource() {
    const settings = await window.electron.getSettings();
    if (!settings?.customSourcesMode) {
      throw new Error("Custom Sources Mode is not enabled");
    }
    const customSource = settings?.customSource;
    if (!customSource?.url) {
      throw new Error("No custom source is selected");
    }
    const data = await this._loadCustomSourceData(customSource, { force: true });
    await this.updateCache(data, false, null, customSource.url);
    // Clear legacy caches so Search.jsx reloads fresh data
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(CACHE_TIMESTAMP_KEY);
    localStorage.removeItem(METADATA_CACHE_KEY);
    return data;
  },

  /**
   * Drop the cached entry for a specific custom source URL (or all of them).
   */
  clearCustomSourceCache(url) {
    try {
      if (url) {
        localStorage.removeItem(CUSTOM_SOURCE_CACHE_PREFIX + url);
        return;
      }
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(CUSTOM_SOURCE_CACHE_PREFIX)) toRemove.push(key);
      }
      toRemove.forEach(k => localStorage.removeItem(k));
    } catch (e) {
      console.warn("[GameService] Failed to clear custom source cache:", e);
    }
  },


  async updateCache(data, isLocalIndex = false, localIndexPath = null, customSourceUrl = null) {
    try {
      const now = Date.now();

      // Create image ID map for efficient lookups
      const imageIdMap = new Map();
      data.games.forEach(game => {
        if (game.imgID) {
          imageIdMap.set(game.imgID, game);
        }
      });

      // Update memory cache
      memoryCache = {
        games: data.games,
        metadata: data.metadata,
        timestamp: now,
        lastUpdated: data.metadata?.getDate,
        imageIdMap, // Store the map in memory cache
        gameIdMap: null,
        isLocalIndex,
        localIndexPath,
        customSourceUrl,
      };

      // Update localStorage cache
      localStorage.setItem(CACHE_KEY, JSON.stringify(data.games));
      localStorage.setItem(METADATA_CACHE_KEY, JSON.stringify(data.metadata));
      localStorage.setItem(CACHE_TIMESTAMP_KEY, now.toString());
      if (data.metadata?.getDate) {
        localStorage.setItem(LAST_UPDATED_KEY, data.metadata.getDate);
      }
    } catch (error) {
      console.error("Error updating cache:", error);
    }
  },

  async getAllGames() {
    const data = await this.getCachedData();
    return data;
  },

  async getRandomTopGames(count = 8) {
    const { games, metadata } = await this.getCachedData();
    if (!games || !games.length) return [];

    // Check if using local index
    const isLocalIndex = metadata?.local === true;

    const validGames = games
      .filter(game => {
        if (!game.imgID) return false;
        if (isLocalIndex) return true;
        return (game.weight || 0) >= 7;
      })
      .map(game => ({
        ...game,
        name: sanitizeText(game.name || game.game),
        game: sanitizeText(game.game),
      }));

    // If no valid games found, return any games with imgID
    if (validGames.length === 0) {
      const fallbackGames = games
        .filter(game => game.imgID)
        .map(game => ({
          ...game,
          name: sanitizeText(game.name || game.game),
          game: sanitizeText(game.game),
        }));
      const shuffled = fallbackGames.sort(() => 0.5 - Math.random());
      return shuffled.slice(0, count);
    }

    // Shuffle and return requested number of games
    const shuffled = validGames.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  },

  async searchGames(query) {
    const { games } = await this.getCachedData();
    const searchTerm = query.toLowerCase();
    return games.filter(
      game =>
        game.title?.toLowerCase().includes(searchTerm) ||
        game.game?.toLowerCase().includes(searchTerm) ||
        game.description?.toLowerCase().includes(searchTerm)
    );
  },

  async getGamesByCategory(category) {
    const { games } = await this.getCachedData();
    return games.filter(
      game =>
        game.category && Array.isArray(game.category) && game.category.includes(category)
    );
  },

  getImageUrl(imgID) {
    return `${API_URL}/v2/image/${imgID}`;
  },

  getImageUrlByGameId(gameID) {
    return `${API_URL}/v3/image/${gameID}`;
  },

  async getLocalImagePath(imgID) {
    if (!memoryCache.isLocalIndex || !memoryCache.localIndexPath) {
      return null;
    }
    return `${memoryCache.localIndexPath}/imgs/${imgID}.jpg`;
  },

  isUsingLocalIndex() {
    return memoryCache.isLocalIndex === true;
  },

  getLocalIndexPath() {
    return memoryCache.localIndexPath;
  },

  clearMemoryCache() {
    console.log("[GameService] Clearing memory cache");
    memoryCache = {
      games: null,
      metadata: null,
      timestamp: null,
      lastUpdated: null,
      imageIdMap: null,
      gameIdMap: null,
      isLocalIndex: false,
      localIndexPath: null,
      customSourceUrl: null,
    };
  },

  async searchGameCovers(query) {
    if (!query.trim()) {
      return [];
    }

    const searchTerm = query.toLowerCase();

    // First try memory cache (this includes local index data if loaded)
    if (memoryCache.games) {
      return memoryCache.games
        .filter(game => game.game?.toLowerCase().includes(searchTerm))
        .slice(0, 20)
        .map(game => ({
          id: game.game,
          title: game.game,
          imgID: game.imgID,
          gameID: game.gameID,
        }));
    }

    // Ensure we have the latest data by calling getCachedData
    // This will load from local index or API as appropriate
    const { games } = await this.getCachedData();
    if (games?.length) {
      return games
        .filter(game => game.game?.toLowerCase().includes(searchTerm))
        .slice(0, 20)
        .map(game => ({
          id: game.game,
          title: game.game,
          imgID: game.imgID,
          gameID: game.gameID,
        }));
    }

    return [];
  },

  async checkMetadataUpdate() {
    // Metadata updates are no longer relevant since we only use local index
    return null;
  },

  async findGameByImageId(imageId) {
    try {
      // Ensure we have the latest data
      if (!memoryCache.imageIdMap) {
        const data = await this.getCachedData();
        if (!memoryCache.imageIdMap) {
          // Create image ID map if it doesn't exist
          const imageIdMap = new Map();
          data.games.forEach(game => {
            if (game.imgID) {
              // Store the game with its download links directly from the API
              imageIdMap.set(game.imgID, {
                ...game,
                // Ensure download_links exists, even if empty
                download_links: game.download_links || {},
              });
            }
          });
          memoryCache.imageIdMap = imageIdMap;
        }
      }

      // O(1) lookup from the map
      const game = memoryCache.imageIdMap.get(imageId);
      if (!game) {
        console.warn(`No game found with image ID: ${imageId}`);
        return null;
      }

      console.log("Found game with download links:", game.download_links);
      return game;
    } catch (error) {
      console.error("Error finding game by image ID:", error);
      return null;
    }
  },

  async findGameByGameID(gameID) {
    try {
      // Ensure we have the latest data
      if (!memoryCache.gameIdMap) {
        const data = await this.getCachedData();
        if (!memoryCache.gameIdMap) {
          // Create game ID map if it doesn't exist
          const gameIdMap = new Map();
          data.games.forEach(game => {
            if (game.gameID) {
              // Store the game with its download links directly from the API
              gameIdMap.set(game.gameID, {
                ...game,
                // Ensure download_links exists, even if empty
                download_links: game.download_links || {},
              });
            }
          });
          memoryCache.gameIdMap = gameIdMap;
        }
      }

      // O(1) lookup from the map
      const game = memoryCache.gameIdMap.get(gameID);
      if (!game) {
        console.warn(`No game found with game ID: ${gameID}`);
        return null;
      }

      console.log("Found game with download links:", game.download_links);
      return game;
    } catch (error) {
      console.error("Error finding game by game ID:", error);
      return null;
    }
  },

  async checkGameUpdate(gameID, localVersion) {
    console.log("[GameService] checkGameUpdate called with:", { gameID, localVersion });
    try {
      if (!gameID) {
        console.warn("[GameService] No gameID provided for update check");
        return null;
      }

      const encodedVersion = encodeURIComponent(localVersion || "");
      const url = `${API_URL}/v3/game/checkupdate/${gameID}?local_version=${encodedVersion}`;
      console.log("[GameService] Fetching update from:", url);

      const response = await fetch(url);
      console.log("[GameService] Response status:", response.status);

      if (!response.ok) {
        if (response.status === 404) {
          console.warn(`[GameService] Game not found in index: ${gameID}`);
          return null;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log("[GameService] Update check response:", data);

      const result = {
        gameID: data.gameID,
        gameName: data.gameName,
        latestVersion: data.latestVersion,
        localVersion: data.localVersion,
        updateAvailable: data.updateAvailable,
        autoUpdateSupported: data.autoUpdateSupported,
        downloadLinks: data.downloadLinks || {},
      };
      console.log("[GameService] Returning result:", result);
      return result;
    } catch (error) {
      console.error("[GameService] Error checking game update:", error);
      return null;
    }
  },
};

export default gameService;
