/**
 * Service for handling game updates across the application
 * Ensures that when a game's properties are updated, they are updated in all locations
 */

import { updateGameInFolders } from "@/lib/folderManager";

/**
 * Update a game's executable path in both the main library and any folders containing the game
 * @param {string} gameId - ID of the game to update (game.game or game.name)
 * @param {string} executablePath - The new executable path
 */
export const updateGameExecutable = async (gameId, executablePath) => {
  try {
    // First, update the game in the main library via the electron API
    await window.electron.modifyGameExecutable(gameId, executablePath);

    // Then, update the game in any folders it might be in
    updateGameInFolders(gameId, { executable: executablePath });

    console.log(
      `Updated executable for game ${gameId} to ${executablePath} in all locations`
    );
    return true;
  } catch (error) {
    console.error("Error updating game executable:", error);
    return false;
  }
};

/**
 * Get all executables for a game
 * @param {string} gameId - ID of the game
 * @param {boolean} isCustom - Whether this is a custom game
 * @returns {Promise<string[]>} Array of executable paths
 */
export const getGameExecutables = async (gameId, isCustom = false) => {
  try {
    const executables = await window.electron.getGameExecutables(gameId, isCustom);
    return executables || [];
  } catch (error) {
    console.error("Error getting game executables:", error);
    return [];
  }
};

/**
 * Update all executables for a game (first one is primary)
 * @param {string} gameId - ID of the game to update
 * @param {string[]} executables - Array of executable paths (first is primary)
 * @param {boolean} isCustom - Whether this is a custom game
 */
export const updateGameExecutables = async (gameId, executables, isCustom = false) => {
  try {
    if (!Array.isArray(executables) || executables.length === 0) {
      console.error("Executables must be a non-empty array");
      return false;
    }

    // Update via electron API
    await window.electron.setGameExecutables(gameId, executables, isCustom);

    // Update folders with primary executable for backwards compatibility
    updateGameInFolders(gameId, { executable: executables[0] });

    console.log(`Updated executables for game ${gameId}: ${executables.join(", ")}`);
    return true;
  } catch (error) {
    console.error("Error updating game executables:", error);
    return false;
  }
};

export default {
  updateGameExecutable,
  getGameExecutables,
  updateGameExecutables,
};
