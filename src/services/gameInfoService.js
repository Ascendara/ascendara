/**
 * Game Data Service
 * Handles fetching game data from multiple APIs:
 * - IGDB (via Twitch): https://api-docs.igdb.com/#authentication
 * - GiantBomb: https://www.giantbomb.com/api/
 */

// Import cache service
import gameApiCache from "./gameInfoCacheService";

// Constants for APIs
const isDev = import.meta.env.DEV;

// IGDB API endpoints
const IGDB_API_URL = isDev ? "/api/igdb" : "https://api.igdb.com/v4";
const TWITCH_AUTH_URL = "https://id.twitch.tv/oauth2/token";

// GiantBomb API endpoints
const GIANTBOMB_API_URL = isDev ? "/api/giantbomb" : "https://www.giantbomb.com/api";

/**
 * Get Twitch access token for IGDB
 * @returns {Promise<string>} Access token
 */
const getTwitchToken = async (clientId, clientSecret) => {
  try {
    const response = await fetch(
      `${TWITCH_AUTH_URL}?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
      {
        method: "POST",
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get Twitch token: ${response.status}`);
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error("Error getting Twitch token:", error);
    throw error;
  }
};

/**
 * Search for a game by name using IGDB
 * @param {string} gameName - Name of the game to search for
 * @param {string} clientId - Twitch Client ID
 * @param {string} accessToken - Twitch Access Token
 * @returns {Promise<Object>} Game data
 */
const searchGameIGDB = async (gameName, clientId, accessToken) => {
  try {
    const body = `search "${gameName}"; fields name,summary,storyline,rating,cover.url,screenshots.url,genres.name,platforms.name,release_dates.human,involved_companies.company.name,involved_companies.developer,involved_companies.publisher; limit 1;`;

    // In production (Electron), use IPC to bypass CORS
    if (!isDev && window.electron?.igdbRequest) {
      const result = await window.electron.igdbRequest(
        "games",
        body,
        clientId,
        accessToken
      );
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data.length > 0 ? result.data[0] : null;
    }

    // In dev mode, use Vite proxy
    const response = await fetch(`${IGDB_API_URL}/games`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Client-ID": clientId,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`IGDB API error: ${response.status}`);
    }

    const games = await response.json();
    return games.length > 0 ? games[0] : null;
  } catch (error) {
    console.error("Error searching for game on IGDB:", error);
    return null;
  }
};

/**
 * Get game screenshots from IGDB
 * @param {number} gameId - IGDB Game ID
 * @param {string} clientId - Twitch Client ID
 * @param {string} accessToken - Twitch Access Token
 * @returns {Promise<Array>} Screenshots array
 */
const getGameScreenshotsIGDB = async (gameId, clientId, accessToken) => {
  try {
    const body = `fields *; where game = ${gameId}; limit 10;`;

    // In production (Electron), use IPC to bypass CORS
    if (!isDev && window.electron?.igdbRequest) {
      const result = await window.electron.igdbRequest(
        "screenshots",
        body,
        clientId,
        accessToken
      );
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    }

    // In dev mode, use Vite proxy
    const response = await fetch(`${IGDB_API_URL}/screenshots`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Client-ID": clientId,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`IGDB API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error getting game screenshots from IGDB:", error);
    return [];
  }
};

/**
 * Search for a game by name using GiantBomb
 * @param {string} gameName - Name of the game to search for
 * @param {string} apiKey - GiantBomb API Key
 * @returns {Promise<Object>} Game data
 */
const searchGameGiantBomb = async (gameName, apiKey) => {
  try {
    // URL encode the game name
    const encodedGameName = encodeURIComponent(gameName);
    const url = `${GIANTBOMB_API_URL}/search/?api_key=${apiKey}&format=json&query=${encodedGameName}&resources=game&limit=1`;

    // Set up headers
    const headers = {
      Accept: "application/json",
      "User-Agent": "Ascendara Game Library (contact@ascendara.com)",
    };

    // In production, we need to add CORS headers
    if (!isDev) {
      headers["Access-Control-Allow-Origin"] = "*";
    }

    const response = await fetch(url, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      throw new Error(`GiantBomb API error: ${response.status}`);
    }

    const data = await response.json();

    console.log("GiantBomb search response:", data);

    if (data.error === "OK" && data.results && data.results.length > 0) {
      return data.results[0];
    }

    return null;
  } catch (error) {
    console.error("Error searching for game on GiantBomb:", error);
    return null;
  }
};

