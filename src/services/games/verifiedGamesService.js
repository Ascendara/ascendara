class VerifiedGamesService {
  constructor() {
    this.verifiedGameIds = new Set();
    this.isLoaded = false;
    this.isLoading = false;
    this.loadPromise = null;
    this.cacheKey = "verified-game-ids";
    this.cacheTimestampKey = "verified-game-ids-timestamp";
    this.cacheDuration = 24 * 60 * 60 * 1000; // 24 hours
  }

  async loadVerifiedGames() {
    if (this.isLoaded) {
      return this.verifiedGameIds;
    }

    if (this.isLoading) {
      return this.loadPromise;
    }

    this.isLoading = true;
    this.loadPromise = this._fetchVerifiedGames();

    try {
      await this.loadPromise;
      return this.verifiedGameIds;
    } finally {
      this.isLoading = false;
      this.loadPromise = null;
    }
  }

  async _fetchVerifiedGames() {
    try {
      // Check cache first
      const cached = this._getCachedData();
      if (cached) {
        this.verifiedGameIds = new Set(cached);
        this.isLoaded = true;
        return;
      }

      // Fetch from API
      const response = await fetch("https://api.ascendara.app/v3/verifiedgames");

      if (!response.ok) {
        throw new Error(`Failed to fetch verified games: ${response.status}`);
      }

      const data = await response.json();

      if (Array.isArray(data)) {
        this.verifiedGameIds = new Set(data);
        this.isLoaded = true;

        // Cache the data
        this._setCachedData(data);
      }
    } catch (error) {
      console.error("Error loading verified games:", error);
      // If fetch fails, try to use expired cache as fallback
      const expiredCache = localStorage.getItem(this.cacheKey);
      if (expiredCache) {
        try {
          const data = JSON.parse(expiredCache);
          this.verifiedGameIds = new Set(data);
          this.isLoaded = true;
        } catch (e) {
          console.error("Error parsing expired cache:", e);
        }
      }
    }
  }

  _getCachedData() {
    try {
      const cached = localStorage.getItem(this.cacheKey);
      const timestamp = localStorage.getItem(this.cacheTimestampKey);

      if (!cached || !timestamp) {
        return null;
      }

      const age = Date.now() - parseInt(timestamp, 10);
      if (age > this.cacheDuration) {
        return null;
      }

      return JSON.parse(cached);
    } catch (error) {
      console.error("Error reading verified games cache:", error);
      return null;
    }
  }

  _setCachedData(data) {
    try {
      localStorage.setItem(this.cacheKey, JSON.stringify(data));
      localStorage.setItem(this.cacheTimestampKey, Date.now().toString());
    } catch (error) {
      console.error("Error caching verified games:", error);
    }
  }

  isVerified(gameId) {
    return this.verifiedGameIds.has(gameId);
  }

  clearCache() {
    localStorage.removeItem(this.cacheKey);
    localStorage.removeItem(this.cacheTimestampKey);
    this.verifiedGameIds.clear();
    this.isLoaded = false;
  }
}

const verifiedGamesService = new VerifiedGamesService();
export default verifiedGamesService;
