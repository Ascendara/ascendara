const CHEAPSHARK_API_BASE = "https://www.cheapshark.com/api/1.0";

/**
 * Search for a game by title and get its price info
 * @param {string} title - Game title to search for
 * @returns {Promise<Object|null>} Game data with price info or null if not found
 */
export async function searchGame(title) {
  try {
    const response = await fetch(
      `${CHEAPSHARK_API_BASE}/games?title=${encodeURIComponent(title)}&limit=5`
    );
    if (!response.ok) return null;

    const games = await response.json();
    if (!games || games.length === 0) return null;

    // Find best match (exact or closest match)
    const normalizedTitle = title.toLowerCase().trim();
    const exactMatch = games.find(
      g => g.external?.toLowerCase().trim() === normalizedTitle
    );

    return exactMatch || games[0];
  } catch (error) {
    console.error("CheapShark search error:", error);
    return null;
  }
}

/**
 * Get detailed game info including all deals
 * @param {string} gameId - CheapShark game ID
 * @returns {Promise<Object|null>} Detailed game info with deals
 */
export async function getGameDetails(gameId) {
  try {
    const response = await fetch(`${CHEAPSHARK_API_BASE}/games?id=${gameId}`);
    if (!response.ok) return null;

    return await response.json();
  } catch (error) {
    console.error("CheapShark game details error:", error);
    return null;
  }
}

/**
 * Get the highest (retail/normal) price for a game
 * This returns the most expensive price found, which is typically the original retail price
 * @param {string} title - Game title
 * @returns {Promise<{price: number, title: string}|null>} Price info or null
 */
export async function getRetailPrice(title) {
  try {
    const game = await searchGame(title);
    if (!game) return null;

    // Get detailed info to find the highest normal price across all stores
    const details = await getGameDetails(game.gameID);
    if (!details || !details.deals || details.deals.length === 0) {
      // Fallback to the search result's cheapest price info
      return {
        price: parseFloat(game.cheapest) || 0,
        title: game.external,
        gameId: game.gameID,
      };
    }

    // Find the highest normalPrice (retail price) across all deals
    let highestPrice = 0;
    for (const deal of details.deals) {
      const normalPrice = parseFloat(deal.retailPrice || deal.normalPrice) || 0;
      if (normalPrice > highestPrice) {
        highestPrice = normalPrice;
      }
    }

    return {
      price: highestPrice,
      title: details.info?.title || game.external,
      gameId: game.gameID,
      thumb: details.info?.thumb,
    };
  } catch (error) {
    console.error("CheapShark retail price error:", error);
    return null;
  }
}

/**
 * Calculate total library value for multiple games
 * @param {string[]} gameTitles - Array of game titles
 * @param {function} onProgress - Optional callback for progress updates (current, total, gameName, price)
 * @returns {Promise<{totalValue: number, games: Array, notFound: string[]}>}
 */
export async function calculateLibraryValue(gameTitles, onProgress) {
  const results = {
    totalValue: 0,
    games: [],
    notFound: [],
  };

  for (let i = 0; i < gameTitles.length; i++) {
    const title = gameTitles[i];

    // Add a small delay to avoid rate limiting
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    const priceInfo = await getRetailPrice(title);

    if (priceInfo && priceInfo.price > 0) {
      results.games.push({
        title: priceInfo.title,
        originalTitle: title,
        price: priceInfo.price,
        gameId: priceInfo.gameId,
        thumb: priceInfo.thumb,
      });
      results.totalValue += priceInfo.price;
    } else {
      results.notFound.push(title);
    }

    if (onProgress) {
      onProgress(i + 1, gameTitles.length, title, priceInfo?.price || 0);
    }
  }

  return results;
}

export default {
  searchGame,
  getGameDetails,
  getRetailPrice,
  calculateLibraryValue,
};