/**
 * Get detailed game info from GiantBomb by ID
 * @param {string} gameId - GiantBomb Game ID/GUID
 * @param {string} apiKey - GiantBomb API Key
 * @returns {Promise<Object>} Detailed game data
 */
const getGameDetailByIdGiantBomb = async (gameId, apiKey) => {
  try {
    console.log(`Fetching GiantBomb details for game ID: ${gameId}`);

    // Construct the URL with the game ID and API key
    // Include fields parameter to request specific data including images
    const url = `https://www.giantbomb.com/api/game/${gameId}/?api_key=${apiKey}&format=json&field_list=id,name,deck,description,image,images,genres,platforms,videos,original_release_date,site_detail_url,aliases`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`GiantBomb API error: ${response.status}`);
    }

    const data = await response.json();

    console.log("GiantBomb detail response:", data);

    if (data.error === "OK" && data.results) {
      return data.results;
    }

    return null;
  } catch (error) {
    console.error("Error getting game details from GiantBomb:", error);
    return null;
  }
};

/**
 * Get game details from GiantBomb
 * @param {string} gameName - Name of the game
 * @param {Object} config - Configuration with apiKey
 * @returns {Promise<Object>} Game details
 */
const getGameDetailsGiantBomb = async (gameName, config) => {
  try {
    console.log(`Fetching GiantBomb data for: ${gameName}`);

    // Extract config values
    const apiKey = config.apiKey;

    // Skip if missing credentials
    if (!apiKey) {
      console.log("GiantBomb integration is missing API key");
      return null;
    }

    // Search for the game
    const searchResult = await searchGameGiantBomb(gameName, apiKey);

    console.log("GiantBomb search result:", searchResult);

    if (!searchResult) {
      console.log(`No GiantBomb results found for: ${gameName}`);
      return null;
    }

    // Get detailed game info
    const gameDetails = await getGameDetailByIdGiantBomb(searchResult.guid, apiKey);

    if (!gameDetails) {
      console.log(
        `No detailed GiantBomb data found for: ${gameName} (${searchResult.guid})`
      );
      // Format basic search result to match IGDB format
      return formatGiantBombToIgdbFormat(searchResult);
    }

    // Process and format the game data to match IGDB format
    const formattedDetails = formatGiantBombToIgdbFormat(gameDetails);

    console.log(`Successfully processed GiantBomb data for: ${gameName}`);

    // Cache the processed game data
    gameApiCache.cacheGame(gameName, formattedDetails, "giantbomb");

    return formattedDetails;
  } catch (error) {
    console.error("Error getting game details from GiantBomb:", error);
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
 * Format GiantBomb data to match IGDB format for compatibility
 * @param {Object} giantBombData - Raw GiantBomb data
 * @returns {Object} Formatted data in IGDB-compatible format
 */
const formatGiantBombToIgdbFormat = giantBombData => {
  if (!giantBombData) return null;

  // Extract image URLs
  const screenshots = [];

  // Add main image if available
  if (giantBombData.image) {
    screenshots.push({
      id: `gb-main-${giantBombData.id}`,
      url: giantBombData.image.original_url,
      image_id: `gb-main-${giantBombData.id}`,
      width: giantBombData.image.width || 1920,
      height: giantBombData.image.height || 1080,
      formatted_url: giantBombData.image.original_url,
    });
  }

  // Add additional images if available
  if (giantBombData.images && Array.isArray(giantBombData.images)) {
    giantBombData.images.forEach((image, index) => {
      // Only add screenshots (type: "screenshot")
      if (image.tags && image.tags.includes("Screenshot")) {
        screenshots.push({
          id: `gb-${image.id || index}`,
          image_id: `gb-${image.id || index}`,
          url: image.original_url,
          width: image.width || 1920,
          height: image.height || 1080,
          formatted_url: image.original_url,
        });
      }
    });
  }

  // Extract platforms
  const platforms = [];
  if (giantBombData.platforms && Array.isArray(giantBombData.platforms)) {
    giantBombData.platforms.forEach(platform => {
      platforms.push({
        id: platform.id,
        name: platform.name,
        abbreviation: platform.abbreviation || "",
      });
    });
  }

  // Extract genres
  const genres = [];
  if (giantBombData.genres && Array.isArray(giantBombData.genres)) {
    giantBombData.genres.forEach(genre => {
      genres.push({
        id: genre.id,
        name: genre.name,
      });
    });
  }

  // Get a clean description - prioritize the deck (summary) field
  let cleanDescription = "";
  if (giantBombData.deck) {
    // The deck field might still have HTML, so strip it
    cleanDescription = stripHtmlTags(giantBombData.deck);
  } else if (giantBombData.description) {
    // For description, we might just need to strip HTML without further processing
    cleanDescription = stripHtmlTags(giantBombData.description);
  }

  // Store the full description separately for detailed views if needed
  // This is only needed if we want to display the full description elsewhere
  const fullCleanDescription = giantBombData.description
    ? cleanDescriptionText(giantBombData.description)
    : "";

  // Parse system requirements
  const systemRequirements = parseSystemRequirements(giantBombData.description || "");

  // Extract game features
  const features = extractGameFeatures(giantBombData.description || "");

  // Extract release date in a cleaner format
  let releaseDate = giantBombData.original_release_date || "";
  if (releaseDate) {
    try {
      const dateObj = new Date(releaseDate);
      releaseDate = dateObj.toISOString().split("T")[0]; // Format as YYYY-MM-DD
    } catch (e) {
      console.error("Error formatting release date:", e);
    }
  }

  // Format the data to match IGDB structure
  return {
    id: giantBombData.id,
    name: giantBombData.name,
    summary: cleanDescription,
    description: cleanDescription,
    storyline: null, // GiantBomb doesn't provide a separate storyline field

    // Store the full description separately
    full_description: fullCleanDescription,

    // IGDB specific fields with GiantBomb data
    cover: giantBombData.image
      ? {
          id: giantBombData.id,
          image_id: giantBombData.id,
          url: giantBombData.image.original_url,
          width: giantBombData.image.width || 1920,
          height: giantBombData.image.height || 1080,
          formatted_url: giantBombData.image.original_url,
        }
      : null,

    screenshots: screenshots,
    formatted_screenshots: screenshots,
    videos: giantBombData.videos || [],
    similar_games: [],
    genres: genres,
    platforms: platforms,

    // Additional GiantBomb specific fields
    aliases: giantBombData.aliases || "",
    release_date: releaseDate,
    site_detail_url: giantBombData.site_detail_url,

    // Structured system requirements
    system_requirements: systemRequirements,

    // Game features
    features: features,

    // Source information
    source: "giantbomb",
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
 * Get game details from IGDB
 * @param {string} gameName - Name of the game
 * @param {Object} config - Configuration with clientId and clientSecret
 * @returns {Promise<Object>} Game details
 */
const getGameDetailsIGDB = async (gameName, config = {}) => {
  try {
    console.log(`Fetching IGDB data for: ${gameName}`);

    // Extract config values
    const clientId = config.clientId;
    const clientSecret = config.clientSecret;

    // Skip if missing credentials
    if (!clientId || !clientSecret) {
      console.log("IGDB integration is missing credentials");
      return null;
    }

    // Get access token
    const accessToken = await getTwitchToken(clientId, clientSecret);

    // Search for the game
    const game = await searchGameIGDB(gameName, clientId, accessToken);

    if (!game) {
      return null;
    }

    // Process the game data
    const gameDetails = {
      id: game.id,
      name: game.name,
      summary: game.summary,
      storyline: game.storyline,
      rating: game.rating,
      cover: game.cover,
      screenshots: game.screenshots || [],
      genres: game.genres || [],
      platforms: game.platforms || [],
      release_date: game.release_dates?.[0]?.human,
    };

    // Extract developers and publishers
    if (game.involved_companies) {
      gameDetails.developers = game.involved_companies
        .filter(company => company.developer)
        .map(company => company.company.name);

      gameDetails.publishers = game.involved_companies
        .filter(company => company.publisher)
        .map(company => company.company.name);
    }

    // Get additional screenshots if needed
    if (game.screenshots?.length < 3 && game.id) {
      const additionalScreenshots = await getGameScreenshotsIGDB(
        game.id,
        clientId,
        accessToken
      );

      if (additionalScreenshots.length > 0) {
        gameDetails.screenshots = additionalScreenshots;
      }
    }

    // Cache the processed game data
    gameApiCache.cacheGame(gameName, gameDetails, "igdb");

    return gameDetails;
  } catch (error) {
    console.error("Error getting game details from IGDB:", error);
    return null;
  }
};

/**
 * Get game details from all available APIs
 * @param {string} gameName - Name of the game
 * @param {Object} config - Configuration with API credentials
 * @returns {Promise<Object>} Combined game details from all APIs
 */
const getGameDetails = async (gameName, config = {}) => {
  console.log("getGameDetails config:", config);

  // Extract credentials from config
  const clientId = config.clientId || "";
  const clientSecret = config.clientSecret || "";

  // Extract GiantBomb API key - check both formats for backward compatibility
  let giantBombApiKey = "";
  if (config.giantbomb && config.giantbomb.apiKey) {
    giantBombApiKey = config.giantbomb.apiKey;
  } else if (config.giantBombKey) {
    giantBombApiKey = config.giantBombKey;
  }

  console.log(
    "IGDB credentials:",
    clientId ? "Set" : "Not set",
    clientSecret ? "Set" : "Not set"
  );
  console.log("GiantBomb API key:", giantBombApiKey ? "Set" : "Not set");

  // Check if IGDB is enabled (has valid credentials)
  const useIgdb =
    clientId && clientSecret && clientId.trim() !== "" && clientSecret.trim() !== "";

  // Check if GiantBomb is enabled (has valid API key)
  const useGiantBomb = giantBombApiKey && giantBombApiKey.trim() !== "";

  console.log("Using IGDB:", useIgdb);
  console.log("Using GiantBomb:", useGiantBomb);

  // If no API is enabled, return null
  if (!useIgdb && !useGiantBomb) {
    console.log("No game API integration is enabled");
    return null;
  }

  // Check cache first
  let cachedData = gameApiCache.getCachedGame(gameName, "combined");
  if (cachedData) {
    console.log(`Using cached combined data for: ${gameName}`);
    return cachedData;
  }

  // Results object
  let gameData = null;

  // Try IGDB first if enabled
  if (useIgdb) {
    gameData = await getGameDetailsIGDB(gameName, {
      clientId,
      clientSecret,
      enabled: true,
    });

    if (gameData) {
      gameData.source = "igdb";

      // Format screenshots for IGDB data
      if (gameData.screenshots && gameData.screenshots.length > 0) {
        gameData.formatted_screenshots = gameData.screenshots.map(screenshot => ({
          ...screenshot,
          formatted_url: formatImageUrl(screenshot.url, "screenshot_huge"),
        }));
      }
    }
  }

  // If no IGDB data or IGDB not enabled, try GiantBomb
  if (!gameData && useGiantBomb) {
    gameData = await getGameDetailsGiantBomb(gameName, {
      apiKey: giantBombApiKey,
      enabled: true,
    });

    // GiantBomb data is already formatted to match IGDB format in the formatGiantBombToIgdbFormat function
  }

  // Cache the data if we found any
  if (gameData) {
    gameApiCache.cacheGame(gameName, gameData, "combined");
  } else {
    console.log(`No game data found for: ${gameName}`);
  }

  return gameData;
};

/**
 * Format image URL to get the appropriate size
 * @param {string} url - Original image URL from IGDB or GiantBomb
 * @param {string} size - Size of the image (e.g., 'cover_big', 'screenshot_huge')
 * @returns {string} Formatted image URL
 */
const formatImageUrl = (url, size = "screenshot_big") => {
  if (!url) return null;

  // Check if it's a GiantBomb URL
  if (url.includes("giantbomb.com")) {
    // GiantBomb URLs don't need size formatting, just return the original
    return url;
  }

  // Handle IGDB URL
  // Replace the size in the URL
  // Original URL format: //images.igdb.com/igdb/image/upload/t_thumb/co1wyy.jpg
  return url.replace("t_thumb", `t_${size}`).replace("//", "https://");
};

// Export the service functions
export default {
  // Main function to get game details from all APIs
  getGameDetails,

  // Individual API functions
  getGameDetailsIGDB,
  getGameDetailsGiantBomb,

  // Helper functions
  formatImageUrl,
};
