import { updateUserStatus, getUserStatus } from "./firebaseService";

let previousStatus = "online";
let isInitialized = false;
let statusChangeCallback = null;
let currentUserId = null;
let initializationTime = 0;
let isPlayingGame = false;

/**
 * Initialize the status service - sets user to their preferred status
 * @param {Function} onStatusChange - Callback to update UI when status changes
 * @param {string} userId - User ID
 */
export const initializeStatusService = async (onStatusChange, userId) => {
  if (isInitialized) return;
  if (!userId) {
    console.log("[AscendStatus] No user ID provided");
    return;
  }

  statusChangeCallback = onStatusChange;
  currentUserId = userId;

  try {
    // Get user's preferred status (what they manually set, not current status)
    const result = await getUserStatus(userId);
    console.log("[AscendStatus] Fetched status:", result.data);

    // Only restore user-chosen statuses (online, away, busy)
    // "offline" is set by app close or API inactivity timeout, not user choice - ignore it
    const validStatuses = ["online", "away", "busy"];
    if (
      result.data?.preferredStatus &&
      validStatuses.includes(result.data.preferredStatus)
    ) {
      previousStatus = result.data.preferredStatus;
    } else if (result.data?.status && validStatuses.includes(result.data.status)) {
      // Fallback to current status if no valid preferred status saved
      previousStatus = result.data.status;
    } else {
      // Default to online if no valid status found
      previousStatus = "online";
    }

    console.log("[AscendStatus] Restoring status to:", previousStatus);

    // Restore user's preferred status
    await updateUserStatus(previousStatus);
    if (statusChangeCallback) statusChangeCallback(previousStatus);
    isInitialized = true;
    initializationTime = Date.now();

    // Set up close handlers
    if (typeof window !== "undefined") {
      // In Electron, use the app-closing IPC event (beforeunload fires during HMR reloads)
      // Only use beforeunload for non-Electron environments (pure browser)
      if (window.electron?.onAppClose) {
        window.electron.onAppClose(() => {
          handleAppClose();
        });
      } else {
        // Fallback for non-Electron environments
        window.addEventListener("beforeunload", handleAppClose);
      }

      // Listen for app hidden (minimized to tray)
      if (window.electron?.onAppHidden) {
        window.electron.onAppHidden(() => {
          handleAppHidden();
        });
      }

      // Listen for app shown (restored from tray)
      if (window.electron?.onAppShown) {
        window.electron.onAppShown(() => {
          handleAppShown();
        });
      }
    }

    console.log("[AscendStatus] Initialized - status set to:", previousStatus);
  } catch (error) {
    console.error("[AscendStatus] Failed to initialize:", error);
  }
};

/**
 * Handle app close - set status to offline
 */
const handleAppClose = async () => {
  if (!currentUserId) return;

  try {
    await updateUserStatus("offline");
    if (statusChangeCallback) statusChangeCallback("offline");
    console.log("[AscendStatus] App closing - status set to offline");
  } catch (error) {
    console.error("[AscendStatus] Failed to set offline status:", error);
  }
};

/**
 * Handle app hidden (minimized to tray) - set status to offline
 */
const handleAppHidden = async () => {
  if (!currentUserId) return;

  // Ignore hidden events that fire within 2 seconds of initialization
  // This prevents race conditions during app startup
  if (Date.now() - initializationTime < 2000) {
    console.log("[AscendStatus] Ignoring early hidden event");
    return;
  }

  // Don't set offline if user is playing a game
  // The window hides during game launch, but user is still active
  if (isPlayingGame) {
    console.log("[AscendStatus] Ignoring hidden event - user is playing a game");
    return;
  }

  try {
    await updateUserStatus("offline");
    if (statusChangeCallback) statusChangeCallback("offline");
    console.log("[AscendStatus] App hidden - status set to offline");
  } catch (error) {
    console.error("[AscendStatus] Failed to set offline status:", error);
  }
};

/**
 * Handle app shown (restored from tray) - restore previous status
 */
const handleAppShown = async () => {
  if (!currentUserId) return;

  try {
    await updateUserStatus(previousStatus);
    if (statusChangeCallback) statusChangeCallback(previousStatus);
    console.log("[AscendStatus] App shown - status restored to:", previousStatus);
  } catch (error) {
    console.error("[AscendStatus] Failed to restore status:", error);
  }
};

/**
 * Cleanup the status service
 */
export const cleanupStatusService = () => {
  if (typeof window !== "undefined") {
    window.removeEventListener("beforeunload", handleAppClose);
  }
  isInitialized = false;
  currentUserId = null;
  statusChangeCallback = null;
};

/**
 * Manually set the user's status and update the stored preference
 */
export const setUserOnlineStatus = async status => {
  if (!currentUserId) return { error: "Not authenticated" };

  try {
    const result = await updateUserStatus(status);
    if (result.success && status !== "offline") {
      previousStatus = status;
    }
    return result;
  } catch (error) {
    return { error: error.message };
  }
};

/**
 * Get the user's stored preferred status
 */
export const getPreferredStatus = () => previousStatus;

/**
 * Set whether a game is currently being played
 * This prevents status from being set to offline when window hides during game launch
 * @param {boolean} playing - Whether a game is currently playing
 */
export const setGamePlayingState = playing => {
  isPlayingGame = playing;
  console.log("[AscendStatus] Game playing state set to:", playing);
};
