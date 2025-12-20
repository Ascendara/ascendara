/**
 * Utility Functions Module
 * Contains helper functions used across the application
 */

const fs = require("fs-extra");
const path = require("path");
const { app } = require("electron");
const { TIMESTAMP_FILE } = require("./config");

/**
 * Sanitize text to handle special characters
 * This function handles a wide range of special characters that need to be
 * normalized for proper display or storage.
 * @param {string} text - Text to sanitize
 * @returns {string} - Sanitized text
 */
function sanitizeText(text) {
  if (!text) return "";

  return text
    .replace(/ŌĆÖ/g, "'")
    .replace(/ŌĆō/g, "-")
    .replace(/├Č/g, "ö")
    .replace(/ŌĆ£/g, '"')
    .replace(/ŌĆØ/g, '"')
    .replace(/ŌĆ"/g, "...")
    .replace(/ŌĆś/g, "'")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\//g, "-")
    .replace(/:/g, "-")
    .replace(/[<>:"\/\\|?*]/g, "")
    .trim();
}

/**
 * Sanitize game names specifically for filesystem compatibility
 * This function is more restrictive than sanitizeText and is specifically
 * designed for game names that will be used as filenames or directory names.
 * @param {string} name - Game name to sanitize
 * @returns {string} - Sanitized game name
 */
function sanitizeGameName(name) {
  const validChars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.() ";
  return name
    .split("")
    .filter(char => validChars.includes(char))
    .join("");
}

/**
 * Get file extension from MIME type
 * @param {string} mimeType - MIME type
 * @returns {string} - File extension
 */
function getExtensionFromMimeType(mimeType) {
  switch (mimeType) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    default:
      return "";
  }
}

/**
 * Update the timestamp file with new values
 * @param {Object} updates - Key-value pairs to update
 * @returns {Object} - Merged timestamp data
 */
function updateTimestampFile(updates) {
  let timestamp = {};
  try {
    if (fs.existsSync(TIMESTAMP_FILE)) {
      timestamp = JSON.parse(fs.readFileSync(TIMESTAMP_FILE, "utf8"));
    }
  } catch (err) {
    console.error("Failed to read timestamp file for merging:", err);
    timestamp = {};
  }
  const merged = { ...timestamp, ...updates };
  try {
    fs.writeFileSync(TIMESTAMP_FILE, JSON.stringify(merged, null, 2));
  } catch (err) {
    console.error("Failed to write timestamp file:", err);
  }
  return merged;
}

/**
 * Read timestamp file
 * @returns {Object} - Timestamp data
 */
function readTimestampFile() {
  try {
    if (fs.existsSync(TIMESTAMP_FILE)) {
      return JSON.parse(fs.readFileSync(TIMESTAMP_FILE, "utf8"));
    }
  } catch (err) {
    console.error("Failed to read timestamp file:", err);
  }
  return {};
}

// Error count management for rate-limiting error logs
const ERROR_COUNTS_FILE = path.join(app.getPath("userData"), "error-counts.json");

function getErrorCounts() {
  try {
    if (fs.existsSync(ERROR_COUNTS_FILE)) {
      const data = fs.readFileSync(ERROR_COUNTS_FILE, "utf8");
      return new Map(Object.entries(JSON.parse(data)));
    }
  } catch (error) {
    console.error("Error reading error counts:", error);
  }
  return new Map();
}

function saveErrorCounts(counts) {
  try {
    fs.writeFileSync(
      ERROR_COUNTS_FILE,
      JSON.stringify(Object.fromEntries(counts)),
      "utf8"
    );
  } catch (error) {
    console.error("Error saving error counts:", error);
  }
}

/**
 * Check if an error should be logged (rate limiting)
 * @param {string} errorKey - Unique error identifier
 * @returns {boolean} - Whether to log the error
 */
function shouldLogError(errorKey) {
  const MAX_ERROR_LOGS = 2;
  const counts = getErrorCounts();
  const count = counts.get(errorKey) || 0;
  if (count < MAX_ERROR_LOGS) {
    counts.set(errorKey, count + 1);
    saveErrorCounts(counts);
    return true;
  }
  return false;
}

/**
 * Print stylish dev mode intro in terminal
 * @param {string} appVersion - App version
 * @param {string} nodeEnv - Node environment
 * @param {boolean} isDev - Is development mode
 */
function printDevModeIntro(appVersion, nodeEnv, isDev = true) {
  const os = require("os");
  const ip = require("ip");

  // Clear the console
  console.clear();

  const hostname = os.hostname();
  const platform = os.platform();
  const release = os.release();
  const arch = os.arch();
  const localIp = ip.address();

  // ANSI color codes for simple coloring
  const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    yellow: "\x1b[33m",
  };

  // Title with decoration
  console.log("");
  console.log(
    `${colors.cyan}${colors.bright}  ╔═══════════════════════════════════════════╗${colors.reset}`
  );
  console.log(
    `${colors.cyan}${colors.bright}  ║           ASCENDARA DEVELOPER MODE        ║${colors.reset}`
  );
  console.log(
    `${colors.cyan}${colors.bright}  ║           Version: ${appVersion} (${nodeEnv})${" ".repeat(Math.max(0, 15 - appVersion.length - nodeEnv.length))}    ║${colors.reset}`
  );
  console.log(
    `${colors.cyan}${colors.bright}  ╚═══════════════════════════════════════════╝${colors.reset}`
  );
  console.log("");

  // System Information
  console.log(`${colors.green}  💻 SYSTEM INFORMATION${colors.reset}`);
  console.log(`    OS: ${platform} ${release} (${arch})`);
  console.log(`    Hostname: ${hostname}`);
  console.log("");

  // Network Information
  console.log(`${colors.blue}  🌐 NETWORK INFORMATION${colors.reset}`);
  console.log(`    Local IP: ${localIp}`);
  console.log(`    Connect: http://${localIp}`);
  console.log("");

  // Developer Tools
  console.log(`${colors.magenta}  🛠️  DEVELOPER TOOLS${colors.reset}`);
  console.log("    • Press Ctrl+C to exit developer mode");
  console.log("    • View logs in console for debugging");
  console.log("");

  // Documentation
  console.log(`${colors.yellow}  📚 DOCUMENTATION${colors.reset}`);
  console.log("    • Docs: https://ascendara.app/docs");
  console.log("");
}

module.exports = {
  sanitizeText,
  sanitizeGameName,
  getExtensionFromMimeType,
  updateTimestampFile,
  readTimestampFile,
  shouldLogError,
  printDevModeIntro,
};
