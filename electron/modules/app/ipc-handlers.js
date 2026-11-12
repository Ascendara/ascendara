/**
 * Miscellaneous IPC Handlers Module
 * Contains IPC handlers that don't fit into other modules
 */

const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const axios = require("axios");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { ipcMain, shell, dialog, app, BrowserWindow, Notification } = require("electron");
const {
  API_URL,
  isDev,
  isWindows,
  appDirectory,
  APIKEY,
  analyticsAPI,
  imageKey,
  steamWebApiKey,
  TIMESTAMP_FILE,
} = require("../core/config");
const { getSettingsManager } = require("../core/settings");
const { sanitizeText, getExtensionFromMimeType } = require("../core/utils");
const { initializeDiscordRPC, destroyDiscordRPC, setRPCState } = require("./discord-rpc");
const steamgrid = require("../library/steamgrid");
const soundPacks = require("./soundPacks");
const { searchAchievementFolders } = require("../library/achievementFolderSearch");
const { isSafeExternalUrl, isTrustedIpcSender } = require("../core/security");
const {
  completeOnboarding,
  hasCompletedOnboarding,
  resetOnboarding,
} = require("../core/onboarding");

let apiKeyOverride = null;
let has_launched = false;

// IGDB functions removed - now using Steam API only

const MAX_GAME_SCAN_ENTRIES = 10000;

async function findFolderExecutables(folderPath) {
  const queue = [folderPath];
  const executables = [];
  let visited = 0;
  let inaccessible = 0;
  let hitLimit = false;
  while (queue.length && visited < MAX_GAME_SCAN_ENTRIES) {
    const directory = queue.shift();
    let entries;
    try {
      entries = await fs.promises.readdir(directory, { withFileTypes: true });
    } catch {
      inaccessible += 1;
      continue;
    }
    for (const entry of entries) {
      if (visited >= MAX_GAME_SCAN_ENTRIES) {
        hitLimit = true;
        break;
      }
      visited += 1;
      if (entry.isSymbolicLink()) continue;
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) queue.push(entryPath);
      else if (entry.isFile() && /\.exe$/i.test(entry.name)) {
        executables.push({
          path: entryPath,
          relativePath: path.relative(folderPath, entryPath),
        });
      }
    }
  }
  executables.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return { executables, inaccessible, truncated: hitLimit || queue.length > 0 };
}

/**
 * Register miscellaneous IPC handlers
 */
// Ad hosts on provider pages (MegaDB, Buzzheavier) and MegaDB's countdown,
// kept current by the API's provider watch. The built-in values cover a
// first run and an unreachable API.
const PROVIDER_WATCH_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_PROVIDER_WATCH = {
  blockedHosts: [
    "aichouphaugn.com",
    "ay267.com",
    "bvtpk.com",
    "luugy.com",
    "vr-gc.com",
    "071kk.com",
    "rtmark.net",
  ],
  megadbWaitSeconds: 10,
};
const HOSTNAME_RE = /^(?=.{1,253}$)[a-z0-9-]+(\.[a-z0-9-]+)+$/;
let providerWatch = { ...DEFAULT_PROVIDER_WATCH, fetchedAt: 0 };
let providerWatchRequest = null;

const getProviderWatch = async () => {
  if (Date.now() - providerWatch.fetchedAt < PROVIDER_WATCH_TTL_MS) return providerWatch;
  if (!providerWatchRequest) {
    providerWatchRequest = axios
      .get(`${API_URL}/app/json/providerwatch`, { timeout: 4000 })
      .then(({ data }) => {
        const hosts = Array.isArray(data?.blockedHosts)
          ? data.blockedHosts
              .filter(host => typeof host === "string")
              .map(host => host.toLowerCase())
              .filter(host => HOSTNAME_RE.test(host))
          : [];
        const wait = Number(data?.megadb?.waitSeconds);
        providerWatch = {
          blockedHosts: [...new Set([...DEFAULT_PROVIDER_WATCH.blockedHosts, ...hosts])],
          megadbWaitSeconds:
            Number.isFinite(wait) && wait >= 0 && wait <= 120
              ? wait
              : DEFAULT_PROVIDER_WATCH.megadbWaitSeconds,
          fetchedAt: Date.now(),
        };
      })
      .catch(error => {
        console.warn("Could not refresh provider watch:", error.message);
        // Try again in a few minutes, not on every window
        providerWatch = {
          ...providerWatch,
          fetchedAt: Date.now() - PROVIDER_WATCH_TTL_MS + 5 * 60 * 1000,
        };
      })
      .finally(() => {
        providerWatchRequest = null;
      });
  }
  await providerWatchRequest;
  return providerWatch;
};

