/**
 * gameLaunchCloudSync.js
 *
 * Cloud-first pre-launch playtime merge.
 *
 * Ascendara's GameHandler binary writes `playTime` and `launchCount` directly
 * to each game's local `.ascendara.json` as the game runs. On a fresh install
 * (e.g. after OS migration), the local file starts at 0 even when the cloud
 * has real history — so short local sessions would otherwise appear as the
 * total playtime on the dashboard.
 *
 * Before every launch, this module performs a lightweight max-merge with the
 * user's cloud library so that a session always accumulates on top of the
 * true total. The merge is executed in the Electron main process by the
 * existing `restore-cloud-game-data` IPC handler, which already applies
 * Math.max semantics to `playTime` / `launchCount`, newest-wins on
 * `lastPlayed`, and OR-merge on `favorite`.
 *
 * Design invariants:
 *   - NEVER block game launch on cloud failure (auth, network, Firestore rules).
 *   - NEVER overwrite larger local values (the IPC handler guarantees this).
 *   - NEVER perform the pull more than once per game per app session, so the
 *     5th launch of the evening doesn't hit Firestore needlessly.
 *   - Hard cap on total time spent waiting before launch (`PULL_TIMEOUT_MS`).
 */

import { auth, getCloudLibrary } from "./firebaseService";

// Max time we're willing to delay a game launch for the cloud pull.
// Network is best-effort — if Firestore is slow we launch anyway and rely on
// the next app start (or manual Restore from Cloud) to reconcile.
const PULL_TIMEOUT_MS = 5000;

// Per-session cache: `${uid}:${normalizedGameName}` -> timestamp of last pull.
// Prevents repeated Firestore reads when the same game is launched multiple
// times in one app session. Cleared on auth change and periodically.
const pulledThisSession = new Map();

// How long a single pull result is considered "fresh enough" within a session.
// 10 minutes: long enough to cover quick relaunches, short enough that a user
// who updates state on another device and relaunches within ~10min misses it
// only on that one launch. The next launch will re-pull.
const SESSION_CACHE_TTL_MS = 10 * 60 * 1000;

const normalizeName = name => (name || "").trim().toLowerCase();

const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("cloud-sync-timeout")), ms)
    ),
  ]);

/**
 * Clear the per-session pull cache. Call on sign-out.
 */
export const clearLaunchCloudSyncCache = () => {
  pulledThisSession.clear();
};

// Invalidate cache automatically when the signed-in user changes.
try {
  auth.onAuthStateChanged?.(() => {
    pulledThisSession.clear();
  });
} catch (_) {
  // Non-fatal — service still functions without auth change listener.
}

/**
 * Perform a max-merge pull of cloud-side per-game counters into the local
 * game JSON file before launch.
 *
 * @param {string} gameName - Game identifier (matches how it's stored locally
 *   and in `cloudLibrary.games[*].name` on Firestore).
 * @returns {Promise<{merged: boolean, reason?: string}>} Resolves once the
 *   merge has completed, timed out, or been skipped. Always resolves; never
 *   throws — callers should treat this as fire-and-forget with optional await.
 */
export const pullCloudGameDataBeforeLaunch = async gameName => {
  const name = (gameName || "").trim();
  if (!name) {
    return { merged: false, reason: "no-game-name" };
  }

  // Guard: only run when authenticated. Anonymous / signed-out users have no
  // cloud state to merge.
  const user = auth?.currentUser;
  if (!user?.uid) {
    return { merged: false, reason: "not-authenticated" };
  }

  // Guard: restore IPC must be available (renderer sandbox / preload sanity).
  if (typeof window === "undefined" || !window.electron?.restoreCloudGameData) {
    return { merged: false, reason: "ipc-unavailable" };
  }

  // Per-session throttle
  const cacheKey = `${user.uid}:${normalizeName(name)}`;
  const last = pulledThisSession.get(cacheKey);
  if (last && Date.now() - last < SESSION_CACHE_TTL_MS) {
    return { merged: false, reason: "cached" };
  }

  try {
    const result = await withTimeout(getCloudLibrary(), PULL_TIMEOUT_MS);
    const cloudGames = result?.data?.games || [];
    const target = cloudGames.find(
      g => normalizeName(g?.name) === normalizeName(name)
    );

    if (!target) {
      // Nothing to merge, but still mark as pulled so we don't retry every
      // single launch within the TTL window.
      pulledThisSession.set(cacheKey, Date.now());
      return { merged: false, reason: "not-in-cloud" };
    }

    // Only counters / flags worth restoring pre-launch. The IPC handler
    // performs Math.max so sending zero/null values cannot regress locals.
    const payload = {
      playTime: typeof target.playTime === "number" ? target.playTime : 0,
      launchCount:
        typeof target.launchCount === "number" ? target.launchCount : 0,
      lastPlayed: target.lastPlayed || null,
      favorite: !!target.favorite,
    };

    const ipcResult = await withTimeout(
      window.electron.restoreCloudGameData(name, payload),
      PULL_TIMEOUT_MS
    );

    pulledThisSession.set(cacheKey, Date.now());

    if (ipcResult?.success) {
      return { merged: true };
    }
    return { merged: false, reason: ipcResult?.error || "ipc-no-success" };
  } catch (err) {
    // Silent failure — must never block launch. Log for diagnostics.
    // eslint-disable-next-line no-console
    console.warn(
      "[gameLaunchCloudSync] Pre-launch cloud pull failed — launching anyway:",
      err?.message || err
    );
    // Do NOT cache on hard failure: we want to retry on the next launch.
    return { merged: false, reason: "error" };
  }
};

export default pullCloudGameDataBeforeLaunch;
