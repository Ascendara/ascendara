import { SEAMLESS_PROVIDERS } from "@/config/providers";

// UTILS
const formatBytes = (bytes, decimals = 2) => {
  if (!bytes) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
};

// Fuzzy search with caching for performance
const createFuzzyMatcher = () => {
  const cache = new Map();

  return (text, query) => {
    if (!text || !query) return false;

    const cacheKey = `${text.toLowerCase()}-${query.toLowerCase()}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    text = text.toLowerCase();
    query = query.toLowerCase();

    // Direct substring match for better performance
    if (text.includes(query)) {
      cache.set(cacheKey, true);
      return true;
    }

    const queryWords = query.split(/\s+/).filter(word => word.length > 0);
    if (queryWords.length === 0) {
      cache.set(cacheKey, false);
      return false;
    }

    const result = queryWords.every(queryWord => {
      if (/\d/.test(queryWord)) return text.includes(queryWord);

      const words = text.split(/\s+/);
      return words.some(word => {
        if (/\d/.test(word)) return word.includes(queryWord);
        if (word.includes(queryWord)) return true;

        // Optimize character matching
        let matches = 0;
        let lastIndex = -1;

        for (const char of queryWord) {
          const index = word.indexOf(char, lastIndex + 1);
          if (index > lastIndex) {
            matches++;
            lastIndex = index;
          }
        }

        return matches >= queryWord.length * 0.8;
      });
    });

    cache.set(cacheKey, result);
    if (cache.size > 1000) {
      // Clear cache if it gets too large
      const keys = Array.from(cache.keys());
      keys.slice(0, 100).forEach(key => cache.delete(key));
    }
    return result;
  };
};

// Show installed game details (replaces direct launching)
const showInstalledGameDetails = (
  game,
  setSelectedInstalledGame,
  setInstalledGameView
) => {
  if (!game) return;
  setSelectedInstalledGame(game);
  setInstalledGameView(true);
};

// Seamless verification
const checkSeamlessAvailable = game => {
  if (!game || !game.download_links) return false;
  const links = game.download_links;
  if (typeof links !== "object" || links === null) return false;
  try {
    const hosts = Object.keys(links);
    return hosts.some(host => SEAMLESS_PROVIDERS.includes(host.toLowerCase()));
  } catch (e) {
    return false;
  }
};

export {
  formatBytes,
  createFuzzyMatcher,
  showInstalledGameDetails,
  checkSeamlessAvailable,
};
