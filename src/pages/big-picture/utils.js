import { SEAMLESS_PROVIDERS, MAGIC_LINK_PROVIDERS } from "@/config/providers";

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
// Hosts Big Picture downloads from without leaving it: seamless hosts, then
// Magic Link hosts that resolve in a hidden window
const IN_APP_PROVIDERS = [...SEAMLESS_PROVIDERS, ...MAGIC_LINK_PROVIDERS];

const getInAppProviders = game => {
  const links = game?.download_links;
  if (!links || typeof links !== "object") return [];
  return IN_APP_PROVIDERS.filter(provider => {
    const candidates = links[provider];
    return Array.isArray(candidates)
      ? candidates.some(link => typeof link === "string" && link.trim())
      : typeof candidates === "string" && candidates.trim();
  });
};

const checkSeamlessAvailable = game => getInAppProviders(game).length > 0;

export {
  formatBytes,
  createFuzzyMatcher,
  showInstalledGameDetails,
  checkSeamlessAvailable,
  getInAppProviders,
};
