import { updateUserStatus, getUserStatus, auth } from "./firebaseService";

let isInitialized = false;
let currentActivity = null;

/**
 * Activity types for automatic status messages
 */
export const ActivityType = {
  BROWSING_LIBRARY: "browsing_library",
  BROWSING_DOWNLOADS: "browsing_downloads",
  SEARCHING_GAMES: "searching_games",
  VIEWING_GAME: "viewing_game",
  PLAYING_GAME: "playing_game",
  DOWNLOADING: "downloading",
  IN_SETTINGS: "in_settings",
  IN_ASCEND: "in_ascend",
  IDLE: "idle",
};

/**
 * Get the display message for an activity type
 * @param {string} activityType - The activity type
 * @param {string} context - Optional context (e.g., game name)
 * @returns {string}
 */
const getActivityMessage = (activityType, context = null) => {
  switch (activityType) {
    case ActivityType.BROWSING_LIBRARY:
      return "Browsing library";
    case ActivityType.BROWSING_DOWNLOADS:
      return "Viewing downloads";
    case ActivityType.SEARCHING_GAMES:
      return "Searching for games";
    case ActivityType.VIEWING_GAME:
      return context ? `Looking at ${context}` : "Viewing a game";
    case ActivityType.PLAYING_GAME:
      return context ? `Playing ${context}` : "Playing a game";
    case ActivityType.DOWNLOADING:
      return context ? `Downloading ${context}` : "Downloading a game";
    case ActivityType.IN_SETTINGS:
      return "In settings";
    case ActivityType.IN_ASCEND:
      return "Using Ascend";
    case ActivityType.IDLE:
    default:
      return "";
  }
};

/**
 * Initialize the user status service
 */
export const initializeUserStatusService = () => {
  if (isInitialized) return;
  isInitialized = true;
  console.log("[UserStatusService] Initialized");
};

/**
 * Set the user's activity and update their custom message
 * @param {string} activityType - The type of activity from ActivityType
 * @param {string} context - Optional context (e.g., game name)
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
export const setActivity = async (activityType, context = null) => {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    currentActivity = { type: activityType, context };
    const customMessage = getActivityMessage(activityType, context);

    // Get current status to preserve it
    const currentStatus = await getCurrentUserStatus(user.uid);
    const status = currentStatus?.status || "online";

    // Update with the current status and new activity message
    const result = await updateUserStatus(status, customMessage);

    if (result.success) {
      console.log("[UserStatusService] Activity updated:", activityType, context || "");
    }

    return result;
  } catch (error) {
    console.error("[UserStatusService] Failed to set activity:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Clear the current activity (set to idle)
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
export const clearActivity = async () => {
  return setActivity(ActivityType.IDLE);
};

/**
 * Get the current activity
 * @returns {object|null}
 */
export const getCurrentActivity = () => currentActivity;

/**
 * Update the user's custom status message directly
 * @param {string} customMessage - The custom message to display
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
export const updateCustomMessage = async customMessage => {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    // Get current status first to preserve it
    const currentStatus = await getCurrentUserStatus(user.uid);
    const status = currentStatus?.status || "online";

    // Update with the current status and new custom message
    const result = await updateUserStatus(status, customMessage);
    return result;
  } catch (error) {
    console.error("[UserStatusService] Failed to update custom message:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Get the current user's status data
 * @param {string} userId - User ID to get status for
 * @returns {Promise<object|null>}
 */
export const getCurrentUserStatus = async userId => {
  try {
    const result = await getUserStatus(userId);
    return result.data;
  } catch (error) {
    console.error("[UserStatusService] Failed to get user status:", error);
    return null;
  }
};

/**
 * Update both status and custom message
 * @param {string} status - The status (online, offline, invisible)
 * @param {string} customMessage - The custom message to display
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
export const updateStatusWithMessage = async (status, customMessage) => {
  try {
    const result = await updateUserStatus(status, customMessage);
    return result;
  } catch (error) {
    console.error("[UserStatusService] Failed to update status with message:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Clear the user's custom message
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
export const clearCustomMessage = async () => {
  return updateCustomMessage("");
};
