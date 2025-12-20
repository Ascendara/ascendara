/**
 * Installed Games Service
 * Caches the list of installed games to prevent repeated IPC calls
 * from every GameCard component.
 */

class InstalledGamesService {
  constructor() {
    this.cache = null;
    this.cacheTimestamp = 0;
    this.cacheExpiry = 10000; // 10 seconds cache
    this.loadPromise = null;
    this.subscribers = new Set();
  }

  /**
   * Get installed games with caching
   * @returns {Promise<Array>} List of installed games
   */
  async getInstalledGames() {
    const now = Date.now();

    // Return cached data if valid
    if (this.cache && now - this.cacheTimestamp < this.cacheExpiry) {
      return this.cache;
    }

    // If already loading, wait for that promise
    if (this.loadPromise) {
      return this.loadPromise;
    }

    // Load fresh data
    this.loadPromise = this._loadGames();

    try {
      const games = await this.loadPromise;
      this.cache = games;
      this.cacheTimestamp = Date.now();
      return games;
    } finally {
      this.loadPromise = null;
    }
  }

  async _loadGames() {
    try {
      const games = await window.electron.getGames();
      return games || [];
    } catch (error) {
      console.error("[InstalledGamesService] Error loading games:", error);
      return [];
    }
  }

  /**
   * Check if a specific game is installed
   * @param {string} gameName - The game name to check
   * @returns {Promise<{isInstalled: boolean, needsUpdate: boolean, installedGame: object|null}>}
   */
  async checkGameStatus(gameName, newVersion) {
    const games = await this.getInstalledGames();
    const installedGame = games.find(ig => ig.game === gameName);

    if (!installedGame) {
      return { isInstalled: false, needsUpdate: false, installedGame: null };
    }

    if (newVersion) {
      const installedVersion = installedGame.version || "0.0.0";
      const needsUpdate = installedVersion !== newVersion;
      return {
        isInstalled: !needsUpdate,
        needsUpdate,
        installedGame,
      };
    }

    return { isInstalled: true, needsUpdate: false, installedGame };
  }

  /**
   * Invalidate the cache (call when games are installed/uninstalled)
   */
  invalidateCache() {
    this.cache = null;
    this.cacheTimestamp = 0;
    this.notifySubscribers();
  }

  /**
   * Subscribe to cache invalidation events
   * @param {function} callback
   * @returns {function} Unsubscribe function
   */
  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  notifySubscribers() {
    this.subscribers.forEach(cb => cb());
  }
}

const installedGamesService = new InstalledGamesService();
export default installedGamesService;
