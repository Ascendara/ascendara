/**
 * Analytics Module
 * The Firebase SDK runs in the renderer, so main-process events are handed to
 * the window, whose analytics service sends them.
 */

const fs = require("fs-extra");
const path = require("path");
const { getMainWindow } = require("./window");

function sendAnalyticsEvent(name, params = {}) {
  const window = getMainWindow();
  if (window && !window.isDestroyed()) {
    window.webContents.send("analytics-event", { name, params });
  }
}

// The download host, without the rest of the link
function linkProvider(link) {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

/**
 * Report how a downloader process ended. The game's info file says it: gone
 * when the download was removed, an error or stop flag when it didn't finish,
 * and no download data once it did.
 */
function trackDownloadOutcome(downloadProcess, gameDirectory, params) {
  downloadProcess.once("exit", async () => {
    const infoPath = path.join(gameDirectory, `${path.basename(gameDirectory)}.ascendara.json`);
    let info;
    try {
      info = JSON.parse(await fs.promises.readFile(infoPath, "utf8"));
    } catch {
      sendAnalyticsEvent("download_cancelled", params);
      return;
    }
    const data = info.downloadingData;
    if (!data || data.pendingManualInstall) {
      sendAnalyticsEvent("download_complete", { ...params, install_size: info.installedBytes });
    } else if (data.error) {
      sendAnalyticsEvent("download_failed", { ...params, reason: data.message });
    } else if (data.stopped) {
      sendAnalyticsEvent("download_stopped", params);
    }
  });
}

module.exports = { sendAnalyticsEvent, linkProvider, trackDownloadOutcome };
