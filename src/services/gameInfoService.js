/**
 * Game Data Service
 * Handles fetching game data from Steam API
 */

// Import cache service
import gameApiCache from "./gameInfoCacheService";

// Constants for APIs
const isDev = import.meta.env.DEV;

// Steam API endpoints
const STEAM_STORE_SEARCH_URL = isDev
  ? "/api/steam/search"
  : "https://store.steampowered.com/api/storesearch";
const STEAM_APP_LIST_URL = isDev
  ? "/api/steam/applist"
  : "https://api.steampowered.com/ISteamApps/GetAppList/v2";
const STEAM_APP_DETAILS_URL = isDev
  ? "/api/steam/appdetails"
  : "https://store.steampowered.com/api/appdetails";

/**
 * Normalize game title for better matching
 * @param {string} title - Game title to normalize
 * @returns {string} Normalized title
 */
const normalizeGameTitle = title => {
  if (!title) return "";
  return title
    .toLowerCase()
    .replace(/[™®©]/g, "") // Remove trademark symbols
    .replace(/[:\-–—]/g, " ") // Replace colons and dashes with spaces
    .replace(
      /\b(edition|remastered|demo|dlc|goty|complete|definitive|enhanced|ultimate|deluxe|premium|gold|standard)\b/gi,
      ""
    ) // Remove edition words
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();
};

/**
 * Search for a game by name using Steam Store Search API
 * @param {string} gameName - Name of the game to search for
 * @param {string} apiKey - Steam API Key (not used for store search)
 * @returns {Promise<Object>} Game data with appid
 */
const searchGameSteam = async (gameName, apiKey) => {
  try {
    // Normalize the search term
    const normalizedSearch = normalizeGameTitle(gameName);
    const encodedSearch = encodeURIComponent(gameName);

    console.log(`Searching Steam for: "${gameName}" (normalized: "${normalizedSearch}")`);

    // Try Steam Store Search API with original title first
    const storeSearchUrl = `https://store.steampowered.com/api/storesearch?term=${encodedSearch}&l=en&cc=US`;
    const storeResult = await window.electron.steamRequest(storeSearchUrl);

    if (storeResult.success) {
      const storeData = storeResult.data;
      console.log("Steam Store Search response:", storeData);

      if (storeData.items && storeData.items.length > 0) {
        console.log(`Found ${storeData.items.length} items from Steam Store Search`);

        // Find best match using normalized titles
        let bestMatch = null;
        let bestScore = 0;

        for (const item of storeData.items) {
          console.log(`Checking item: ${item.name} (type: ${item.type})`);

          // Steam uses "app" for games, not "game"
          // We'll accept all types and let similarity matching handle it
          // if (item.type !== "app") continue;

          const normalizedItemName = normalizeGameTitle(item.name);

          // Exact match gets highest priority
          if (normalizedItemName === normalizedSearch) {
            bestMatch = { appid: item.id, name: item.name };
            console.log(`Found exact match: ${item.name}`);
            break;
          }

          // Calculate similarity score
          const score = calculateSimilarity(normalizedSearch, normalizedItemName);
          console.log(`Similarity score for "${item.name}": ${score}`);
          if (score > bestScore) {
            bestScore = score;
            bestMatch = { appid: item.id, name: item.name };
          }
        }

        if (bestMatch) {
          console.log(
            `Steam Store Search found: ${bestMatch.name} (AppID: ${bestMatch.appid}, score: ${bestScore})`
          );
          return bestMatch;
        } else {
          console.log("No suitable match found in store search results");
        }
      } else {
        console.log("Store search returned no items with original title");

        // Try again with just the base game name (remove edition suffixes)
        if (gameName !== normalizedSearch) {
          console.log(`Trying normalized search: "${normalizedSearch}"`);
          const normalizedEncoded = encodeURIComponent(normalizedSearch);
          const normalizedSearchUrl = `https://store.steampowered.com/api/storesearch?term=${normalizedEncoded}&l=en&cc=US`;
          const normalizedResult =
            await window.electron.steamRequest(normalizedSearchUrl);

          if (normalizedResult.success) {
            const normalizedData = normalizedResult.data;
            console.log("Normalized search response:", normalizedData);

            if (normalizedData.items && normalizedData.items.length > 0) {
              // Take the first result from normalized search
              const firstResult = normalizedData.items[0];
              console.log(
                `Using first result from normalized search: ${firstResult.name} (AppID: ${firstResult.id})`
              );
              return { appid: firstResult.id, name: firstResult.name };
            }
          }
        }
      }
    } else {
      console.log(`Store search failed`);
    }

    console.log(`No Steam app found for: ${gameName}`);
    return null;
  } catch (error) {
    console.error("Error searching for game on Steam:", error);
    return null;
  }
};

