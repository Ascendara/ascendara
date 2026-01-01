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

    // Store in localStorage
    localStorage.setItem(cacheKey, JSON.stringify(cacheObject));
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

// Run cleanup on service initialization
clearExpiredCache();

// Export the service functions
export default {
  // New API
  getCachedGame,
  cacheGame,
  clearExpiredCache,
  clearAllCache,
  getCacheStats,

  // Legacy API for backward compatibility
  getCachedGame: legacyGetCachedGame,
  cacheGame: legacyCacheGame,
};
