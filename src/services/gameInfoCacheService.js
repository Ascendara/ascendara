/**
 * Game APIs Cache Service
 * Handles caching of game data from multiple APIs to reduce API calls
 */

// Constants
const CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

// Cache prefixes for different APIs
const CACHE_PREFIXES = {
  STEAM: "steam_cache_",
  DEFAULT: "game_cache_",
};

/**
 * Get cached game data from a specific API
 * @param {string} gameName - Name of the game
 * @param {string} apiType - API type ("steam")
 * @returns {Object|null} Cached game data or null if not found/expired
 */
const getCachedGame = (gameName, apiType = "steam") => {
  try {
    // Get the appropriate cache prefix
    const prefix = getCachePrefix(apiType);

    // Normalize game name for consistent cache keys
    const cacheKey = `${prefix}${normalizeGameName(gameName)}`;

    // Get from localStorage
    const cachedData = localStorage.getItem(cacheKey);

    if (!cachedData) {
      return null;
    }

    const { data, timestamp } = JSON.parse(cachedData);

    // Check if cache is expired
    if (Date.now() - timestamp > CACHE_EXPIRY) {
      // Remove expired cache
      localStorage.removeItem(cacheKey);
      return null;
    }

    return data;
  } catch (error) {
    console.error(`Error retrieving cached ${apiType} game data:`, error);
    return null;
  }
};

/**
 * Detect a localStorage quota-exceeded error across browsers.
 */
const isQuotaExceededError = error => {
  if (!error) return false;
  return (
    error.name === "QuotaExceededError" ||
    error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    error.code === 22 ||
    error.code === 1014
  );
};

/**
 * Free up localStorage space by evicting cache entries.
 * @param {number} targetBytes - Approximate amount of space we want to free.
 * @returns {number} Number of entries removed.
 */
const evictForSpace = (targetBytes = 512 * 1024) => {
  let removed = 0;
  let freed = 0;

  // Pass 1: drop expired API caches
  try {
    const expiredKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!isGameApiCacheKey(key)) continue;
      try {
        const raw = localStorage.getItem(key);
        const { timestamp } = JSON.parse(raw);
        if (!timestamp || Date.now() - timestamp > CACHE_EXPIRY) {
          expiredKeys.push({ key, size: raw ? raw.length : 0 });
        }
      } catch (e) {
        // Corrupted entry – evict
        expiredKeys.push({ key, size: 0 });
      }
    }
    expiredKeys.forEach(({ key, size }) => {
      localStorage.removeItem(key);
      removed++;
      freed += size;
    });
  } catch (e) {
    console.warn("evictForSpace: error scanning expired entries", e);
  }

  if (freed >= targetBytes) return removed;

  // Pass 2: evict oldest API cache entries
  try {
    const entries = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!isGameApiCacheKey(key)) continue;
      try {
        const raw = localStorage.getItem(key);
        const { timestamp } = JSON.parse(raw);
        entries.push({ key, timestamp: timestamp || 0, size: raw ? raw.length : 0 });
      } catch {
        entries.push({ key, timestamp: 0, size: 0 });
      }
    }
    entries.sort((a, b) => a.timestamp - b.timestamp);
    for (const { key, size } of entries) {
      if (freed >= targetBytes) break;
      localStorage.removeItem(key);
      removed++;
      freed += size;
    }
  } catch (e) {
    console.warn("evictForSpace: error evicting oldest API entries", e);
  }

  if (freed >= targetBytes) return removed;

  // Pass 3: drop cached cover images (re-fetchable, often the biggest offenders)
  try {
    const imagePrefixes = ["game-cover-", "play-later-image-", "cloud-game-image-"];
    const imageKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (imagePrefixes.some(p => key.startsWith(p))) {
        const raw = localStorage.getItem(key);
        imageKeys.push({ key, size: raw ? raw.length : 0 });
      }
    }
    // Largest first – frees space fastest
    imageKeys.sort((a, b) => b.size - a.size);
    for (const { key, size } of imageKeys) {
      if (freed >= targetBytes) break;
      localStorage.removeItem(key);
      removed++;
      freed += size;
    }
  } catch (e) {
    console.warn("evictForSpace: error evicting cover images", e);
  }

  return removed;
};

