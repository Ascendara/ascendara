/**
 * Discord RPC Module
 * Handles Discord Rich Presence integration
 */

const { Client } = require("discord-rpc");
const { getSettingsManager } = require("./settings");
const { clientId, isDev } = require("./config");

let rpc = null;
let rpcIsConnected = false;
let rpcConnectionAttempts = 0;
const MAX_RPC_ATTEMPTS = 3;
let currentlyPlayingGame = null;

/**
 * Destroy the Discord RPC connection
 */
function destroyDiscordRPC() {
  if (rpc) {
    try {
      if (rpc.transport && rpc.transport.socket) {
        rpc.destroy().catch(() => {
          // Ignore destroy errors
        });
      }
    } catch (error) {
      // Ignore any errors during cleanup
    } finally {
      rpc = null;
      rpcIsConnected = false;
      rpcConnectionAttempts = 0;
      currentlyPlayingGame = null;
    }
    console.log("Discord RPC has been destroyed");
  }
}

/**
 * Initialize Discord RPC connection
 */
function initializeDiscordRPC() {
  if (rpcConnectionAttempts >= MAX_RPC_ATTEMPTS) {
    console.log("Maximum Discord RPC connection attempts reached. Stopping retries.");
    return;
  }

  if (isDev) {
    console.log("Discord RPC is disabled in development mode");
    return;
  }

  const settingsManager = getSettingsManager();
  const settings = settingsManager.getSettings();
  if (settings.rpcEnabled === false) {
    console.log("Discord RPC is disabled in settings");
    return;
  }

  // Ensure any existing client is cleaned up
  destroyDiscordRPC();

  rpc = new Client({ transport: "ipc" });

  rpc.on("ready", () => {
    // Reset connection attempts on successful connection
    rpcConnectionAttempts = 0;
    rpcIsConnected = true;
    console.log("Discord RPC is ready");

    // Restore playing state if a game is running, otherwise show library state
    if (currentlyPlayingGame) {
      setPlayingActivity(currentlyPlayingGame);
    } else {
      rpc
        .setActivity({
          state: "Searching for games...",
          largeImageKey: "ascendara",
          largeImageText: "Ascendara",
        })
        .catch(() => {
          // Ignore activity setting errors
        });
    }
  });

  rpc.on("error", error => {
    console.error("Discord RPC error:", error);
    rpcConnectionAttempts++;

    if (rpcConnectionAttempts < MAX_RPC_ATTEMPTS) {
      console.log(
        `Discord RPC connection attempt ${rpcConnectionAttempts}/${MAX_RPC_ATTEMPTS}`
      );
      // Wait a bit before retrying
      setTimeout(initializeDiscordRPC, 1000);
    } else {
      console.log("Maximum Discord RPC connection attempts reached. Stopping retries.");
    }
  });

  rpc.login({ clientId }).catch(error => {
    console.error("Discord RPC login error:", error);
    rpcConnectionAttempts++;
    rpcIsConnected = false;

    if (rpcConnectionAttempts < MAX_RPC_ATTEMPTS) {
      console.log(
        `Discord RPC connection attempt ${rpcConnectionAttempts}/${MAX_RPC_ATTEMPTS}`
      );
      // Wait a bit before retrying
      setTimeout(initializeDiscordRPC, 1000);
    } else {
      console.log("Maximum Discord RPC connection attempts reached. Stopping retries.");
    }
  });
}

/**
 * Update Discord RPC to library state
 */
function updateDiscordRPCToLibrary() {
  currentlyPlayingGame = null;
  if (!rpc || !rpcIsConnected) return;

  // First disconnect any existing activity
  rpc
    .clearActivity()
    .then(() => {
      // Wait a bit longer to ensure clean state
      setTimeout(() => {
        // Then set new activity
        rpc
          .setActivity({
            state: "Searching for games...",
            largeImageKey: "ascendara",
            largeImageText: "Ascendara",
          })
          .catch(err => {
            console.log("Failed to set Discord RPC library activity:", err);
          });
      }, 500);
    })
    .catch(error => {
      console.error("Error updating Discord RPC:", error);
    });
}

/**
 * Set Discord RPC activity for playing a game
 * @param {string} gameName - Name of the game being played
 */
function setPlayingActivity(gameName) {
  currentlyPlayingGame = gameName;
  if (!rpc || !rpcIsConnected) return;

  rpc
    .setActivity({
      details: "Playing a Game",
      state: `${gameName}`,
      startTimestamp: new Date(),
      largeImageKey: "ascendara",
      largeImageText: "Ascendara",
      buttons: [
        {
          label: "Play on Ascendara",
          url: "https://ascendara.app/",
        },
      ],
    })
    .catch(err => {
      console.log("Failed to set Discord RPC playing activity:", err);
    });
}

/**
 * Set Discord RPC activity based on state
 * @param {string} state - State to set ("default", "downloading")
 */
function setRPCState(state) {
  if (!rpc || !rpcIsConnected) {
    console.log("Discord RPC not connected, skipping activity update");
    return;
  }

  try {
    if (state === "default") {
      rpc
        .setActivity({
          state: "Searching for games...",
          largeImageKey: "ascendara",
          largeImageText: "Ascendara",
        })
        .catch(err => {
          console.log("Failed to set Discord RPC activity:", err);
        });
    } else if (state === "downloading") {
      rpc
        .setActivity({
          state: "Watching download progress...",
          largeImageKey: "ascendara",
          largeImageText: "Ascendara",
        })
        .catch(err => {
          console.log("Failed to set Discord RPC activity:", err);
        });
    }
  } catch (err) {
    console.log("Failed to update Discord RPC activity:", err);
  }
}

/**
 * Get the RPC instance
 */
function getRPC() {
  return rpc;
}

/**
 * Check if RPC is connected
 */
function isRPCConnected() {
  return rpcIsConnected;
}

module.exports = {
  initializeDiscordRPC,
  destroyDiscordRPC,
  updateDiscordRPCToLibrary,
  setPlayingActivity,
  setRPCState,
  getRPC,
  isRPCConnected,
};
