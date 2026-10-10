/**
 * favoritesCloudSync.js
 *
 * Keeps the user's favorites in sync across devices via their Ascend cloud
 * library (`users/{uid}.cloudLibrary.favorites`).
 *
 * Favorites are stored locally in two localStorage keys that many screens
 * write to directly:
 *   - `game-favorites`      — array of game names
 *   - `game-favorites-meta` — per-game display info for favorites that aren't
 *                             installed (cover image id, gameID, ...)
 *
 * Rather than touching every toggle site, this service keeps its own change
 * log (`game-favorites-sync`) and diffs it against `game-favorites` whenever
 * the `favorites-updated` event fires. Each change is stamped with the time it
 * was made, and removals are kept as tombstones, so the merge with the cloud
 * is last-write-wins per game: un-favoriting on one device removes it
 * everywhere instead of the other device adding it straight back.
 *
 * Design invariants:
 *   - NEVER throw into the UI — sync is best-effort and silent.
 *   - Favorites that only exist locally before the first sync are uploaded,
 *     but an explicit change made on another device always beats them.
 */

import { auth, updateCloudFavorites } from "./firebaseService";

const FAVORITES_KEY = "game-favorites";
const META_KEY = "game-favorites-meta";
const STATE_KEY = "game-favorites-sync";

// Wait for the user to stop toggling before hitting Firestore.
const PUSH_DEBOUNCE_MS = 2000;
// Pull changes made on other devices: on window focus (throttled) and on a
// slow interval for sessions that never lose focus (e.g. Big Picture).
const FOCUS_SYNC_MIN_INTERVAL_MS = 2 * 60 * 1000;
const BACKGROUND_SYNC_INTERVAL_MS = 15 * 60 * 1000;
// Tombstones only need to outlive the longest time a device stays offline.
const TOMBSTONE_TTL_MS = 180 * 24 * 60 * 60 * 1000;
// Timestamp given to favorites that predate sync on this device, so any
// explicit change made elsewhere wins over them.
const BASELINE_TIMESTAMP = 1;

// Only what's needed to render and re-download an uninstalled favorite —
// descriptions and download links are looked up from the game index instead.
const META_FIELDS = ["imgID", "gameID", "version", "size", "category", "dlc", "online"];

let activeUid = null;
let pushTimer = null;
let backgroundTimer = null;
let lastSyncAt = 0;
let syncInFlight = null;
let syncQueued = false;

const readJson = (key, fallback) => {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return parsed ?? fallback;
  } catch (_) {
    return fallback;
  }
};

const writeJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`[favoritesCloudSync] Failed to write ${key}:`, e?.message || e);
  }
};

const readFavorites = () => {
  const list = readJson(FAVORITES_KEY, []);
  return Array.isArray(list) ? list.filter(name => typeof name === "string" && name) : [];
};

// Firestore rejects undefined, so build the stored meta field by field.
const pickMeta = source => {
  if (!source || typeof source !== "object") return null;
  const meta = {};
  META_FIELDS.forEach(field => {
    if (source[field] !== undefined && source[field] !== null) {
      meta[field] = source[field];
    }
  });
  return Object.keys(meta).length > 0 ? meta : null;
};

const loadState = uid => {
  const state = readJson(STATE_KEY, null);
  if (!state || state.uid !== uid || typeof state.entries !== "object") {
    return { entries: {}, isBaseline: true };
  }
  return { entries: state.entries || {}, isBaseline: false };
};

const saveState = (uid, entries) => writeJson(STATE_KEY, { uid, entries });

/**
 * Fold whatever changed in `game-favorites` since the last look into the
 * change log. Returns the up-to-date log and whether anything changed.
 */
const reconcileLocal = uid => {
  const { entries, isBaseline } = loadState(uid);
  const favorites = new Set(readFavorites());
  const stamp = isBaseline ? BASELINE_TIMESTAMP : Date.now();
  let changed = isBaseline;

  favorites.forEach(name => {
    if (!entries[name]?.favorite) {
      entries[name] = { favorite: true, updatedAt: stamp };
      changed = true;
    }
  });

  Object.keys(entries).forEach(name => {
    if (entries[name].favorite && !favorites.has(name)) {
      entries[name] = { favorite: false, updatedAt: stamp };
      changed = true;
    }
  });

  if (changed) saveState(uid, entries);
  return { entries, changed };
};

/**
 * Attach display info to favorites that don't have any yet, so another device
 * can show a cover and offer a download for games it doesn't have installed.
 */
const attachMeta = async entries => {
  const localMeta = readJson(META_KEY, {});
  const missing = [];

  Object.keys(entries).forEach(name => {
    const entry = entries[name];
    if (!entry.favorite || entry.meta) return;
    const meta = pickMeta(localMeta[name]);
    if (meta) {
      entry.meta = meta;
    } else {
      missing.push(name);
    }
  });

  if (missing.length === 0 || !window.electron?.getGames) return;

  try {
    const installed = (await window.electron.getGames()) || [];
    const byName = new Map(installed.map(g => [g.game || g.name, g]));
    missing.forEach(name => {
      const meta = pickMeta(byName.get(name));
      if (meta) entries[name].meta = meta;
    });
  } catch (_) {
    // Non-fatal — the favorite still syncs by name.
  }
};

const toEntryList = entries =>
  Object.keys(entries)
    .sort()
    .map(name => ({
      name,
      favorite: !!entries[name].favorite,
      updatedAt: entries[name].updatedAt || BASELINE_TIMESTAMP,
      ...(entries[name].favorite && entries[name].meta && { meta: entries[name].meta }),
    }));

