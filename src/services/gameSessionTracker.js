/**
 * gameSessionTracker.js
 *
 * Cloud-first per-session delta tracker.
 *
 */

import { applyGameSessionDelta, recomputeProfileStats } from "./firebaseService";

// Active sessions keyed by gameName -> { baselinePlayTime, baselineLaunchCount,
// startedAt, isCustom, gameID }
const activeSessions = new Map();

const norm = name => (name || "").trim();

/**
 * Find the local game record (regular or custom) by name and return its
 * playTime / launchCount, plus minimal metadata. Returns null if not found.
 */
const readLocalGameSnapshot = async gameName => {
  if (!gameName || typeof window === "undefined" || !window.electron) {
    return null;
  }

  const target = norm(gameName).toLowerCase();

  try {
    const games = (await window.electron.getGames?.()) || [];
    const hit = games.find(g => norm(g.game || g.name).toLowerCase() === target);
    if (hit) {
      return {
        playTime: typeof hit.playTime === "number" ? hit.playTime : 0,
        launchCount: typeof hit.launchCount === "number" ? hit.launchCount : 0,
        isCustom: false,
        gameID: hit.gameID || null,
      };
    }
  } catch (e) {
    console.warn("[gameSessionTracker] getGames failed:", e?.message || e);
  }

  try {
    const customGames = (await window.electron.getCustomGames?.()) || [];
    const hit = customGames.find(
      g => norm(g.game || g.name).toLowerCase() === target
    );
    if (hit) {
      return {
        playTime: typeof hit.playTime === "number" ? hit.playTime : 0,
        launchCount: typeof hit.launchCount === "number" ? hit.launchCount : 0,
        isCustom: true,
        gameID: null,
      };
    }
  } catch (e) {
    console.warn("[gameSessionTracker] getCustomGames failed:", e?.message || e);
  }

  return null;
};

/**
 * Record a baseline snapshot at launch. Safe to call multiple times — the
 * latest snapshot wins (which matters if the game was launched, the user
 * rage-quit immediately, and they relaunched before `game-closed` fired).
 */
export const recordSessionStart = async gameName => {
  const name = norm(gameName);
  if (!name) return;

  const snapshot = await readLocalGameSnapshot(name);
  if (!snapshot) {
    // No local record — game might be cloud-only or freshly added. We still
    // want to credit the session; treat baseline as zero.
    activeSessions.set(name, {
      baselinePlayTime: 0,
      baselineLaunchCount: 0,
      startedAt: Date.now(),
      isCustom: false,
      gameID: null,
    });
    return;
  }

  activeSessions.set(name, {
    baselinePlayTime: snapshot.playTime,
    baselineLaunchCount: snapshot.launchCount,
    startedAt: Date.now(),
    isCustom: snapshot.isCustom,
    gameID: snapshot.gameID,
  });
};

/**
 * Compute the session delta from local file vs the recorded baseline and
 * atomically apply it to the cloud. Idempotent: removes the session entry on
 * completion so a duplicate `game-closed` event is a no-op.
 *
 * Returns the result of `applyGameSessionDelta` for callers that want to
 * surface UI feedback, but never throws.
 */
export const recordSessionEnd = async gameName => {
  const name = norm(gameName);
  if (!name) return { success: false, error: "no-game-name" };

  const session = activeSessions.get(name);
  if (!session) {
    // No baseline — happens if the tracker wasn't initialized in time, or if
    // the user signed in mid-session. Skip: we'd rather miss one delta than
    // double-count by treating the entire local total as a delta.
    return { success: false, error: "no-baseline" };
  }
  activeSessions.delete(name);

  const after = await readLocalGameSnapshot(name);
  if (!after) {
    return { success: false, error: "post-snapshot-missing" };
  }

  const playtimeDelta = Math.max(0, after.playTime - session.baselinePlayTime);
  const launchesDelta = Math.max(
    0,
    after.launchCount - session.baselineLaunchCount
  );

  // Edge case: handler updates playTime in 180s ticks, so very short sessions
  // (<3min) may show zero local delta. We still credit the launchCount and
  // a wall-clock minimum so the cloud reflects "the user did launch this".
  const wallClockSeconds = Math.max(
    0,
    Math.floor((Date.now() - session.startedAt) / 1000)
  );
  const effectivePlaytime =
    playtimeDelta > 0 ? playtimeDelta : Math.min(wallClockSeconds, 180);

  try {
    const deltaResult = await applyGameSessionDelta(
      name,
      {
        playtimeDelta: effectivePlaytime,
        launchesDelta: launchesDelta || 1,
        lastPlayed: new Date().toISOString(),
      },
      {
        isCustom: session.isCustom || after.isCustom,
        gameID: session.gameID || after.gameID,
      }
    );

    // Server recomputes level / XP / totals from cloudLibrary. Fire-and-forget
    // — the dashboard will pick up the new values on its next read, and a
    // failure here is reconciled by the next session's recompute.
    recomputeProfileStats().catch(err =>
      console.warn(
        "[gameSessionTracker] Server stats recompute failed:",
        err?.message || err
      )
    );

    return deltaResult;
  } catch (e) {
    console.warn(
      "[gameSessionTracker] Failed to push session delta — will retry on next session:",
      e?.message || e
    );
    return { success: false, error: e?.message || "delta-apply-failed" };
  }
};

/**
 * Drop all in-memory sessions. Call on sign-out so a subsequent user's session
 * doesn't inherit stale baselines.
 */
export const clearAllSessions = () => {
  activeSessions.clear();
};

export default {
  recordSessionStart,
  recordSessionEnd,
  clearAllSessions,
};
