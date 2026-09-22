/**
 * Library for managing game folders in the Ascendara application
 * Handles saving, loading, and manipulating folder data
 */

const FOLDERS_STORAGE_KEY = "library-folders";

/**
 * Load all folders from localStorage
 * @returns {Array} Array of folder objects
 */
export const loadFolders = () => {
  try {
    const savedFolders = localStorage.getItem(FOLDERS_STORAGE_KEY);
    return savedFolders ? JSON.parse(savedFolders) : [];
  } catch (error) {
    console.error("Error loading folders:", error);
    return [];
  }
};

/**
 * Save folders to localStorage
 * @param {Array} folders - Array of folder objects to save
 */
export const saveFolders = folders => {
  try {
    localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(folders));
  } catch (error) {
    console.error("Error saving folders:", error);
  }
};

/**
 * Create a new folder
 * @param {string} name - Name of the folder
 * @returns {Object} The newly created folder object
 */
export const createFolder = name => {
  const newFolder = {
    game: name,
    isFolder: true,
    isCustom: true,
    items: [],
  };

  const folders = loadFolders();
  const updatedFolders = [...folders, newFolder];
  saveFolders(updatedFolders);

  return newFolder;
};

/**
 * Add a game to a folder
 * @param {Object} game - Game object to add
 * @param {string} folderName - Name of the folder to add the game to
 * @returns {Array} Updated array of folders
 */
export const addGameToFolder = (game, folderName) => {
  const folders = loadFolders();

  const updatedFolders = folders.map(folder =>
    folder.game === folderName
      ? { ...folder, items: [...(folder.items || []), game] }
      : folder
  );

  saveFolders(updatedFolders);
  return updatedFolders;
};

/**
 * Remove a game from a folder
 * @param {string} gameId - ID of the game to remove (game.game or game.name)
 * @param {string} folderName - Name of the folder to remove the game from
 * @returns {Array} Updated array of folders
 */
export const removeGameFromFolder = (gameId, folderName) => {
  const folders = loadFolders();

  const updatedFolders = folders.map(folder =>
    folder.game === folderName
      ? {
          ...folder,
          items: folder.items.filter(game => (game.game || game.name) !== gameId),
        }
      : folder
  );

  saveFolders(updatedFolders);
  return updatedFolders;
};

/**
 * Delete a folder
 * @param {string} folderName - Name of the folder to delete
 * @returns {Array} Updated array of folders
 */
export const deleteFolder = folderName => {
  const folders = loadFolders();
  const updatedFolders = folders.filter(folder => folder.game !== folderName);
  saveFolders(updatedFolders);
  return updatedFolders;
};

/**
 * Check if a game is in any folder
 * @param {Object} game - Game object to check
 * @returns {boolean} True if the game is in a folder
 */
export const isGameInFolder = game => {
  const folders = loadFolders();
  const gameId = game.game || game.name;

  return folders.some(folder =>
    folder.items?.some(folderGame => (folderGame.game || folderGame.name) === gameId)
  );
};

/**
 * Get all games that are in folders
 * @returns {Array} Array of game objects that are in folders
 */
export const getGamesInFolders = () => {
  const folders = loadFolders();
  return folders.flatMap(folder => folder.items || []);
};

/**
 * Filter out games that are in folders
 * @param {Array} games - Array of game objects
 * @returns {Array} Array of games that are not in any folder
 */
export const filterGamesNotInFolders = games => {
  const gamesInFolders = getGamesInFolders();

  return games.filter(
    game =>
      !gamesInFolders.some(
        folderGame => (folderGame.game || folderGame.name) === (game.game || game.name)
      )
  );
};

/**
 * Get a folder by name
 * @param {string} folderName - Name of the folder to get
 * @returns {Object|null} The folder object or null if not found
 */
export const getFolderByName = folderName => {
  const folders = loadFolders();
  return folders.find(folder => folder.game === folderName) || null;
};

/**
 * Update folder name
 * @param {string} oldFolderName - Current name of the folder
 * @param {string} newFolderName - New name for the folder
 * @returns {Array} Updated array of folders
 */
export const updateFolderName = (oldFolderName, newFolderName) => {
  const folders = loadFolders();

  // Check if a folder with the new name already exists
  const folderWithNewNameExists = folders.some(folder => folder.game === newFolderName);
  if (folderWithNewNameExists) {
    throw new Error("A folder with this name already exists");
  }

  const updatedFolders = folders.map(folder =>
    folder.game === oldFolderName ? { ...folder, game: newFolderName } : folder
  );

  saveFolders(updatedFolders);

  // Also update folder-specific favorites
  try {
    const favoritesObj = JSON.parse(localStorage.getItem("folder-favorites") || "{}");
    if (favoritesObj[oldFolderName]) {
      favoritesObj[newFolderName] = favoritesObj[oldFolderName];
      delete favoritesObj[oldFolderName];
      localStorage.setItem("folder-favorites", JSON.stringify(favoritesObj));
    }
  } catch (error) {
    console.error("Error updating folder favorites:", error);
  }

  return updatedFolders;
};

/**
 * Update a game's properties in all folders
 * @param {string} gameId - ID of the game to update (game.game or game.name)
 * @param {Object} updatedProperties - Object containing the properties to update
 * @returns {Array} Updated array of folders
 */
export const updateGameInFolders = (gameId, updatedProperties) => {
  const folders = loadFolders();
  let updated = false;

  const updatedFolders = folders.map(folder => {
    // Check if this folder contains the game
    const gameIndex = folder.items?.findIndex(
      game => (game.game || game.name) === gameId
    );

    if (gameIndex !== -1 && gameIndex !== undefined) {
      // Create a new items array with the updated game
      const updatedItems = [...folder.items];
      updatedItems[gameIndex] = {
        ...updatedItems[gameIndex],
        ...updatedProperties,
      };

      updated = true;
      return { ...folder, items: updatedItems };
    }

    return folder;
  });

  if (updated) {
    saveFolders(updatedFolders);

    // Dispatch an event to notify that folders have been updated
    try {
      window.dispatchEvent(new CustomEvent("ascendara:game-updated-in-folders"));
    } catch (error) {
      console.error("Error dispatching game-updated-in-folders event:", error);
    }
  }

  return updatedFolders;
};

// Hiding a folder keeps its games in the folder and preserves all metadata.
export const setFolderHidden = (folderName, hidden) => {
  const folders = loadFolders().map(folder =>
    folder.game === folderName ? { ...folder, hidden } : folder
  );
  saveFolders(folders);
  window.dispatchEvent(new CustomEvent("ascendara:folders-updated"));
  return folders;
};
