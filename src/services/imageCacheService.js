/**
 * ImageCacheService - A simplified and robust image caching service
 */
import gameService from "./gameService";

class ImageCacheService {
  constructor() {
    // Core caching
    this.memoryCache = new Map(); // imgID -> { url, quality }
    this.memoryCacheOrder = [];
    this.maxMemoryCacheSize = 200; // Increased for local index
    this.db = null;
    this.isInitialized = false;
    this.initPromise = null;
    this.initRetries = 0;
    this.maxInitRetries = 3;

    // Request management
    this.activeRequests = new Map();
    this.maxConcurrentRequests = 16; // Increased for local loading
    this.retryDelay = 2000;
    this.maxRetries = 2;

    // Preloading and prioritization
    this.preloadQueue = new Set();
    this.visibleImages = new Set();
    this.priorityQueue = [];
    this.lowPriorityQueue = [];
    this.processingQueue = false;

    // 404 error tracking
    this.recent404Count = 0;
    this.max404BeforeClear = 4;

    // Settings cache to avoid repeated IPC calls
    this._settingsCache = null;
    this._settingsCacheTime = 0;
    this._settingsCacheDuration = 30000; // 30 seconds - longer cache for settings
    this._settingsLoadPromise = null;

    // Initialize settings eagerly (non-blocking)
    this._preloadSettings();

    // Initialize
    this.initPromise = this.initializeDB();
  }

  /**
   * Preload settings on service initialization
   */
  _preloadSettings() {
    if (!this._settingsLoadPromise) {
      this._settingsLoadPromise = window.electron
        .getSettings()
        .then(settings => {
          this._settingsCache = settings;
          this._settingsCacheTime = Date.now();
          this._settingsLoadPromise = null;
          return settings;
        })
        .catch(err => {
          console.warn("[ImageCache] Failed to preload settings:", err);
          this._settingsLoadPromise = null;
          return null;
        });
    }
    return this._settingsLoadPromise;
  }

  /**
   * Get cached settings or fetch fresh ones
   * Returns cached value immediately if available, otherwise waits for load
   */
  async _getSettings() {
    const now = Date.now();

    // Return cached settings if valid
    if (
      this._settingsCache &&
      now - this._settingsCacheTime < this._settingsCacheDuration
    ) {
      return this._settingsCache;
    }

    // If already loading, wait for that promise
    if (this._settingsLoadPromise) {
      return this._settingsLoadPromise;
    }

    // Load fresh settings
    return this._preloadSettings();
  }

  /**
   * Get settings synchronously if cached, null otherwise
   * Use this for non-blocking checks
   */
  _getSettingsSync() {
    const now = Date.now();
    if (
      this._settingsCache &&
      now - this._settingsCacheTime < this._settingsCacheDuration
    ) {
      return this._settingsCache;
    }
    // Trigger async load but don't wait
    this._preloadSettings();
    return this._settingsCache; // May be stale or null
  }

  /**
   * Invalidate settings cache (call when settings change)
   */
  invalidateSettingsCache() {
    this._settingsCache = null;
    this._settingsCacheTime = 0;
  }

  async initializeDB() {
    if (this.initRetries >= this.maxInitRetries) {
      console.warn(
        "[ImageCache] Max init retries reached, continuing with memory-only cache"
      );
      this.isInitialized = true;
      return;
    }

    try {
      // Check if IndexedDB is available
      if (!window.indexedDB) {
        console.warn(
          "[ImageCache] IndexedDB not available, continuing with memory-only cache"
        );
        this.isInitialized = true;
        return;
      }

      const request = indexedDB.open("ImageCache", 1);

      return new Promise((resolve, reject) => {
        let hasErrored = false;

        request.onupgradeneeded = event => {
          try {
            const db = event.target.result;
            if (!db.objectStoreNames.contains("images")) {
              db.createObjectStore("images", { keyPath: "id" });
            }
          } catch (error) {
            console.error("[ImageCache] Error during database upgrade:", error);
            hasErrored = true;
          }
        };

        request.onsuccess = event => {
          if (hasErrored) {
            this.retryInitialization(resolve);
            return;
          }

          try {
            this.db = event.target.result;
            this.isInitialized = true;
            console.log(
              "[ImageCache] Ascendara Image Cache service initialized, IndexedDB ready"
            );
            resolve();
          } catch (error) {
            this.retryInitialization(resolve);
          }
        };

        request.onerror = () => {
          this.retryInitialization(resolve);
        };
      });
    } catch (error) {
      console.warn("[ImageCache] IndexedDB initialization failed:", error);
      this.retryInitialization();
    }
  }

  async retryInitialization(resolve) {
    this.initRetries++;
    console.warn(
      `[ImageCache] Retrying initialization (attempt ${this.initRetries}/${this.maxInitRetries})`
    );

    if (this.initRetries < this.maxInitRetries) {
      setTimeout(() => {
        this.initPromise = this.initializeDB();
        if (resolve) this.initPromise.then(resolve);
      }, 1000);
    } else {
      console.warn(
        "[ImageCache] Max init retries reached, continuing with memory-only cache"
      );
      this.isInitialized = true;
      if (resolve) resolve();
    }
  }

