/**
 * Index Relay Module
 * When the API can't reach the game source itself, fetches the pages it asks
 * for on this machine and hands them over. The API does all the reading.
 */

const { BrowserWindow, session } = require("electron");
const authHelper = require("../core/auth-helper");
const { API_URL } = require("../core/config");

const SOURCE_URL = "https://steamrip.com/";
const PROBE_URL = "https://steamrip.com/wp-json/wp/v2/posts?per_page=1";
const RELAY_PARTITION = "persist:index-relay";
const CLEARANCE_TIMEOUT_MS = 3 * 60 * 1000;
const SHOW_WINDOW_AFTER_MS = 5000;
const PARALLEL_FETCHES = 6;

let activeRelay = null;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Ask the API whether it is keeping the index fresh on its own
 * @returns {Promise<object>} - { success, serverRefresh, blocked, lastSuccess, ... }
 */
async function getIndexStatus() {
  try {
    const response = await fetch(`${API_URL}/localindex/status`, {
      signal: AbortSignal.timeout(15000),
    });
    return await response.json();
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function getAuthToken() {
  const response = await authHelper.authenticatedFetch(`${API_URL}/auth/token`);
  if (!response.ok) {
    throw new Error(`Failed to get auth token: ${response.status}`);
  }
  return (await response.json()).token;
}

function isSourceUrl(url) {
  try {
    const { protocol, hostname } = new URL(url);
    return (
      protocol === "https:" &&
      (hostname === "steamrip.com" || hostname.endsWith(".steamrip.com"))
    );
  } catch (e) {
    return false;
  }
}

/**
 * Load the source in the window and wait until its pages come back without a
 * challenge. The window is only shown if that doesn't happen on its own.
 */
async function waitForClearance(relayWindow, relaySession) {
  relayWindow.loadURL(SOURCE_URL).catch(() => {});
  const showTimer = setTimeout(() => {
    if (!relayWindow.isDestroyed()) relayWindow.show();
  }, SHOW_WINDOW_AFTER_MS);

  try {
    const deadline = Date.now() + CLEARANCE_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (relayWindow.isDestroyed()) {
        throw new Error("The verification window was closed");
      }
      try {
        const response = await relaySession.fetch(PROBE_URL);
        if (response.status === 200) return;
      } catch (e) {
        // Not through yet, keep waiting
      }
      await delay(2000);
    }
    throw new Error("Timed out waiting for verification");
  } finally {
    clearTimeout(showTimer);
    if (!relayWindow.isDestroyed()) relayWindow.hide();
  }
}

/**
 * Fetch the requested pages and add them to a form the API understands:
 * one file per request id, plus a status_<id> field
 */
async function fetchRequests(requests, relaySession) {
  const form = new FormData();
  for (let start = 0; start < requests.length; start += PARALLEL_FETCHES) {
    await Promise.all(
      requests.slice(start, start + PARALLEL_FETCHES).map(async request => {
        if (!isSourceUrl(request.url)) return;
        try {
          const response = await relaySession.fetch(request.url);
          const body = Buffer.from(await response.arrayBuffer());
          form.append(`status_${request.id}`, String(response.status));
          form.append(request.id, new Blob([body]), "body");
        } catch (e) {
          console.error(`Index relay could not fetch ${request.url}:`, e.message);
        }
      })
    );
  }
  return form;
}

async function runRelay() {
  const relaySession = session.fromPartition(RELAY_PARTITION);
  // The source checks the browser; don't announce an embedded one
  relaySession.setUserAgent(
    relaySession.getUserAgent().replace(/\s(Electron|ascendara)\/\S+/gi, "")
  );

  const relayWindow = new BrowserWindow({
    width: 520,
    height: 680,
    show: false,
    autoHideMenuBar: true,
    title: "Ascendara",
    webPreferences: {
      session: relaySession,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  try {
    await waitForClearance(relayWindow, relaySession);

    const headers = { Authorization: `Bearer ${await getAuthToken()}` };
    let response = await fetch(`${API_URL}/localindex/relay/start`, {
      method: "POST",
      headers,
    });
    let data = await response.json().catch(() => ({}));
    if (response.status === 409) {
      // The API doesn't need help (anymore)
      return { success: true, needed: false };
    }
    if (!response.ok || !data.success) {
      throw new Error(data.error || `Relay failed with status ${response.status}`);
    }

    const relayId = data.relayId;
    for (;;) {
      const form = await fetchRequests(data.requests || [], relaySession);
      response = await fetch(`${API_URL}/localindex/relay/${relayId}`, {
        method: "POST",
        headers,
        body: form,
      });
      data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || `Relay failed with status ${response.status}`);
      }
      if (data.done) {
        return { success: true, needed: true, changed: data.changed || 0 };
      }
    }
  } finally {
    if (!relayWindow.isDestroyed()) relayWindow.destroy();
  }
}

/**
 * Help the API refresh the index from this machine
 * @returns {Promise<{success: boolean, needed?: boolean, changed?: number, error?: string}>}
 */
function runIndexRelay() {
  if (!activeRelay) {
    activeRelay = runRelay()
      .catch(error => {
        console.error("Index relay failed:", error);
        return { success: false, error: error.message };
      })
      .finally(() => {
        activeRelay = null;
      });
  }
  return activeRelay;
}

module.exports = {
  getIndexStatus,
  runIndexRelay,
};
