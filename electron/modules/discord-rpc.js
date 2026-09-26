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
// Keep separate sessions so closing a Retro emulator cannot clear a PC game's
// presence, or another Retro game that is still running.
const playingSessions = new Map();
let retryTimeout = null;
let playingRefresh = null;
let connecting = false;
let connectionGeneration = 0;
let activityQueue = Promise.resolve();
let desiredState = "default";

const PLAYING_REFRESH_MS = 20000;

function scheduleRetry(delay) {
  if (retryTimeout) clearTimeout(retryTimeout);
  retryTimeout = setTimeout(() => {
    retryTimeout = null;
    initializeDiscordRPC();
  }, delay);
  retryTimeout.unref?.();
}

function syncPlayingRefresh() {
  if (playingSessions.size && !playingRefresh) {
    playingRefresh = setInterval(publishPlayingActivity, PLAYING_REFRESH_MS);
    playingRefresh.unref?.();
  } else if (!playingSessions.size && playingRefresh) {
    clearInterval(playingRefresh);
    playingRefresh = null;
  }
}

function publishActivity() {
  if (!rpc || !rpcIsConnected) return;
  const client = rpc;
  // Serialize writes: a pending browsing update must never land after a game starts.
  activityQueue = activityQueue.catch(() => {}).then(() => {
    if (client !== rpc || !rpcIsConnected) return;
    const session = [...playingSessions.values()].at(-1);
    const activity = session
      ? {
          details: "Playing a Game",
          state: session.name,
          startTimestamp: session.startedAt,
          largeImageKey: "ascendara",
          largeImageText: "Ascendara",
          buttons: [{ label: "Play on Ascendara", url: "https://ascendara.app/" }],
        }
      : {
          state: desiredState === "downloading"
            ? "Watching download progress..."
            : desiredState === "idle" ? "Idling..." : "Searching for games...",
          largeImageKey: "ascendara",
          largeImageText: "Ascendara",
        };
    return client.setActivity(activity);
  }).catch(error => {
    console.warn("Failed to update Discord RPC activity:", error);
  });
}

/**
 * Check if Discord is running
 */
async function isDiscordRunning() {
  try {
    if (process.platform === "win32") {
      const { stdout } = await execAsync('tasklist /FO CSV /NH');
      return /"discord(?:canary|ptb|development)?\.exe"/i.test(stdout);
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
  ++connectionGeneration;
  connecting = false;
  rpcConnectionAttempts = 0;
  if (retryTimeout) {
    clearTimeout(retryTimeout);
    retryTimeout = null;
  }
  if (playingRefresh) {
    clearInterval(playingRefresh);
    playingRefresh = null;
  }
  const client = rpc;
  rpc = null;
  rpcIsConnected = false;
  activityQueue = Promise.resolve();
  if (!client) return;
  client.removeAllListeners();
  Promise.resolve(client.destroy()).catch(() => {});
  console.log("Discord RPC has been destroyed");
}

/**
 * Initialize Discord RPC connection
 */
async function initializeDiscordRPC() {
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

  if (connecting || rpcIsConnected) return;
  connecting = true;
  const generation = connectionGeneration;
  if (retryTimeout) {
    clearTimeout(retryTimeout);
    retryTimeout = null;
  }

  let discordRunning;
  try {
    discordRunning = await isDiscordRunning();
  } catch (error) {
    console.warn("Discord process check failed:", error);
    discordRunning = false;
  }
  if (generation !== connectionGeneration) return;
  if (!discordRunning) {
    connecting = false;
    scheduleRetry(30000);
    return;
  }

  let client;
  try {
    client = new Client({ transport: "ipc" });
  } catch (error) {
    connecting = false;
    scheduleRetry(30000);
    console.warn("Discord RPC client could not start:", error);
    return;
  }
  rpc = client;
  const failed = error => {
    if (client !== rpc || generation !== connectionGeneration) return;
    console.warn("Discord RPC connection lost:", error?.message || error);
    client.removeAllListeners();
    rpc = null;
    rpcIsConnected = false;
    connecting = false;
    activityQueue = Promise.resolve();
    Promise.resolve(client.destroy()).catch(() => {});
    const delay = Math.min(2000 * 2 ** rpcConnectionAttempts++, 30000);
    scheduleRetry(delay);
  };

  client.on("ready", () => {
    if (client !== rpc || generation !== connectionGeneration) return;
    rpcConnectionAttempts = 0;
    rpcIsConnected = true;
    connecting = false;
    activityQueue = Promise.resolve();
    console.log("Discord RPC is ready");
    syncPlayingRefresh();
    publishActivity();
  });
  client.on("error", failed);
  client.on("disconnected", failed);
  client.login({ clientId }).catch(failed);
}

/**
 * Update Discord RPC to library state
 */
function updateDiscordRPCToLibrary(sessionId = "pc") {
  playingSessions.delete(sessionId);
  syncPlayingRefresh();
  publishActivity();
}

/**
 * Set Discord RPC activity for playing a game
 * @param {string} gameName - Name of the game being played
 */
function setPlayingActivity(gameName, sessionId = "pc") {
  playingSessions.delete(sessionId);
  playingSessions.set(sessionId, { name: gameName, startedAt: new Date() });
  syncPlayingRefresh();
  if (!rpc && !connecting) initializeDiscordRPC();
  publishPlayingActivity();
}

function publishPlayingActivity() {
  if (playingSessions.size) publishActivity();
}

/**
 * Set Discord RPC activity based on state
 * @param {string} state - State to set ("default", "downloading")
 */
function setRPCState(state) {
  if (!["default", "downloading", "idle"].includes(state)) return;
  desiredState = state;
  if (!playingSessions.size) publishActivity();
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
