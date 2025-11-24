/**
 * Service to cache download page data for retry functionality.
 * When a download starts, we cache the game data so users can retry
 * failed downloads by navigating back to the download page.
 */

const STORAGE_KEY = "retryDownloadCache";

/**
 * Cache the download page data for a game.
 * @param {string} gameName - The sanitized game name (used as key)
 * @param {object} gameData - The full game data object from the download page
 */
export const cacheDownloadData = (gameName, gameData) => {
  try {
    const cache = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    cache[gameName] = {
      gameData,
      timestamp: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    console.log(`Cached download data for: ${gameName}`);
  } catch (error) {
    console.error("Failed to cache download data:", error);
  }
};

/**
 * Get cached download page data for a game.
 * @param {string} gameName - The sanitized game name
 * @returns {object|null} The cached game data or null if not found
 */
export const getCachedDownloadData = gameName => {
  try {
    const cache = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const entry = cache[gameName];
    if (entry) {
      return entry.gameData;
    }
    return null;
  } catch (error) {
    console.error("Failed to get cached download data:", error);
    return null;
  }
};

/**
 * Clear cached download data for a specific game.
 * Call this when a download completes successfully or is deleted.
 * @param {string} gameName - The sanitized game name
 */
export const clearCachedDownloadData = gameName => {
  try {
    const cache = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (cache[gameName]) {
      delete cache[gameName];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
      console.log(`Cleared cached download data for: ${gameName}`);
    }
  } catch (error) {
    console.error("Failed to clear cached download data:", error);
  }
};

/**
 * Check if cached download data exists for a game.
 * @param {string} gameName - The sanitized game name
 * @returns {boolean} True if cache exists
 */
export const hasCachedDownloadData = gameName => {
  try {
    const cache = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return !!cache[gameName];
  } catch (error) {
    console.error("Failed to check cached download data:", error);
    return false;
  }
};

/**
 * Clear all cached download data.
 * Useful for cleanup or settings reset.
 */
export const clearAllCachedDownloadData = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log("Cleared all cached download data");
  } catch (error) {
    console.error("Failed to clear all cached download data:", error);
  }
};

export default {
  cacheDownloadData,
  getCachedDownloadData,
  clearCachedDownloadData,
  hasCachedDownloadData,
  clearAllCachedDownloadData,
};
