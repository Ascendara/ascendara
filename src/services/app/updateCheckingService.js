import { useSyncExternalStore } from "react";

// How often the background check re-asks the main process for the latest version.
const BACKGROUND_CHECK_INTERVAL = 30 * 60 * 1000;

// `isLatest` is null until the first check finishes.
let status = { isLatest: null, updateRequired: false };
let inFlight = null;
let backgroundTimer = null;
const listeners = new Set();

const setStatus = patch => {
  status = { ...status, ...patch };
  listeners.forEach(listener => listener());
};

/**
 * Asks the main process whether this build is the latest one.
 * Concurrent callers share a single request; the result is cached for
 * everything that reads the version status.
 * @returns {Promise<boolean>} true when the app is on the latest version
 */
export const checkForUpdates = () => {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const isLatest = await window.electron.checkForUpdates();
      setStatus({ isLatest });
      return isLatest;
    } catch (error) {
      console.error("Error checking for updates:", error);
      // Keep the last known answer; on a first-run failure don't lock anyone out.
      if (status.isLatest === null) setStatus({ isLatest: true });
      return status.isLatest;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
};

export const isUpdateAvailable = () => status.isLatest === false;

/**
 * Starts the periodic background version check. Safe to call more than once.
 */
export const startBackgroundUpdateChecks = () => {
  if (backgroundTimer) return;
  checkForUpdates();
  backgroundTimer = setInterval(checkForUpdates, BACKGROUND_CHECK_INTERVAL);
  // The API answers 426 when this build is too old to talk to it.
  window.addEventListener("ascendara:update-required", () =>
    setStatus({ updateRequired: true })
  );
};

const subscribe = listener => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = () => status;

/**
 * Live version status for components.
 * @returns {{ checking: boolean, isOutdated: boolean }}
 */
export const useVersionStatus = () => {
  const { isLatest, updateRequired } = useSyncExternalStore(subscribe, getSnapshot);
  return {
    checking: isLatest === null && !updateRequired,
    isOutdated: updateRequired || isLatest === false,
  };
};
