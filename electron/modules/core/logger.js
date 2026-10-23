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

// `end()` makes the stream unwritable before the close event fires, so checking
// only `closed` can still allow a final shutdown log to write after the stream ends.
const canWriteToLog = () =>
  !logStream.destroyed &&
  !logStream.closed &&
  !logStream.writableEnded &&
  !logStream.writableFinished;

/**
 * Initialize the logger by overriding console methods
 */
function initializeLogger() {
  console.log = (...args) => {
    const message = formatMessage(args);
    if (canWriteToLog()) {
      logStream.write(message);
    }
    originalConsole.log(...args);
  };

  console.error = (...args) => {
    const message = formatMessage(args);
    if (canWriteToLog()) {
      logStream.write(`ERROR: ${message}`);
    }
    originalConsole.error(...args);
  };

  console.warn = (...args) => {
    const message = formatMessage(args);
    if (canWriteToLog()) {
      logStream.write(`WARN: ${message}`);
    }
    originalConsole.warn(...args);
  };
}

/**
 * Close the log stream
 */
function closeLogger() {
  if (!logStream.destroyed && !logStream.closed && !logStream.writableEnded) {
    logStream.end();
  }
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