/**
 * Calculate similarity between two strings (simple implementation)
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Similarity score (0-1)
 */
const calculateSimilarity = (str1, str2) => {
  if (str1 === str2) return 1;
  if (!str1 || !str2) return 0;

  // Check if one string contains the other
  if (str1.includes(str2) || str2.includes(str1)) {
    return 0.8;
  }

  // Simple word-based matching
  const words1 = str1.split(" ").filter(w => w.length > 2);
  const words2 = str2.split(" ").filter(w => w.length > 2);

  if (words1.length === 0 || words2.length === 0) return 0;

  let matchCount = 0;
  for (const word1 of words1) {
    if (words2.some(word2 => word2.includes(word1) || word1.includes(word2))) {
      matchCount++;
    }
  }

  return matchCount / Math.max(words1.length, words2.length);
};

/**
 * Get detailed game info from Steam by App ID
 * @param {number} appId - Steam App ID
 * @param {string} apiKey - Steam API Key
 * @returns {Promise<Object>} Detailed game data
 */
const getGameDetailByIdSteam = async (appId, apiKey) => {
  try {
    console.log(`Fetching Steam details for app ID: ${appId}`);

    // Get game details from Steam Store API
    const url = `https://store.steampowered.com/api/appdetails?appids=${appId}`;

    const result = await window.electron.steamRequest(url);

    if (!result.success) {
      throw new Error(`Steam API error`);
    }

    const data = result.data;

    console.log("Steam detail response:", data);

    if (data[appId]?.success && data[appId]?.data) {
      return data[appId].data;
    }

    return null;
  } catch (error) {
    console.error("Error getting game details from Steam:", error);
    return null;
  }
};

/**
 * Get game details from Steam
 * @param {string} gameName - Name of the game
 * @param {Object} config - Configuration (apiKey is loaded from electron config)
 * @returns {Promise<Object>} Game details
 */
const getGameDetailsSteam = async (gameName, config) => {
  try {
    console.log(`Fetching Steam data for: ${gameName}`);

    // Get Steam API key from electron config (hardcoded)
    const apiKey = await window.electron.getSteamApiKey();

    if (!apiKey) {
      console.log("Steam API key not available from electron config");
      return null;
    }

    // Search for the game
    const searchResult = await searchGameSteam(gameName, apiKey);

    console.log("Steam search result:", searchResult);

    if (!searchResult) {
      console.log(`No Steam results found for: ${gameName}`);
      return null;
    }

    // Get detailed game info
    const gameDetails = await getGameDetailByIdSteam(searchResult.appid, apiKey);

    if (!gameDetails) {
      console.log(
        `No detailed Steam data found for: ${gameName} (${searchResult.appid})`
      );
      return null;
    }

    // Process and format the game data
    const formattedDetails = formatSteamData(gameDetails);

    console.log(`Successfully processed Steam data for: ${gameName}`);

    // Cache the processed game data
    gameApiCache.cacheGame(gameName, formattedDetails, "steam");

    return formattedDetails;
  } catch (error) {
    console.error("Error getting game details from Steam:", error);
    return null;
  }
};

/**
 * Strip HTML tags from text
 * @param {string} html - HTML text to strip
 * @returns {string} Plain text without HTML tags
 */
const stripHtmlTags = html => {
  if (!html) return "";
  // Create a temporary div element
  const tempDiv = document.createElement("div");
  // Set the HTML content
  tempDiv.innerHTML = html;
  // Return the text content (strips all HTML tags)
  return tempDiv.textContent || tempDiv.innerText || "";
};

/**
 * Clean and format description text by properly handling section headers
 * @param {string} description - Raw description text that may contain section headers
 * @returns {string} Cleaned and formatted description text
 */