/**
 * Cache game data from a specific API
 * @param {string} gameName - Name of the game
 * @param {Object} gameData - Game data to cache
 * @param {string} apiType - API type ("steam")
 */
const cacheGame = (gameName, gameData, apiType = "steam") => {
  try {
    if (!gameData) return;

    // Get the appropriate cache prefix
    const prefix = getCachePrefix(apiType);

    // Normalize game name for consistent cache keys
    const cacheKey = `${prefix}${normalizeGameName(gameName)}`;

    // Create cache object with timestamp
    const cacheObject = {
      data: gameData,
      timestamp: Date.now(),
    };

    const serialized = JSON.stringify(cacheObject);

    try {
      localStorage.setItem(cacheKey, serialized);
    } catch (error) {
      if (isQuotaExceededError(error)) {
        // Free space and retry once
        const evicted = evictForSpace(Math.max(serialized.length * 2, 512 * 1024));
        console.warn(
          `[gameInfoCache] Quota exceeded; evicted ${evicted} entries and retrying`
        );
        try {
          localStorage.setItem(cacheKey, serialized);
        } catch (retryError) {
          // Give up silently – caching is best-effort
          console.warn(
            `[gameInfoCache] Still over quota after eviction; skipping cache for ${gameName}`
          );
        }
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error(`Error caching ${apiType} game data:`, error);
  }
};

/**
 * Get the appropriate cache prefix for the API type
 * @param {string} apiType - API type ("steam")
 * @returns {string} Cache prefix
 */
const getCachePrefix = apiType => {
  switch (apiType.toLowerCase()) {
    case "steam":
      return CACHE_PREFIXES.STEAM;
    default:
      return CACHE_PREFIXES.DEFAULT;
  }
};

/**
 * Clear expired cache entries for all APIs
 */
const clearExpiredCache = () => {
  try {
    // Get all localStorage keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);

      // Check if it's one of our cache keys
      if (isGameApiCacheKey(key)) {
        try {
          const cachedData = localStorage.getItem(key);
          const { timestamp } = JSON.parse(cachedData);

          // Remove if expired
          if (Date.now() - timestamp > CACHE_EXPIRY) {
            localStorage.removeItem(key);
          }
        } catch (e) {
          // If entry is corrupted, remove it
          localStorage.removeItem(key);
        }
      }
    }
  } catch (error) {
    console.error("Error clearing expired cache:", error);
  }
};

/**
 * Check if a key is a game API cache key
 * @param {string} key - localStorage key
 * @returns {boolean} True if it's a game API cache key
 */
const isGameApiCacheKey = key => {
  return Object.values(CACHE_PREFIXES).some(prefix => key.startsWith(prefix));
};

/**
 * Clear all game API cache entries
 * @param {string} apiType - Optional API type to clear only that API's cache
 * @returns {number} Number of cache entries removed
 */
const clearAllCache = (apiType = null) => {
  try {
    // Get all localStorage keys
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);

      if (apiType) {
        // Clear only specific API cache
        const prefix = getCachePrefix(apiType);
        if (key.startsWith(prefix)) {
          keysToRemove.push(key);
        }
      } else if (isGameApiCacheKey(key)) {
        // Clear all game API caches
        keysToRemove.push(key);
      }
    }

    // Remove all matching cache keys
    keysToRemove.forEach(key => localStorage.removeItem(key));

    return keysToRemove.length;
  } catch (error) {
    console.error("Error clearing cache:", error);
    return 0;
  }
};

/**
 * Normalize game name for consistent cache keys
 * @param {string} gameName - Name of the game
 * @returns {string} Normalized game name
 */
const normalizeGameName = gameName => {
  if (!gameName) return "";
  return gameName
    .toLowerCase()
    .replace(/[^\w\s]/g, "") // Remove special characters
    .replace(/\s+/g, "_"); // Replace spaces with underscores
};

/**
 * Get cache statistics for all or specific API
 * @param {string} apiType - Optional API type to get stats for only that API
 * @returns {Object} Cache statistics
 */
