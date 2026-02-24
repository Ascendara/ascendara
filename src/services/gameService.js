import { getCurrentStatus } from "./serverStatus";
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

    // Check if using local index
    const isDev = import.meta.env.DEV;
    console.log("[GameService] isDev:", isDev);

    const settings = await window.electron.getSettings();
    console.log("[GameService] Settings loaded:", {
      usingLocalIndex: settings?.usingLocalIndex,
      localIndex: settings?.localIndex,
    });
    const usingLocalIndex = settings?.usingLocalIndex === true;

    // If local index setting changed, invalidate cache
    if (memoryCache.isLocalIndex !== usingLocalIndex) {
      console.log("[GameService] Local index setting changed, invalidating cache");
      memoryCache = {
        games: null,
        metadata: null,
        timestamp: null,
        lastUpdated: null,
        imageIdMap: null,
        gameIdMap: null,
        isLocalIndex: usingLocalIndex,
        localIndexPath: settings?.localIndex,
      };
    }

    // If using local index, load from local file
    if (usingLocalIndex && settings?.localIndex) {
      console.log(
        "[GameService] Attempting to load local index from:",
        settings.localIndex
      );
      try {
        const data = await this.fetchDataFromLocalIndex(settings.localIndex);
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
          await this.updateCache(data, true, settings.localIndex);
          return data;
        }
        console.warn("[GameService] Local index file empty or not found");
        // In dev mode, fall back to API if local index is empty
        if (isDev) {
          console.log("[GameService] Dev mode: falling back to API");
          // Continue to API fetch below
        } else {
          // In production, return empty data to prevent mixing local and API data
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
      } catch (error) {
        console.error("[GameService] Error loading local index:", error);
        // In dev mode, fall back to API if local index fails
        if (isDev) {
          console.log("[GameService] Dev mode: falling back to API after error");
          // Continue to API fetch below
        } else {
          // In production, don't fall back to API when local index is enabled
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
    }

    // Check localStorage cache (only when NOT using local index)
    const cachedGames = localStorage.getItem(CACHE_KEY);
    const cachedMetadata = localStorage.getItem(METADATA_CACHE_KEY);
    const timestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);

    if (cachedGames && cachedMetadata && timestamp) {
      const age = now - parseInt(timestamp);
      if (age < CACHE_DURATION) {
        const parsedGames = JSON.parse(cachedGames);
        const parsedMetadata = JSON.parse(cachedMetadata);

        // Ensure local property is set correctly for cached API data
        if (parsedMetadata.local === undefined) {
          parsedMetadata.local = false;
        }

        // Update memory cache
        memoryCache = {
          ...memoryCache,
          games: parsedGames,
          metadata: parsedMetadata,
          timestamp: parseInt(timestamp),
          lastUpdated: parsedMetadata.getDate,
          isLocalIndex: usingLocalIndex,
        };

        return {
          games: parsedGames,
          metadata: parsedMetadata,
        };
      }
    }

    try {
      const status = getCurrentStatus();
      if (!status?.ok) {
        if (cachedGames && cachedMetadata) {
          const parsedGames = JSON.parse(cachedGames);
          const parsedMetadata = JSON.parse(cachedMetadata);
          return { games: parsedGames, metadata: parsedMetadata };
        }
        throw new Error("Server is not available");
      }

      const data = await this.fetchDataFromAPI();
      await this.updateCache(data);
      return data;
    } catch (error) {
      if (cachedGames && cachedMetadata) {
        const parsedGames = JSON.parse(cachedGames);
        const parsedMetadata = JSON.parse(cachedMetadata);
        return { games: parsedGames, metadata: parsedMetadata };
      }
      console.error("Error fetching data:", error);
      return { games: [], metadata: null };
    }
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

  async fetchDataFromAPI() {
    // Get settings from electron
    const settings = await window.electron.getSettings();
    const source = settings?.gameSource || "steamrip";

    let endpoint = `${API_URL}/json/games`;
    if (source === "fitgirl") {
      endpoint = `${API_URL}/json/sources/fitgirl/games`;
    }

    try {
      const response = await fetch(endpoint);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();

      // Sanitize game titles
      if (data.games) {
        data.games = data.games.map(game => ({
          ...game,
          name: sanitizeText(game.name),
          game: sanitizeText(game.game),
        }));
      }

      return {
        games: data.games,
        metadata: {
          apiversion: data.metadata?.apiversion,
          games: data.games?.length,
          getDate: data.metadata?.getDate,
          source: data.metadata?.source || source,
          imagesAvailable: true,
          local: false, // Explicitly mark as not local
        },
      };
    } catch (error) {
      console.warn("Primary API failed, trying backup CDN:", error);
      const backupEndpoint = "https://cdn.ascendara.app/files/data.json";

      try {
        const response = await fetch(backupEndpoint, {
          mode: "no-cors",
          headers: {
            Accept: "application/json",
          },
        });

        // When using no-cors, we can't access the response directly
        // We need to handle it differently
        if (!response.ok && response.type !== "opaque") {
          throw new Error(`Backup CDN failed! status: ${response.status}`);
        }

        // Since no-cors might give us an opaque response,
        // we'll need to handle potential parsing errors
        let data;
        try {
          data = await response.json();
        } catch (parseError) {
          console.error("Failed to parse CDN response:", parseError);
          throw new Error("Unable to parse backup data source");
        }

        // Sanitize game titles
        if (data.games) {
          data.games = data.games.map(game => ({
            ...game,
            name: sanitizeText(game.name),
            game: sanitizeText(game.game),
          }));
        }

        return {
          games: data.games,
          metadata: {
            apiversion: data.metadata?.apiversion,
            games: data.games?.length,
            getDate: data.metadata?.getDate,
            source: data.metadata?.source || source,
            imagesAvailable: false, // Images won't be available when using CDN
            local: false, // Explicitly mark as not local
          },
        };
      } catch (cdnError) {
        console.error("Both API and CDN failed:", cdnError);
        // Re-throw the error to be handled by the caller
        throw new Error("Failed to fetch game data from both primary and backup sources");
      }
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
    try {
      // Skip API check if using local index
      const settings = await window.electron.getSettings();
      if (settings?.usingLocalIndex) {
        return null;
      }

      const response = await fetch(`${API_URL}/json/games`, {
        method: "HEAD", // Only get headers to check Last-Modified
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const lastModified = response.headers.get("Last-Modified");
      return lastModified || null;
    } catch (error) {
      console.error("Error checking metadata:", error);
      return null;
    }
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
