import { useCallback, useEffect, useState } from "react";
import { useGameRunning } from "./useGameRunning";

/** "1:02:03" / "12:34" for a running session timer. */
export const formatSessionTime = ms => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
};

/**
 * Live play session for a library game: whether it is running, how long the
 * current session has lasted, and a way to end it from inside Ascendara.
 */
export function useGameSession(gameName) {
  const isRunning = useGameRunning(gameName);
  const [session, setSession] = useState(null);
  const [now, setNow] = useState(Date.now);
  const [isStopping, setIsStopping] = useState(false);

  useEffect(() => {
    if (!isRunning || !gameName) {
      setSession(null);
      setIsStopping(false);
      return undefined;
    }
    let active = true;
    const fallback = { name: gameName, startedAt: Date.now(), canStop: false };
    window.electron
      ?.getRunningGameSessions?.()
      .then(sessions => {
        if (!active) return;
        setSession(sessions?.find(entry => entry.name === gameName) || fallback);
      })
      .catch(() => active && setSession(fallback));
    return () => {
      active = false;
    };
  }, [gameName, isRunning]);

  useEffect(() => {
    if (!isRunning) return undefined;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  // Library launches always have a helper process to end; store games
  // (launched through their own client) don't, so they can't be stopped here.
  const canStop = Boolean(isRunning && session?.sessionId);

  const stop = useCallback(async () => {
    if (!canStop || isStopping) return null;
    setIsStopping(true);
    try {
      return await window.electron.stopGame(gameName, session.sessionId, {
        force: true,
      });
    } finally {
      setIsStopping(false);
    }
  }, [canStop, gameName, isStopping, session]);

  return {
    isRunning,
    canStop,
    isStopping,
    stop,
    elapsedMs: isRunning && session ? now - session.startedAt : 0,
  };
}