const getCacheStats = (apiType = null) => {
  try {
    let count = 0;
    let totalSize = 0;
    const apiStats = {};

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);

      // If apiType is specified, only count that API's cache
      if (apiType) {
        const prefix = getCachePrefix(apiType);
        if (key.startsWith(prefix)) {
          count++;
          totalSize += localStorage.getItem(key).length;
        }
      }
      // Otherwise count all game API caches and track per-API stats
      else if (isGameApiCacheKey(key)) {
        count++;
        const size = localStorage.getItem(key).length;
        totalSize += size;

        // Track per-API stats
        Object.entries(CACHE_PREFIXES).forEach(([api, prefix]) => {
          if (key.startsWith(prefix)) {
            if (!apiStats[api]) {
              apiStats[api] = { count: 0, size: 0 };
            }
            apiStats[api].count++;
            apiStats[api].size += size;
          }
        });
      }
    }

    return {
      count,
      totalSize: Math.round(totalSize / 1024), // Size in KB
      apiStats: Object.entries(apiStats).reduce((acc, [api, stats]) => {
        acc[api] = {
          count: stats.count,
          totalSize: Math.round(stats.size / 1024), // Size in KB
        };
        return acc;
      }, {}),
    };
  } catch (error) {
    console.error("Error getting cache stats:", error);
    return { count: 0, totalSize: 0, apiStats: {} };
  }
};

// For backward compatibility
const legacyGetCachedGame = gameName => getCachedGame(gameName, "steam");
const legacyCacheGame = (gameName, gameData) => cacheGame(gameName, gameData, "steam");

/**
 * Keep the total size of game-API caches under a soft budget. Evicts oldest
 * entries first. Default budget of 2 MB leaves plenty of room (browsers cap
 * localStorage around 5–10 MB) for cover images and other state.
 */
const enforceCacheBudget = (maxBytes = 2 * 1024 * 1024) => {
  try {
    const entries = [];
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!isGameApiCacheKey(key)) continue;
      const raw = localStorage.getItem(key);
      const size = raw ? raw.length : 0;
      let timestamp = 0;
      try {
        timestamp = JSON.parse(raw).timestamp || 0;
      } catch {
        // corrupted – will be evicted first
      }
      entries.push({ key, size, timestamp });
      total += size;
    }
    if (total <= maxBytes) return 0;

    entries.sort((a, b) => a.timestamp - b.timestamp);
    let removed = 0;
    for (const { key, size } of entries) {
      if (total <= maxBytes) break;
      localStorage.removeItem(key);
      total -= size;
      removed++;
    }
    if (removed > 0) {
      console.log(
        `[gameInfoCache] Pruned ${removed} cache entries to stay within budget`
      );
    }
    return removed;
  } catch (error) {
    console.warn("Error enforcing cache budget:", error);
    return 0;
  }
};

// Run cleanup on service initialization
clearExpiredCache();
enforceCacheBudget();

/**
 * Quota-safe wrapper around `localStorage.setItem`. Attempts to set the value,
 * and on QuotaExceededError frees space via `evictForSpace` and retries once.
 * Never throws – returns `true` on success, `false` if the value could not be
 * stored even after eviction.
 */
const safeSetItem = (key, value) => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (!isQuotaExceededError(error)) {
      console.warn(`[safeSetItem] Failed to set ${key}:`, error);
      return false;
    }
    const target = Math.max(
      typeof value === "string" ? value.length * 2 : 512 * 1024,
      512 * 1024
    );
    const evicted = evictForSpace(target);
    console.warn(
      `[safeSetItem] Quota exceeded for ${key}; evicted ${evicted} entries`
    );
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (retryError) {
      console.warn(
        `[safeSetItem] Still over quota after eviction; skipping ${key}`
      );
      return false;
    }
  }
};

// Export the service functions
export { isQuotaExceededError, evictForSpace, safeSetItem };

export default {
  // New API
  getCachedGame,
  cacheGame,
  clearExpiredCache,
  clearAllCache,
  getCacheStats,
  evictForSpace,
  safeSetItem,
  isQuotaExceededError,

  // Legacy API for backward compatibility
  getCachedGame: legacyGetCachedGame,
  cacheGame: legacyCacheGame,
};