/**
 * Last-write-wins merge of two favorites logs, keyed by game name. Ties go to
 * the favorited side so two devices that never synced end up with the union.
 */
const mergeEntries = (cloudList, localList) => {
  const merged = {};
  const consider = entry => {
    if (!entry?.name) return;
    const candidate = {
      favorite: !!entry.favorite,
      updatedAt: Number(entry.updatedAt) || BASELINE_TIMESTAMP,
      meta: pickMeta(entry.meta),
    };
    const current = merged[entry.name];
    const wins =
      !current ||
      candidate.updatedAt > current.updatedAt ||
      (candidate.updatedAt === current.updatedAt && candidate.favorite && !current.favorite);
    if (wins) {
      merged[entry.name] = { ...candidate, meta: candidate.meta || current?.meta || null };
    } else if (!current.meta && candidate.meta) {
      current.meta = candidate.meta;
    }
  };

  cloudList.forEach(consider);
  localList.forEach(consider);

  const cutoff = Date.now() - TOMBSTONE_TTL_MS;
  Object.keys(merged).forEach(name => {
    const entry = merged[name];
    if (!entry.favorite && entry.updatedAt < cutoff) delete merged[name];
  });

  return merged;
};

/**
 * Write a merged log back to localStorage, keeping the user's existing
 * favorites order and appending anything new from other devices.
 */
const applyToLocal = (uid, entries) => {
  saveState(uid, entries);

  const current = readFavorites();
  const next = current.filter(name => entries[name]?.favorite);
  const known = new Set(next);
  Object.keys(entries).forEach(name => {
    if (entries[name].favorite && !known.has(name)) next.push(name);
  });

  // Give favorites from other devices enough info to render when not installed.
  const localMeta = readJson(META_KEY, {});
  let metaChanged = false;
  next.forEach(name => {
    if (!localMeta[name] && entries[name]?.meta) {
      localMeta[name] = entries[name].meta;
      metaChanged = true;
    }
  });
  if (metaChanged) writeJson(META_KEY, localMeta);

  const listChanged =
    next.length !== current.length || next.some((name, i) => name !== current[i]);
  if (listChanged) {
    writeJson(FAVORITES_KEY, next);
    window.dispatchEvent(new CustomEvent("favorites-updated"));
  }
};

const runSync = async uid => {
  const { entries } = reconcileLocal(uid);
  await attachMeta(entries);
  saveState(uid, entries);
  const localList = toEntryList(entries);

  const result = await updateCloudFavorites(cloudList => {
    const mergedList = toEntryList(mergeEntries(cloudList, localList));
    const currentList = toEntryList(mergeEntries(cloudList, []));
    return {
      entries: mergedList,
      changed: JSON.stringify(mergedList) !== JSON.stringify(currentList),
    };
  });

  if (!result.success || activeUid !== uid) {
    return { success: false, error: result.error || "cancelled" };
  }

  // The user may have toggled something while the request was in flight —
  // fold that in before writing, and push it on the next pass.
  const latest = reconcileLocal(uid);
  const finalEntries = mergeEntries(result.entries, toEntryList(latest.entries));
  applyToLocal(uid, finalEntries);
  if (latest.changed) schedulePush();

  lastSyncAt = Date.now();
  return { success: true, error: null };
};

/**
 * Sync favorites with the cloud now. Safe to call from anywhere; resolves
 * without throwing and is a no-op when the service isn't running.
 *
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
export const syncFavoritesNow = async () => {
  const uid = activeUid;
  if (!uid || auth?.currentUser?.uid !== uid) {
    return { success: false, error: "Not running" };
  }

  if (syncInFlight) {
    syncQueued = true;
    return syncInFlight;
  }

  syncInFlight = runSync(uid)
    .catch(err => {
      console.warn("[favoritesCloudSync] Sync failed:", err?.message || err);
      return { success: false, error: err?.message || "Sync failed" };
    })
    .finally(() => {
      syncInFlight = null;
      if (syncQueued) {
        syncQueued = false;
        schedulePush();
      }
    });

  return syncInFlight;
};

function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    syncFavoritesNow();
  }, PUSH_DEBOUNCE_MS);
}

const handleFavoritesUpdated = () => {
  if (!activeUid) return;
  // Our own writes are already in the change log, so this only schedules a
  // push when the user actually changed something.
  if (reconcileLocal(activeUid).changed) schedulePush();
};

const handleWindowFocus = () => {
  if (Date.now() - lastSyncAt >= FOCUS_SYNC_MIN_INTERVAL_MS) syncFavoritesNow();
};

/**
 * Start syncing favorites for the signed-in user.
 * @param {object} user - Firebase user
 * @param {boolean} hasAscendAccess - Cloud library sync requires Ascend access
 */
export const initializeFavoritesSync = (user, hasAscendAccess) => {
  stopFavoritesSync();
  if (!user?.uid || !hasAscendAccess) return;

  activeUid = user.uid;
  window.addEventListener("favorites-updated", handleFavoritesUpdated);
  window.addEventListener("focus", handleWindowFocus);
  backgroundTimer = setInterval(syncFavoritesNow, BACKGROUND_SYNC_INTERVAL_MS);
  syncFavoritesNow();
};

/**
 * Stop syncing (sign-out / lost access). Local favorites are left untouched.
 */
export const stopFavoritesSync = () => {
  activeUid = null;
  syncQueued = false;
  lastSyncAt = 0;
  if (pushTimer) clearTimeout(pushTimer);
  if (backgroundTimer) clearInterval(backgroundTimer);
  pushTimer = null;
  backgroundTimer = null;
  window.removeEventListener("favorites-updated", handleFavoritesUpdated);
  window.removeEventListener("focus", handleWindowFocus);
};
