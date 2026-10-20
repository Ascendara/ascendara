import { useEffect, useState } from "react";

/**
 * Shared "is this game running" state driven by the main process launch/close
 * events, so cards and pages don't each poll is-game-running over IPC.
 */
const runningGames = new Set();
// Store games are launched by the store-accounts module, which is_game_running
// doesn't know about, so they are tracked apart from library launches.
const runningStoreGames = new Set();
const listeners = new Set();
let unsubscribeEvents = null;

const notify = () => listeners.forEach(listener => listener());

const setRunning = (game, running, games = runningGames) => {
  if (!game || games.has(game) === running) return;
  if (running) games.add(game);
  else games.delete(game);
  notify();
};

const isAnyRunning = game => runningGames.has(game) || runningStoreGames.has(game);

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
  const unsubStoreLaunch = window.electron.storeAccounts?.onGameLaunched?.(data =>
    setRunning(data?.game, true, runningStoreGames)
  );
  const unsubStoreClosed = window.electron.storeAccounts?.onGameClosed?.(data =>
    setRunning(data?.game, false, runningStoreGames)
  );
  unsubscribeEvents = () => {
    unsubLaunch?.();
    unsubClosed?.();
    unsubError?.();
    unsubStoreLaunch?.();
    unsubStoreClosed?.();
  };
};

export function useGameRunning(gameName) {
  const [isRunning, setIsRunning] = useState(() => isAnyRunning(gameName));

  useEffect(() => {
    if (!gameName) {
      setIsRunning(false);
      return undefined;
    }
    ensureSubscribed();

    let active = true;
    const sync = () => setIsRunning(isAnyRunning(gameName));
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
