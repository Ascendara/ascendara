/**
 * Game View Service
 * Counts a view when a game card stays at least half on screen for a moment
 * (not a click), batches those views to the API, and shares the public counts.
 * The API decides what counts: each viewer counts once per game, so this
 * service only avoids sending games it has already reported.
 */
import { getAuthToken } from "@/utils/authHelper";

const API_URL = "https://api.ascendara.app/app/v1/gameviews";
const VISIBLE_RATIO = 0.5;
const DWELL_MS = 1000;
const FLUSH_DELAY_MS = 3000;
const MAX_BATCH = 50;
const COUNTS_TTL_MS = 5 * 60 * 1000;
const TOKEN_TTL_MS = 10 * 60 * 1000;
const MAX_REPORTED = 20000;
const REPORTED_KEY = "ascendara-reported-game-views";

class GameViewService {
  constructor() {
    this.counts = new Map();
    this.countsFetchedAt = 0;
    this.countsRequest = null;
    this.subscribers = new Map(); // gameID -> Set of callbacks
    this.reported = this.loadReported();
    this.pending = new Set();
    this.flushTimer = null;
    this.isFlushing = false;
    this.token = null;
    this.tokenFetchedAt = 0;
    this.elements = new Map(); // element -> gameID
    this.dwellTimers = new Map(); // element -> timeout
    this.observer = null;
  }

  loadReported() {
    try {
      const stored = JSON.parse(localStorage.getItem(REPORTED_KEY) || "[]");
      return new Set(Array.isArray(stored) ? stored : []);
    } catch {
      return new Set();
    }
  }

  saveReported() {
    try {
      const ids = [...this.reported].slice(-MAX_REPORTED);
      localStorage.setItem(REPORTED_KEY, JSON.stringify(ids));
    } catch (error) {
      console.warn("Error saving reported game views:", error);
    }
  }

  getCount(gameID) {
    return this.counts.get(gameID) ?? null;
  }

  /**
   * Subscribe to the view count of a game
   * @param {string} gameID - The game ID to watch
   * @param {function} callback - Receives the view count
   * @returns {function} Unsubscribe function
   */
  subscribe(gameID, callback) {
    if (!gameID) return () => {};
    if (!this.subscribers.has(gameID)) this.subscribers.set(gameID, new Set());
    this.subscribers.get(gameID).add(callback);

    if (this.counts.has(gameID)) callback(this.counts.get(gameID));
    this.loadCounts();

    return () => {
      const callbacks = this.subscribers.get(gameID);
      callbacks?.delete(callback);
      if (callbacks?.size === 0) this.subscribers.delete(gameID);
    };
  }

  setCounts(views) {
    Object.entries(views || {}).forEach(([gameID, count]) => {
      if (!Number.isFinite(count) || this.counts.get(gameID) === count) return;
      this.counts.set(gameID, count);
      this.subscribers.get(gameID)?.forEach(callback => callback(count));
    });
  }

  async loadCounts() {
    if (this.countsRequest || Date.now() - this.countsFetchedAt < COUNTS_TTL_MS) return;
    this.countsRequest = fetch(API_URL)
      .then(response => (response.ok ? response.json() : null))
      .then(views => {
        if (views) this.setCounts(views);
      })
      .catch(() => {})
      .finally(() => {
        this.countsFetchedAt = Date.now();
        this.countsRequest = null;
      });
  }

  /**
   * Watch an element and count a view for its game once it has been visible
   * @param {Element} element - The rendered game card
   * @param {string} gameID - The game it shows
   * @returns {function} Stop watching
   */
  observe(element, gameID) {
    if (!element || !gameID || typeof IntersectionObserver === "undefined") {
      return () => {};
    }
    if (!this.observer) {
      this.observer = new IntersectionObserver(
        entries => entries.forEach(entry => this.handleIntersection(entry)),
        { threshold: VISIBLE_RATIO }
      );
    }
    this.elements.set(element, gameID);
    this.observer.observe(element);
    return () => {
      this.cancelDwell(element);
      this.elements.delete(element);
      this.observer?.unobserve(element);
    };
  }

  handleIntersection(entry) {
    const element = entry.target;
    const gameID = this.elements.get(element);
    if (!gameID) return;
    if (!entry.isIntersecting || entry.intersectionRatio < VISIBLE_RATIO) {
      this.cancelDwell(element);
      return;
    }
    if (this.reported.has(gameID) || this.pending.has(gameID)) return;
    if (this.dwellTimers.has(element)) return;
    this.dwellTimers.set(
      element,
      setTimeout(() => {
        this.dwellTimers.delete(element);
        // A card behind a minimized or hidden window was not seen.
        if (document.visibilityState === "visible") this.queueView(gameID);
      }, DWELL_MS)
    );
  }

  cancelDwell(element) {
    clearTimeout(this.dwellTimers.get(element));
    this.dwellTimers.delete(element);
  }

  queueView(gameID) {
    if (this.reported.has(gameID) || this.pending.has(gameID)) return;
    this.pending.add(gameID);
    if (this.pending.size >= MAX_BATCH) {
      this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), FLUSH_DELAY_MS);
    }
  }

  async getToken(forceRefresh = false) {
    if (forceRefresh || !this.token || Date.now() - this.tokenFetchedAt > TOKEN_TTL_MS) {
      this.token = await getAuthToken();
      this.tokenFetchedAt = Date.now();
    }
    return this.token;
  }

  async flush() {
    clearTimeout(this.flushTimer);
    this.flushTimer = null;
    if (this.isFlushing || this.pending.size === 0) return;

    const gameIDs = [...this.pending].slice(0, MAX_BATCH);
    gameIDs.forEach(gameID => this.pending.delete(gameID));
    this.isFlushing = true;

    try {
      const send = async forceRefresh =>
        fetch(API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${await this.getToken(forceRefresh)}`,
          },
          body: JSON.stringify({ gameIDs }),
        });
      let response = await send(false);
      if (response.status === 401) response = await send(true);
      if (!response.ok) throw new Error(`View tracking failed (${response.status})`);

      const data = await response.json();
      gameIDs.forEach(gameID => this.reported.add(gameID));
      this.saveReported();
      this.setCounts(data.views);
    } catch (error) {
      // Unsent views are retried the next time their card is seen.
      console.warn("Error reporting game views:", error);
    } finally {
      this.isFlushing = false;
      if (this.pending.size > 0 && !this.flushTimer) {
        this.flushTimer = setTimeout(() => this.flush(), FLUSH_DELAY_MS);
      }
    }
  }
}

const gameViewService = new GameViewService();
export default gameViewService;
