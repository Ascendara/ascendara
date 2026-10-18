/**
 * Download Sync Service
 * Handles syncing download data to monitor.ascendara.app for webapp viewing
 * Only active for users with Ascend subscription or trial
 */

let syncInterval = null;
let isAuthenticated = false;
let currentUser = null;
let hasAscendAccess = false;
let lastDownloadCount = 0;
let isSyncing = false;
let lastSyncSignature = null;
let lastSyncAt = 0;

// Stopped, failed and waiting downloads stay in the list indefinitely, so an
// unchanged list is only re-sent this often instead of on every tick.
const UNCHANGED_SYNC_INTERVAL = 30000;

// Back off after failed requests so a broken endpoint or rejected session
// isn't retried at full polling speed forever.
const createBackoff = (baseDelay = 5000, maxDelay = 5 * 60 * 1000) => {
  let failures = 0;
  let retryAt = 0;
  return {
    blocked: () => Date.now() < retryAt,
    success: () => {
      failures = 0;
      retryAt = 0;
    },
    failure: () => {
      failures += 1;
      retryAt = Date.now() + Math.min(maxDelay, baseDelay * 2 ** failures);
    },
  };
};

const syncBackoff = createBackoff();
const commandBackoff = createBackoff();

/**
 * Initialize download sync service
 * @param {Object} user - Firebase user object
 * @param {boolean} ascendAccess - Whether user has Ascend subscription/trial
 */
export const initializeDownloadSync = (user, ascendAccess = false) => {
  if (!user) {
    stopDownloadSync();
    return;
  }

  currentUser = user;
  isAuthenticated = true;
  hasAscendAccess = ascendAccess;

  // Only sync if user has Ascend access
  if (!hasAscendAccess) {
    console.log("[DownloadSync] Sync disabled - Ascend subscription required");
    stopDownloadSync();
    return;
  }

  // Don't start interval yet - will be started when downloads begin
  console.log(
    "[DownloadSync] Service initialized - polling will start when downloads begin"
  );
};

/**
 * Stop download sync service
 */
export const stopDownloadSync = () => {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  isAuthenticated = false;
  currentUser = null;
  hasAscendAccess = false;
  lastSyncSignature = null;
  lastSyncAt = 0;
  syncBackoff.success();
  commandBackoff.success();
};

/**
 * Start the sync interval if not already running
 */
const startSyncInterval = () => {
  if (!syncInterval && hasAscendAccess) {
    console.log("[DownloadSync] Starting sync interval (5s)");
    syncInterval = setInterval(syncDownloads, 5000);
    isSyncing = true;
  }
};

/**
 * Stop the sync interval
 */
const stopSyncInterval = () => {
  if (syncInterval) {
    console.log("[DownloadSync] Stopping sync interval - no active downloads");
    clearInterval(syncInterval);
    syncInterval = null;
    isSyncing = false;
  }
};

/**
 * Sync current downloads to monitor endpoint
 */
const syncDownloads = async (force = false) => {
  if (!isAuthenticated || !currentUser) {
    return;
  }

  if (!force && syncBackoff.blocked()) {
    return;
  }

  try {
    // Check if electron API is available
    if (!window.electron || typeof window.electron.getDownloads !== "function") {
      return;
    }

    // Get current downloads from electron
    const downloads = await window.electron.getDownloads();
    const downloadsArray = (downloads || []).filter(download => !download.privateSource);
    const currentCount = downloadsArray.length;

    // If we had downloads before but now have none, sync once more then stop
    if (lastDownloadCount > 0 && currentCount === 0) {
      console.log("[DownloadSync] Downloads completed - sending final sync and stopping");
      await performSync(downloadsArray, true);
      stopSyncInterval();
      lastDownloadCount = 0;
      return;
    }

    // If no downloads, don't sync
    if (currentCount === 0) {
      return;
    }

    // Update last known count
    lastDownloadCount = currentCount;

    // Perform sync
    await performSync(downloadsArray, force);
  } catch (error) {
    syncBackoff.failure();
    console.error("[DownloadSync] Error syncing downloads:", error);
  }
};

/**
 * Perform the actual sync operation
 */
