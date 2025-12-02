/**
 * Rating Queue Service
 * Fetches game ratings one at a time with controlled pacing to prevent API flooding
 * and ensure the UI remains responsive.
 */

class RatingQueueService {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.cache = new Map();
    this.subscribers = new Map(); // gameID -> Set of callbacks
    this.delayBetweenRequests = 150; // ms between each request
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes cache
  }

  /**
   * Subscribe to rating updates for a specific game
   * @param {string} gameID - The game ID to get rating for
   * @param {function} callback - Callback function that receives the rating
   * @returns {function} Unsubscribe function
   */
  subscribe(gameID, callback) {
    if (!gameID) return () => {};

    // Check cache first
    const cached = this.cache.get(gameID);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      // Immediately call back with cached value
      setTimeout(() => callback(cached.rating), 0);
      return () => {};
    }

    // Add subscriber
    if (!this.subscribers.has(gameID)) {
      this.subscribers.set(gameID, new Set());
    }
    this.subscribers.get(gameID).add(callback);

    // Add to queue if not already queued
    if (!this.queue.includes(gameID) && !this.cache.has(gameID)) {
      this.queue.push(gameID);
      this.processQueue();
    }

    // Return unsubscribe function
    return () => {
      const subs = this.subscribers.get(gameID);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) {
          this.subscribers.delete(gameID);
          // Remove from queue if no subscribers
          const idx = this.queue.indexOf(gameID);
          if (idx > -1) {
            this.queue.splice(idx, 1);
          }
        }
      }
    };
  }

  /**
   * Process the queue one item at a time
   */
  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const gameID = this.queue.shift();

      // Skip if no subscribers (component unmounted)
      if (!this.subscribers.has(gameID)) continue;

      try {
        const response = await fetch(
          `https://api.ascendara.app/app/v2/gamerating/${gameID}`
        );

        if (response.ok) {
          const data = await response.json();
          const rating = data.rating > 0 ? data.rating : 0;

          // Cache the result
          this.cache.set(gameID, {
            rating,
            timestamp: Date.now(),
          });

          // Notify all subscribers
          const subs = this.subscribers.get(gameID);
          if (subs) {
            subs.forEach(callback => callback(rating));
          }
        }
      } catch (error) {
        console.error(`Error fetching rating for ${gameID}:`, error);
        // Cache a 0 rating on error to prevent retrying immediately
        this.cache.set(gameID, {
          rating: 0,
          timestamp: Date.now(),
        });
      }

      // Wait before processing next item
      if (this.queue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, this.delayBetweenRequests));
      }
    }

    this.isProcessing = false;
  }

  /**
   * Get cached rating if available
   * @param {string} gameID
   * @returns {number|null}
   */
  getCachedRating(gameID) {
    const cached = this.cache.get(gameID);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.rating;
    }
    return null;
  }

  /**
   * Clear the cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Clear expired cache entries
   */
  cleanupCache() {
    const now = Date.now();
    for (const [gameID, data] of this.cache.entries()) {
      if (now - data.timestamp > this.cacheExpiry) {
        this.cache.delete(gameID);
      }
    }
  }
}

// Export singleton instance
const ratingQueueService = new RatingQueueService();
export default ratingQueueService;
