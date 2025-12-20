/**
 * Nexus Mods Service
 * Provides integration with Nexus Mods API to check game mod support
 * and browse/manage mods for games.
 */

const NEXUS_API_URL = "https://api.nexusmods.com/v2/graphql";

// Cache for game mod support lookups
const gameModSupportCache = new Map();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Normalize a game name for better matching
 * @param {string} name - Game name to normalize
 * @returns {string} Normalized name
 */
const normalizeGameName = name => {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "") // Remove special characters
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();
};

/**
 * Search for a game on Nexus Mods using GraphQL API
 * @param {string} gameName - Name of the game to search for
 * @returns {Promise<Object|null>} Game data if found, null otherwise
 */
const searchGame = async gameName => {
  if (!gameName) return null;

  const normalizedSearch = normalizeGameName(gameName);

  // Check cache first
  const cacheKey = `search_${normalizedSearch}`;
  const cached = gameModSupportCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  try {
    const query = `
      query games($filter: GamesSearchFilter, $count: Int) {
        games(filter: $filter, count: $count) {
          nodes {
            id
            name
            domainName
            modCount
            downloadCount
            genre
          }
          totalCount
        }
      }
    `;

    const variables = {
      filter: {
        name: {
          value: gameName,
          op: "WILDCARD",
        },
      },
      count: 10,
    };

    const response = await fetch(NEXUS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      console.error("[NexusMods] API request failed:", response.status);
      return null;
    }

    const result = await response.json();

    if (result.errors) {
      console.error("[NexusMods] GraphQL errors:", result.errors);
      return null;
    }

    const games = result.data?.games?.nodes || [];

    // Find the best match
    let bestMatch = null;
    let bestScore = 0;

    for (const game of games) {
      const normalizedGameName = normalizeGameName(game.name);

      // Exact match
      if (normalizedGameName === normalizedSearch) {
        bestMatch = game;
        break;
      }

      // Partial match scoring
      let score = 0;
      if (normalizedGameName.includes(normalizedSearch)) {
        score = normalizedSearch.length / normalizedGameName.length;
      } else if (normalizedSearch.includes(normalizedGameName)) {
        score = (normalizedGameName.length / normalizedSearch.length) * 0.8;
      }

      // Boost score if game has mods
      if (game.modCount > 0) {
        score *= 1.2;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = game;
      }
    }

    // Cache the result
    gameModSupportCache.set(cacheKey, {
      data: bestMatch,
      timestamp: Date.now(),
    });

    return bestMatch;
  } catch (error) {
    console.error("[NexusMods] Error searching for game:", error);
    return null;
  }
};

/**
 * Check if a game has mod support on Nexus Mods
 * @param {string} gameName - Name of the game to check
 * @returns {Promise<{supported: boolean, gameData: Object|null}>}
 */
const checkModSupport = async gameName => {
  if (!gameName) {
    return { supported: false, gameData: null };
  }

  const cacheKey = `support_${normalizeGameName(gameName)}`;
  const cached = gameModSupportCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  try {
    const gameData = await searchGame(gameName);

    const result = {
      supported: gameData !== null && gameData.modCount > 0,
      gameData: gameData,
    };

    // Cache the result
    gameModSupportCache.set(cacheKey, {
      data: result,
      timestamp: Date.now(),
    });

    return result;
  } catch (error) {
    console.error("[NexusMods] Error checking mod support:", error);
    return { supported: false, gameData: null };
  }
};

/**
 * Get the Nexus Mods URL for a game
 * @param {string} domainName - The domain name of the game on Nexus Mods
 * @returns {string} URL to the game's mod page
 */
const getGameModsUrl = domainName => {
  if (!domainName) return "https://www.nexusmods.com/";
  return `https://www.nexusmods.com/${domainName}/mods/`;
};

/**
 * Get mods for a game with pagination and sorting options
 * @param {string} gameDomainName - The domain name of the game on Nexus Mods
 * @param {Object} options - Query options
 * @param {number} options.count - Number of mods to fetch (default 20)
 * @param {number} options.offset - Offset for pagination (default 0)
 * @param {string} options.sortBy - Sort field: 'endorsements', 'downloads', 'updatedAt' (default 'endorsements')
 * @param {string} options.sortDirection - Sort direction: 'DESC' or 'ASC' (default 'DESC')
 * @param {string} options.searchQuery - Optional search query to filter mods by name
 * @returns {Promise<{mods: Array, totalCount: number}>} Mods and total count
 */
const getMods = async (gameDomainName, options = {}) => {
  if (!gameDomainName) return { mods: [], totalCount: 0 };

  const {
    count = 20,
    offset = 0,
    sortBy = "endorsements",
    sortDirection = "DESC",
    searchQuery = null,
  } = options;

  try {
    const query = `
      query mods($filter: ModsFilter, $sort: [ModsSort!], $count: Int, $offset: Int) {
        mods(filter: $filter, sort: $sort, count: $count, offset: $offset) {
          nodes {
            uid
            modId
            name
            summary
            pictureUrl
            version
            createdAt
            updatedAt
            uploader {
              name
              memberId
            }
            modCategory {
              name
              id
            }
          }
          totalCount
        }
      }
    `;

    const filter = {
      gameDomainName: {
        value: gameDomainName,
        op: "EQUALS",
      },
    };

    // Add name search filter if provided
    if (searchQuery) {
      filter.name = {
        value: `*${searchQuery}*`,
        op: "WILDCARD",
      };
    }

    const variables = {
      filter,
      sort: [{ [sortBy]: { direction: sortDirection } }],
      count,
      offset,
    };

    const response = await fetch(NEXUS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      console.error("[NexusMods] Failed to fetch mods:", response.status);
      return { mods: [], totalCount: 0 };
    }

    const result = await response.json();

    if (result.errors) {
      console.error("[NexusMods] GraphQL errors:", result.errors);
      return { mods: [], totalCount: 0 };
    }

    return {
      mods: result.data?.mods?.nodes || [],
      totalCount: result.data?.mods?.totalCount || 0,
    };
  } catch (error) {
    console.error("[NexusMods] Error fetching mods:", error);
    return { mods: [], totalCount: 0 };
  }
};

