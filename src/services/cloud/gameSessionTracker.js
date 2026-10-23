/**
 * gameSessionTracker.js
 *
 * Server-timed play sessions.
 *
 * Playtime is timed by the API, not taken from the local game JSON (which a
 * user can edit). At launch we start a session on the server, heartbeat while
 * the game runs, and end it on close; the server credits only the real time
 * between heartbeats and writes it to the cloud profile itself. The local
 * baseline snapshot is still used for the launch count.
 *
 * If the API doesn't support sessions yet (404), the session falls back to the
 * legacy path: the local playtime delta is pushed as a claim, which the server
 * caps at real time.
 */

import {
  applyGameSessionDelta,
  auth,
  recomputeProfileStats,
} from "../firebase/firebaseService";
import { userAuthenticatedFetch } from "@/utils/authHelper";
import { API_URL } from "@/config/api";

const SESSION_API = `${API_URL}/v3/playtime/session`;

// Active sessions keyed by gameName -> { baselinePlayTime, baselineLaunchCount,
// startedAt, isCustom, gameID, sessionId, legacy, timer, missedRunningChecks }
const activeSessions = new Map();

const norm = name => (name || "").trim();

const callSessionApi = async (action, body) => {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const response = await userAuthenticatedFetch(user, `${SESSION_API}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, ok: response.ok, data };
};

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
    const hit = customGames.find(g => norm(g.game || g.name).toLowerCase() === target);
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
 * Start (or restart) the server session for a tracked game and keep it alive
 * with heartbeats. Leaves session.sessionId null when the server can't be
 * reached; that session simply earns no server-timed playtime.
 */
const startServerSession = async (name, session) => {
  try {
    const { ok, status, data } = await callSessionApi("start", {
      game: name,
      gameID: session.gameID || undefined,
      isCustom: !!session.isCustom,
    });
    if (activeSessions.get(name) !== session) return; // ended meanwhile
    if (status === 404 && !data?.sessionId) {
      session.legacy = true;
      return;
    }
    if (!ok || !data?.sessionId) {
      console.warn("[gameSessionTracker] Session start failed:", status, data?.error);
      return;
    }
    session.sessionId = data.sessionId;
    clearInterval(session.timer);
    session.timer = setInterval(
      () => heartbeat(name, session),
      (data.heartbeatSeconds || 60) * 1000
    );
  } catch (e) {
    console.warn("[gameSessionTracker] Session start error:", e?.message || e);
  }
};

const heartbeat = async (name, session) => {
  if (activeSessions.get(name) !== session || !session.sessionId) return;

  // Safety net for a missed `game-closed` event: stop once the game has been
  // gone for two checks in a row.
  try {
    const running = await window.electron?.isGameRunning?.(name);
    session.missedRunningChecks = running === false ? session.missedRunningChecks + 1 : 0;
    if (session.missedRunningChecks >= 2) {
      recordSessionEnd(name);
      return;
    }
  } catch {
    /* Keep heartbeating if the check itself fails. */
  }

  try {
    const { status, data } = await callSessionApi("heartbeat", {
      sessionId: session.sessionId,
    });
    if (status === 404 && data?.code === "SESSION_NOT_FOUND") {
      // The server closed it (e.g. we were offline too long): start fresh.
      session.sessionId = null;
      clearInterval(session.timer);
      startServerSession(name, session);
    }
  } catch (e) {
    console.warn("[gameSessionTracker] Heartbeat failed:", e?.message || e);
  }
};

/**
 * Record a baseline snapshot and start a server-timed session at launch.
 * Safe to call multiple times — the latest call wins (which matters if the
 * game was launched, the user rage-quit immediately, and they relaunched
 * before `game-closed` fired); the server closes the older session itself.
 */
export const recordSessionStart = async gameName => {
  const name = norm(gameName);
  if (!name) return;

  clearInterval(activeSessions.get(name)?.timer);

  const snapshot = await readLocalGameSnapshot(name);
  const session = {
    baselinePlayTime: snapshot?.playTime || 0,
    baselineLaunchCount: snapshot?.launchCount || 0,
    startedAt: Date.now(),
    isCustom: snapshot?.isCustom || false,
    gameID: snapshot?.gameID || null,
    sessionId: null,
    legacy: false,
    timer: null,
    missedRunningChecks: 0,
  };
  activeSessions.set(name, session);
  await startServerSession(name, session);
};

/**
 * End the session: the server credits the timed playtime, then we push the
 * launch count / lastPlayed and trigger a stats recompute. Idempotent: removes
 * the session entry first so a duplicate `game-closed` event is a no-op.
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
    // the user signed in mid-session. Skip: we'd rather miss one session than
    // double-count by treating the entire local total as a delta.
    return { success: false, error: "no-baseline" };
  }
  activeSessions.delete(name);
  clearInterval(session.timer);

  if (session.sessionId) {
    try {
      await callSessionApi("end", { sessionId: session.sessionId });
    } catch (e) {
      // The server's sweeper closes it and credits up to the last heartbeat.
      console.warn("[gameSessionTracker] Session end failed:", e?.message || e);
    }
  }

  const after = await readLocalGameSnapshot(name);
  if (!after) {
    return { success: false, error: "post-snapshot-missing" };
  }

  const launchesDelta = Math.max(0, after.launchCount - session.baselineLaunchCount);

  // Server-timed sessions already credited the playtime; only the legacy
  // path still reports the local delta (which the server caps at real time).
  // Handler updates playTime in 180s ticks, so very short legacy sessions
  // (<3min) may show zero local delta: fall back to a wall-clock minimum.
  let playtimeDelta = 0;
  if (session.legacy) {
    const localDelta = Math.max(0, after.playTime - session.baselinePlayTime);
    const wallClockSeconds = Math.max(
      0,
      Math.floor((Date.now() - session.startedAt) / 1000)
    );
    playtimeDelta = localDelta > 0 ? localDelta : Math.min(wallClockSeconds, 180);
  }

  try {
    const deltaResult = await applyGameSessionDelta(
      name,
      {
        playtimeDelta,
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
 * doesn't inherit stale baselines. Server sessions left open are closed by the
 * server's sweeper once heartbeats stop.
 */
export const clearAllSessions = () => {
  activeSessions.forEach(session => clearInterval(session.timer));
  activeSessions.clear();
};

export default {
  recordSessionStart,
  recordSessionEnd,
  clearAllSessions,
};