  /**
   * Get image URL for given imgID. Uses LRU memory cache, local files (if local index), IndexedDB, and deduplication.
   * If the image is requested multiple times concurrently, all requests await the same promise.
   */
  async getImage(imgID, options = { priority: "normal", quality: "high" }) {
    if (!imgID) return null;

    // Check memory cache FIRST - no async needed, instant return
    if (this.memoryCache.has(imgID)) {
      const cached = this.memoryCache.get(imgID);
      // Move to most recently used
      this.memoryCacheOrder = this.memoryCacheOrder.filter(id => id !== imgID);
      this.memoryCacheOrder.push(imgID);

      // Return if we have high quality or requested quality
      if (
        cached.quality === "high" ||
        options.quality === "low" ||
        cached.quality === options.quality
      ) {
        return cached.url;
      }
    }

    // If already being loaded, return the existing promise (deduplication)
    if (this.activeRequests.has(imgID)) {
      return this.activeRequests.get(imgID);
    }

    // Get settings to determine if local index
    const settings = await this._getSettings();
    const isLocalIndex = settings?.usingLocalIndex && settings?.localIndex;

    // For local index - load directly from disk (no IndexedDB wait needed)
    // When using local index, NEVER fall back to API
    if (isLocalIndex) {
      const loadPromise = this._loadLocalImage(imgID, settings.localIndex);
      this.activeRequests.set(imgID, loadPromise);

      try {
        const result = await loadPromise;
        return result; // Return result even if null - don't fall back to API
      } catch (error) {
        console.warn(`[ImageCache] Failed to load local image ${imgID}:`, error);
        return null; // Return null instead of falling through to API
      } finally {
        this.activeRequests.delete(imgID);
      }
    }

    // For API images only (not using local index), wait for IndexedDB initialization
    await this.initPromise;

    // Try IndexedDB cache if available (only for API images)
    if (this.db) {
      try {
        const cachedImage = await this.getFromIndexedDB(imgID);
        if (cachedImage) {
          const url = URL.createObjectURL(cachedImage);
          this._setMemoryCache(imgID, url);
          return url;
        }
      } catch (error) {
        console.warn(`[ImageCache] Failed to read from IndexedDB for ${imgID}:`, error);
      }
    }

    // Load from API (only when NOT using local index)
    const loadPromise = this._loadFromAPI(imgID, settings, options);
    this.activeRequests.set(imgID, loadPromise);

    try {
      const result = await loadPromise;
      this._setMemoryCache(imgID, result);
      return result;
    } catch (error) {
      this.activeRequests.delete(imgID);
      throw error;
    } finally {
      this.activeRequests.delete(imgID);
    }
  }

  /**
   * Load image from local disk (for local index) - always high quality
   */
  async _loadLocalImage(imgID, localIndexPath) {
    const localImagePath = `${localIndexPath}/imgs/${imgID}.jpg`;
    const localImageUrl = await window.electron.getLocalImageUrl(localImagePath);
    if (localImageUrl) {
      this._setMemoryCache(imgID, localImageUrl, "high");
      return localImageUrl;
    }
    return null;
  }

  _setMemoryCache(imgID, url, quality = "high") {
    this.memoryCache.set(imgID, { url, quality });
    this.memoryCacheOrder = this.memoryCacheOrder.filter(id => id !== imgID);
    this.memoryCacheOrder.push(imgID);

    // Cleanup if cache is too large
    while (this.memoryCacheOrder.length > this.maxMemoryCacheSize) {
      const oldest = this.memoryCacheOrder.shift();
      if (oldest) {
        const oldCache = this.memoryCache.get(oldest);
        if (oldCache?.url) URL.revokeObjectURL(oldCache.url);
        this.memoryCache.delete(oldest);
      }
    }
  }

  /**
   * Load image from API (legacy method, kept for compatibility)
   */
  async loadImage(
    imgID,
    retryCount = 0,
    options = { quality: "high", priority: "normal" }
  ) {
    const settings = await this._getSettings();
    return this._loadFromAPI(imgID, settings, options, retryCount);
  }

