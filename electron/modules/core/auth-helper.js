/**
 * Time-Based Authentication Helper
 * Generates rotating HMAC signatures that change every hour
 * This prevents forked projects from accessing the API without SECRET_KEY
 */

const crypto = require("crypto");
const buildSignatureLoader = require("./build-signature-loader");

// Source checkouts do not include the private production config.
let productionConfig = {};
try {
  productionConfig = require("../../config.prod.js");
} catch (error) {
  const missingPrivateConfig =
    error?.code === "MODULE_NOT_FOUND" &&
    String(error.message || "").includes("config.prod.js");

  if (!missingPrivateConfig) throw error;
}

const SECRET_SEED =
  process.env.ASCENDARA_SECRET_SEED || productionConfig.SECRET_SEED || null;
let missingAuthWarningShown = false;

// Server time minus local time, in ms. Users with a wrong system clock would
// otherwise sign every request with a timestamp the API rejects.
let serverOffsetMs = 0;
// Below this the clock is close enough; Date headers only have 1s resolution.
const MIN_SKEW_MS = 30 * 1000;
const RESYNC_INTERVAL_MS = 30 * 60 * 1000;

function serverNow() {
  return Date.now() + serverOffsetMs;
}

/**
 * Update the clock offset from an HTTP Date header sent by the API
 * @param {string} dateHeader - Value of the Date response header
 */
function updateServerTimeFromDateHeader(dateHeader) {
  const serverMs = Date.parse(dateHeader);
  if (Number.isNaN(serverMs)) return;

  const offset = serverMs - Date.now();
  const nextOffset = Math.abs(offset) < MIN_SKEW_MS ? 0 : offset;
  if (Math.abs(nextOffset - serverOffsetMs) >= MIN_SKEW_MS) {
    console.warn(
      `[Auth] System clock differs from server by ${Math.round(offset / 1000)}s, correcting`
    );
  }
  serverOffsetMs = nextOffset;
}

async function syncServerTime() {
  const { API_URL } = require("./config");
  try {
    const response = await fetch(`${API_URL}/health`, { method: "HEAD" });
    const dateHeader = response.headers.get("date");
    if (dateHeader) updateServerTimeFromDateHeader(dateHeader);
  } catch (error) {
    console.warn("[Auth] Failed to sync server time:", error.message);
  }
}

/**
 * Track the API's clock so signed requests stay valid when the system clock is wrong.
 * Syncs now and periodically, and learns from every API response the renderer receives.
 * @param {Electron.Session} session - Session the renderer makes API requests through
 */
function startServerTimeSync(session) {
  const { API_URL } = require("./config");
  // onHeadersReceived runs before the renderer sees the response, so a retry
  // after a clock_skew rejection is already signed with the corrected time
  session.webRequest.onHeadersReceived(
    { urls: [`${API_URL}/*`] },
    (details, callback) => {
      const headers = details.responseHeaders || {};
      const dateKey = Object.keys(headers).find(key => key.toLowerCase() === "date");
      if (dateKey) updateServerTimeFromDateHeader(headers[dateKey][0]);
      callback({});
    }
  );

  syncServerTime();
  setInterval(syncServerTime, RESYNC_INTERVAL_MS).unref?.();
}

/**
 * Generate time-based authentication headers
 * @returns {Object} Headers with X-Timestamp, X-Signature, and build signature
 */
function generateAuthHeaders() {
  const buildHeaders = buildSignatureLoader.getBuildSignatureHeaders();

  if (!SECRET_SEED) {
    if (!missingAuthWarningShown) {
      console.warn(
        "[Auth] Private API authentication is unavailable in this source build. Protected Ascendara endpoints may reject requests."
      );
      missingAuthWarningShown = true;
    }

    return buildHeaders;
  }

  // Get current timestamp, corrected to the server's clock
  const nowSeconds = Math.floor(serverNow() / 1000);
  const timestamp = nowSeconds.toString();

  // Get current hour for rotating secret
  const currentHour = Math.floor(nowSeconds / 3600);

  // Combine secret seed with current hour
  const rotatingSecret = `${SECRET_SEED}:${currentHour}`;

  // Generate HMAC signature
  const signature = crypto
    .createHmac("sha256", rotatingSecret)
    .update(timestamp)
    .digest("hex");

  return {
    "X-Timestamp": timestamp,
    "X-Signature": signature,
    ...buildHeaders,
  };
}

/**
 * Make authenticated request to API
 * @param {string} url - API endpoint URL
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>}
 */
async function authenticatedFetch(url, options = {}) {
  const send = () =>
    fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        ...generateAuthHeaders(),
      },
    });

  let response = await send();
  const dateHeader = response.headers.get("date");
  if (dateHeader) updateServerTimeFromDateHeader(dateHeader);
  if (response.status === 401 && (await isClockSkewResponse(response))) {
    response = await send();
  }
  return response;
}

async function isClockSkewResponse(response) {
  try {
    const data = await response.clone().json();
    return data?.error === "clock_skew";
  } catch {
    return false;
  }
}

module.exports = {
  generateAuthHeaders,
  authenticatedFetch,
  startServerTimeSync,
};