function registerMiscHandlers() {
  const settingsManager = getSettingsManager();

  ipcMain.handle("khinsider-request", (_, path) => {
    const { session } = require("electron");
    const { requestKhinsider } = require("../library/khinsider");
    return requestKhinsider(path, session.fromPartition("persist:khinsider"));
  });

  // Reload app
  ipcMain.handle("reload", () => {
    app.relaunch();
    app.exit();
  });

  // Is dev mode
  ipcMain.handle("is-dev", () => isDev);

  // IGDB handler removed - now using Steam API only

  // GiantBomb API request handler (bypasses CORS)
  ipcMain.handle("giantbomb-request", async (_, { url, apiKey }) => {
    try {
      const response = await axios.get(url, {
        headers: {
          "User-Agent": "Ascendara Game Library (contact@ascendara.com)",
          Accept: "application/json",
        },
        params: {
          api_key: apiKey,
          format: "json",
        },
      });
      return { success: true, data: response.data };
    } catch (error) {
      console.error("GiantBomb request error:", error.message);
      return { success: false, error: error.message };
    }
  });

  // CheapShark API request handler (CheapShark rejects generic User-Agents)
  ipcMain.handle("cheapshark-request", async (_, { path, params }) => {
    if (typeof path !== "string" || !/^\/[a-z]+$/i.test(path)) {
      return { success: false, status: 400, error: "Invalid CheapShark path" };
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await axios.get(`https://www.cheapshark.com/api/1.0${path}`, {
          headers: {
            "User-Agent": "Ascendara Game Library (contact@ascendara.com)",
            Accept: "application/json",
          },
          params,
          timeout: 15000,
        });
        return { success: true, data: response.data };
      } catch (error) {
        const status = error.response?.status;
        if (status === 429 && attempt < 2) {
          const retryAfter = parseInt(error.response.headers?.["retry-after"], 10);
          const waitMs =
            (Number.isFinite(retryAfter) ? retryAfter : 2 * (attempt + 1)) * 1000;
          await new Promise(resolve => setTimeout(resolve, Math.min(waitMs, 15000)));
          continue;
        }
        console.error("CheapShark request error:", error.message);
        return { success: false, status, error: error.message };
      }
    }
  });

  // Steam API request handler (now proxied through backend)
  ipcMain.handle("steam-request", async (_, { url }) => {
    try {
      // Parse the URL to determine which proxy endpoint to use
      const urlObj = new URL(url);
      let proxyUrl;

      if (url.includes("storesearch")) {
        // Extract search term from URL
        const term = urlObj.searchParams.get("term");
        proxyUrl = `${API_URL}/api/proxy/steam/search?term=${encodeURIComponent(term)}`;
      } else if (url.includes("appdetails")) {
        // Extract appids from URL
        const appids = urlObj.searchParams.get("appids");
        proxyUrl = `${API_URL}/api/proxy/steam/appdetails?appids=${appids}`;
      } else {
        // Fallback to direct request for unknown endpoints
        console.warn("Unknown Steam API endpoint, using direct request:", url);
        const response = await axios.get(url, {
          headers: {
            "User-Agent": "Ascendara Game Library (contact@ascendara.com)",
            Accept: "application/json",
          },
        });
        return { success: true, data: response.data };
      }

      // Make request to backend proxy
      const response = await axios.get(proxyUrl, {
        headers: {
          "User-Agent": "Ascendara Game Library (contact@ascendara.com)",
          Accept: "application/json",
        },
      });

      return { success: true, data: response.data };
    } catch (error) {
      console.error("Steam proxy request error:", error.message);
      return { success: false, error: error.message };
    }
  });

  // Is experiment / branch
  const { appBranch } = require("../core/config");
  const { testingVersion } = require("../core/config");

  ipcMain.handle("is-experiment", () => appBranch === "experimental");
  ipcMain.handle("get-testing-version", () => testingVersion);
  ipcMain.handle("get-branch", () => appBranch);

  // Has admin
  let hasAdmin = false;
  ipcMain.handle("has-admin", async () => hasAdmin);

  // API key handlers
  ipcMain.handle("override-api-key", (_, newApiKey) => {
    apiKeyOverride = newApiKey;
    console.log("API Key overridden:", apiKeyOverride);
  });

  // Legacy API key handlers (deprecated - use get-auth-headers instead)
  ipcMain.handle("get-api-key", () => apiKeyOverride || APIKEY);

  ipcMain.handle("get-analytics-key", () => analyticsAPI);

  ipcMain.handle("get-image-key", () => imageKey);

  ipcMain.handle("get-steam-api-key", () => steamWebApiKey);

  // Time-based authentication
  const authHelper = require("../core/auth-helper");
  ipcMain.handle("get-auth-headers", () => authHelper.generateAuthHeaders());

  // Resolve a MegaDB page to its file link without opening it: read the final
  // link from the page, wait out the countdown (the server checks it against
  // the session cookie), then follow the link with that cookie and the page
  // as referrer to the file server's redirect. Resolves { url } or { error },
  // and the renderer falls back to the provider window on an error.
  ipcMain.handle("resolve-megadb-link", async (ipcEvent, pageUrl) => {
    const isMegaDbHost = host =>
      ["megadb.net", "megadb.xyz"].some(
        domain => host === domain || host.endsWith(`.${domain}`)
      );
    try {
      if (!isSafeExternalUrl(pageUrl)) throw new Error("Invalid link");
      if (!isMegaDbHost(new URL(pageUrl).hostname.toLowerCase())) {
        throw new Error("Not a MegaDB link");
      }
      const userAgent =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
      const page = await axios.get(pageUrl, {
        timeout: 20000,
        responseType: "text",
        headers: { "User-Agent": userAgent, Referer: "https://steamrip.com/" },
      });
      const html = String(page.data || "");
      const finalUrl = html.match(/finalDownloadUrl\s*=\s*'([^']+)'/)?.[1];
      if (!finalUrl || !isMegaDbHost(new URL(finalUrl).hostname.toLowerCase())) {
        throw new Error("Download link not found on page");
      }
      const { megadbWaitSeconds } = await getProviderWatch();
      const pageSeconds = Number(html.match(/var\s+seconds\s*=\s*(\d+)/)?.[1]);
      const seconds =
        (Number.isFinite(pageSeconds) && pageSeconds <= 120
          ? pageSeconds
          : megadbWaitSeconds) + 1;
      const cookie = (page.headers["set-cookie"] || [])
        .map(entry => entry.split(";")[0])
        .join("; ");

      const sender = ipcEvent.sender;
      if (sender && !sender.isDestroyed()) {
        sender.send("external-window-progress", {
          url: pageUrl,
          stage: "countdown",
          endsAt: Date.now() + seconds * 1000,
        });
      }
      await new Promise(resolve => setTimeout(resolve, seconds * 1000));
      if (sender && !sender.isDestroyed()) {
        sender.send("external-window-progress", { url: pageUrl, stage: "resolving" });
      }

      const redirect = await axios.get(finalUrl, {
        timeout: 20000,
        maxRedirects: 0,
        responseType: "text",
        validateStatus: status => status >= 200 && status < 400,
        headers: {
          "User-Agent": userAgent,
          Referer: pageUrl,
          ...(cookie ? { Cookie: cookie } : {}),
        },
      });
      const location = redirect.headers.location;
      const fileUrl = location ? new URL(location, finalUrl).href : null;
      if (!fileUrl || !isSafeExternalUrl(fileUrl)) {
        throw new Error("MegaDB did not return a download link");
      }
      return { url: fileUrl };
    } catch (error) {
      console.error("Failed to resolve MegaDB link:", error.message);
      return { error: error.message };
    }
  });

  // Open URL
  ipcMain.handle("open-url", async (ipcEvent, url, options = {}) => {
    if (!isSafeExternalUrl(url)) throw new Error("Only HTTP(S) links are allowed");
    if (options?.referrer) {
      if (!isSafeExternalUrl(options.referrer)) throw new Error("Invalid referrer");
      // autoDownload keeps the window hidden and starts the download itself,
      // only showing the window if that doesn't work out (e.g. a captcha).
      // The returned promise settles with what happened so the renderer can
      // stop its loading state.
      const autoDownload = !!options.autoDownload;
      let settle = () => {};
      const outcome = new Promise(resolve => {
        settle = status => {
          settle = () => {};
          resolve({ status });
        };
      });
      const externalWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        show: !autoDownload,
        icon: path.join(
          __dirname,
          "../..",
          process.platform === "linux" ? "icon.png" : "icon.ico"
        ),
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          partition: "external-providers",
          nativeWindowOpen: false,
          // Remote provider pages receive no Node access or preload bridge.
          sandbox: true,
          webSecurity: true,
          // Prevent rendering stalls when the window is idle or in the background
          backgroundThrottling: false,
        },
      });

      // Block ads/popups trying to open additional windows
      externalWindow.webContents.setWindowOpenHandler(({ url: popupUrl }) => {
        console.log("Blocked popup in external window:", popupUrl);
        return { action: "deny" };
      });
      externalWindow.webContents.on("new-window", event => {
        event.preventDefault();
        console.log("Blocked new-window popup in external window");
      });

      // Block known ad/tracker hosts and resources from loading in the
      // external window (e.g. injected ad images/scripts on megadb/buzzheavier).
      const { blockedHosts: blockedResourceHosts, megadbWaitSeconds } =
        await getProviderWatch();
      externalWindow.webContents.session.webRequest.onBeforeRequest(
        { urls: ["*://*/*"] },
        (details, callback) => {
          try {
            const host = new URL(details.url).hostname.toLowerCase();
            const isBlockedHost = blockedResourceHosts.some(
              blocked => host === blocked || host.endsWith(`.${blocked}`)
            );
            if (isBlockedHost) {
              console.log("Blocked ad resource in external window:", details.url);
              callback({ cancel: true });
              return;
            }
          } catch (error) {
            console.error(
              "Failed to parse external window resource URL:",
              details.url,
              error
            );
          }
          callback({ cancel: false });
        }
      );

      const allowedHosts = [
        "buzzheavier.com",
        "bzzhr.co",
        "bzzhr.to",
        "ts.bzzhr.to",
        "fafda.to",
        "fuckingfast.net",
        "fuckingfast.co",
        "megadb.net",
        "megadb.xyz",
      ];
      externalWindow.webContents.on("will-navigate", (event, navUrl) => {
        try {
          const host = new URL(navUrl).hostname.toLowerCase();
          const isAllowed =
            isSafeExternalUrl(navUrl) &&
            allowedHosts.some(
              allowed => host === allowed || host.endsWith(`.${allowed}`)
            );
          if (!isAllowed) {
            console.log("Blocked navigation in external window:", navUrl);
            event.preventDefault();
          }
        } catch (error) {
          event.preventDefault();
          console.error("Failed to parse external window navigation URL:", navUrl, error);
        }
      });

      const sender = ipcEvent.sender;
      let blockedHandled = false;
      const notifyBlocked = reason => {
        if (blockedHandled) return;
        blockedHandled = true;
        clearTimeout(blankPageTimeout);
        clearTimeout(revealTimeout);
        settle("blocked");
        console.log("External provider window appears blocked:", reason);
        try {
          if (sender && !sender.isDestroyed()) {
            sender.send("external-window-blocked", { url, reason });
          }
        } catch (error) {
          console.error("Failed to notify renderer of blocked external window:", error);
        }
        if (!externalWindow.isDestroyed()) {
          externalWindow.close();
        }
      };

      externalWindow.webContents.on(
        "did-fail-load",
        (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
          // -3 is ERR_ABORTED, which fires for cancelled/redirected navigations
          // (e.g. blocked ad popups) and isn't an actual load failure.
          if (isMainFrame && errorCode !== -3) {
            notifyBlocked(`${errorDescription} (${errorCode})`);
          }
        }
      );

      let blankPageTimeout;
      externalWindow.webContents.on("did-finish-load", () => {
        if (blockedHandled) return;
        // Give client-side JS a moment to render before judging the page blank.
        setTimeout(async () => {
          if (blockedHandled || externalWindow.isDestroyed()) return;
          try {
            const bodyText = await externalWindow.webContents.executeJavaScript(
              "document.body ? document.body.innerText.trim().length : 0"
            );
            if (bodyText === 0) {
              notifyBlocked("Page loaded blank");
            } else {
              clearTimeout(blankPageTimeout);
            }
          } catch (error) {
            console.error("Failed to inspect external window content:", error);
          }
        }, 3000);
      });

      // Some ad networks (e.g. Adsterra "Social Bar") don't open a real popup
      // window at all -- they inject a fake "notification"/"reminder" overlay
      // directly into the page DOM. Blocking the network request for the
      // popup/image isn't enough since the overlay markup itself still
      // renders. Strip out any overlay whose text matches known ad phrasing,
      // and keep watching for ones injected later (these often appear after
      // a delay or on an interval).
      externalWindow.webContents.on("did-finish-load", () => {
        if (externalWindow.isDestroyed()) return;
        externalWindow.webContents
          .executeJavaScript(
            `(function () {
              if (window.__ascendaraAdOverlayObserver) return;
              const blockedHosts = ${JSON.stringify(blockedResourceHosts)};
              function findOverlayRoot(image) {
                let el = image.parentElement;
                while (el && el !== document.body && el !== document.documentElement) {
                  const position = window.getComputedStyle(el).position;
                  if (
                    (position === "fixed" || position === "absolute") &&
                    el.style.left === "50%" && el.style.top === "50%"
                  ) {
                    return el;
                  }
                  el = el.parentElement;
                }
                return null;
              }
              function sweep() {
                for (const image of document.querySelectorAll("img[src]")) {
                  let host;
                  try {
                    host = new URL(image.src, document.baseURI).hostname.toLowerCase();
                  } catch {
                    continue;
                  }
                  if (!blockedHosts.some(blocked =>
                    host === blocked || host.endsWith("." + blocked)
                  )) continue;
                  const overlay = findOverlayRoot(image);
                  if (overlay && overlay.isConnected) overlay.remove();
                }
              }
              sweep();
              const observer = new MutationObserver(sweep);
              observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ["src", "style", "class"],
              });
              window.__ascendaraAdOverlayObserver = observer;
            })();`
          )
          .catch(error => {
            console.error("Failed to inject ad overlay cleanup script:", error);
          });
      });

      blankPageTimeout = setTimeout(() => {
        if (!blockedHandled && !externalWindow.isDestroyed()) {
          notifyBlocked("Page took too long to load");
        }
      }, 20000);

      // Hand the window to the user when the automatic download can't finish
      // on its own, so they can click through whatever is in the way.
      let revealTimeout;
      const revealWindow = reason => {
        clearTimeout(revealTimeout);
        if (
          blockedHandled ||
          externalWindow.isDestroyed() ||
          externalWindow.isVisible()
        ) {
          return;
        }
        console.log("Showing external provider window:", reason);
        externalWindow.show();
        externalWindow.focus();
        settle("shown");
      };

      // MegaDB's ad scripts swallow clicks on its download button, so the
      // timer never starts and the page seems to loop. Its final link is in
      // the page already: wait out the timer (the server sends the download
      // page again if it's used early), then open it with the page as
      // referrer so it redirects to the file, which will-download catches.
      const isMegaDb = host => host === "megadb.net" || host.endsWith(".megadb.net");
      let megaDbStarted = false;
      externalWindow.webContents.on("did-finish-load", async () => {
        if (megaDbStarted || blockedHandled || externalWindow.isDestroyed()) return;
        const pageUrl = externalWindow.webContents.getURL();
        try {
          if (!isMegaDb(new URL(pageUrl).hostname.toLowerCase())) return;
        } catch {
          return;
        }
        try {
          const finalUrl = await externalWindow.webContents.executeJavaScript(
            "typeof finalDownloadUrl === 'string' ? finalDownloadUrl : null"
          );
          if (!finalUrl || !isMegaDb(new URL(finalUrl).hostname.toLowerCase())) {
            // A challenge or error page; the real page may load next
            return;
          }
          megaDbStarted = true;
          if (sender && !sender.isDestroyed()) {
            sender.send("external-window-progress", { url, stage: "resolving" });
          }
          console.log("Waiting out MegaDB timer before opening its download link");
          // One second past the countdown, which the server enforces
          await new Promise(resolve =>
            setTimeout(resolve, (megadbWaitSeconds + 1) * 1000)
          );
          if (blockedHandled || externalWindow.isDestroyed()) return;
          externalWindow.webContents.loadURL(finalUrl, { httpReferrer: pageUrl });
        } catch (error) {
          console.error("Failed to start MegaDB download:", error);
          revealWindow("MegaDB download failed");
        }
      });

      if (autoDownload) {
        revealTimeout = setTimeout(
          () => revealWindow("Automatic download took too long"),
          30000
        );

        // Do what the download button does: request its htmx endpoint and
        // follow the HX-Redirect to the file, which will-download then catches.
        // If the endpoint doesn't answer that way, click the button instead.
        let downloadTriggered = false;
        externalWindow.webContents.on("did-finish-load", async () => {
          if (downloadTriggered || blockedHandled || externalWindow.isDestroyed()) return;
          try {
            // Handled above
            if (isMegaDb(new URL(externalWindow.webContents.getURL()).hostname)) return;
          } catch {
            return;
          }
          try {
            if (sender && !sender.isDestroyed()) {
              sender.send("external-window-progress", { url, stage: "resolving" });
            }
            const result = await externalWindow.webContents.executeJavaScript(
              `(async function () {
                const trigger = document.querySelector('[hx-get*="/download"]');
                if (!trigger) return "missing";
                try {
                  const response = await fetch(trigger.getAttribute("hx-get"), {
                    headers: { "HX-Request": "true", "HX-Current-URL": location.href },
                    credentials: "include",
                    redirect: "manual",
                  });
                  const redirect = response.headers.get("HX-Redirect");
                  if (redirect) {
                    location.href = new URL(redirect, location.href).href;
                    return "redirected";
                  }
                } catch (error) {}
                trigger.click();
                return "clicked";
              })()`
            );
            // A page without the button (e.g. a challenge) may navigate on to
            // the real one, so try again on the next load
            if (result !== "missing") downloadTriggered = true;
            console.log("Automatic external window download:", result);
          } catch (error) {
            console.error("Failed to start automatic download:", error);
            revealWindow("Automatic download failed");
          }
        });
      }

      externalWindow.once("closed", () => {
        clearTimeout(blankPageTimeout);
        clearTimeout(revealTimeout);
        settle("closed");
      });

      externalWindow.loadURL(url, { httpReferrer: options.referrer });

      // When the user clicks a download button in the external window, intercept
      // the file download and send the URL to Ascendara instead of saving it here.
      const onWillDownload = (event, item, webContents) => {
        if (webContents !== externalWindow.webContents) return;
        event.preventDefault();
        clearTimeout(revealTimeout);
        settle("intercepted");
        const downloadUrl = item.getURL();
        console.log("Intercepted download in external window:", downloadUrl);

        try {
          // ipcEvent.sender is the main window's webContents that invoked open-url.
          // Use it directly so the message always reaches the right renderer.
          const sender = ipcEvent.sender;
          if (sender && !sender.isDestroyed()) {
            sender.send(
              "intercepted-download-url",
              `ascendara://${encodeURIComponent(downloadUrl)}`
            );
            console.log("Forwarded intercepted download URL to main window");
            const senderWindow = BrowserWindow.fromWebContents(sender);
            if (senderWindow && !senderWindow.isDestroyed()) {
              senderWindow.focus();
            }
          }
        } catch (error) {
          console.error("Failed to forward intercepted download URL:", error);
        }

        externalWindow.webContents.session.removeListener(
          "will-download",
          onWillDownload
        );
        if (!externalWindow.isDestroyed()) {
          externalWindow.close();
        }
      };
      externalWindow.webContents.session.on("will-download", onWillDownload);
      const providerSession = externalWindow.webContents.session;
      externalWindow.once("closed", () =>
        providerSession.removeListener("will-download", onWillDownload)
      );
      if (autoDownload) return outcome;
    } else {
      await shell.openExternal(url);
    }
  });

  // Resolve SteamGrid cover URLs for a game name (used by custom-source UI)
  ipcMain.handle("steamgrid-get-urls", async (_, gameName) => {
    try {
      return await steamgrid.getImageUrls(gameName);
    } catch (error) {
      console.error("[SteamGrid] getImageUrls IPC error:", error);
      return { gameId: null, grid: null, hero: null, logo: null, header: null };
    }
  });

  // Portrait cover only, for the game detail page (2 requests instead of 5)
  ipcMain.handle("steamgrid-get-grid", async (_, gameName) => {
    try {
      return await steamgrid.getGridUrl(gameName);
    } catch (error) {
      console.error("[SteamGrid] getGridUrl IPC error:", error);
      return { gameId: null, url: null };
    }
  });

  // Lightweight: one-image header lookup for browse/search UI (2 requests
  // instead of 5). Use this by default; switch to steamgrid-get-urls only
  // when all four asset variants are actually needed.
  ipcMain.handle("steamgrid-get-header", async (_, gameName) => {
    try {
      return await steamgrid.getHeaderUrl(gameName);
    } catch (error) {
      console.error("[SteamGrid] getHeaderUrl IPC error:", error);
      return { gameId: null, url: null };
    }
  });

  // Artwork correction picker: SteamGridDB matches for a name, then one game's covers
  ipcMain.handle("steamgrid-search-games", async (_, term) => {
    try {
      return await steamgrid.searchGames(term);
    } catch (error) {
      console.error("[SteamGrid] searchGames IPC error:", error);
      return null;
    }
  });

  ipcMain.handle("steamgrid-get-game-artwork", async (_, gameId) => {
    try {
      return await steamgrid.getGameArtwork(gameId);
    } catch (error) {
      console.error("[SteamGrid] getGameArtwork IPC error:", error);
      return null;
    }
  });

  // Read local file
  ipcMain.handle("read-local-file", async (_, filePath, encoding = "utf8") => {
    try {
      return await fs.promises.readFile(filePath, encoding);
    } catch (error) {
      console.error("Error reading local file:", error);
      throw error;
    }
  });

  // List backup files in a directory
  ipcMain.handle("listBackupFiles", async (_, dirPath) => {
    try {
      if (!fs.existsSync(dirPath)) {
        return [];
      }
      const files = await fs.promises.readdir(dirPath);
      return files;
    } catch (error) {
      console.error("Error listing backup files:", error);
      return [];
    }
  });

  // Read backup file as buffer
  ipcMain.handle("readBackupFile", async (_, filePath) => {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error("Backup file not found");
      }
      const buffer = await fs.promises.readFile(filePath);
      return buffer;
    } catch (error) {
      console.error("Error reading backup file:", error);
      throw error;
    }
  });

  // Get temp directory path
  ipcMain.handle("getTempPath", async () => {
    return os.tmpdir();
  });

  // Write file (for cloud backup restore)
  ipcMain.handle("writeFile", async (_, filePath, buffer) => {
    try {
      // Ensure parent folder exists (creates it if needed)
      await fs.ensureDir(path.dirname(filePath));
      await fs.promises.writeFile(filePath, Buffer.from(buffer));
      return true;
    } catch (error) {
      console.error("Error writing file:", error);
      throw error;
    }
  });

  // Delete file (cleanup after restore)
  ipcMain.handle("deleteFile", async (_, filePath) => {
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
      return true;
    } catch (error) {
      console.error("Error deleting file:", error);
      throw error;
    }
  });

  // Read/write file
  ipcMain.handle("read-file", async (_, filePath) => {
    try {
      return fs.readFileSync(filePath, "utf8");
    } catch (error) {
      console.error("Error reading file:", error);
      throw error;
    }
  });

  ipcMain.handle("write-file", async (_, filePath, content) => {
    try {
      fs.ensureDirSync(path.dirname(filePath));
      fs.writeFileSync(filePath, content);
      return true;
    } catch (error) {
      console.error("Error writing file:", error);
      throw error;
    }
  });

  // Fetch API image
  ipcMain.handle("fetch-api-image", async (_, endpoint, imgID, timestamp, signature) => {
    try {
      const url = `${API_URL}/${endpoint}/${imgID}`;
      const response = await axios.get(url, {
        headers: {
          "X-Timestamp": timestamp.toString(),
          "X-Signature": signature,
          "Cache-Control": "no-store",
        },
        responseType: "arraybuffer",
      });

      if (response.status !== 200) {
        return { error: true, status: response.status };
      }

      const base64 = Buffer.from(response.data).toString("base64");
      const contentType = response.headers["content-type"] || "image/jpeg";
      return { dataUrl: `data:${contentType};base64,${base64}` };
    } catch (error) {
      console.error("Error fetching API image:", error.message);
      return { error: true, status: error.response?.status || 0, message: error.message };
    }
  });

  // Get local image as base64
  ipcMain.handle("get-local-image-url", async (_, imagePath) => {
    try {
      if (fs.existsSync(imagePath)) {
        const imageBuffer = await fs.promises.readFile(imagePath);
        const base64 = imageBuffer.toString("base64");
        return `data:image/jpeg;base64,${base64}`;
      }
      return null;
    } catch (error) {
      console.error("Error getting local image:", error);
      return null;
    }
  });

  // Get download manager log (last N lines)
  ipcMain.handle("get-download-log", async (_, lines = 200) => {
    try {
      const appDataPath = app.getPath("appData");
      const logPath = path.join(
        appDataPath,
        "Ascendara by tagoWorks",
        "downloadmanager.log"
      );
      if (!fs.existsSync(logPath)) return "";
      const content = await fs.promises.readFile(logPath, "utf-8");
      const all = content.split("\n");
      return all.slice(-lines).join("\n");
    } catch (err) {
      return `[Error reading log: ${err.message}]`;
    }
  });

  // Upload support logs
  ipcMain.handle("upload-support-logs", async (_, sessionToken, appToken) => {
    try {
      const appDataPath = app.getPath("appData");
      const ascendaraPath = path.join(appDataPath, "Ascendara by tagoWorks");

      const logFiles = {
        "debug.log": path.join(ascendaraPath, "debug.log"),
        "downloadmanager.log": path.join(ascendaraPath, "downloadmanager.log"),
        "notificationhelper.log": path.join(ascendaraPath, "notificationhelper.log"),
        "gamehandler.log": path.join(ascendaraPath, "gamehandler.log"),
      };

      const logs = {};
      for (const [name, filePath] of Object.entries(logFiles)) {
        try {
          if (fs.existsSync(filePath)) {
            const content = await fs.promises.readFile(filePath, "utf-8");
            logs[name] = content.slice(-512000);
          } else {
            logs[name] = "[File not found]";
          }
        } catch (err) {
          logs[name] = `[Error reading file: ${err.message}]`;
        }
      }

      const response = await axios.post(
        `${API_URL}/support/upload-logs`,
        { session_token: sessionToken, logs },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${appToken}`,
          },
        }
      );

      return { success: true, data: response.data };
    } catch (error) {
      console.error("Error uploading support logs:", error.message);
      return { success: false, error: error.response?.data?.message || error.message };
    }
  });

  // Dialog handlers
  ipcMain.handle("open-directory-dialog", async () => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("open-file-dialog", async (_, exePath = null) => {
    const settings = settingsManager.getSettings();
    let defaultPath = settings.downloadDirectory || app.getPath("downloads");

    if (exePath) {
      defaultPath = path.dirname(exePath);
    }

    const result = await dialog.showOpenDialog({
      defaultPath,
      properties: ["openFile"],
      filters: isWindows
        ? [{ name: "Executable Files", extensions: ["exe", "bat", "cmd"] }]
        : [],
    });

    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("scan-game-folders", async event => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(window, {
      title: "Select a folder containing game folders",
      properties: ["openDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) return { success: true, canceled: true };
    const rootPath = result.filePaths[0];
    try {
      const rootEntries = await fs.promises.readdir(rootPath, { withFileTypes: true });
      const directories = rootEntries.filter(
        entry => entry.isDirectory() && !entry.isSymbolicLink()
      );
      const games = [];
      let skipped = 0;
      let inaccessible = 0;
      for (const directory of directories) {
        const folderPath = path.join(rootPath, directory.name);
        const scan = await findFolderExecutables(folderPath);
        inaccessible += scan.inaccessible;
        if (!scan.executables.length) {
          skipped += 1;
          continue;
        }
        games.push({
          folderPath,
          name: directory.name,
          executables: scan.executables,
          truncated: scan.truncated,
        });
      }
      games.sort((a, b) => a.name.localeCompare(b.name));
      return { success: true, canceled: false, rootPath, games, skipped, inaccessible };
    } catch (error) {
      return { success: false, error: error.message || "Failed to scan folder" };
    }
  });

  ipcMain.handle("search-achievement-folders", async (_, appId) => {
    try {
      const settings = settingsManager.getSettings();
      let documentsPath;
      try {
        documentsPath = app.getPath("documents");
      } catch {
        documentsPath = undefined;
      }
      return await searchAchievementFolders({
        appId,
        watchedFolders: settings.watchingFolders,
        platform: process.platform,
        documentsPath,
      });
    } catch (error) {
      console.error("search-achievement-folders failed:", error);
      return { success: false, error: error.message || "searchFailed" };
    }
  });

  ipcMain.handle("open-folder-path", async (_, targetPath) => {
    if (typeof targetPath !== "string" || !path.isAbsolute(targetPath)) {
      return { success: false, error: "invalidPath" };
    }
    try {
      const stat = await fs.promises.stat(targetPath);
      if (!stat.isDirectory()) return { success: false, error: "notDirectory" };
      const error = await shell.openPath(targetPath);
      return error ? { success: false, error } : { success: true };
    } catch (error) {
      return { success: false, error: error.message || "openFailed" };
    }
  });

  // Profile image handlers
  ipcMain.handle("upload-profile-image", async (_, imageBase64) => {
    try {
      const userDataPath = app.getPath("userData");
      const imagesDir = path.join(userDataPath, "profile_images");

      await fs.ensureDir(imagesDir);

      const imagePath = path.join(imagesDir, "profile.png");
      const imageBuffer = Buffer.from(imageBase64.split(",")[1], "base64");
      await fs.writeFile(imagePath, imageBuffer);

      return { success: true, path: imagePath };
    } catch (error) {
      console.error("Error saving profile image:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("get-profile-image", async () => {
    try {
      const userDataPath = app.getPath("userData");
      const imagePath = path.join(userDataPath, "profile_images", "profile.png");

      if (await fs.pathExists(imagePath)) {
        const imageBuffer = await fs.readFile(imagePath);
        return imageBuffer.toString("base64");
      }
      return null;
    } catch (error) {
      console.error("Error reading profile image:", error);
      return null;
    }
  });

  const spawnNotificationHelper = args => {
    const notificationHelperPath = isDev
      ? "./binaries/AscendaraNotificationHelper/dist/AscendaraNotificationHelper.exe"
      : path.join(appDirectory, "/resources/AscendaraNotificationHelper.exe");

    const child = spawn(notificationHelperPath, args, {
      detached: true,
      stdio: "ignore",
    });
    child.on("error", err => console.error("Failed to spawn notification helper:", err));
    child.unref();
  };

  // Native notifications go through the themed helper on Windows and the
  // system notifier elsewhere, and respect the notifications setting
  const showNotification = (title, message) => {
    const settings = settingsManager.getSettings();
    if (!settings.notifications) {
      return { success: false, error: "Notifications are disabled in settings" };
    }

    if (isWindows) {
      spawnNotificationHelper([
        "--theme",
        settings.theme || "purple",
        "--title",
        title,
        "--message",
        message,
      ]);
    } else {
      // Ascendara plays its own sound through the window, so keep the system one quiet
      if (settings.notificationSounds !== false) {
        BrowserWindow.getAllWindows()[0]?.webContents.send(
          "play-notification-sound",
          "notification"
        );
      }
      const notification = new Notification({
        title,
        body: message,
        silent: true,
        timeoutType: "default",
        urgency: "normal",
        icon: path.join(app.getAppPath(), "build", "icon.png"),
      });
      notification.show();
    }

    return { success: true };
  };

  // Show test notification
  ipcMain.handle("show-test-notification", async () => {
    try {
      return showNotification(
        "Test Notification",
        "This is a test notification from Ascendara!"
      );
    } catch (error) {
      console.error("Error showing test notification:", error);
      return { success: false, error: error.message };
    }
  });

  // Shows a notification styled with unsaved theme maker colors. It's an
  // explicit preview, so it ignores the notifications setting.
  ipcMain.handle("preview-notification", async (_, colors, achievement) => {
    try {
      if (!isWindows) {
        return { success: false, error: "Themed notifications are only on Windows" };
      }
      if (!colors || typeof colors !== "object") {
        return { success: false, error: "Invalid colors" };
      }
      const args = ["--theme", "custom", "--colors", JSON.stringify(colors)];
      if (achievement) {
        args.push(
          "--is-achievement",
          "--message",
          "First Steps",
          "--game",
          "Ascendara",
          "--description",
          "This is how achievement unlocks will look with your theme."
        );
      } else {
        args.push(
          "--title",
          "Download Complete",
          "--message",
          "This is how notifications will look with your theme."
        );
      }
      spawnNotificationHelper(args);
      return { success: true };
    } catch (error) {
      console.error("Error showing preview notification:", error);
      return { success: false, error: error.message };
    }
  });

  // Notification sounds. A picked file is copied into userData so it keeps
  // working if the original is moved, and the helper reads the copy's path.
  const SOUND_PROFILES = ["classic", "crystal", "arcade", "simple"];
  const SOUND_MIME = {
    wav: "audio/wav",
    mp3: "audio/mpeg",
    ogg: "audio/ogg",
    flac: "audio/flac",
    m4a: "audio/mp4",
  };
  const isCustomSound = async file =>
    typeof file === "string" &&
    path.dirname(path.resolve(file)) === soundPacks.soundsDir() &&
    (await fs.pathExists(file));

  ipcMain.handle("pick-notification-sound", async (event, kind) => {
    if (!soundPacks.SOUND_KINDS.includes(kind)) {
      return { success: false, error: "Invalid sound type" };
    }
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(window, {
      properties: ["openFile"],
      filters: [{ name: "Audio", extensions: soundPacks.SOUND_EXTENSIONS }],
    });
    if (result.canceled || !result.filePaths[0]) {
      return { success: false, canceled: true };
    }
    try {
      const source = result.filePaths[0];
      const ext = path.extname(source).slice(1).toLowerCase();
      if (!soundPacks.SOUND_EXTENSIONS.includes(ext)) {
        return { success: false, error: "unsupported" };
      }
      const { size } = await fs.stat(source);
      if (size > soundPacks.MAX_SOUND_BYTES) {
        return { success: false, error: "tooLarge" };
      }
      const dir = soundPacks.soundsDir();
      await fs.ensureDir(dir);
      // Drop the previous custom sound for this type, whatever its format
      for (const file of await fs.readdir(dir)) {
        if (path.parse(file).name === kind) await fs.remove(path.join(dir, file));
      }
      const target = path.join(dir, `${kind}.${ext}`);
      await fs.copy(source, target);
      return { success: true, path: target, name: path.basename(source) };
    } catch (error) {
      console.error("Error saving notification sound:", error);
      return { success: false, error: error.message };
    }
  });

  // The configured sound as a data URL, for previewing in the window and for
  // notifications that don't go through the helper. Passing a profile previews
  // that profile's sound and skips any custom upload. A profile is a built-in
  // name or "pack:<id>" for an imported pack, and a missing pack falls back
  // to the first built-in profile.
  ipcMain.handle("get-notification-sound", async (_, kind, previewProfile) => {
    if (!soundPacks.SOUND_KINDS.includes(kind)) return null;
    try {
      const settings = settingsManager.getSettings();
      const custom = settings[`${kind}SoundPath`];
      const profile = previewProfile || settings.notificationSoundProfile;
      let file = null;
      if (!previewProfile && (await isCustomSound(custom))) {
        file = custom;
      } else {
        const packId = soundPacks.packIdFromProfile(profile);
        if (packId) file = await soundPacks.findPackSound(packId, kind);
      }
      if (!file) {
        const base = app.isPackaged
          ? path.join(process.resourcesPath, "public", "sounds")
          : path.join(__dirname, "../../../src/public/sounds");
        const builtIn = SOUND_PROFILES.includes(profile) ? profile : SOUND_PROFILES[0];
        file = path.join(base, "profiles", builtIn, `${kind}.wav`);
      }
      const ext = path.extname(file).slice(1).toLowerCase();
      const data = await fs.readFile(file);
      return `data:${SOUND_MIME[ext] || "audio/wav"};base64,${data.toString("base64")}`;
    } catch (error) {
      console.error("Error reading notification sound:", error);
      return null;
    }
  });

  ipcMain.handle("list-sound-packs", async () => {
    try {
      return await soundPacks.listSoundPacks();
    } catch (error) {
      console.error("Error listing sound packs:", error);
      return [];
    }
  });

  ipcMain.handle("import-sound-pack", async event => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(window, {
      properties: ["openFile"],
      filters: [{ name: "Sound pack", extensions: ["zip"] }],
    });
    if (result.canceled || !result.filePaths[0]) {
      return { success: false, canceled: true };
    }
    try {
      const pack = await soundPacks.importSoundPack(result.filePaths[0]);
      return { success: true, pack };
    } catch (error) {
      console.error("Error importing sound pack:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("delete-sound-pack", async (_, id) => {
    try {
      await soundPacks.deleteSoundPack(id);
      return { success: true };
    } catch (error) {
      console.error("Error deleting sound pack:", error);
      return { success: false, error: error.message };
    }
  });

  // Packs up the user's two custom sounds so they can share them
  ipcMain.handle("export-sound-pack", async event => {
    const settings = settingsManager.getSettings();
    const sources = {};
    for (const kind of soundPacks.SOUND_KINDS) {
      const custom = settings[`${kind}SoundPath`];
      if (!(await isCustomSound(custom))) {
        return { success: false, error: "missingSounds" };
      }
      sources[kind] = custom;
    }
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showSaveDialog(window, {
      defaultPath: "My sound pack.zip",
      filters: [{ name: "Sound pack", extensions: ["zip"] }],
    });
    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }
    try {
      await soundPacks.exportSoundPack(sources, result.filePath);
      return { success: true, path: result.filePath };
    } catch (error) {
      console.error("Error exporting sound pack:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("show-notification", async (_, title, message) => {
    try {
      if (typeof title !== "string" || typeof message !== "string") {
        return { success: false, error: "Invalid notification" };
      }
      return showNotification(title.slice(0, 120), message.slice(0, 400));
    } catch (error) {
      console.error("Error showing notification:", error);
      return { success: false, error: error.message };
    }
  });

  // Discord RPC handlers
  ipcMain.handle("toggle-discord-rpc", async (_, enabled) => {
    try {
      if (enabled) {
        initializeDiscordRPC();
        return { success: true, message: "Discord RPC enabled" };
      } else {
        destroyDiscordRPC();
        return { success: true, message: "Discord RPC disabled" };
      }
    } catch (error) {
      console.error("Error toggling Discord RPC:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("switch-rpc", (_, state) => {
    setRPCState(state);
  });

  // Welcome complete
  ipcMain.handle("welcome-complete", () => {
    BrowserWindow.getAllWindows().forEach(window => {
      window.webContents.send("welcome-complete");
    });
  });

  // Check v7 welcome
  ipcMain.handle("check-v7-welcome", async () => {
    try {
      const v7Path = path.join(app.getPath("userData"), "v7.json");
      return !fs.existsSync(v7Path);
    } catch (error) {
      return false;
    }
  });

  // Settings changed listener
  ipcMain.on("settings-changed", event => {
    if (!isTrustedIpcSender(event)) return;
    BrowserWindow.getAllWindows().forEach(window => {
      window.webContents.send("settings-updated");
    });
  });

  // Game rated
  ipcMain.handle("game-rated", async (_, game, isCustom) => {
    const settings = settingsManager.getSettings();
    try {
      if (!settings.downloadDirectory) {
        throw new Error("Download directory not set");
      }

      if (isCustom) {
        const gamesFilePath = path.join(settings.downloadDirectory, "games.json");
        const gamesData = JSON.parse(fs.readFileSync(gamesFilePath, "utf8"));
        const gameInfo = gamesData.games.find(g => g.game === game);
        if (!gameInfo) throw new Error("Custom game not found");
        gameInfo.hasRated = true;
        fs.writeFileSync(gamesFilePath, JSON.stringify(gamesData, null, 2));
      } else {
        const gameDirectory = path.join(settings.downloadDirectory, game);
        const gameInfoPath = path.join(gameDirectory, `${game}.ascendara.json`);
        const gameInfo = JSON.parse(fs.readFileSync(gameInfoPath, "utf8"));
        gameInfo.hasRated = true;
        fs.writeFileSync(gameInfoPath, JSON.stringify(gameInfo, null, 2));
      }
      return true;
    } catch (error) {
      console.error("Error setting game as rated:", error);
      return false;
    }
  });

  // Delete game directory
  ipcMain.handle("delete-game-directory", async (_, game) => {
    try {
      const settings = settingsManager.getSettings();
      if (!settings.downloadDirectory) return;

      const gameDirectory = path.join(settings.downloadDirectory, game);

      try {
        // Never delete items that existed in this folder before Ascendara
        // started downloading into it (e.g. a manual install with save
        // data that happened to share the same folder name).
        const preexistingMarkerPath = path.join(
          gameDirectory,
          "preexisting.ascendara.json"
        );
        let preexistingEntries = [];
        if (fs.existsSync(preexistingMarkerPath)) {
          try {
            preexistingEntries = JSON.parse(
              fs.readFileSync(preexistingMarkerPath, "utf8")
            );
          } catch (markerError) {
            console.error(`Error reading pre-existing items marker: ${markerError}`);
          }
        }
        const preexistingSet = new Set(preexistingEntries);

        const files = await fs.promises.readdir(gameDirectory, { withFileTypes: true });
        for (const file of files) {
          if (preexistingSet.has(file.name)) {
            continue;
          }
          const fullPath = path.join(gameDirectory, file.name);
          await fs.promises.rm(fullPath, { recursive: true, force: true });
        }
        if (fs.existsSync(preexistingMarkerPath)) {
          await fs.promises.rm(preexistingMarkerPath, { force: true });
        }
        const remaining = await fs.promises.readdir(gameDirectory);
        if (remaining.length === 0) {
          await fs.promises.rmdir(gameDirectory);
        } else {
          console.log(
            `Kept game directory because it still contains ${remaining.length} pre-existing item(s): ${gameDirectory}`
          );
        }
      } catch (error) {
        console.error("Error deleting the game directory:", error);
        throw error;
      }
    } catch (error) {
      console.error("Error deleting the game directory:", error);
    }
  });

  // Steam schemas may store achievement icons as bare hash filenames (which the
  // renderer would resolve against its own origin) or as legacy
  // /steamcommunity/public/images/apps/ URLs, which 404 for newer apps.
  // Point both at community_assets, which serves every app.
  const STEAM_ICON_BASE =
    "https://shared.akamai.steamstatic.com/community_assets/images/apps";
  const LEGACY_STEAM_ICON =
    /^https?:\/\/[^/]*(?:steamstatic\.com|akamaihd\.net)\/steamcommunity\/public\/images\/apps\/(\d+)\/([^/?#]+)/i;
  const resolveAchievementIcons = data => {
    if (!data || !Array.isArray(data.achievements)) return data;
    const appid = data.appid;
    const resolve = icon => {
      if (!icon || typeof icon !== "string") return icon;
      const legacy = icon.match(LEGACY_STEAM_ICON);
      if (legacy) return `${STEAM_ICON_BASE}/${legacy[1]}/${legacy[2]}`;
      if (/^(https?|file|data):/i.test(icon) || path.isAbsolute(icon)) return icon;
      if (!appid) return icon;
      const file = /\.\w+$/.test(icon) ? icon : `${icon}.jpg`;
      return `${STEAM_ICON_BASE}/${appid}/${file}`;
    };
    return {
      ...data,
      achievements: data.achievements.map(a => (a ? { ...a, icon: resolve(a.icon) } : a)),
    };
  };

  // Read game achievements
  const readGameAchievements = (game, isCustom = false) => {
    const settings = settingsManager.getSettings();
    if (!settings.downloadDirectory || !settings.additionalDirectories) {
      return null;
    }

    const allDirectories = [
      settings.downloadDirectory,
      ...settings.additionalDirectories,
    ];

    if (!isCustom) {
      for (const directory of allDirectories) {
        const achievementsPath = path.join(
          directory,
          game,
          "achievements.ascendara.json"
        );
        if (fs.existsSync(achievementsPath)) {
          try {
            const data = fs.readFileSync(achievementsPath, "utf8");
            const parsed = JSON.parse(data);

            if (parsed.achievementWater && !parsed.watcher) {
              parsed.watcher = parsed.achievementWater;
              delete parsed.achievementWater;
              fs.writeFileSync(achievementsPath, JSON.stringify(parsed, null, 4), "utf8");
            }

            return parsed;
          } catch (error) {
            console.error("Error reading achievements file:", error);
            return null;
          }
        }
      }
      return null;
    } else {
      try {
        const gamesFilePath = path.join(settings.downloadDirectory, "games.json");
        const gamesData = JSON.parse(fs.readFileSync(gamesFilePath, "utf8"));
        const gameInfo = gamesData.games.find(g => g.game === game);

        if (gameInfo) {
          if (gameInfo.achievementWater && !gameInfo.achievementWatcher) {
            gameInfo.achievementWatcher = gameInfo.achievementWater;
            delete gameInfo.achievementWater;
            fs.writeFileSync(gamesFilePath, JSON.stringify(gamesData, null, 4), "utf8");
          }

          if (gameInfo.achievementWatcher) {
            return gameInfo.achievementWatcher;
          }

          if (gameInfo.executable) {
            const achievementsPath = path.join(
              path.dirname(gameInfo.executable),
              "achievements.ascendara.json"
            );
            if (fs.existsSync(achievementsPath)) {
              return JSON.parse(fs.readFileSync(achievementsPath, "utf8"));
            }
          }
        }
      } catch (error) {
        console.error("Error reading games.json:", error);
      }
      return null;
    }
  };

  ipcMain.handle("read-game-achievements", async (_, game, isCustom = false) =>
    resolveAchievementIcons(readGameAchievements(game, isCustom))
  );

  // Compute achievements leaderboard (main process)
  // Expects games as an array of strings or objects: { gameName|game, isCustom }
  // Returns ranked entries: { gameName, unlocked, total, percentage }
  ipcMain.handle("get-achievements-leaderboard", async (_, games = [], options = {}) => {
    try {
      const limit =
        typeof options?.limit === "number" && Number.isFinite(options.limit)
          ? Math.max(1, Math.floor(options.limit))
          : 6;

      if (!Array.isArray(games) || games.length === 0) return [];

      // Reuse the existing achievements reader via a local invoke-style call.
      // We intentionally call the underlying IPC handler logic by invoking the same
      // reader through ipcMain's handler directly is not supported, so we replicate
      // the minimal read logic here.
      const settings = settingsManager.getSettings();
      if (!settings.downloadDirectory || !settings.additionalDirectories) {
        return [];
      }

      const allDirectories = [
        settings.downloadDirectory,
        ...settings.additionalDirectories,
      ];

      const readAchievements = async (gameName, isCustom) => {
        if (!gameName) return null;

        if (!isCustom) {
          for (const directory of allDirectories) {
            const achievementsPath = path.join(
              directory,
              gameName,
              "achievements.ascendara.json"
            );
            if (fs.existsSync(achievementsPath)) {
              try {
                const data = fs.readFileSync(achievementsPath, "utf8");
                const parsed = JSON.parse(data);

                if (parsed.achievementWater && !parsed.watcher) {
                  parsed.watcher = parsed.achievementWater;
                  delete parsed.achievementWater;
                  fs.writeFileSync(
                    achievementsPath,
                    JSON.stringify(parsed, null, 4),
                    "utf8"
                  );
                }

                return parsed;
              } catch (error) {
                console.error("Error reading achievements file:", error);
                return null;
              }
            }
          }
          return null;
        }

        // Custom game: stored in games.json (achievementWatcher) or alongside executable
        try {
          const gamesFilePath = path.join(settings.downloadDirectory, "games.json");
          const gamesData = JSON.parse(fs.readFileSync(gamesFilePath, "utf8"));
          const gameInfo = gamesData.games.find(g => g.game === gameName);

          if (gameInfo) {
            if (gameInfo.achievementWater && !gameInfo.achievementWatcher) {
              gameInfo.achievementWatcher = gameInfo.achievementWater;
              delete gameInfo.achievementWater;
              fs.writeFileSync(gamesFilePath, JSON.stringify(gamesData, null, 4), "utf8");
            }

            if (gameInfo.achievementWatcher) {
              return gameInfo.achievementWatcher;
            }

            if (gameInfo.executable) {
              const achievementsPath = path.join(
                path.dirname(gameInfo.executable),
                "achievements.ascendara.json"
              );
              if (fs.existsSync(achievementsPath)) {
                return JSON.parse(fs.readFileSync(achievementsPath, "utf8"));
              }
            }
          }
        } catch (error) {
          console.error("Error reading games.json:", error);
        }

        return null;
      };

      const entries = await Promise.all(
        games.map(async g => {
          const gameName = typeof g === "string" ? g : g?.gameName || g?.game || g?.name;
          const isCustom = typeof g === "object" ? !!g?.isCustom : false;

          const achievementData = await readAchievements(gameName, isCustom);

          // The achievement data structure has achievements nested in .achievements property
          const list = achievementData?.achievements;

          if (!Array.isArray(list) || list.length === 0) return null;

          const unlocked = list.filter(
            a => !!(a?.achieved || a?.unlocked || a?.isUnlocked)
          ).length;
          const total = list.length;

          return {
            gameName,
            unlocked,
            total,
            percentage: total > 0 ? Math.round((unlocked / total) * 100) : 0,
          };
        })
      );

      return entries
        .filter(Boolean)
        .sort((a, b) => {
          if (b.unlocked !== a.unlocked) return b.unlocked - a.unlocked;
          if (b.percentage !== a.percentage) return b.percentage - a.percentage;
          if (b.total !== a.total) return b.total - a.total;
          return String(a.gameName).localeCompare(String(b.gameName));
        })
        .slice(0, limit);
    } catch (error) {
      console.error("Error computing achievements leaderboard:", error);
      return [];
    }
  });

  // Where a game's achievement display lives: its own file, or the
  // achievementWatcher key of its entry in games.json for custom games
  const locateAchievementDisplay = (game, isCustom) => {
    const settings = settingsManager.getSettings();
    if (!settings.downloadDirectory || typeof game !== "string") return null;

    if (!isCustom) {
      for (const directory of [
        settings.downloadDirectory,
        ...(settings.additionalDirectories || []),
      ]) {
        const file = path.join(directory, game, "achievements.ascendara.json");
        if (fs.existsSync(file)) return { file };
      }
      return null;
    }

    try {
      const gamesFile = path.join(settings.downloadDirectory, "games.json");
      const gameInfo = JSON.parse(fs.readFileSync(gamesFile, "utf8")).games?.find(
        g => g.game === game
      );
      if (gameInfo?.achievementWatcher) return { file: gamesFile, custom: true };
      if (gameInfo?.executable) {
        const file = path.join(
          path.dirname(gameInfo.executable),
          "achievements.ascendara.json"
        );
        if (fs.existsSync(file)) return { file };
      }
    } catch (_) {}
    return null;
  };

  // Last-modified time of each game's achievement display, so the renderer
  // can tell which games' achievements changed without reading every file
  ipcMain.handle("get-achievement-stamps", async (_, games = []) => {
    const stamps = {};
    for (const game of Array.isArray(games) ? games : []) {
      const location = locateAchievementDisplay(game?.name, !!game?.isCustom);
      if (!location) continue;
      try {
        stamps[game.name] = (await fs.promises.stat(location.file)).mtimeMs;
      } catch (_) {}
    }
    return stamps;
  });

  // Same per-appid unlock database the achievement watcher keeps (track.js)
  const achievementCacheDir = path.join(
    process.env.APPDATA || path.join(os.homedir(), ".config"),
    "Achievement Watcher/steam_cache/data"
  );

  // Merge unlocks from another device into a game's achievements. The watcher
  // rebuilds the display from its unlock database, so unlocks go there too or
  // its next write would drop them. Only ever unlocks, never locks.
  // unlocks: [{ achID, unlockTime }]
  ipcMain.handle(
    "merge-game-achievements",
    async (_, gameName, isCustom = false, unlocks = []) => {
      try {
        const location = locateAchievementDisplay(gameName, isCustom);
        if (!location) return { success: false, error: "No achievement data yet" };

        const document = JSON.parse(await fs.promises.readFile(location.file, "utf8"));
        const display = location.custom
          ? document.games?.find(g => g.game === gameName)?.achievementWatcher
          : document;
        if (!display?.appid || !Array.isArray(display.achievements)) {
          return { success: false, error: "Achievements not linked to a Steam app yet" };
        }

        const byId = new Map(
          display.achievements.filter(a => a?.achID).map(a => [a.achID, a])
        );
        const newlyUnlocked = (Array.isArray(unlocks) ? unlocks : []).filter(
          u => byId.has(u?.achID) && !byId.get(u.achID).achieved
        );
        if (newlyUnlocked.length === 0) return { success: true, merged: 0 };

        const cacheFile = path.join(achievementCacheDir, `${display.appid}.db`);
        let cache = [];
        try {
          cache = JSON.parse(await fs.promises.readFile(cacheFile, "utf8"));
        } catch (_) {}
        if (!Array.isArray(cache)) cache = [];

        for (const unlock of newlyUnlocked) {
          const unlockTime = Number(unlock.unlockTime) || Math.floor(Date.now() / 1000);
          const previous = cache.find(a => a.name === unlock.achID);
          const entry = {
            name: unlock.achID,
            Notified: true,
            Achieved: true,
            UnlockTime: unlockTime,
          };
          if (!previous) cache.push(entry);
          else if (!previous.Achieved) Object.assign(previous, entry);
          Object.assign(byId.get(unlock.achID), {
            achieved: true,
            unlockTime: String(unlockTime),
          });
        }

        await fs.promises.mkdir(achievementCacheDir, { recursive: true });
        await fs.promises.writeFile(cacheFile, JSON.stringify(cache), "utf8");
        display.lastUpdated = new Date().toISOString();
        await fs.promises.writeFile(
          location.file,
          JSON.stringify(document, null, 2),
          "utf8"
        );
        return { success: true, merged: newlyUnlocked.length };
      } catch (error) {
        console.error("Error merging game achievements:", error);
        return { success: false, error: error.message };
      }
    }
  );

  // Save custom game
  ipcMain.handle(
    "save-custom-game",
    async (event, game, online, dlc, version, executable, imageUrl) => {
      const settings = settingsManager.getSettings();
      try {
        if (!settings.downloadDirectory) {
          console.error("Download directory not set");
          return {
            success: false,
            error: "Download directory not set. Please configure it in Settings.",
          };
        }

        const gamesFilePath = path.join(settings.downloadDirectory, "games.json");
        const gamesDirectory = path.join(settings.downloadDirectory, "games");

        if (!fs.existsSync(gamesDirectory)) {
          fs.mkdirSync(gamesDirectory, { recursive: true });
        }

        if (imageUrl) {
          let imageBuffer;
          let extension = ".jpg";

          try {
            // Download image directly from the provided URL (e.g., SteamGridDB)
            const response = await axios({
              url: imageUrl,
              method: "GET",
              responseType: "arraybuffer",
            });

            imageBuffer = Buffer.from(response.data);
            const mimeType = response.headers["content-type"];
            extension = getExtensionFromMimeType(mimeType);

            if (imageBuffer) {
              await fs.promises.writeFile(
                path.join(gamesDirectory, `${game}.ascendara${extension}`),
                imageBuffer
              );
              console.log(`Successfully saved cover image for: ${game}`);
            }
          } catch (error) {
            console.warn(`Could not download cover image for ${game}:`, error.message);
          }
        }

        const gamesData = fs.existsSync(gamesFilePath)
          ? JSON.parse(fs.readFileSync(gamesFilePath, "utf8"))
          : { games: [] };
        const { sameGame } = require("../library/launcher-import");
        if (
          gamesData.games.some(
            existing => !existing._isDeleted && sameGame(existing, { game, executable })
          )
        ) {
          return { success: false, error: "This game is already in your library." };
        }
        gamesData.games.push({
          game,
          online,
          dlc,
          version,
          executable,
          isRunning: false,
        });
        const temporary = `${gamesFilePath}.${crypto.randomUUID()}.tmp`;
        try {
          fs.writeFileSync(temporary, JSON.stringify(gamesData, null, 2));
          fs.renameSync(temporary, gamesFilePath);
        } finally {
          if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
        }
        console.log(`Successfully added custom game: ${game}`);
        return { success: true };
      } catch (error) {
        console.error("Error saving custom game:", error);
        return { success: false, error: error.message || "Failed to save game" };
      }
    }
  );

  // Update game cover
  ipcMain.handle("update-game-cover", async (_, game, imgID, imageData) => {
    const settings = settingsManager.getSettings();
    try {
      if (!settings.downloadDirectory) return false;

      const gamesDirectory = path.join(settings.downloadDirectory, "games");

      if (!fs.existsSync(gamesDirectory)) {
        await fs.promises.mkdir(gamesDirectory, { recursive: true });
      }

      let imageBuffer;
      let extension = ".jpg";

      if (imgID) {
        // App only uses local index now
        if (!settings.usingLocalIndex || !settings.localIndex) {
          console.warn(`Cannot update game cover: local index is not enabled`);
          return false;
        }

        const localImagePath = path.join(settings.localIndex, "imgs", `${imgID}.jpg`);
        try {
          imageBuffer = await fs.promises.readFile(localImagePath);
        } catch (error) {
          console.warn(`Could not load local image for ${imgID}:`, error);

          // Try SteamGridDB fallback
          try {
            console.log(`Trying SteamGridDB fallback for game cover: ${game}`);
            const steamGridHeader = await steamgrid.fetchGameHeader(game);
            if (steamGridHeader && steamGridHeader.url) {
              const response = await axios({
                url: steamGridHeader.url,
                method: "GET",
                responseType: "arraybuffer",
                timeout: 10000,
              });

              imageBuffer = Buffer.from(response.data);
              const mimeType = response.headers["content-type"];
              extension = getExtensionFromMimeType(mimeType);
              console.log(`SteamGridDB game cover downloaded for: ${game}`);
            } else {
              console.log(`No SteamGridDB game cover found for: ${game}`);
              return false;
            }
          } catch (steamGridError) {
            console.warn(
              `SteamGridDB fallback failed for ${game}:`,
              steamGridError.message
            );
            return false;
          }
        }
      } else if (imageData) {
        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
        imageBuffer = Buffer.from(base64Data, "base64");

        if (imageData.includes("image/png")) {
          extension = ".png";
        } else if (imageData.includes("image/jpeg") || imageData.includes("image/jpg")) {
          extension = ".jpg";
        }
      } else {
        return false;
      }

      const filePath = path.join(gamesDirectory, `${game}.ascendara${extension}`);
      await fs.promises.writeFile(filePath, imageBuffer);

      BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed()) {
          win.webContents.send("cover-image-updated", { game, success: true });
        }
      });

      return true;
    } catch (error) {
      console.error("Error updating game cover:", error);
      return false;
    }
  });

  // Modify game executable
  ipcMain.handle("modify-game-executable", (_, game, executable) => {
    const settings = settingsManager.getSettings();
    try {
      if (!settings.downloadDirectory || !settings.additionalDirectories) return false;

      const allDirectories = [
        settings.downloadDirectory,
        ...settings.additionalDirectories,
      ];

      for (const directory of allDirectories) {
        const gameInfoPath = path.join(directory, game, `${game}.ascendara.json`);

        if (fs.existsSync(gameInfoPath)) {
          const gameInfo = JSON.parse(fs.readFileSync(gameInfoPath, "utf8"));
          gameInfo.executable = executable;
          fs.writeFileSync(gameInfoPath, JSON.stringify(gameInfo, null, 2));
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error("Error modifying game executable:", error);
      return false;
    }
  });

  // Read game entry JSON
  ipcMain.handle("read-game-entry", (_, game, isCustom) => {
    const settings = settingsManager.getSettings();
    try {
      if (!settings.downloadDirectory)
        return { success: false, error: "Download directory not set" };

      if (isCustom) {
        const gamesFilePath = path.join(settings.downloadDirectory, "games.json");
        if (!fs.existsSync(gamesFilePath))
          return { success: false, error: "games.json not found" };
        const gamesData = JSON.parse(fs.readFileSync(gamesFilePath, "utf8"));
        const gameInfo = gamesData.games.find(g => g.game === game);
        if (!gameInfo) return { success: false, error: "Game not found in games.json" };
        return { success: true, data: gameInfo };
      }

      const allDirectories = [
        settings.downloadDirectory,
        ...(settings.additionalDirectories || []),
      ];

      for (const directory of allDirectories) {
        const gameInfoPath = path.join(directory, game, `${game}.ascendara.json`);
        if (fs.existsSync(gameInfoPath)) {
          const gameInfo = JSON.parse(fs.readFileSync(gameInfoPath, "utf8"));
          return { success: true, data: gameInfo, path: gameInfoPath };
        }
      }

      return { success: false, error: "Game entry file not found" };
    } catch (error) {
      console.error("Error reading game entry:", error);
      return { success: false, error: error.message };
    }
  });

  // Write game entry JSON
  ipcMain.handle("write-game-entry", (_, game, updatedData, isCustom) => {
    const settings = settingsManager.getSettings();
    try {
      if (!settings.downloadDirectory)
        return { success: false, error: "Download directory not set" };

      if (isCustom) {
        const gamesFilePath = path.join(settings.downloadDirectory, "games.json");
        if (!fs.existsSync(gamesFilePath))
          return { success: false, error: "games.json not found" };
        const gamesData = JSON.parse(fs.readFileSync(gamesFilePath, "utf8"));
        const idx = gamesData.games.findIndex(g => g.game === game);
        if (idx === -1) return { success: false, error: "Game not found in games.json" };
        gamesData.games[idx] = updatedData;
        fs.writeFileSync(gamesFilePath, JSON.stringify(gamesData, null, 2));
        return { success: true };
      }

      const allDirectories = [
        settings.downloadDirectory,
        ...(settings.additionalDirectories || []),
      ];

      for (const directory of allDirectories) {
        const gameInfoPath = path.join(directory, game, `${game}.ascendara.json`);
        if (fs.existsSync(gameInfoPath)) {
          fs.writeFileSync(gameInfoPath, JSON.stringify(updatedData, null, 2));
          return { success: true };
        }
      }

      return { success: false, error: "Game entry file not found" };
    } catch (error) {
      console.error("Error writing game entry:", error);
      return { success: false, error: error.message };
    }
  });

  // Local crack directory handlers
  ipcMain.handle("get-local-crack-directory", () => {
    const possiblePaths = [
      path.join(os.homedir(), "AppData", "Roaming", "Goldberg SteamEmu Saves"),
      path.join(os.homedir(), "AppData", "Local", "Goldberg SteamEmu Saves"),
      path.join(app.getPath("userData"), "Goldberg SteamEmu Saves"),
    ];

    const filePath = path.join(app.getPath("userData"), "ascendarasettings.json");
    let settings;
    try {
      settings = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (error) {
      settings = {};
    }

    let foundPath = null;
    for (const checkPath of possiblePaths) {
      try {
        if (fs.existsSync(checkPath)) {
          foundPath = checkPath;
          break;
        }
      } catch (error) {}
    }

    if (!foundPath) {
      foundPath = possiblePaths[0];
      try {
        fs.mkdirSync(path.join(foundPath, "settings"), { recursive: true });
      } catch (error) {
        return null;
      }
    }

    settings.crackDirectory = path.join(foundPath, "settings");

    try {
      fs.writeFileSync(filePath, JSON.stringify(settings, null, 2));
    } catch (error) {
      return null;
    }

    return settings.crackDirectory;
  });

  ipcMain.handle("set-local-crack-directory", (_, directory) => {
    const filePath = path.join(app.getPath("userData"), "ascendarasettings.json");
    try {
      let settings = {};
      if (fs.existsSync(filePath)) {
        settings = JSON.parse(fs.readFileSync(filePath, "utf8"));
      }
      settings.crackDirectory = directory;
      fs.writeFileSync(filePath, JSON.stringify(settings, null, 2));
      return true;
    } catch (error) {
      return false;
    }
  });

  ipcMain.handle("get-local-crack-username", () => {
    const filePath = path.join(app.getPath("userData"), "ascendarasettings.json");
    try {
      const settings = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const steamEmuPath = settings.crackDirectory;

      if (fs.existsSync(steamEmuPath)) {
        const accountNamePath = path.join(steamEmuPath, "account_name.txt");
        if (fs.existsSync(accountNamePath)) {
          return fs.readFileSync(accountNamePath, "utf8").trim();
        }
      }
    } catch (error) {}
    return null;
  });

  ipcMain.handle("set-local-crack-username", (_, username) => {
    const filePath = path.join(app.getPath("userData"), "ascendarasettings.json");
    try {
      const settings = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const steamEmuPath = settings.crackDirectory;

      if (!fs.existsSync(steamEmuPath)) {
        fs.mkdirSync(steamEmuPath, { recursive: true });
      }

      fs.writeFileSync(path.join(steamEmuPath, "account_name.txt"), username);
      return true;
    } catch (error) {
      return false;
    }
  });

  // Uninstall Ascendara
  ipcMain.handle("uninstall-ascendara", async () => {
    if (!isWindows)
      return {
        success: false,
        error: "Quit Ascendara and remove the application using your file manager.",
      };
    const executablePath = process.execPath;
    const executableDir = path.dirname(executablePath);
    const uninstallerPath = path.join(executableDir, "Uninstall Ascendara.exe");

    try {
      resetOnboarding();
    } catch (error) {}

    try {
      fs.unlinkSync(path.join(app.getPath("userData"), "ascendarasettings.json"));
    } catch (error) {}

    shell.openExternal("https://ascendara.app/uninstall");

    spawn(
      "powershell.exe",
      ["-Command", `Start-Process -FilePath "${uninstallerPath}" -Verb RunAs -Wait`],
      { shell: true }
    );
  });

  // Has launched handler
  ipcMain.handle("has-launched", () => {
    const result = has_launched;
    if (!has_launched) {
      has_launched = true;
    }
    return result;
  });

  // Is new handler
  ipcMain.handle("is-new", () => {
    if (hasCompletedOnboarding()) return false;
    try {
      fs.accessSync(TIMESTAMP_FILE);
      return false;
    } catch (error) {
      return true;
    }
  });

  // Is v7 handler
  ipcMain.handle("is-v7", () => hasCompletedOnboarding());

  // Set v7 handler
  ipcMain.handle("set-v7", () => {
    try {
      let timestamp = {
        timestamp: Date.now(),
        v7: true,
      };

      if (fs.existsSync(TIMESTAMP_FILE)) {
        const existingData = JSON.parse(fs.readFileSync(TIMESTAMP_FILE, "utf8"));
        timestamp.timestamp = existingData.timestamp;
      }

      try {
        fs.writeFileSync(TIMESTAMP_FILE, JSON.stringify(timestamp, null, 2));
      } catch (err) {
        console.error("Failed to write timestamp file:", err);
      }
      completeOnboarding();
      return true;
    } catch (error) {
      console.error("Error setting v7:", error);
      return false;
    }
  });

  // Create timestamp handler
  ipcMain.handle("create-timestamp", () => {
    let existingData = {};
    try {
      if (fs.existsSync(TIMESTAMP_FILE)) {
        existingData = JSON.parse(fs.readFileSync(TIMESTAMP_FILE, "utf8"));
      }
    } catch (err) {
      console.error("Failed to read existing timestamp file:", err);
    }

    const timestamp = {
      ...existingData,
      timestamp: Date.now(),
      v7: true,
    };
    // A locked timestamp file must not block finishing setup
    try {
      fs.writeFileSync(TIMESTAMP_FILE, JSON.stringify(timestamp, null, 2));
    } catch (err) {
      console.error("Failed to write timestamp file:", err);
    }
    completeOnboarding();
  });

  // Start Steam handler
  ipcMain.handle("start-steam", async () => {
    const { shell } = require("electron");
    try {
      await shell.openExternal("steam://open");
      return true;
    } catch (error) {
      console.error("Failed to start Steam:", error);
      return false;
    }
  });

  ipcMain.handle("get-drives", async () => {
    if (os.platform() === "win32") {
      const drives = [];
      for (let i = 65; i <= 90; i++) {
        const letter = String.fromCharCode(i) + ":\\";
        try {
          await fs.access(letter);
          drives.push({ name: letter, path: letter });
        } catch (e) {}
      }
      return drives;
    } else {
      // On Linux/macOS, return the root
      return [{ name: "/", path: "/" }];
    }
  });

  ipcMain.handle("list-directory", async (event, dirPath) => {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const files = entries.map(entry => ({
        name: entry.name,
        type: entry.isDirectory() ? "directory" : "file",
        path: path.join(dirPath, entry.name),
      }));
      return files;
    } catch (error) {
      throw new Error(`Cannot read directory: ${error.message}`);
    }
  });

  // Import Steam games handler
  require("../library/launcher-import").registerLauncherImportHandlers();

  // HowLongToBeat completion times handler
  require("../library/hltb").registerHltbHandlers();

  // Download finished handler
  ipcMain.handle("download-finished", async (_, game) => {
    console.log(`Download finished for game: ${game}`);
    return true;
  });

  // Check if trainer exists for game
  ipcMain.handle("check-trainer-exists", async (_, gameName, isCustom) => {
    try {
      const settings = settingsManager.getSettings();
      if (!settings.downloadDirectory) {
        return false;
      }

      let gameDirectory;

      if (isCustom) {
        const gamesFilePath = path.join(settings.downloadDirectory, "games.json");
        if (!fs.existsSync(gamesFilePath)) {
          return false;
        }

        const gamesData = JSON.parse(fs.readFileSync(gamesFilePath, "utf8"));
        const customGame = gamesData.games.find(g => g.game === gameName);

        if (!customGame || !customGame.executable) {
          return false;
        }

        gameDirectory = path.dirname(customGame.executable);
      } else {
        const allDirectories = [
          settings.downloadDirectory,
          ...(settings.additionalDirectories || []),
        ];

        const sanitizedGame = sanitizeText(gameName);

        for (const directory of allDirectories) {
          const testGameDir = path.join(directory, sanitizedGame);
          const testGameInfoPath = path.join(
            testGameDir,
            `${sanitizedGame}.ascendara.json`
          );

          if (fs.existsSync(testGameInfoPath)) {
            gameDirectory = testGameDir;
            break;
          }
        }

        if (!gameDirectory) {
          return false;
        }
      }

      const trainerPath = path.join(gameDirectory, "ascendaraFlingTrainer.exe");
      return fs.existsSync(trainerPath);
    } catch (error) {
      console.error("Error checking trainer existence:", error);
      return false;
    }
  });

  // Download trainer to game directory
  ipcMain.handle(
    "download-trainer-to-game",
    async (_, downloadUrl, gameName, isCustom) => {
      try {
        const settings = settingsManager.getSettings();
        if (!settings.downloadDirectory) {
          throw new Error("Download directory not set");
        }

        let gameDirectory;

        if (isCustom) {
          // For custom games, use the games.json to find the executable path
          const gamesFilePath = path.join(settings.downloadDirectory, "games.json");
          if (!fs.existsSync(gamesFilePath)) {
            throw new Error("Custom games file not found");
          }

          const gamesData = JSON.parse(fs.readFileSync(gamesFilePath, "utf8"));
          const customGame = gamesData.games.find(g => g.game === gameName);

          if (!customGame || !customGame.executable) {
            throw new Error("Custom game executable not found");
          }

          // Get directory from executable path
          gameDirectory = path.dirname(customGame.executable);
        } else {
          // For downloaded games, search in all download directories
          const allDirectories = [
            settings.downloadDirectory,
            ...(settings.additionalDirectories || []),
          ];

          const sanitizedGame = sanitizeText(gameName);

          for (const directory of allDirectories) {
            const testGameDir = path.join(directory, sanitizedGame);
            const testGameInfoPath = path.join(
              testGameDir,
              `${sanitizedGame}.ascendara.json`
            );

            if (fs.existsSync(testGameInfoPath)) {
              gameDirectory = testGameDir;
              break;
            }
          }

          if (!gameDirectory) {
            throw new Error(`Game directory not found for ${gameName}`);
          }
        }

        // Ensure game directory exists
        if (!fs.existsSync(gameDirectory)) {
          throw new Error(`Game directory does not exist: ${gameDirectory}`);
        }

        // Download the trainer file
        const trainerPath = path.join(gameDirectory, "ascendaraFlingTrainer.exe");

        console.log(`Downloading trainer to: ${trainerPath}`);

        // Use axios with proper headers to avoid 403 errors
        const response = await axios({
          method: "GET",
          url: downloadUrl,
          responseType: "stream",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            Referer: "https://flingtrainer.com/",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "same-origin",
          },
          maxRedirects: 5,
          timeout: 60000,
        });

        const writer = fs.createWriteStream(trainerPath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
          writer.on("finish", () => {
            console.log(`Trainer downloaded successfully to: ${trainerPath}`);
            resolve({ success: true, path: trainerPath });
          });
          writer.on("error", err => {
            console.error("Error writing trainer file:", err);
            reject(err);
          });
        });
      } catch (error) {
        console.error("Error downloading trainer to game directory:", error);
        throw error;
      }
    }
  );

  // Generate QR code for webapp connection
  ipcMain.handle("generate-webapp-qrcode", async (_, { code }) => {
    try {
      const { generateWebappQRCode } = require("./qrcode");
      const qrCodeDataUrl = await generateWebappQRCode(code);
      return { success: true, dataUrl: qrCodeDataUrl };
    } catch (error) {
      console.error("Error generating QR code:", error);
      return { success: false, error: error.message };
    }
  });

  // ---------------------------------------------------------------------------
  // Custom List Storage
  // Writes each imported list as a standalone JSON file under the user's
  // Documents/Ascendara/CustomLists folder so it can be inspected, shared, or
  // opened from the index info dialog.
  // ---------------------------------------------------------------------------
  const getCustomListsDir = () => {
    const dir = path.join(app.getPath("documents"), "Ascendara", "CustomLists");
    fs.ensureDirSync(dir);
    return dir;
  };
  const safeListFileName = listId => {
    const safe = String(listId).replace(/[^a-zA-Z0-9_-]/g, "_");
    return `${safe}.json`;
  };
  const getCustomListFilePath = listId =>
    path.join(getCustomListsDir(), safeListFileName(listId));

  // ---------------------------------------------------------------------------
  // External Source JSON Storage
  // Persists user-provided JSON for external-source buckets under the user's
  // configured local index directory (`<localIndex>/external-sources/`). This
  // keeps the payload alongside the local game index and survives localStorage
  // clears so the game service can load the source without hitting the network.
  // ---------------------------------------------------------------------------
  const getExternalSourcesDir = () => {
    const settings = settingsManager.getSettings();
    const base =
      settings?.localIndex ||
      path.join(app.getPath("appData"), "ascendara", "localindex");
    const dir = path.join(base, "external-sources");
    fs.ensureDirSync(dir);
    return dir;
  };
  const safeExternalSourceFileName = sourceId => {
    const safe = String(sourceId).replace(/[^a-zA-Z0-9_-]/g, "_");
    return `${safe}.json`;
  };
  const getExternalSourceFilePath = sourceId =>
    path.join(getExternalSourcesDir(), safeExternalSourceFileName(sourceId));

  ipcMain.handle("get-external-sources-directory", () => {
    try {
      return getExternalSourcesDir();
    } catch (err) {
      console.error("get-external-sources-directory failed:", err);
      return null;
    }
  });

  ipcMain.handle("set-external-source-json", async (_, sourceId, data) => {
    try {
      if (!sourceId) throw new Error("Missing sourceId");
      const filePath = getExternalSourceFilePath(sourceId);
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
      return { success: true, path: filePath };
    } catch (err) {
      console.error("set-external-source-json failed:", err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("get-external-source-json", async (_, sourceId) => {
    try {
      if (!sourceId) return null;
      const filePath = getExternalSourceFilePath(sourceId);
      if (!(await fs.pathExists(filePath))) return null;
      const raw = await fs.readFile(filePath, "utf8");
      return JSON.parse(raw);
    } catch (err) {
      console.error("get-external-source-json failed:", err);
      return null;
    }
  });

  ipcMain.handle("remove-external-source-json", async (_, sourceId) => {
    try {
      if (!sourceId) return { success: false, error: "Missing sourceId" };
      const filePath = getExternalSourceFilePath(sourceId);
      if (await fs.pathExists(filePath)) {
        await fs.remove(filePath);
      }
      return { success: true };
    } catch (err) {
      console.error("remove-external-source-json failed:", err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("get-custom-lists-directory", () => {
    try {
      return getCustomListsDir();
    } catch (err) {
      console.error("get-custom-lists-directory failed:", err);
      return null;
    }
  });

  ipcMain.handle("set-custom-list-data", async (_, listId, data) => {
    try {
      if (!listId) throw new Error("Missing listId");
      const filePath = getCustomListFilePath(listId);
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
      return { success: true, path: filePath };
    } catch (err) {
      console.error("set-custom-list-data failed:", err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("get-custom-list-data", async (_, listId) => {
    try {
      if (!listId) return null;
      const filePath = getCustomListFilePath(listId);
      if (!(await fs.pathExists(filePath))) return null;
      const raw = await fs.readFile(filePath, "utf8");
      return JSON.parse(raw);
    } catch (err) {
      console.error("get-custom-list-data failed:", err);
      return null;
    }
  });

  ipcMain.handle("get-custom-list-file-path", (_, listId) => {
    try {
      if (!listId) return null;
      return getCustomListFilePath(listId);
    } catch (err) {
      console.error("get-custom-list-file-path failed:", err);
      return null;
    }
  });

  ipcMain.handle("remove-custom-list-data", async (_, listId) => {
    try {
      if (!listId) return { success: false, error: "Missing listId" };
      const filePath = getCustomListFilePath(listId);
      if (await fs.pathExists(filePath)) {
        await fs.remove(filePath);
      }
      return { success: true };
    } catch (err) {
      console.error("remove-custom-list-data failed:", err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("open-custom-list-file", async (_, listId) => {
    try {
      if (!listId) return { success: false, error: "Missing listId" };
      const filePath = getCustomListFilePath(listId);
      if (!(await fs.pathExists(filePath))) {
        return { success: false, error: "File not found" };
      }
      await shell.openPath(filePath);
      return { success: true };
    } catch (err) {
      console.error("open-custom-list-file failed:", err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("show-custom-list-in-folder", async (_, listId) => {
    try {
      if (!listId) return { success: false, error: "Missing listId" };
      const filePath = getCustomListFilePath(listId);
      if (!(await fs.pathExists(filePath))) {
        // Fall back to opening the directory itself
        await shell.openPath(getCustomListsDir());
        return { success: true };
      }
      shell.showItemInFolder(filePath);
      return { success: true };
    } catch (err) {
      console.error("show-custom-list-in-folder failed:", err);
      return { success: false, error: err.message };
    }
  });
}

module.exports = {
  registerMiscHandlers,
};