  /**
   * Load image from API with retry logic (uses IPC to bypass CORS)
   */
  async _loadFromAPI(
    imgID,
    settings,
    options = { quality: "high", priority: "normal" },
    retryCount = 0
  ) {
    if (!imgID) return null;

    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = await this.generateSignature(timestamp);
      const source = settings?.gameSource || "steamrip";

      let endpoint = "v2/image";
      if (source === "fitgirl") {
        endpoint = "v2/fitgirl/image";
      }

      // Use IPC to fetch image from main process (bypasses CORS)
      const result = await window.electron.fetchApiImage(
        endpoint,
        imgID,
        timestamp,
        signature
      );

      if (result.error) {
        if (result.status === 404) {
          this.recent404Count++;
          if (this.recent404Count >= this.max404BeforeClear) {
            await this.clearCache();
            this.recent404Count = 0;
          }
        }
        throw new Error(`HTTP error! status: ${result.status}`);
      }

      // Result is a data URL, use it directly
      const url = result.dataUrl;

      // Cache the result with correct quality
      this._setMemoryCache(imgID, url, options.quality);

      // For IndexedDB, we need to convert data URL to blob
      if (this.db) {
        try {
          const response = await fetch(url);
          const blob = await response.blob();
          this.saveToIndexedDB(imgID, blob).catch(error => {
            console.warn(
              `[ImageCache] Failed to save image ${imgID} to IndexedDB:`,
              error
            );
          });
        } catch (e) {
          // Ignore IndexedDB save errors
        }
      }

      // Reset 404 counter on success
      if (this.recent404Count > 0) this.recent404Count = 0;
      return url;
    } catch (error) {
      if (retryCount < this.maxRetries) {
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        return this._loadFromAPI(imgID, settings, options, retryCount + 1);
      }
      throw error;
    }
  }

  async getFromIndexedDB(imgID) {
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction(["images"], "readonly");
        const store = transaction.objectStore("images");
        const request = store.get(imgID);

        request.onsuccess = () => {
          const data = request.result;
          if (data && data.blob) {
            resolve(data.blob);
          } else {
            resolve(null);
          }
        };

        request.onerror = () => reject(request.error);
      } catch (error) {
        reject(error);
      }
    });
  }

  async generateSignature(timestamp) {
    try {
      // Try to get secret from electron
      const secret = (await window.electron?.imageSecret()) || "default_secret";

      const encoder = new TextEncoder();
      const data = encoder.encode(timestamp.toString());
      const keyData = encoder.encode(secret);

      const key = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );

      const signature = await crypto.subtle.sign("HMAC", key, data);
      const hashArray = Array.from(new Uint8Array(signature));
      return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    } catch (error) {
      console.error("[ImageCache] Error generating signature:", error);
      throw error;
    }
  }

  async saveToIndexedDB(imgID, blob) {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction(["images"], "readwrite");
        const store = transaction.objectStore("images");
        const request = store.put({ id: imgID, blob, timestamp: Date.now() });

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      } catch (error) {
        reject(error);
      }
    });
  }

  // Utility methods
  async clearCache(skipRefresh = false) {
    console.log("[ImageCache] Clearing cache");
    this.memoryCache.clear();
    this.memoryCacheOrder = [];
    await this.clearIndexedDB();

    // Clear localStorage cache
    try {
      localStorage.removeItem("ascendara_games_cache");
      localStorage.removeItem("local_ascendara_games_timestamp");
      localStorage.removeItem("local_ascendara_metadata_cache");

      // Force a refresh of the game data (respects local index setting)
      // Skip refresh if caller will handle it (e.g., during page reload)
      if (!skipRefresh) {
        try {
          await gameService.getCachedData();
          console.log("[ImageCache] Game service cache refreshed successfully");
        } catch (error) {
          console.error("[ImageCache] Error refreshing game service cache:", error);
        }
      }
    } catch (error) {
      console.error("[ImageCache] Error clearing game service cache:", error);
    }
  }

  async clearIndexedDB() {
    if (this.db) {
      return new Promise(resolve => {
        try {
          const transaction = this.db.transaction(["images"], "readwrite");
          const store = transaction.objectStore("images");
          const request = store.clear();
          request.onsuccess = () => {
            console.log("[ImageCache] IndexedDB cleared successfully");
            resolve();
          };
          request.onerror = () => {
            console.error("[ImageCache] Error clearing IndexedDB:", request.error);
            resolve();
          };
        } catch (error) {
          console.error("[ImageCache] Error clearing IndexedDB:", error);
          resolve();
        }
      });
    }
  }

  invalidateCache(imgID) {
    if (!imgID) return;

    console.log(`[ImageCache] Invalidating cache for image ID: ${imgID}`);

    // Remove from memory cache
    if (this.memoryCache.has(imgID)) {
      this.memoryCache.delete(imgID);
      this.memoryCacheOrder = this.memoryCacheOrder.filter(id => id !== imgID);
    }

    // Remove from IndexedDB if available
    if (this.db) {
      try {
        const transaction = this.db.transaction(["images"], "readwrite");
        const store = transaction.objectStore("images");
        store.delete(imgID);
      } catch (error) {
        console.error(
          `[ImageCache] Error removing image ${imgID} from IndexedDB:`,
          error
        );
      }
    }

    // Also clear from localStorage if it might be there
    try {
      // Since we don't know which game this imgID belongs to, we can't target specific keys
      // This is a best-effort approach to find and clear relevant localStorage items
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith("game-cover-") || key.startsWith("game-image-")) {
          const value = localStorage.getItem(key);
          // If the value contains the imgID, remove it
          if (value && value.includes(imgID)) {
            localStorage.removeItem(key);
          }
        }
      }
    } catch (e) {
      console.warn("[ImageCache] Error clearing localStorage:", e);
    }
  }
}

export default new ImageCacheService();
