/**
 * Analytics v2
 * Sends app usage to Firebase Analytics for every user. Signed-in users are
 * identified by their Firebase uid; signed-out users stay anonymous. Events
 * raised by the main process (downloads) arrive over IPC and are sent here,
 * since the Firebase SDK only runs in the renderer.
 */
import { app } from "@/services/firebase/firebaseService";
import {
  initializeAnalytics,
  isSupported,
  logEvent,
  setUserId,
  setUserProperties,
} from "firebase/analytics";

// Calls made before Analytics is ready, bounded in case it never is
const MAX_PENDING = 100;

let analytics = null;
let unavailable = false;
const pending = [];

if (app) {
  isSupported()
    .then(supported => {
      if (!supported) {
        unavailable = true;
        pending.length = 0;
        return;
      }
      // Screens are logged per route below; the automatic one would double the first
      analytics = initializeAnalytics(app, { config: { send_page_view: false } });
      setUserProperties(analytics, {
        app_version: __APP_VERSION__,
        platform: window.electron?.getPlatform?.() || "unknown",
      });
      for (const call of pending.splice(0)) call(analytics);
    })
    .catch(error => {
      unavailable = true;
      pending.length = 0;
      console.warn("[Analytics] Unavailable:", error);
    });
} else {
  unavailable = true;
}

function run(call) {
  if (analytics) {
    try {
      call(analytics);
    } catch (error) {
      console.warn("[Analytics] Failed to send:", error);
    }
  } else if (!unavailable && pending.length < MAX_PENDING) {
    pending.push(call);
  }
}

// File paths in error messages can contain the user's name, e.g. C:\Users\<name>
const PATH_PATTERN = /(?:[A-Za-z]:[\\/]|\\\\|~[\\/]|\/(?:Users|home)\/)[^\s"'<>|]*/g;

// Firebase drops parameter values longer than 100 characters
function clean(params) {
  return Object.fromEntries(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => [
        key,
        typeof value === "string" ? value.replace(PATH_PATTERN, "<path>").slice(0, 100) : value,
      ])
  );
}

export function track(name, params = {}) {
  run(instance => logEvent(instance, name, clean(params)));
}

// One screen per route, without route parameters such as folder names
export function trackScreen(pathname) {
  const screen = pathname.split("/").filter(Boolean)[0] || "home";
  run(instance =>
    logEvent(instance, "page_view", {
      page_title: screen,
      page_path: `/${screen}`,
      page_location: `${window.location.origin}/${screen}`,
    })
  );
}

export function identifyUser(user) {
  run(instance => {
    setUserId(instance, user?.uid || null);
    setUserProperties(instance, { signed_in: user ? "true" : "false" });
  });
}

/** Forward main-process and game events; returns a cleanup function. */
export function startAnalyticsListeners() {
  const electron = window.electron;
  if (!electron) return () => {};
  const unsubscribers = [
    electron.onAnalyticsEvent?.(event => {
      if (event?.name) track(event.name, event.params || {});
    }),
    electron.onGameLaunchSuccess?.((_, data) => track("game_launch", { game: data?.game })),
    electron.onGameLaunchError?.((_, data) =>
      track("game_launch_failed", { game: data?.game, reason: data?.error })
    ),
  ];
  return () => unsubscribers.forEach(unsubscribe => unsubscribe?.());
}
