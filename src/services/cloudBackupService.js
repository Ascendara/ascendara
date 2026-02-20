import { uploadBackup } from "./firebaseService";
/**
 * Upload the latest local backup to cloud
 * Centralized logic for cloud backup uploads
 *
 * @param {string} gameName - Name of the game
 * @param {object} settings - App settings (for backupLocation)
 * @param {object} user - Firebase user object
 * @param {object} userData - User data (for subscription check)
 * @returns {Promise<{success: boolean, error: string|null, code?: string}>}
 */
export const uploadBackupToCloud = async (gameName, settings, user, userData) => {
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }
  const backupLocation = settings?.ludusavi?.backupLocation;
  if (!backupLocation) {
    return { success: false, error: "Backup location not configured" };
  }
  try {
    const gameBackupFolder = `${backupLocation}/${gameName}`;
    const backupFiles = await window.electron.listBackupFiles(gameBackupFolder);

    if (!backupFiles || backupFiles.length === 0) {
      return { success: false, error: "No backup files found" };
    }
    const zipBackups = backupFiles.filter(f => f.endsWith(".zip"));
    if (zipBackups.length === 0) {
      return { success: false, error: "No zip backup files found" };
    }
    const latestBackup = zipBackups.sort().reverse()[0];
    const backupPath = `${gameBackupFolder}/${latestBackup}`;
    const backupFile = await window.electron.readBackupFile(backupPath);
    if (!backupFile) {
      return { success: false, error: "Failed to read backup file" };
    }
    const blob = new Blob([backupFile], { type: "application/zip" });
    const file = new File([blob], latestBackup, { type: "application/zip" });
    const uploadResult = await uploadBackup(
      file,
      gameName,
      `Auto backup - ${new Date().toLocaleString()}`
    );
    return uploadResult;
  } catch (error) {
    console.error("Upload backup to cloud error:", error);
    return { success: false, error: error.message };
  }
};
/**
 * Check if auto cloud backup is enabled for a specific game
 * @param {string} gameName - Name of the game
 * @returns {boolean}
 */
export const isAutoCloudBackupEnabled = gameName => {
  return localStorage.getItem(`cloudBackup_${gameName}`) === "true";
};
/**
 * Check if user has active Ascend subscription
 * @param {object} userData - User data object
 * @returns {boolean}
 */
export const hasActiveSubscription = userData => {
  return userData?.verified || userData?.ascendSubscription?.active === true;
};
/**
 * Auto-upload backup to cloud after game closes
 * Performs all necessary checks before uploading
 *
 * @param {string} gameName - Name of the game
 * @param {object} settings - App settings
 * @param {object} user - Firebase user
 * @param {object} userData - User data for subscription check
 * @returns {Promise<{success: boolean, error: string|null, skipped?: boolean, reason?: string}>}
 */
export const autoUploadBackupToCloud = async (gameName, settings, user, userData) => {
  if (!user) {
    return {
      success: false,
      error: "Not authenticated",
      skipped: true,
      reason: "not_authenticated",
    };
  }
  if (!hasActiveSubscription(userData)) {
    return {
      success: false,
      error: "Subscription required",
      code: "SUBSCRIPTION_REQUIRED",
      skipped: true,
      reason: "no_subscription",
    };
  }
  if (!isAutoCloudBackupEnabled(gameName)) {
    return {
      success: false,
      error: "Auto cloud backup disabled for this game",
      skipped: true,
      reason: "disabled_for_game",
    };
  }
  return await uploadBackupToCloud(gameName, settings, user, userData);
};
