// Module-level caches so game artwork survives page switches (Library <-> GameScreen)
// without re-fetching via IPC. Keyed by game name; values are data URLs (or null
// when we've confirmed the asset doesn't exist).
export const gameImageCache = new Map();
export const heroImageCache = new Map();
export const logoImageCache = new Map();

export const clearGameImageCaches = gameId => {
  gameImageCache.delete(gameId);
  heroImageCache.delete(gameId);
  logoImageCache.delete(gameId);
};