const cleanDescriptionText = description => {
  if (!description) return "";

  // First strip HTML tags
  let cleanText = stripHtmlTags(description);

  // Common section headers in game descriptions
  const sectionHeaders = [
    "Overview",
    "Story",
    "Gameplay",
    "Features",
    "System Requirements",
    "Minimum",
    "Recommended",
    "External Links",
    "About This Game",
    "Description",
  ];

  // Replace common section headers with properly formatted versions (with newlines)
  sectionHeaders.forEach(header => {
    // Match the header at the beginning of a line or right after another header
    // This regex looks for the header without proper formatting
    const headerRegex = new RegExp(`(^|\\n)${header}([^\\n]|$)`, "gi");

    // Replace with properly formatted header (with newlines before and after)
    cleanText = cleanText.replace(headerRegex, (match, prefix, suffix) => {
      // If the suffix is not a space or punctuation, we need to add a space
      // This handles cases like "OverviewThe game is..." -> "Overview\nThe game is..."
      if (suffix && !suffix.match(/[\s\.,;:]/)) {
        return `${prefix}${header}\n\n${suffix}`;
      }
      return `${prefix}${header}\n\n${suffix}`;
    });
  });

  // Fix any instances where section headers are directly followed by content without spacing
  // This regex looks for capitalized words that might be headers stuck to content
  cleanText = cleanText.replace(
    /([A-Z][a-z]+)([A-Z][a-z]+)(\s|$)/g,
    (match, word1, word2, suffix) => {
      // Check if the first word might be a header
      if (sectionHeaders.some(header => header.toLowerCase() === word1.toLowerCase())) {
        return `${word1}\n\n${word2}${suffix}`;
      }
      return match;
    }
  );

  // Additional cleanup for specific patterns seen in the example
  // Fix "OverviewGameName" pattern
  cleanText = cleanText.replace(/(Overview)([A-Z])/g, "$1\n\n$2");

  // Fix "External LinksWebsite" pattern
  cleanText = cleanText.replace(/(External Links)([A-Z])/g, "$1\n\n$2");

  // Remove any triple or more consecutive newlines
  cleanText = cleanText.replace(/\n{3,}/g, "\n\n");

  return cleanText.trim();
};

/**
 * Parse system requirements from description
 * @param {string} description - Game description that may contain system requirements
 * @returns {Object} Structured system requirements object
 */
const parseSystemRequirements = description => {
  if (!description) return null;

  // Default empty structure
  const requirements = {
    minimum: {
      os: [],
      processor: [],
      memory: [],
      graphics: [],
      directx: [],
      storage: [],
      sound: [],
    },
    recommended: {
      os: [],
      processor: [],
      memory: [],
      graphics: [],
      directx: [],
      storage: [],
      sound: [],
    },
  };

  // Clean the description
  const cleanDescription = stripHtmlTags(description);

  // Look for system requirements section
  const sysReqMatch = cleanDescription.match(/system\s+requirements/i);
  if (!sysReqMatch) return null;

  // Extract minimum requirements
  const minMatch = cleanDescription.match(/minimum[:\s]+(.*?)(?=recommended|\n\n|$)/is);
  if (minMatch && minMatch[1]) {
    const minText = minMatch[1].trim();

    // OS
    const osMatch = minText.match(
      /(?:os|operating system)[:\s]+(.*?)(?=\n|processor|cpu|$)/i
    );
    if (osMatch && osMatch[1]) requirements.minimum.os.push(osMatch[1].trim());

    // Processor
    const procMatch = minText.match(/(?:processor|cpu)[:\s]+(.*?)(?=\n|memory|ram|$)/i);
    if (procMatch && procMatch[1])
      requirements.minimum.processor.push(procMatch[1].trim());

    // Memory
    const memMatch = minText.match(/(?:memory|ram)[:\s]+(.*?)(?=\n|graphics|gpu|$)/i);
    if (memMatch && memMatch[1]) requirements.minimum.memory.push(memMatch[1].trim());

    // Graphics
    const gpuMatch = minText.match(
      /(?:graphics|gpu|video)[:\s]+(.*?)(?=\n|directx|storage|$)/i
    );
    if (gpuMatch && gpuMatch[1]) requirements.minimum.graphics.push(gpuMatch[1].trim());

    // DirectX
    const dxMatch = minText.match(/directx[:\s]+(.*?)(?=\n|storage|$)/i);
    if (dxMatch && dxMatch[1]) requirements.minimum.directx.push(dxMatch[1].trim());

    // Storage
    const storageMatch = minText.match(
      /(?:storage|hard drive|disk space)[:\s]+(.*?)(?=\n|sound|$)/i
    );
    if (storageMatch && storageMatch[1])
      requirements.minimum.storage.push(storageMatch[1].trim());

    // Sound
    const soundMatch = minText.match(/(?:sound|audio)[:\s]+(.*?)(?=\n|$)/i);
    if (soundMatch && soundMatch[1])
      requirements.minimum.sound.push(soundMatch[1].trim());
  }

  // Extract recommended requirements
  const recMatch = cleanDescription.match(/recommended[:\s]+(.*?)(?=\n\n|$)/is);
  if (recMatch && recMatch[1]) {
    const recText = recMatch[1].trim();

    // OS
    const osMatch = recText.match(
      /(?:os|operating system)[:\s]+(.*?)(?=\n|processor|cpu|$)/i
    );
    if (osMatch && osMatch[1]) requirements.recommended.os.push(osMatch[1].trim());

    // Processor
    const procMatch = recText.match(/(?:processor|cpu)[:\s]+(.*?)(?=\n|memory|ram|$)/i);
    if (procMatch && procMatch[1])
      requirements.recommended.processor.push(procMatch[1].trim());

    // Memory
    const memMatch = recText.match(/(?:memory|ram)[:\s]+(.*?)(?=\n|graphics|gpu|$)/i);
    if (memMatch && memMatch[1]) requirements.recommended.memory.push(memMatch[1].trim());

    // Graphics
    const gpuMatch = recText.match(
      /(?:graphics|gpu|video)[:\s]+(.*?)(?=\n|directx|storage|$)/i
    );
    if (gpuMatch && gpuMatch[1])
      requirements.recommended.graphics.push(gpuMatch[1].trim());

    // DirectX
    const dxMatch = recText.match(/directx[:\s]+(.*?)(?=\n|storage|$)/i);
    if (dxMatch && dxMatch[1]) requirements.recommended.directx.push(dxMatch[1].trim());

    // Storage
    const storageMatch = recText.match(
      /(?:storage|hard drive|disk space)[:\s]+(.*?)(?=\n|sound|$)/i
    );
    if (storageMatch && storageMatch[1])
      requirements.recommended.storage.push(storageMatch[1].trim());

    // Sound
    const soundMatch = recText.match(/(?:sound|audio)[:\s]+(.*?)(?=\n|$)/i);
    if (soundMatch && soundMatch[1])
      requirements.recommended.sound.push(soundMatch[1].trim());
  }

  return requirements;
};

