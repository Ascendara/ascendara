/**
 * Discord RPC Module
 * Handles Discord Rich Presence integration
 */

const { Client } = require("discord-rpc");
const { clientId, isDev } = require("./config");
const { exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);

let rpc = null;
let rpcIsConnected = false;
let rpcConnectionAttempts = 0;
const MAX_RPC_ATTEMPTS = 3;
let currentlyPlayingGame = null;
// Keep separate sessions so closing a Retro emulator cannot clear a PC game's
// presence, or another Retro game that is still running.
const playingSessions = new Map();
let activityRevision = 0;
let retryTimeout = null;

/**
 * Check if Discord is running
 */
async function isDiscordRunning() {
  try {
    if (process.platform === "win32") {
      const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq Discord.exe" /FO CSV /NH');
      return stdout.toLowerCase().includes("discord.exe");
    } else if (process.platform === "darwin") {
      const { stdout } = await execAsync('pgrep -x Discord || pgrep -x "Discord Canary" || pgrep -x "Discord PTB"');
      return stdout.trim().length > 0;
    } else {
      const { stdout } = await execAsync('pgrep -x discord || pgrep -x "discordcanary" || pgrep -x "discordptb"');
      return stdout.trim().length > 0;
    }
  } catch {
    return false;
  }
}

/**
 * Destroy the Discord RPC connection
 */
function destroyDiscordRPC() {
  // Clear any pending retry
  if (retryTimeout) {
    clearTimeout(retryTimeout);
    retryTimeout = null;
  }
  
  if (rpc) {
    try {
      // Remove event listeners to prevent callbacks after destroy
      rpc.removeAllListeners();
      
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
    }
    console.log("Discord RPC has been destroyed");
  }
}

/**
 * Initialize Discord RPC connection
 */
async function initializeDiscordRPC() {
  if (rpcConnectionAttempts >= MAX_RPC_ATTEMPTS) {
    console.log("Maximum Discord RPC connection attempts reached. Stopping retries.");
    return;
  }

  if (isDev) {
    console.log("Discord RPC is disabled in development mode");
    return;
  }

  const { getSettingsManager } = require("./settings");
  const settingsManager = getSettingsManager();
  const settings = settingsManager.getSettings();
  if (settings.rpcEnabled === false) {
    console.log("Discord RPC is disabled in settings");
    return;
  }

  // Check if Discord is running first
  const discordRunning = await isDiscordRunning();
  if (!discordRunning) {
    console.log("Discord is not running, skipping RPC connection");
    // Try again in 30 seconds to see if Discord was started
    if (rpcConnectionAttempts < MAX_RPC_ATTEMPTS) {
      rpcConnectionAttempts++;
      console.log(`Discord RPC connection attempt ${rpcConnectionAttempts}/${MAX_RPC_ATTEMPTS} - Discord not running, retrying in 30s`);
      retryTimeout = setTimeout(initializeDiscordRPC, 30000);
    }
    return;
  }

  // Ensure any existing client is cleaned up
  destroyDiscordRPC();

  // Small delay to ensure Discord IPC is ready
  await new Promise(resolve => setTimeout(resolve, 500));

  rpc = new Client({ transport: "ipc" });
  let errorHandled = false;

  rpc.on("ready", () => {
    // Reset connection attempts on successful connection
    rpcConnectionAttempts = 0;
    rpcIsConnected = true;
    errorHandled = false;
    console.log("Discord RPC is ready");

    // Restore playing state if a game is running, otherwise show library state
    if (currentlyPlayingGame) {
      publishPlayingActivity();
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
    // Prevent double-handling errors
    if (errorHandled) return;
    errorHandled = true;
    
    // Log full error details
    const errorDetails = error?.message || error?.code || JSON.stringify(error) || "Unknown error";
    console.error("Discord RPC error:", errorDetails);
    
    rpcIsConnected = false;
    rpcConnectionAttempts++;

    if (rpcConnectionAttempts < MAX_RPC_ATTEMPTS) {
      const backoffDelay = Math.min(2000 * Math.pow(2, rpcConnectionAttempts - 1), 10000);
      console.log(
        `Discord RPC connection attempt ${rpcConnectionAttempts}/${MAX_RPC_ATTEMPTS}, retrying in ${backoffDelay}ms`
      );
      retryTimeout = setTimeout(initializeDiscordRPC, backoffDelay);
    } else {
      console.log("Maximum Discord RPC connection attempts reached. Stopping retries.");
    }
  });

  rpc.login({ clientId }).catch(error => {
    // Prevent double-handling if error event already fired
    if (errorHandled) return;
    errorHandled = true;
    
    // Log full error details
    const errorDetails = error?.message || error?.code || JSON.stringify(error) || "Unknown error";
    console.error("Discord RPC login error:", errorDetails);
    
    rpcIsConnected = false;
    rpcConnectionAttempts++;

    if (rpcConnectionAttempts < MAX_RPC_ATTEMPTS) {
      const backoffDelay = Math.min(2000 * Math.pow(2, rpcConnectionAttempts - 1), 10000);
      console.log(
        `Discord RPC connection attempt ${rpcConnectionAttempts}/${MAX_RPC_ATTEMPTS}, retrying in ${backoffDelay}ms`
      );
      retryTimeout = setTimeout(initializeDiscordRPC, backoffDelay);
    } else {
      console.log("Maximum Discord RPC connection attempts reached. Stopping retries.");
    }
  });
}

/**
 * Update Discord RPC to library state
 */
function updateDiscordRPCToLibrary(sessionId = "pc") {
  playingSessions.delete(sessionId);
  const revision = ++activityRevision;
  if (playingSessions.size) {
    publishPlayingActivity();
    return;
  }
  currentlyPlayingGame = null;
  if (!rpc || !rpcIsConnected) return;

  // First disconnect any existing activity
  const client = rpc;
  client
    .clearActivity()
    .then(() => {
      // Wait a bit longer to ensure clean state
      setTimeout(() => {
        if (revision !== activityRevision || currentlyPlayingGame || client !== rpc || !rpcIsConnected) return;
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
function setPlayingActivity(gameName, sessionId = "pc") {
  playingSessions.delete(sessionId);
  playingSessions.set(sessionId, { name: gameName, startedAt: new Date() });
  ++activityRevision;
  publishPlayingActivity();
}

function publishPlayingActivity() {
  const session = [...playingSessions.values()].at(-1);
  currentlyPlayingGame = session?.name || null;
  if (!session) return;
  if (!rpc || !rpcIsConnected) return;

  rpc
    .setActivity({
      details: "Playing a Game",
      state: session.name,
      startTimestamp: session.startedAt,
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
  if (isDev) {
    return;
  }
  if (!rpc || !rpcIsConnected) {
    console.log("Discord RPC not connected, skipping activity update");
    return;
  }
  // Never let generic UI states (idle/default/downloading) override the
  // "Playing a Game" activity while a game is actually running.
  if (currentlyPlayingGame) {
    console.log("Discord RPC: a game is currently playing, ignoring state change to", state);
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
    } else if (state === "idle") {
      rpc
        .setActivity({
          state: "Idling...",
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
