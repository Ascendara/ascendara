/**
 * Modules Index
 * Exports all modules for easy importing
 *
 * Modules are split into two categories:
 * - Critical: Loaded immediately at startup (required for app to function)
 * - Lazy: Loaded on-demand when first accessed (improves startup time)
 */

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
  steamcmd: createLazyLoader("./steamcmd"),
  localRefresh: createLazyLoader("./local-refresh"),
  ludusavi: createLazyLoader("./ludusavi"),
  translations: createLazyLoader("./translations"),
  themes: createLazyLoader("./themes"),
  qrcode: createLazyLoader("./qrcode"),
};

module.exports = {
  // ============================================
  // CRITICAL MODULES - Loaded immediately
  // ============================================

  // Configuration
  config: require("./config"),

  // Core utilities
  logger: require("./logger"),
  encryption: require("./encryption"),
  utils: require("./utils"),

  // Settings management
  settings: require("./settings"),

  // Window management
  window: require("./window"),

  // Discord RPC
  discordRpc: require("./discord-rpc"),

  // Protocol handling
  protocol: require("./protocol"),

  // Core feature modules (needed at startup)
  tools: require("./tools"),
  updates: require("./updates"),
  downloads: require("./downloads"),
  games: require("./games"),
  system: require("./system"),
  ipcHandlers: require("./ipc-handlers"),

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
};