/**
 * Extract game features from description
 * @param {string} description - Game description
 * @returns {Array} Array of game features
 */
const extractGameFeatures = description => {
  if (!description) return [];

  const features = [];
  const cleanDescription = stripHtmlTags(description);

  // Look for common feature indicators
  const featureMatches = cleanDescription.match(/features?:?\s*(.*?)(?=\n\n|$)/is);
  if (featureMatches && featureMatches[1]) {
    // Split by bullet points or newlines
    const featureText = featureMatches[1];
    const featureItems = featureText
      .split(/[•\-\*\n]+/)
      .filter(item => item.trim().length > 0);

    featureItems.forEach(item => {
      const cleanItem = item.trim();
      if (cleanItem && cleanItem.length > 3) {
        features.push(cleanItem);
      }
    });
  }

  return features;
};

/**
 * Format Steam data for use in the application
 * @param {Object} steamData - Raw Steam data
 * @returns {Object} Formatted Steam data
 */
const formatSteamData = steamData => {
  if (!steamData) return null;

  // Extract screenshots
  const screenshots = [];
  if (steamData.screenshots && Array.isArray(steamData.screenshots)) {
    steamData.screenshots.forEach((screenshot, index) => {
      screenshots.push({
        id: `steam-${steamData.steam_appid}-${index}`,
        image_id: `steam-${steamData.steam_appid}-${index}`,
        url: screenshot.path_full,
        width: 1920,
        height: 1080,
        formatted_url: screenshot.path_full,
      });
    });
  }

  // Extract platforms
  const platforms = [];
  if (steamData.platforms) {
    if (steamData.platforms.windows) platforms.push({ id: 1, name: "Windows" });
    if (steamData.platforms.mac) platforms.push({ id: 2, name: "Mac" });
    if (steamData.platforms.linux) platforms.push({ id: 3, name: "Linux" });
  }

  // Extract genres
  const genres = [];
  if (steamData.genres && Array.isArray(steamData.genres)) {
    steamData.genres.forEach(genre => {
      genres.push({
        id: genre.id,
        name: genre.description,
      });
    });
  }

  // Get clean description - prefer short_description for summary, about_the_game for detailed
  const shortDescription = steamData.short_description || "";
  const aboutTheGame = steamData.about_the_game
    ? stripHtmlTags(steamData.about_the_game)
    : "";
  const fullCleanDescription = steamData.detailed_description
    ? stripHtmlTags(steamData.detailed_description)
    : "";

  // Parse system requirements from PC requirements
  let systemRequirements = null;
  if (steamData.pc_requirements) {
    systemRequirements = {
      minimum: steamData.pc_requirements.minimum
        ? stripHtmlTags(steamData.pc_requirements.minimum)
        : "",
      recommended: steamData.pc_requirements.recommended
        ? stripHtmlTags(steamData.pc_requirements.recommended)
        : "",
    };
  }

  // Extract release date
  let releaseDate = "";
  if (steamData.release_date && steamData.release_date.date) {
    releaseDate = steamData.release_date.date;
  }

  // Extract developers and publishers
  const developers = steamData.developers || [];
  const publishers = steamData.publishers || [];

  // Format the data for the application
  return {
    id: steamData.steam_appid,
    name: steamData.name,
    summary: shortDescription,
    description: aboutTheGame || shortDescription,
    storyline: null,

    // Store the full description separately
    full_description: fullCleanDescription,

    // Steam API fields
    cover: steamData.header_image
      ? {
          id: steamData.steam_appid,
          image_id: steamData.steam_appid,
          url: steamData.header_image,
          width: 460,
          height: 215,
          formatted_url: steamData.header_image,
        }
      : null,

    screenshots: screenshots,
    formatted_screenshots: screenshots,
    videos: steamData.movies || [],
    similar_games: [],
    genres: genres,
    platforms: platforms,

    // Additional Steam specific fields
    developers: developers,
    publishers: publishers,
    release_date: releaseDate,
    site_detail_url: `https://store.steampowered.com/app/${steamData.steam_appid}`,

    // Structured system requirements
    system_requirements: systemRequirements,

    // Game features
    features: [],

    // Source information
    source: "steam",
  };
};

