/**
 * SteamGridImageService
 *
 * Resolves Steam-style cover art for games that don't ship with an Ascendara
 * imgID (e.g. Hydra Library custom sources). Image URLs are returned from the
 * SteamGridDB proxy via IPC and cached by game name in both memory and
 * localStorage.
 *
 * Shape:
 *   { gameId, grid, hero, logo, header }
 * All fields may be null when no match is found.
 */

const LS_PREFIX = "ascendara_sgdb_urls::";
const NEGATIVE_TTL = 24 * 60 * 60 * 1000; // 1 day for "not found" entries
const POSITIVE_TTL = 14 * 24 * 60 * 60 * 1000; // 14 days for successful hits

const EMPTY = { gameId: null, grid: null, hero: null, logo: null, header: null };

function normalizeKey(name) {
  if (!name || typeof name !== "string") return null;
  return name.trim().toLowerCase();
}

function lsKey(name) {
  return LS_PREFIX + normalizeKey(name);
}

class SteamGridImageService {
  constructor() {
    this.memoryCache = new Map(); // key -> assets
    this.inflight = new Map(); // key -> Promise<assets>
  }

  _readLS(name) {
    try {
      const raw = localStorage.getItem(lsKey(name));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.timestamp !== "number") return null;
      const hasAny = parsed.grid || parsed.hero || parsed.logo || parsed.header;
      const ttl = hasAny ? POSITIVE_TTL : NEGATIVE_TTL;
      if (Date.now() - parsed.timestamp > ttl) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  _writeLS(name, assets) {
    try {
      localStorage.setItem(
        lsKey(name),
        JSON.stringify({ ...assets, timestamp: Date.now() })
      );
    } catch (e) {
      // Storage quota or disabled - fine to ignore
    }
  }

  /**
   * Synchronous cache peek. Returns null if nothing is cached.
   */
  peek(name) {
    const key = normalizeKey(name);
    if (!key) return null;
    if (this.memoryCache.has(key)) return this.memoryCache.get(key);
    const fromLS = this._readLS(name);
    if (fromLS) {
      const assets = {
        gameId: fromLS.gameId ?? null,
        grid: fromLS.grid ?? null,
        hero: fromLS.hero ?? null,
        logo: fromLS.logo ?? null,
        header: fromLS.header ?? null,
      };
      this.memoryCache.set(key, assets);
      return assets;
    }
    return null;
  }

  /**
   * Lightweight default: resolve ONLY a header image URL for display. Uses
   * 2 upstream requests instead of 5. Returned shape matches EMPTY with only
   * `header` (and `grid` as mirror) populated.
   */
  async getAssets(name) {
    const key = normalizeKey(name);
    if (!key) return { ...EMPTY };

    const cached = this.peek(name);
    if (cached) return cached;

    if (this.inflight.has(key)) return this.inflight.get(key);

    const promise = (async () => {
      let assets = { ...EMPTY };
      try {
        if (window.electron?.getSteamGridHeader) {
          const res = await window.electron.getSteamGridHeader(name);
          if (res && typeof res === "object") {
            assets = {
              gameId: res.gameId ?? null,
              grid: res.url ?? null,
              hero: res.url ?? null,
              logo: null,
              header: res.url ?? null,
            };
          }
        }
      } catch (e) {
        console.warn("[SteamGridImage] header IPC lookup failed for", name, e);
      }
      this.memoryCache.set(key, assets);
      this._writeLS(name, assets);
      return assets;
    })();

    this.inflight.set(key, promise);
    try {
      return await promise;
    } finally {
      this.inflight.delete(key);
    }
  }

  /**
   * Heavier full-asset resolve (grid + hero + logo + header). Only call this
   * when all four variants are actually needed - post-install flows already
   * download the files directly in the main process.
   */
  async getFullAssets(name) {
    const key = normalizeKey(name);
    if (!key) return { ...EMPTY };

    try {
      if (window.electron?.getSteamGridUrls) {
        const res = await window.electron.getSteamGridUrls(name);
        if (res && typeof res === "object") {
          const assets = {
            gameId: res.gameId ?? null,
            grid: res.grid ?? null,
            hero: res.hero ?? null,
            logo: res.logo ?? null,
            header: res.header ?? null,
          };
          this.memoryCache.set(key, assets);
          this._writeLS(name, assets);
          return assets;
        }
      }
    } catch (e) {
      console.warn("[SteamGridImage] full IPC lookup failed for", name, e);
    }
    return { ...EMPTY };
  }

  /**
   * Convenience: pick the best single URL for a given slot.
   *   slot = 'card'   -> prefer hero, fallback grid, header
   *   slot = 'hero'   -> prefer hero, fallback grid
   *   slot = 'header' -> prefer header, fallback grid, hero
   *   slot = 'logo'   -> logo only
   */
  pickUrl(assets, slot = "card") {
    if (!assets) return null;
    switch (slot) {
      case "hero":
        return assets.hero || assets.grid || assets.header || null;
      case "header":
        return assets.header || assets.grid || assets.hero || null;
      case "logo":
        return assets.logo || null;
      case "card":
      default:
        return assets.hero || assets.grid || assets.header || null;
    }
  }
}

const steamGridImageService = new SteamGridImageService();
export default steamGridImageService;
