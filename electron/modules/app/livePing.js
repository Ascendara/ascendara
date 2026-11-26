/**
 * Live Ping Module
 * When the user opts in (the livePing setting), tells the API every few
 * minutes that Ascendara is open and whether a game is running, so the website
 * can show how many people are on Ascendara right now. The ping carries only a
 * random ID made for this, never an account or machine ID. Opting out or
 * quitting takes this install off the count at once.
 */

const fs = require("fs-extra");
const path = require("path");
const crypto = require("crypto");
const { app } = require("electron");
const authHelper = require("../core/auth-helper");
const { API_URL } = require("../core/config");
const { getSettingsManager } = require("../core/settings");

// The API counts an install as online for 10 minutes after its last ping
const PING_INTERVAL_MS = 4 * 60 * 1000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let timer = null;
// Pings run one at a time, so an opt-out can't land before an earlier ping
let queue = Promise.resolve();
// Whether the API is counting this install right now
let counted = false;
let installId = null;

function getInstallId() {
  if (installId) return installId;
  const file = path.join(app.getPath("userData"), "live-ping-id");
  try {
    const saved = fs.readFileSync(file, "utf8").trim();
    if (UUID_PATTERN.test(saved)) return (installId = saved);
  } catch {}
  installId = crypto.randomUUID();
  try {
    fs.writeFileSync(file, installId);
  } catch (error) {
    console.warn("[LivePing] Couldn't save the install ID:", error.message);
  }
  return installId;
}

const optedIn = () => getSettingsManager().getSettings().livePing === true;

async function send(body) {
  const tokenResponse = await authHelper.authenticatedFetch(`${API_URL}/auth/token`);
  if (!tokenResponse.ok) throw new Error(`Auth token: ${tokenResponse.status}`);
  const { token } = await tokenResponse.json();
  const response = await fetch(`${API_URL}/stats/live`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ id: getInstallId(), ...body }),
  });
  if (!response.ok) throw new Error(`API answered ${response.status}`);
}

async function ping() {
  if (optedIn()) {
    const playing = require("../library/games").hasRunningGames();
    await send({ playing });
    counted = true;
  } else if (counted) {
    counted = false;
    await send({ offline: true });
  }
}

// Pings now: on start, when the setting changes, and when a game starts or stops
function refreshLivePing() {
  queue = queue
    .then(ping)
    .catch(error => console.warn("[LivePing] Ping failed:", error.message));
  return queue;
}

function startLivePing() {
  if (timer) return;
  refreshLivePing();
  timer = setInterval(refreshLivePing, PING_INTERVAL_MS);
}

// On quit; best effort, since the app may close before it's sent
function stopLivePing() {
  if (timer) clearInterval(timer);
  timer = null;
  if (!counted) return;
  counted = false;
  send({ offline: true }).catch(() => {});
}

module.exports = { startLivePing, stopLivePing, refreshLivePing };
