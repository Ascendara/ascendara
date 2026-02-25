/**
 * Time-Based Authentication Helper
 * Generates rotating HMAC signatures that change every hour
 * This prevents forked projects from accessing the API without SECRET_KEY
 */

const crypto = require("crypto");
const config = require("../config.prod.js");
const buildSignatureLoader = require("./build-signature-loader");
const SECRET_SEED = config.SECRET_SEED;

/**
 * Generate time-based authentication headers
 * @returns {Object} Headers with X-Timestamp, X-Signature, and build signature
 */
function generateAuthHeaders() {
  // Get current timestamp
  const timestamp = Math.floor(Date.now() / 1000).toString();

  // Get current hour for rotating secret
  const currentHour = Math.floor(Date.now() / 1000 / 3600);

  // Combine secret seed with current hour
  const rotatingSecret = `${SECRET_SEED}:${currentHour}`;

  // Generate HMAC signature
  const signature = crypto
    .createHmac("sha256", rotatingSecret)
    .update(timestamp)
    .digest("hex");

  // Get build signature headers
  const buildHeaders = buildSignatureLoader.getBuildSignatureHeaders();

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
  const authHeaders = generateAuthHeaders();

  const mergedOptions = {
    ...options,
    headers: {
      ...options.headers,
      ...authHeaders,
    },
  };

  return fetch(url, mergedOptions);
}

module.exports = {
  generateAuthHeaders,
  authenticatedFetch,
};