const performSync = async (downloadsArray, force = false) => {
  // Format downloads for API
  const downloadStates = downloadsArray.map(download => ({
    id: download.id || download.name,
    name: download.name,
    progress: download.progress || 0,
    speed: download.speed || "0 B/s",
    eta: download.eta || "Calculating...",
    status: download.status || "downloading",
    size: download.size || "Unknown",
    downloaded: download.downloaded || "0 MB",
    error: download.error || null,
    paused: download.paused || false,
    stopped: download.stopped || false,
  }));

  // Nothing moved since the last sync, so there is nothing new to tell the webapp
  const signature = JSON.stringify(downloadStates);
  if (
    !force &&
    signature === lastSyncSignature &&
    Date.now() - lastSyncAt < UNCHANGED_SYNC_INTERVAL
  ) {
    return;
  }

  const timestamp = new Date().toISOString();
  const formattedDownloads = downloadStates.map(download => ({ ...download, timestamp }));

  // Get Firebase ID token
  const firebaseToken = await currentUser.getIdToken();

  // Sync to monitor endpoint
  const response = await fetch("https://monitor.ascendara.app/downloads/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${firebaseToken}`,
    },
    body: JSON.stringify({
      downloads: formattedDownloads,
    }),
  });

  if (!response.ok) {
    syncBackoff.failure();
    console.error(
      "[DownloadSync] Failed to sync downloads:",
      response.status,
      await response.text()
    );
  } else {
    syncBackoff.success();
    lastSyncSignature = signature;
    lastSyncAt = Date.now();
    console.log("[DownloadSync] Synced", formattedDownloads.length, "download(s)");
  }
};

/**
 * Check for pending download commands from webapp
 */
export const checkDownloadCommands = async () => {
  if (!isAuthenticated || !currentUser) {
    console.log("[DownloadCommands] Not authenticated or no user");
    return [];
  }

  try {
    // Check if electron API is available
    if (!window.electron) {
      console.warn("[DownloadCommands] electron API not available");
      return [];
    }

    if (commandBackoff.blocked()) {
      return [];
    }

    const firebaseToken = await currentUser.getIdToken();
    console.log("[DownloadCommands] Checking for commands for user:", currentUser.uid);

    const response = await fetch(
      `https://monitor.ascendara.app/downloads/commands/${currentUser.uid}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${firebaseToken}`,
        },
      }
    );

    if (!response.ok) {
      commandBackoff.failure();
      console.error(
        "[DownloadCommands] Failed to get download commands:",
        response.status,
        await response.text()
      );
      return [];
    }

    commandBackoff.success();
    const data = await response.json();
    console.log("[DownloadCommands] Received response:", data);
    const commands = data.commands || [];
    console.log(
      "[DownloadCommands] Found",
      commands.length,
      "pending commands:",
      commands
    );
    return commands;
  } catch (error) {
    commandBackoff.failure();
    console.error("[DownloadCommands] Error checking download commands:", error);
    return [];
  }
};

/**
 * Acknowledge a command has been executed
 * @param {string} downloadId - Download ID
 * @param {string} status - Command status: 'completed' or 'failed'
 * @param {string} error - Optional error message if failed
 */
export const acknowledgeCommand = async (
  downloadId,
  status = "completed",
  error = null
) => {
  if (!isAuthenticated || !currentUser) return;

  try {
    const firebaseToken = await currentUser.getIdToken();
    const payload = {
      downloadId,
      status,
    };

    if (error) {
      payload.error = error;
    }

    console.log(
      "[DownloadCommands] Acknowledging command:",
      downloadId,
      "Status:",
      status
    );

    await fetch("https://monitor.ascendara.app/downloads/commands/acknowledge", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${firebaseToken}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error("[DownloadCommands] Error acknowledging command:", error);
  }
};

/**
 * Notify API that a download has started
 * @param {string} downloadId - Download ID
 * @param {string} downloadName - Download name
 */
export const notifyDownloadStart = async (downloadId, downloadName) => {
  console.log("[DownloadSync] Download started:", downloadName);

  if (!isAuthenticated || !currentUser) {
    return;
  }

  // Start sync interval when download begins
  startSyncInterval();

  // Perform immediate sync
  await syncDownloads(true);

  try {
    const firebaseToken = await currentUser.getIdToken();

    const response = await fetch("https://monitor.ascendara.app/downloads/notify-start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${firebaseToken}`,
      },
      body: JSON.stringify({
        downloadId,
        downloadName,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[DownloadSync] Failed to notify download start:",
        response.status,
        errorText
      );
    }
  } catch (error) {
    console.error("[DownloadSync] Error notifying download start:", error);
  }
};

/**
 * Force immediate sync and ensure interval is running
 */
export const forceSyncDownloads = () => {
  console.log("[DownloadSync] Force sync requested");
  startSyncInterval();
  syncDownloads(true);
};
