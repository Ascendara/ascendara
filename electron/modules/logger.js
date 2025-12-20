/**
 * Logger Module
 * Handles console logging with file output
 */

const fs = require("fs-extra");
const path = require("path");
const { app } = require("electron");

// Get the app data path for the log file
const logPath = path.join(app.getPath("appData"), "Ascendara by tagoWorks", "debug.log");

// Ensure log directory exists
if (!fs.existsSync(path.dirname(logPath))) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
}

const logStream = fs.createWriteStream(logPath, { flags: "a" });
const originalConsole = { ...console };

const formatMessage = args => {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] ${args
    .map(arg => (typeof arg === "object" ? JSON.stringify(arg) : arg))
    .join(" ")}\n`;
};

/**
 * Initialize the logger by overriding console methods
 */
function initializeLogger() {
  console.log = (...args) => {
    const message = formatMessage(args);
    if (!logStream.destroyed && !logStream.closed) {
      logStream.write(message);
    }
    originalConsole.log(...args);
  };

  console.error = (...args) => {
    const message = formatMessage(args);
    if (!logStream.destroyed && !logStream.closed) {
      logStream.write(`ERROR: ${message}`);
    }
    originalConsole.error(...args);
  };

  console.warn = (...args) => {
    const message = formatMessage(args);
    if (!logStream.destroyed && !logStream.closed) {
      logStream.write(`WARN: ${message}`);
    }
    originalConsole.warn(...args);
  };
}

/**
 * Close the log stream
 */
function closeLogger() {
  logStream.end();
}

/**
 * Get the log file path
 */
function getLogPath() {
  return logPath;
}

module.exports = {
  initializeLogger,
  closeLogger,
  getLogPath,
  logStream,
};
