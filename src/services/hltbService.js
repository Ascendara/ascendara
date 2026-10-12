/**
 * HowLongToBeat Service
 * Fetches game completion times through the main process
 */

import gameApiCache from "./gameInfoCacheService";

/**
 * Get completion times for a game
 * @param {string} gameName - Name of the game
 * @returns {Promise<Object|null>} { id, name, main, plus, full, url } with times in seconds
 */
const getGameTimes = async gameName => {
  if (!gameName) return null;

  const cachedData = gameApiCache.getCachedGame(gameName, "hltb");
  if (cachedData) return cachedData;

  try {
    const times = await window.electron.getHltbGameTimes(gameName);
    if (times) gameApiCache.cacheGame(gameName, times, "hltb");
    return times || null;
  } catch (error) {
    console.error("Error fetching HowLongToBeat data:", error);
    return null;
  }
};

/**
 * Format a duration the way HowLongToBeat does, rounded to the nearest half hour
 * @param {number} seconds - Duration in seconds
 * @returns {string|null} e.g. "27", "41½" or null when there is no data
 */
const formatHours = seconds => {
  if (!seconds) return null;
  const halves = Math.max(1, Math.round(seconds / 1800));
  const whole = Math.floor(halves / 2);
  return `${whole || ""}${halves % 2 ? "½" : ""}`;
};

export default {
  getGameTimes,
  formatHours,
};
