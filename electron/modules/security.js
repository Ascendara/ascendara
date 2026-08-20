const APP_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:46859",
  "http://127.0.0.1:46859",
]);

// Avoid wrapping the same ipcMain instance twice.
const guardedIpcMainInstances = new WeakSet();

function parseHttpUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
}

function isAllowedAppNavigation(rawUrl) {
  const parsed = parseHttpUrl(rawUrl);
  return Boolean(parsed && APP_ORIGINS.has(parsed.origin));
}

function getIpcSenderUrl(event) {
  if (typeof event?.senderFrame?.url === "string" && event.senderFrame.url) {
    return event.senderFrame.url;
  }

  try {
    return event?.sender?.getURL?.() || "";
  } catch {
    return "";
  }
}

function isTrustedIpcSender(event) {
  return isAllowedAppNavigation(getIpcSenderUrl(event));
}

function createTrustedIpcListener(channel, listener, onBlocked) {
  if (typeof listener !== "function") {
    throw new TypeError(`IPC handler for "${channel}" must be a function`);
  }

  return (event, ...args) => {
    if (!isTrustedIpcSender(event)) {
      const senderUrl = getIpcSenderUrl(event) || "unknown";
      const error = new Error(`Blocked IPC channel "${channel}" from an untrusted renderer`);

      if (typeof onBlocked === "function") {
        onBlocked({ channel, senderUrl, error });
      } else {
        console.warn(`[Security] ${error.message}: ${senderUrl}`);
      }

      throw error;
    }

    return listener(event, ...args);
  };
}

// Validate every ipcMain.handle call registered after this point.
function installIpcMainGuard(ipcMain, options = {}) {
  if (!ipcMain || typeof ipcMain.handle !== "function") {
    throw new TypeError("A valid Electron ipcMain instance is required");
  }

  if (guardedIpcMainInstances.has(ipcMain)) return ipcMain;

  const originalHandle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, listener) =>
    originalHandle(channel, createTrustedIpcListener(channel, listener, options.onBlocked));

  if (typeof ipcMain.handleOnce === "function") {
    const originalHandleOnce = ipcMain.handleOnce.bind(ipcMain);
    ipcMain.handleOnce = (channel, listener) =>
      originalHandleOnce(
        channel,
        createTrustedIpcListener(channel, listener, options.onBlocked)
      );
  }

  guardedIpcMainInstances.add(ipcMain);
  return ipcMain;
}

module.exports = {
  createTrustedIpcListener,
  getIpcSenderUrl,
  installIpcMainGuard,
  isAllowedAppNavigation,
  isTrustedIpcSender,
};
