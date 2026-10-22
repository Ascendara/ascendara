/**
 * ArtworkOverrideService
 *
 * Approved community artwork corrections, keyed by gameID. Results (including
 * "no override") are cached in memory and localStorage so the download page
 * knows which artwork to show on first paint instead of flashing the
 * name-matched artwork and swapping it once the API answers.
 *
 * Shape: { gameID, sgdbGameId, gridId, gridUrl, heroId, heroUrl } or null.
 */

const API_URL = "https://api.ascendara.app/app/artwork/override";
const LS_PREFIX = "ascendara_artwork_override::";
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 2500;

class ArtworkOverrideService {
  constructor() {
    this.memoryCache = new Map(); // gameID -> { override, timestamp }
    this.inflight = new Map(); // gameID -> Promise<override>
  }

  /**
   * Synchronous cache read. Returns undefined when nothing is cached, null when
   * the game is known to have no override.
   */
  peek(gameID) {
    if (!gameID) return undefined;
    const key = String(gameID);
    let entry = this.memoryCache.get(key);
    if (!entry) {
      try {
        entry = JSON.parse(localStorage.getItem(LS_PREFIX + key));
      } catch {
        entry = null;
      }
      if (!entry || typeof entry.timestamp !== "number") return undefined;
      this.memoryCache.set(key, entry);
    }
    if (Date.now() - entry.timestamp > CACHE_TTL) return undefined;
    return entry.override ?? null;
  }

  /**
   * Fetch the current override from the API and refresh the cache. Resolves to
   * the cached value (or null) if the API is slow or unreachable.
   */
  async fetch(gameID) {
    if (!gameID) return null;
    const key = String(gameID);
    if (this.inflight.has(key)) return this.inflight.get(key);

    const promise = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(`${API_URL}/${encodeURIComponent(key)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const { override } = await response.json();
        const entry = { override: override || null, timestamp: Date.now() };
        this.memoryCache.set(key, entry);
        try {
          localStorage.setItem(LS_PREFIX + key, JSON.stringify(entry));
        } catch {
          // Storage quota or disabled - memory cache still works
        }
        return entry.override;
      } catch {
        return this.peek(key) ?? null;
      } finally {
        clearTimeout(timer);
      }
    })();

    this.inflight.set(key, promise);
    try {
      return await promise;
    } finally {
      this.inflight.delete(key);
    }
  }
}

const artworkOverrideService = new ArtworkOverrideService();
export default artworkOverrideService;
