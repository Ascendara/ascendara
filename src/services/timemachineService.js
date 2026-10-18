// Past versions of a game, from the API's time machine release log
const versionCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds
const API_URL = "https://api.ascendara.app"; // Production API

/** Thrown while the server is still building its version history. */
export class TimemachineBusyError extends Error {
  constructor() {
    super("Time machine history is still being prepared");
    this.name = "TimemachineBusyError";
  }
}

// Older API responses list archives by name; shape them like v2 releases
const fromLegacyVersions = (versions = []) =>
  versions.map(entry => ({
    version: entry.game?.version || "",
    firstSeen: null,
    lastSeen: null,
    live: false,
    legacyDate: entry.metadata?.getDate || null,
    game: entry.game,
  }));

/**
 * Every known version of a game, newest first.
 * @param {{gameID?: string, game?: string}} gameData
 * @returns {Promise<Array<{version: string, firstSeen: string|null,
 *   lastSeen: string|null, live: boolean, game: Object}>>}
 */
export const fetchGameReleases = async gameData => {
  const byId = !!gameData?.gameID;
  const cacheKey = byId ? `id_${gameData.gameID}` : `name_${gameData?.game}`;
  const cached = versionCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  const url = byId
    ? `${API_URL}/json/v2/timemachine/${encodeURIComponent(gameData.gameID)}`
    : `${API_URL}/json/timemachine/game/${encodeURIComponent(gameData.game)}`;
  const response = await fetch(url);

  if (response.status === 503) {
    throw new TimemachineBusyError();
  }
  // The name lookup answers 404 when a game has no archived versions
  if (response.status === 404) {
    return [];
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch versions: ${response.status}`);
  }

  const data = await response.json();
  const releases = byId ? data.releases || [] : fromLegacyVersions(data.versions);
  versionCache.set(cacheKey, { data: releases, timestamp: Date.now() });
  return releases;
};

export const clearVersionCache = () => {
  versionCache.clear();
};
