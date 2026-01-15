/**
 * FLiNG Trainer Service
 * Provides integration with FLiNG Trainer website to check game trainer support
 * and download trainers for games.
 */

const FLING_BASE_URL = "https://flingtrainer.com";
const FLING_PROXY_URL = "/api/flingtrainer";
const FLING_SEARCH_URL = "https://flingtrainer.com/?s=";

// Cache for trainer lookups
const trainerCache = new Map();
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

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
 * Convert game name to URL slug format used by FLiNG Trainer
 * @param {string} name - Game name to convert
 * @returns {string} URL slug
 */
const gameNameToSlug = name => {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/['']/g, "") // Remove apostrophes
    .replace(/[^a-z0-9\s-]/g, "") // Remove special characters except hyphens
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Remove multiple hyphens
    .trim();
};

/**
 * Search for trainers on FLiNG website
 * @param {string} gameName - Name of the game to search for
 * @returns {Promise<Array>} Array of trainer results
 */
const searchTrainers = async gameName => {
  if (!gameName) return [];

  try {
    const searchUrl = `${FLING_PROXY_URL}/?s=${encodeURIComponent(gameName)}`;
    const response = await fetch(searchUrl);

    if (!response.ok) {
      console.error("[FlingTrainer] Search request failed:", response.status);
      return [];
    }

    const html = await response.text();
    return parseSearchResults(html, gameName);
  } catch (error) {
    console.error("[FlingTrainer] Error searching for trainers:", error);
    return [];
  }
};

/**
 * Parse search results HTML to extract trainer information
 * @param {string} html - HTML content from search page
 * @param {string} searchTerm - Original search term
 * @returns {Array} Array of trainer objects
 */
const parseSearchResults = (html, searchTerm) => {
  const trainers = [];

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // Find all article elements (trainer entries)
    const articles = doc.querySelectorAll("article");

    articles.forEach(article => {
      const titleElement = article.querySelector(
        "h2.entry-title a, .entry-title a, h2 a"
      );
      const imageElement = article.querySelector("img");

      if (titleElement) {
        const title = titleElement.textContent.trim();
        const url = titleElement.getAttribute("href");

        // Only include if it's a trainer
        if (title.toLowerCase().includes("trainer")) {
          trainers.push({
            name: title.replace(" Trainer", "").replace(" trainer", "").trim(),
            title: title,
            url: url,
            imageUrl: imageElement ? imageElement.getAttribute("src") : null,
          });
        }
      }
    });
  } catch (error) {
    console.error("[FlingTrainer] Error parsing search results:", error);
  }

  return trainers;
};

/**
 * Fetch trainer page and extract download link
 * @param {string} trainerUrl - URL of the trainer page
 * @returns {Promise<Object|null>} Trainer details with download link
 */
const fetchTrainerDetails = async trainerUrl => {
  if (!trainerUrl) return null;

  try {
    // Convert full URL to proxy URL
    const proxyUrl = trainerUrl.replace(FLING_BASE_URL, FLING_PROXY_URL);
    const response = await fetch(proxyUrl);

    if (!response.ok) {
      console.error("[FlingTrainer] Failed to fetch trainer page:", response.status);
      return null;
    }

    const html = await response.text();
    return parseTrainerPage(html, trainerUrl);
  } catch (error) {
    console.error("[FlingTrainer] Error fetching trainer details:", error);
    return null;
  }
};

/**
 * Parse trainer page HTML to extract download link and details
 * @param {string} html - HTML content from trainer page
 * @param {string} pageUrl - Original page URL
 * @returns {Object|null} Trainer details
 */
const parseTrainerPage = (html, pageUrl) => {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    let downloadUrl = null;
    let trainerVersion = "";

    // Look for FLiNG Trainer download links (format: /downloads/[id])
    // The first one in the list is the latest standalone version
    const flingDownloadLinks = doc.querySelectorAll('a[href*="/downloads/"]');
    if (flingDownloadLinks.length > 0) {
      // Get the first download link (latest version)
      const firstLink = flingDownloadLinks[0];
      downloadUrl = firstLink.getAttribute("href");

      // Extract version from link text (e.g., "Astroneer.v1.11-v1.19.Plus.8.Trainer-FLiNG")
      const linkText = firstLink.textContent.trim();
      const versionMatch = linkText.match(/v[\d.]+-v[\d.]+|v[\d.]+/i);
      if (versionMatch) {
        trainerVersion = versionMatch[0];
      }
    }

    // Fallback: Look for direct download links (.zip, .rar, .7z)
    if (!downloadUrl) {
      const archiveLinks = doc.querySelectorAll(
        'a[href*=".zip"], a[href*=".rar"], a[href*=".7z"]'
      );
      for (const link of archiveLinks) {
        const href = link.getAttribute("href");
        if (href) {
          downloadUrl = href;
          break;
        }
      }
    }

    // Get trainer info
    const title =
      doc.querySelector("h1.entry-title, .entry-title, h1")?.textContent?.trim() || "";
    const content = doc.querySelector(".entry-content, article")?.textContent || "";

    // Extract version info from page content if not found in link
    if (!trainerVersion) {
      const contentVersionMatch =
        content.match(/Game Version[:\s]*([^\n]+)/i) ||
        content.match(/v[\d.]+-v[\d.]+/i) ||
        content.match(/v[\d.]+/i);
      trainerVersion = contentVersionMatch ? contentVersionMatch[0] : "";
    }

    // Extract options count
    const optionsMatch = content.match(/(\d+)\s*Options/i);
    const options = optionsMatch ? optionsMatch[1] : "";

    return {
      title: title,
      downloadUrl: downloadUrl,
      pageUrl: pageUrl,
      version: trainerVersion,
      options: options,
    };
  } catch (error) {
    console.error("[FlingTrainer] Error parsing trainer page:", error);
    return null;
  }
};

