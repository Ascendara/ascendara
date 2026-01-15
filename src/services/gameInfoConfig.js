/**
 * Game APIs Configuration
 *
 * This file stores the configuration for game data APIs:
 * - Steam: Built-in and automatically configured
 */

// Default configuration for all APIs
const defaultConfig = {
  // Cache duration in milliseconds (default: 7 days)
  cacheDuration: 7 * 24 * 60 * 60 * 1000,

  // Steam configuration (always enabled with hardcoded key)
  steam: {
    enabled: true,
    apiKey: "HARDCODED_FROM_CONFIG", // Loaded from electron config
  },
};

/**
 * Custom hook to get all game API configurations
 * @returns {Object} Configuration for all game APIs
 */
export const useGameApisConfig = () => {
  // Steam config - always enabled with hardcoded key from electron
  // The actual key is loaded from electron config in gameInfoService
  const steamEnabled = true;

  return {
    cacheDuration: defaultConfig.cacheDuration,

    // Steam - always enabled
    steam: {
      enabled: steamEnabled,
      apiKey: "HARDCODED_FROM_CONFIG", // Loaded in gameInfoService
    },
  };
};

/**
 * Load game APIs configuration from electron store
 * @returns {Object} Game APIs configuration
 */
export const loadConfig = async () => {
  try {
    const config = (await window.electron.getStoreValue("gameApisConfig")) || {};
    return { ...defaultConfig, ...config };
  } catch (error) {
    console.error("Error loading game APIs config:", error);
    return defaultConfig;
  }
};

/**
 * Save game APIs configuration to electron store
 * @param {Object} config - Game APIs configuration to save
 * @returns {Promise<boolean>} Success status
 */
export const saveConfig = async config => {
  try {
    await window.electron.setStoreValue("gameApisConfig", {
      ...defaultConfig,
      ...config,
    });
    return true;
  } catch (error) {
    console.error("Error saving game APIs config:", error);
    return false;
  }
};

export default {
  defaultConfig,
  loadConfig,
  saveConfig,
};
