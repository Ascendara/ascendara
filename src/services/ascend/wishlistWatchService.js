/**
 * wishlistWatchService.js
 *
 * Ascend feature: watches the connected Steam account's wishlist and tells the
 * user when one of those games shows up in the game index.
 *
 * The wishlist itself is fetched by the store-accounts module alongside the
 * Steam library. This service refreshes that account now and then, matches
 * wishlist names against the index (exact normalized titles only, so nobody
 * gets an alert for the wrong game) and remembers what it already announced
 * in `ascend-wishlist-watch:{uid}`.
 *
 * The first check after enabling only records what is already available and
 * reports it once as a summary, so connecting a big wishlist doesn't fire a
 * notification per game.
 *
 * Design invariants:
 *   - NEVER throw into the UI — watching is best-effort and silent.
 *   - Unmatched wishlist games are re-checked on every index refresh.
 */

import gameService from "../games/gameService";

export const WISHLIST_ALERTS_KEY = "ascend-wishlist-alerts";
export const WISHLIST_MATCHES_EVENT = "ascend-wishlist-matches";

// The wishlist only changes when the user edits it on Steam, so a slow
// refresh is plenty; index refreshes are what usually bring new matches.
const STEAM_REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const START_DELAY_MS = 20 * 1000;
const MAX_MATCHES = 100;

let user = null;
let active = false;
let checking = false;
let startTimer = null;
let intervalTimer = null;

const stateKey = uid => `ascend-wishlist-watch:${uid}`;

function readState(uid) {
  try {
    const parsed = JSON.parse(localStorage.getItem(stateKey(uid)) || "null");
    if (parsed && typeof parsed === "object") {
      return {
        baselined: parsed.baselined === true,
        seen: parsed.seen && typeof parsed.seen === "object" ? parsed.seen : {},
        matches: Array.isArray(parsed.matches) ? parsed.matches : [],
        lastRefresh: Number(parsed.lastRefresh) || 0,
      };
    }
  } catch {
    /* Fall through to a fresh state. */
  }
  return { baselined: false, seen: {}, matches: [], lastRefresh: 0 };
}

function writeState(uid, state) {
  try {
    localStorage.setItem(stateKey(uid), JSON.stringify(state));
  } catch (e) {
    console.warn("[wishlistWatch] Failed to save state:", e?.message || e);
  }
}

export function isWishlistAlertsEnabled() {
  try {
    return localStorage.getItem(WISHLIST_ALERTS_KEY) !== "false";
  } catch {
    return true;
  }
}

export function setWishlistAlertsEnabled(enabled) {
  try {
    localStorage.setItem(WISHLIST_ALERTS_KEY, enabled ? "true" : "false");
  } catch {
    return false;
  }
  if (enabled) scheduleCheck(0);
  return true;
}

/** Wishlist games found in the index for the signed-in user, newest first */
export function getWishlistMatches() {
  if (!user?.uid) return [];
  return readState(user.uid).matches;
}

async function steamAccount() {
  const result = await window.electron?.storeAccounts?.state();
  if (!result?.success) return null;
  return result.data.accounts.find(account => account.store === "steam" && account.connected) || null;
}

// Normalized title -> game, built once per check instead of once per wishlist game
async function catalogByTitle() {
  const { games, metadata } = await gameService.getAllGames();
  const byTitle = new Map();
  if (metadata?.customSource || !Array.isArray(games)) return byTitle;
  for (const game of games) {
    if (!game?.gameID) continue;
    const title = gameService.normalizeForMatch(game.game);
    if (title && !byTitle.has(title)) byTitle.set(title, game);
  }
  return byTitle;
}

/** Steam app id -> index game for every wishlist game that is on Ascendara */
export async function matchWishlistToCatalog(wishlist = []) {
  const byTitle = await catalogByTitle();
  const matches = new Map();
  for (const item of wishlist) {
    const game = byTitle.get(gameService.normalizeForMatch(item.name));
    if (game) matches.set(item.id, game);
  }
  return matches;
}

async function check() {
  if (!active || checking || !user?.uid || !isWishlistAlertsEnabled()) return;
  checking = true;
  const uid = user.uid;
  try {
    let account = await steamAccount();
    if (!account) return;

    const state = readState(uid);
    if (!account.busy && Date.now() - state.lastRefresh > STEAM_REFRESH_INTERVAL_MS) {
      state.lastRefresh = Date.now();
      writeState(uid, state);
      const refreshed = await window.electron.storeAccounts.refresh("steam");
      if (refreshed?.success) {
        account = refreshed.data.accounts.find(item => item.store === "steam") || account;
        window.dispatchEvent(new Event("store-accounts-updated"));
      }
    }

    // An empty list may just be a wishlist Steam wouldn't hand over yet, and
    // baselining on it would turn every later match into its own alert
    const wishlist = account.wishlist || [];
    if (!wishlist.length) return;
    const pending = wishlist.filter(item => !state.seen[item.id]);
    if (!pending.length && state.baselined) return;

    const byTitle = await catalogByTitle();
    if (!byTitle.size) return;

    const found = [];
    for (const item of pending) {
      const game = byTitle.get(gameService.normalizeForMatch(item.name));
      if (!game) continue;
      state.seen[item.id] = true;
      found.push({
        id: item.id,
        name: game.game,
        gameID: game.gameID,
        imgID: game.imgID || null,
        matchedAt: new Date().toISOString(),
      });
    }

    const initial = !state.baselined;
    state.baselined = true;
    state.matches = [...found.reverse(), ...state.matches].slice(0, MAX_MATCHES);
    if (!active || user?.uid !== uid) return;
    writeState(uid, state);

    if (found.length) {
      window.dispatchEvent(
        new CustomEvent(WISHLIST_MATCHES_EVENT, { detail: { matches: found, initial } })
      );
    }
  } catch (err) {
    console.warn("[wishlistWatch] Check failed:", err?.message || err);
  } finally {
    checking = false;
  }
}

function scheduleCheck(delay = START_DELAY_MS) {
  if (!active) return;
  clearTimeout(startTimer);
  startTimer = setTimeout(check, delay);
}

const handleIndexRefreshed = () => scheduleCheck(2000);
const handleAccountsUpdated = () => {
  // Our own Steam refresh announces itself too; the check in flight covers it
  if (!checking) scheduleCheck(2000);
};

export function initializeWishlistWatch(nextUser, hasAccess) {
  stopWishlistWatch();
  if (!nextUser || !hasAccess) return;
  user = nextUser;
  active = true;
  window.addEventListener("index-refreshed", handleIndexRefreshed);
  window.addEventListener("store-accounts-updated", handleAccountsUpdated);
  intervalTimer = setInterval(check, CHECK_INTERVAL_MS);
  scheduleCheck();
}

export function stopWishlistWatch() {
  active = false;
  user = null;
  clearTimeout(startTimer);
  clearInterval(intervalTimer);
  startTimer = null;
  intervalTimer = null;
  window.removeEventListener("index-refreshed", handleIndexRefreshed);
  window.removeEventListener("store-accounts-updated", handleAccountsUpdated);
}
