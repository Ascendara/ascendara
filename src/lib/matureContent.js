// Genre/category labels that stay hidden unless "Mature Content" is on in settings.
// Matched loosely: indexes and custom sources spell these differently.
const MATURE_CATEGORY =
  /\b(?:nudity|nsfw|sexual|sex|adult|hentai|porn\w*|erotic\w*|18\+)(?:\b|$)/i;

export const isMatureCategory = category =>
  typeof category === "string" && MATURE_CATEGORY.test(category.trim());

export const visibleCategories = (categories, showMature) =>
  showMature ? categories : categories.filter(category => !isMatureCategory(category));

// Catalogue entries keep their genres in `category`; other sources use genre(s).
const gameCategories = game => {
  const value = game?.category || game?.genre || game?.genres;
  if (Array.isArray(value))
    return value.map(item => (typeof item === "string" ? item : item?.name));
  return typeof value === "string" ? value.split(",") : [];
};

export const isMatureGame = game => gameCategories(game).some(isMatureCategory);

// The full list still backs updates and installed games; only browsing hides them.
export const filterMatureGames = (games, showMature) =>
  showMature || !Array.isArray(games) ? games : games.filter(game => !isMatureGame(game));
