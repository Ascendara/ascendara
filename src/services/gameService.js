import { sanitizeText } from "@/lib/utils";

const API_URL = "https://api.ascendara.app";
const CACHE_KEY = "ascendara_games_cache";
const CACHE_TIMESTAMP_KEY = "local_ascendara_games_timestamp";
const METADATA_CACHE_KEY = "local_ascendara_metadata_cache";
const LAST_UPDATED_KEY = "local_ascendara_last_updated";
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

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
};

const gameService = {
  parseDateString(dateStr) {
    if (!dateStr) return null;
    return new Date(dateStr).getTime();
  },

  async getCachedData() {
    console.log("[GameService] getCachedData called");

    // Check memory cache FIRST - no async, instant return
    const now = Date.now();
    if (memoryCache.games && memoryCache.metadata && memoryCache.timestamp) {
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

    // Get settings to check local index path
    const settings = await window.electron.getSettings();
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


  async updateCache(data, isLocalIndex = false, localIndexPath = null) {
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
        isLocalIndex,
        localIndexPath,
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
