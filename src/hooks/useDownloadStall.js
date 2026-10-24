import { useEffect, useState } from "react";

/**
 * Shared "this download stopped making progress" state, driven by the main
 * process download watchdog, so every card reads one store instead of polling.
 */
const stalls = new Map();
const listeners = new Set();
let unsubscribeEvents = null;

const notify = () => listeners.forEach(listener => listener());

const applyStall = stall => {
  if (!stall?.game) return;
  if (stall.stalled) stalls.set(stall.game, stall);
  else if (!stalls.delete(stall.game)) return;
  notify();
};

const ensureSubscribed = () => {
  if (unsubscribeEvents || !window.electron?.onDownloadStall) return;
  unsubscribeEvents = window.electron.onDownloadStall(applyStall);
  // The warning may have been sent before this window started listening.
  window.electron
    .getDownloadStalls?.()
    .then(current => current?.forEach(applyStall))
    .catch(error => console.error("Failed to load stalled downloads:", error));
};

/** Subscribe to every stall change, e.g. to warn the user wherever they are. */
export const onDownloadStallChange = callback => {
  ensureSubscribed();
  return window.electron?.onDownloadStall?.(callback) || (() => {});
};

/** The stall for a game ({ since, phase }) while it is stalled, otherwise null. */
export const useDownloadStall = game => {
  const [stall, setStall] = useState(() => (game ? stalls.get(game) || null : null));

  useEffect(() => {
    ensureSubscribed();
    const update = () => setStall(game ? stalls.get(game) || null : null);
    listeners.add(update);
    update();
    return () => listeners.delete(update);
  }, [game]);

  return stall;
};
