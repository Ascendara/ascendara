/**
 * Download Sync Service
 * Handles syncing download data to monitor.ascendara.app for webapp viewing
 * Only active for users with Ascend subscription or trial
 */

let syncInterval = null;
let isAuthenticated = false;
let currentUser = null;
let hasAscendAccess = false;

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

  // Start syncing downloads every 5 seconds
  if (!syncInterval) {
    syncInterval = setInterval(syncDownloads, 5000);
    // Sync immediately
    syncDownloads();
  }
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
};

/**
 * Sync current downloads to monitor endpoint
 */
const syncDownloads = async () => {
  console.log(
    "[DownloadSync] Sync triggered, authenticated:",
    isAuthenticated,
    "user:",
    currentUser?.uid
  );

  if (!isAuthenticated || !currentUser) {
    console.warn("[DownloadSync] Not authenticated or no user");
    return;
  }

  try {
    // Check if electron API is available
    if (!window.electron || typeof window.electron.getDownloads !== "function") {
      console.warn("[DownloadSync] electron.getDownloads not available");
      return;
    }

    // Get current downloads from electron
    console.log("[DownloadSync] Calling electron.getDownloads()...");
    const downloads = await window.electron.getDownloads();
    console.log("[DownloadSync] Got downloads:", downloads?.length || 0, "items");

    // Always sync, even if empty, so the API knows downloads were removed
    const downloadsArray = downloads || [];

    // Format downloads for API
    const formattedDownloads = downloadsArray.map(download => ({
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
      timestamp: new Date().toISOString(),
    }));

    console.log("[DownloadSync] Formatted downloads:", formattedDownloads);

    // Get Firebase ID token
    const firebaseToken = await currentUser.getIdToken();

    // Sync to monitor endpoint
    console.log("[DownloadSync] Syncing to monitor.ascendara.app...");
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
      console.error(
        "[DownloadSync] Failed to sync downloads:",
        response.status,
        await response.text()
      );
    } else {
      console.log(
        "[DownloadSync] Successfully synced",
        formattedDownloads.length,
        "downloads"
      );
    }
  } catch (error) {
    console.error("[DownloadSync] Error syncing downloads:", error);
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
      console.error(
        "[DownloadCommands] Failed to get download commands:",
        response.status,
        await response.text()
      );
      return [];
    }

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
  console.log("[DownloadSync] notifyDownloadStart called:", {
    downloadId,
    downloadName,
    isAuthenticated,
    hasUser: !!currentUser,
    hasAscendAccess,
  });

  if (!isAuthenticated || !currentUser) {
    console.warn("[DownloadSync] Cannot notify - not authenticated or no user");
    return;
  }

  try {
    const firebaseToken = await currentUser.getIdToken();
    console.log(
      "[DownloadSync] Notifying download start:",
      downloadName,
      "to https://monitor.ascendara.app/downloads/notify-start"
    );

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
    } else {
      console.log("[DownloadSync] Successfully notified download start");
    }
  } catch (error) {
    console.error("[DownloadSync] Error notifying download start:", error);
  }
};

/**
 * Force immediate sync
 */
export const forceSyncDownloads = () => {
  console.log("[DownloadSync] Force sync requested");
  syncDownloads();
};