/**
 * Remove duplicated phrases or sentences from text
 * @param {string} text - Text that may contain duplications
 * @returns {string} Text with duplications removed
 */
const removeDuplicatedPhrases = text => {
  if (!text) return "";

  // Split into sentences or phrases
  const sentences = text.split(/[.!?]\s+/);
  const uniqueSentences = [];
  const seen = new Set();

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed && !seen.has(trimmed.toLowerCase())) {
      seen.add(trimmed.toLowerCase());
      uniqueSentences.push(trimmed);
    }
  }

  // If we have multiple sentences, join with proper punctuation
  if (uniqueSentences.length > 1) {
    return uniqueSentences.join(". ") + ".";
  }

  // Check for duplicated phrases within a single sentence
  if (uniqueSentences.length === 1) {
    const sentence = uniqueSentences[0];
    const phrases = sentence.split(/,\s+/);
    const uniquePhrases = [];
    const seenPhrases = new Set();

    for (const phrase of phrases) {
      const trimmed = phrase.trim();
      if (trimmed && !seenPhrases.has(trimmed.toLowerCase())) {
        seenPhrases.add(trimmed.toLowerCase());
        uniquePhrases.push(trimmed);
      }
    }

    return uniquePhrases.join(", ");
  }

  return text;
};

/**
 * Get game details from Steam API
 * @param {string} gameName - Name of the game
 * @param {Object} config - Configuration (not used, kept for compatibility)
 * @returns {Promise<Object>} Game details from Steam
 */
const getGameDetails = async (gameName, config = {}) => {
  console.log("getGameDetails for:", gameName);

  // Get Steam API key from electron config (always available)
  let steamApiKey = "";
  try {
    steamApiKey = await window.electron.getSteamApiKey();
  } catch (error) {
    console.error("Error getting Steam API key from electron:", error);
  }

  console.log("Steam API key:", steamApiKey ? "Set" : "Not set");

  // Check if Steam is enabled (has valid API key from electron config)
  const useSteam = steamApiKey && steamApiKey.trim() !== "";

  console.log("Using Steam:", useSteam);

  // If Steam API is not available, return null
  if (!useSteam) {
    console.log("Steam API is not available");
    return null;
  }

  // Check cache first
  let cachedData = gameApiCache.getCachedGame(gameName, "steam");
  if (cachedData) {
    console.log(`Using cached Steam data for: ${gameName}`);
    return cachedData;
  }

  // Get Steam data
  const gameData = await getGameDetailsSteam(gameName, {
    apiKey: steamApiKey,
    enabled: true,
  });

  // Cache the data if we found any
  if (gameData) {
    gameApiCache.cacheGame(gameName, gameData, "steam");
  } else {
    console.log(`No game data found for: ${gameName}`);
  }

  return gameData;
};

/**
 * Format image URL to get the appropriate size
 * @param {string} url - Original image URL from Steam
 * @param {string} size - Size parameter (not used for Steam, kept for compatibility)
 * @returns {string} Formatted image URL
 */
const formatImageUrl = (url, size = "screenshot_big") => {
  if (!url) return null;

  // Fix protocol-relative URLs (starting with //)
  if (url.startsWith("//")) {
    url = `https:${url}`;
  }

  return url;
};

// Export the service functions
export default {
  // Main function to get game details from Steam
  getGameDetails,

  // Individual API functions
  getGameDetailsSteam,

  // Helper functions
  formatImageUrl,
};
