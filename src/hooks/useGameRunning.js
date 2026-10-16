import { useEffect, useState } from "react";

/**
 * Shared "is this game running" state driven by the main process launch/close
 * events, so cards and pages don't each poll is-game-running over IPC.
 */
const runningGames = new Set();
const listeners = new Set();
let unsubscribeEvents = null;

const notify = () => listeners.forEach(listener => listener());

const setRunning = (game, running) => {
  if (!game || runningGames.has(game) === running) return;
  if (running) runningGames.add(game);
  else runningGames.delete(game);
  notify();
};

const ensureSubscribed = () => {
  if (unsubscribeEvents || !window.electron) return;
  const unsubLaunch = window.electron.onGameLaunchSuccess?.((_, data) =>
    setRunning(data?.game, true)
  );
  const unsubClosed = window.electron.onGameClosed?.((_, data) =>
    setRunning(data?.game, false)
  );
  const unsubError = window.electron.onGameLaunchError?.((_, data) =>
    setRunning(data?.game, false)
  );
  unsubscribeEvents = () => {
    unsubLaunch?.();
    unsubClosed?.();
    unsubError?.();
  };
};

export function useGameRunning(gameName) {
  const [isRunning, setIsRunning] = useState(() => runningGames.has(gameName));

  useEffect(() => {
    if (!gameName) {
      setIsRunning(false);
      return undefined;
    }
    ensureSubscribed();

    let active = true;
    const sync = () => setIsRunning(runningGames.has(gameName));
    listeners.add(sync);
    sync();

    // Pick up a game launched before anything was listening.
    window.electron
      ?.isGameRunning?.(gameName)
      .then(running => {
        if (active) setRunning(gameName, Boolean(running));
      })
      .catch(() => {});

    return () => {
      active = false;
      listeners.delete(sync);
    };
  }, [gameName]);

  return isRunning;
}