/**
 * Check if a game has trainer support on FLiNG Trainer
 * @param {string} gameName - Name of the game to check
 * @returns {Promise<{supported: boolean, trainerData: Object|null}>}
 */
const checkTrainerSupport = async gameName => {
  if (!gameName) {
    return { supported: false, trainerData: null };
  }

  const cacheKey = normalizeGameName(gameName);
  const cached = trainerCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  try {
    // Search for trainers
    const trainers = await searchTrainers(gameName);

    if (trainers.length === 0) {
      const result = { supported: false, trainerData: null };
      trainerCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    }

    // Find best match
    const normalizedSearch = normalizeGameName(gameName);
    let bestMatch = trainers[0];

    for (const trainer of trainers) {
      const normalizedName = normalizeGameName(trainer.name);
      if (normalizedName === normalizedSearch) {
        bestMatch = trainer;
        break;
      }
      if (
        normalizedName.includes(normalizedSearch) ||
        normalizedSearch.includes(normalizedName)
      ) {
        bestMatch = trainer;
      }
    }

    // Fetch trainer details to get download link
    const details = await fetchTrainerDetails(bestMatch.url);

    const trainerData = {
      ...bestMatch,
      ...details,
      searchUrl: `${FLING_SEARCH_URL}${encodeURIComponent(gameName)}`,
    };

    const result = { supported: true, trainerData };
    trainerCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  } catch (error) {
    console.error("[FlingTrainer] Error checking trainer support:", error);
    return { supported: false, trainerData: null };
  }
};

/**
 * Get the FLiNG Trainer URL for a game
 * @param {string} gameName - The name of the game
 * @returns {string} URL to the trainer page or search page
 */
const getTrainerUrl = gameName => {
  if (!gameName) return FLING_BASE_URL;
  const slug = gameNameToSlug(gameName);
  return `${FLING_BASE_URL}/trainer/${slug}-trainer/`;
};

/**
 * Get the search URL for a game
 * @param {string} gameName - The name of the game
 * @returns {string} URL to search results
 */
const getSearchUrl = gameName => {
  if (!gameName) return FLING_BASE_URL;
  return `${FLING_SEARCH_URL}${encodeURIComponent(gameName)}`;
};

/**
 * Get all trainers page URL
 * @returns {string} URL to all trainers page
 */
const getAllTrainersUrl = () => {
  return `${FLING_BASE_URL}/all-trainers/`;
};

/**
 * Open trainer page in browser
 * @param {Object} trainerData - Trainer data object with url
 */
const openTrainerPage = trainerData => {
  const url = trainerData?.pageUrl || trainerData?.url || FLING_BASE_URL;
  if (window.electron?.openURL) {
    window.electron.openURL(url);
  } else {
    window.open(url, "_blank");
  }
};

/**
 * Download trainer file to desktop
 * @param {Object} trainerData - Trainer data with downloadUrl
 * @param {string} gameName - Name of the game for the filename
 * @returns {Promise<boolean>} Success status
 */
const downloadTrainer = async (trainerData, gameName) => {
  if (!trainerData?.downloadUrl) {
    console.error("[FlingTrainer] No download URL available");
    return false;
  }

  try {
    // Use Electron to download the file to desktop
    if (window.electron?.downloadToDesktop) {
      const fileName = `${gameName.replace(/[^a-zA-Z0-9]/g, "_")}_Trainer.zip`;
      await window.electron.downloadToDesktop(trainerData.downloadUrl, fileName);
      return true;
    } else {
      // Fallback: open download URL in browser
      window.open(trainerData.downloadUrl, "_blank");
      return true;
    }
  } catch (error) {
    console.error("[FlingTrainer] Error downloading trainer:", error);
    return false;
  }
};

/**
 * Download trainer file directly to game directory
 * @param {Object} trainerData - Trainer data with downloadUrl
 * @param {string} gameName - Name of the game
 * @param {boolean} isCustom - Whether the game is a custom game
 * @returns {Promise<{success: boolean, path?: string, error?: string}>} Download result
 */
const downloadTrainerToGame = async (trainerData, gameName, isCustom = false) => {
  if (!trainerData?.downloadUrl) {
    console.error("[FlingTrainer] No download URL available");
    return { success: false, error: "No download URL available" };
  }

  try {
    if (!window.electron?.downloadTrainerToGame) {
      console.error("[FlingTrainer] Electron API not available");
      return { success: false, error: "Download API not available" };
    }

    const result = await window.electron.downloadTrainerToGame(
      trainerData.downloadUrl,
      gameName,
      isCustom
    );

    return result;
  } catch (error) {
    console.error("[FlingTrainer] Error downloading trainer to game directory:", error);
    return { success: false, error: error.message || "Unknown error" };
  }
};

const flingTrainerService = {
  checkTrainerSupport,
  getTrainerUrl,
  getSearchUrl,
  getAllTrainersUrl,
  openTrainerPage,
  downloadTrainer,
  downloadTrainerToGame,
  normalizeGameName,
  gameNameToSlug,
};

export default flingTrainerService;
