/**
 * Modules Index
 * Exports all modules for easy importing
 *
 * Modules are split into two categories:
 * - Critical: Loaded immediately at startup (required for app to function)
 * - Lazy: Loaded on-demand when first accessed (improves startup time)
 */

const { ipcMain } = require("electron");
const security = require("./core/security");
const rendererNetwork = require("./app/renderer-network");
const recovery = require("./app/recovery");

// Install the IPC guard before feature modules register their handlers.
security.installIpcMainGuard(ipcMain);

rendererNetwork.registerRendererNetworkHandlers(ipcMain);
recovery.registerRecoveryHandlers(ipcMain);

// Cache for lazy-loaded modules
const lazyModuleCache = {};

/**
 * Create a lazy loader for a module
 * @param {string} modulePath - Path to the module
 * @returns {function} - Function that returns the module (loading it if needed)
 */
function createLazyLoader(modulePath) {
  return () => {
    if (!lazyModuleCache[modulePath]) {
      lazyModuleCache[modulePath] = require(modulePath);
    }
    return lazyModuleCache[modulePath];
  };
}

// Lazy loaders for non-critical modules
const lazyLoaders = {
  steamcmd: createLazyLoader("./system/steamcmd"),
  localRefresh: createLazyLoader("./sources/local-refresh"),
  ludusavi: createLazyLoader("./library/ludusavi"),
  translations: createLazyLoader("./app/translations"),
  themes: createLazyLoader("./app/themes"),
  qrcode: createLazyLoader("./app/qrcode"),
  umuDatabase: createLazyLoader("./compat/umu-database"),
};

module.exports = {
  // ============================================
  // CRITICAL MODULES - Loaded immediately
  // ============================================

  // Configuration
  config: require("./core/config"),

  // Core utilities
  logger: require("./core/logger"),
  encryption: require("./core/encryption"),
  recovery,
  rendererNetwork,
  security,
  utils: require("./core/utils"),

  // Settings management
  settings: require("./core/settings"),

  // Window management
  window: require("./app/window"),

  // Discord RPC
  discordRpc: require("./app/discord-rpc"),

  // Protocol handling
  protocol: require("./app/protocol"),

  // Core feature modules (needed at startup)
  tools: require("./system/tools"),
  updates: require("./system/updates"),
  downloads: require("./downloads/downloads"),
  games: require("./library/games"),
  system: require("./system/system"),
  ipcHandlers: require("./app/ipc-handlers"),

  // ============================================
  // LAZY MODULES - Loaded on first access
  // ============================================

  // These getters load modules only when accessed
  get steamcmd() {
    return lazyLoaders.steamcmd();
  },
  get localRefresh() {
    return lazyLoaders.localRefresh();
  },
  get ludusavi() {
    return lazyLoaders.ludusavi();
  },
  get translations() {
    return lazyLoaders.translations();
  },
  get themes() {
    return lazyLoaders.themes();
  },
  get qrcode() {
    return lazyLoaders.qrcode();
  },
  get umuDatabase() {
    return lazyLoaders.umuDatabase();
  },
};
