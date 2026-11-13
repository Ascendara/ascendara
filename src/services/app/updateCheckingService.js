import { useSyncExternalStore } from "react";
import {
  INITIAL_UPDATE_STATUS,
  UPDATE_PHASES,
  reduceUpdateStatus,
} from "./updateLifecycle";

// How often the background check re-asks the main process for the latest version.
const BACKGROUND_CHECK_INTERVAL = 30 * 60 * 1000;

let status = { ...INITIAL_UPDATE_STATUS };
let inFlight = null;
let backgroundTimer = null;
let lifecycleEventsBound = false;
const listeners = new Set();

const dispatch = event => {
  const nextStatus = reduceUpdateStatus(status, event);
  if (nextStatus === status) return;
  status = nextStatus;
  listeners.forEach(listener => listener(status));
};

const readDownloadSnapshot = async isLatest => {
  if (isLatest) return { downloaded: false, downloading: false };
  try {
    const [downloaded, downloading] = await Promise.all([
      window.electron.isUpdateDownloaded(),
      window.electron.getTimestampValue("downloadingUpdate"),
    ]);
    return { downloaded: Boolean(downloaded), downloading: Boolean(downloading) };
  } catch (error) {
    console.error("Error reading update download status:", error);
    return { downloaded: false, downloading: false };
  }
};

const bindLifecycleEvents = () => {
  if (lifecycleEventsBound) return;
  lifecycleEventsBound = true;

  window.electron.onUpdateDownloadProgress?.(progress =>
    dispatch({ type: "DOWNLOAD_PROGRESS", progress })
  );
  window.electron.onUpdateReady?.(() => dispatch({ type: "READY" }));
  window.electron.onUpdateError?.(() => dispatch({ type: "DOWNLOAD_ERROR" }));

  // The API answers 426 when this build is too old to talk to it.
  window.addEventListener("ascendara:update-required", () =>
    dispatch({ type: "UPDATE_REQUIRED" })
  );
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
      const downloadSnapshot = await readDownloadSnapshot(isLatest);
      dispatch({ type: "SNAPSHOT", isLatest, ...downloadSnapshot });
      return isLatest;
    } catch (error) {
      console.error("Error checking for updates:", error);
      // Keep the last known answer; on a first-run failure don't lock anyone out.
      if (status.isLatest === null) {
        dispatch({
          type: "SNAPSHOT",
          isLatest: true,
          downloaded: false,
          downloading: false,
        });
      }
      return status.isLatest;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
};

export { UPDATE_PHASES };

export const isUpdateAvailable = () => status.phase === UPDATE_PHASES.AVAILABLE;

/**
 * Starts the periodic background version check. Safe to call more than once.
 */
export const startBackgroundUpdateChecks = () => {
  bindLifecycleEvents();
  if (backgroundTimer) return;
  checkForUpdates();
  backgroundTimer = setInterval(checkForUpdates, BACKGROUND_CHECK_INTERVAL);
};

const subscribe = listener => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = () => status;

export const subscribeToUpdateStatus = listener => subscribe(listener);
export const getUpdateStatus = () => getSnapshot();
export const markUpdateInstalling = () => dispatch({ type: "INSTALLING" });
export const markUpdateInstallFailed = () => dispatch({ type: "INSTALL_FAILED" });

/**
 * Live update lifecycle for components.
 * @returns {{
 *   checking: boolean,
 *   isOutdated: boolean,
 *   phase: string,
 *   downloadProgress: number
 * }}
 */
export const useVersionStatus = () => {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  return {
    ...snapshot,
    checking: snapshot.phase === UPDATE_PHASES.CHECKING,
    isOutdated: snapshot.updateRequired || snapshot.isLatest === false,
  };
};