/**
 * Get popular mods for a game (convenience wrapper)
 * @param {string} gameDomainName - The domain name of the game on Nexus Mods
 * @param {number} count - Number of mods to fetch
 * @returns {Promise<Array>} Array of mod data
 */
const getPopularMods = async (gameDomainName, count = 10) => {
  const result = await getMods(gameDomainName, { count, sortBy: "endorsements" });
  return result.mods;
};

/**
 * Get mod details including files
 * @param {string} gameDomainName - The domain name of the game on Nexus Mods
 * @param {number} modId - The mod ID
 * @returns {Promise<Object|null>} Mod details with files
 */
const getModDetails = async (gameDomainName, modId) => {
  if (!gameDomainName || !modId) return null;

  try {
    const query = `
      query mod($gameDomainName: String!, $modId: Int!) {
        legacyMods(
          filter: { gameDomainName: { value: $gameDomainName, op: EQUALS }, modId: { value: $modId, op: EQUALS } }
          count: 1
        ) {
          nodes {
            uid
            modId
            name
            summary
            description
            pictureUrl
            endorsementCount
            downloadCount
            version
            createdAt
            updatedAt
            author {
              name
              memberId
            }
            modCategory {
              name
              id
            }
          }
        }
      }
    `;

    const variables = {
      gameDomainName,
      modId: parseInt(modId),
    };

    const response = await fetch(NEXUS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      console.error("[NexusMods] Failed to fetch mod details:", response.status);
      return null;
    }

    const result = await response.json();

    if (result.errors) {
      console.error("[NexusMods] GraphQL errors:", result.errors);
      return null;
    }

    const mod = result.data?.legacyMods?.nodes?.[0] || null;
    return mod;
  } catch (error) {
    console.error("[NexusMods] Error fetching mod details:", error);
    return null;
  }
};

/**
 * Get mod files for downloading
 * @param {number} gameId - The game ID on Nexus Mods
 * @param {number} modId - The mod ID
 * @returns {Promise<Array>} Array of mod files
 */
const getModFiles = async (gameId, modId) => {
  if (!gameId || !modId) return [];

  try {
    const query = `
      query modFiles($modId: ID!, $gameId: ID!) {
        modFiles(modId: $modId, gameId: $gameId) {
          fileId
          name
          version
          sizeInBytes
          description
          category
          primary
        }
      }
    `;

    const variables = {
      modId: String(modId),
      gameId: String(gameId),
    };

    const response = await fetch(NEXUS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      console.error("[NexusMods] Failed to fetch mod files:", response.status);
      return [];
    }

    const result = await response.json();

    if (result.errors) {
      console.error("[NexusMods] GraphQL errors:", result.errors);
      return [];
    }

    // modFiles returns an array directly, not a page with nodes
    return result.data?.modFiles || [];
  } catch (error) {
    console.error("[NexusMods] Error fetching mod files:", error);
    return [];
  }
};

/**
 * Get categories for a game
 * @param {string} gameDomainName - The domain name of the game on Nexus Mods
 * @returns {Promise<Array>} Array of categories
 */
const getCategories = async gameDomainName => {
  if (!gameDomainName) return [];

  try {
    const query = `
      query categories($gameDomainName: String!) {
        categories(filter: { gameDomainName: { value: $gameDomainName, op: EQUALS } }) {
          nodes {
            id
            name
            parentId
          }
        }
      }
    `;

    const variables = { gameDomainName };

    const response = await fetch(NEXUS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      console.error("[NexusMods] Failed to fetch categories:", response.status);
      return [];
    }

    const result = await response.json();

    if (result.errors) {
      console.error("[NexusMods] GraphQL errors:", result.errors);
      return [];
    }

    return result.data?.categories?.nodes || [];
  } catch (error) {
    console.error("[NexusMods] Error fetching categories:", error);
    return [];
  }
};

/**
 * Get the direct download URL for a mod file (requires opening in browser for manual download)
 * Note: Nexus Mods requires authentication for direct downloads, so we provide the mod page URL
 * @param {string} gameDomainName - The domain name of the game on Nexus Mods
 * @param {number} modId - The mod ID
 * @param {number} fileId - The file ID (optional, goes to files tab if provided)
 * @returns {string} URL to the mod page or files tab
 */
const getModDownloadUrl = (gameDomainName, modId, fileId = null) => {
  if (!gameDomainName || !modId) return "https://www.nexusmods.com/";
  if (fileId) {
    return `https://www.nexusmods.com/${gameDomainName}/mods/${modId}?tab=files&file_id=${fileId}`;
  }
  return `https://www.nexusmods.com/${gameDomainName}/mods/${modId}?tab=files`;
};

/**
 * Format file size from bytes to human readable
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size string
 */
const formatFileSize = bytes => {
  if (!bytes || bytes === 0) return "Unknown";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
};

/**
 * Clear the cache
 */
const clearCache = () => {
  gameModSupportCache.clear();
};

const nexusModsService = {
  searchGame,
  checkModSupport,
  getGameModsUrl,
  getMods,
  getPopularMods,
  getModDetails,
  getModFiles,
  getCategories,
  getModDownloadUrl,
  formatFileSize,
  clearCache,
  normalizeGameName,
};

export default nexusModsService;
