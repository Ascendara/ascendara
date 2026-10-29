import { API_URL } from "@/config/api";
const ENDPOINTS = {
  monitor: "https://monitor.ascendara.app/",
  api: `${API_URL}/`,
  storage: "https://cdn.ascendara.app/",
  lfs: "https://lfs.ascendara.app/",
  r2: "https://r2.ascendara.app/",
};

const requestServiceStatus = (url, options) => {
  // Service checks use the restricted main-process request path.
  return window.electron.requestAscendaraService(url, options);
};

const checkEndpoint = async url => {
  try {
    const response = await requestServiceStatus(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Client": "launcher-status-check",
      },
      timeout: 5000,
    });

    // Check for error code 1033 (offline)
    if (
      response.status === 1033 ||
      response.statusCode === 1033 ||
      String(response.status) === "1033" ||
      String(response.statusCode) === "1033"
    ) {
      return {
        ok: false,
        error: "Service Offline (1033)",
        isOffline: true,
      };
    }

    // Check for 530 status with "error code: 1033" in data
    if (
      response.status === 530 &&
      response.data &&
      String(response.data).includes("1033")
    ) {
      return {
        ok: false,
        error: "Service Offline (1033)",
        isOffline: true,
      };
    }

    // Any response (2xx, 3xx, 4xx) means the server is reachable and online
    // Only 5xx errors (except 530 with 1033) indicate actual server problems
    const isReachable = response.status < 500 || response.ok;

    if (isReachable) {
      return {
        ok: true,
        data: response.data,
      };
    }

    return {
      ok: false,
      error: `Server Error (${response.status})`,
    };
  } catch (error) {
    // Check if error contains status code 1033
    if (error.status === 1033 || error.code === 1033 || error.statusCode === 1033) {
      return {
        ok: false,
        error: "Service Offline (1033)",
        isOffline: true,
      };
    }

    // Check string versions
    if (
      String(error.status) === "1033" ||
      String(error.code) === "1033" ||
      String(error.statusCode) === "1033"
    ) {
      return {
        ok: false,
        error: "Service Offline (1033)",
        isOffline: true,
      };
    }

    return {
      ok: false,
      error: "Service Unreachable",
      unreachable: true,
    };
  }
};

// Singleton state
let currentStatus = {
  ok: true, // Start optimistically
  noInternet: false,
  monitor: { ok: true },
  api: { ok: true },
  storage: { ok: true },
  lfs: { ok: true },
  r2: { ok: true },
};
let lastCheck = null;
let checkInterval = null;
let subscribers = new Set();

const CACHE_DURATION = 10000; // 10 seconds
const STATUS_CHECK_INTERVAL = 3 * 60 * 1000; // 3 minutes

// storage (cdn) and r2 are public buckets, so every status ping is a billed
// read. Check them rarely and reuse the last result in between.
const BUCKET_CHECK_INTERVAL = 30 * 60 * 1000; // 30 minutes
let lastBucketCheck = null;

const checkBuckets = async () => {
  if (lastBucketCheck && Date.now() - lastBucketCheck < BUCKET_CHECK_INTERVAL) {
    return [currentStatus.storage, currentStatus.r2];
  }
  lastBucketCheck = Date.now();
  return Promise.all([checkEndpoint(ENDPOINTS.storage), checkEndpoint(ENDPOINTS.r2)]);
};

let pendingCheck = null;
export const checkServerStatus = (force = false) => {
  if (!pendingCheck) {
    pendingCheck = performStatusCheck(force).finally(() => {
      pendingCheck = null;
    });
  }
  return pendingCheck;
};

const performStatusCheck = async (force = false) => {
  // Return cached status if available and not forced
  if (!force && currentStatus && lastCheck && Date.now() - lastCheck < CACHE_DURATION) {
    return currentStatus;
  }

  try {
    // These checks double as the connectivity probe, so there is no separate
    // ping: if none of them got any response at all, we have no internet.
    const [monitor, api, lfs] = await Promise.all([
      checkEndpoint(ENDPOINTS.monitor),
      checkEndpoint(ENDPOINTS.api),
      checkEndpoint(ENDPOINTS.lfs),
    ]);
    const isOnline = ![monitor, api, lfs].every(r => r.unreachable);

    // If no internet, update and return that status
    if (!isOnline) {
      currentStatus = {
        ok: false,
        noInternet: true,
        monitor: { ok: false, error: "No internet connection" },
        api: { ok: false, error: "No internet connection" },
        storage: { ok: false, error: "No internet connection" },
        lfs: { ok: false, error: "No internet connection" },
        r2: { ok: false, error: "No internet connection" },
      };
      lastBucketCheck = null; // re-check buckets as soon as we're back online
      lastCheck = Date.now();
      notifySubscribers();
      return currentStatus;
    }

    // We have internet, so the bucket checks are worth spending
    const [storage, r2] = await checkBuckets();
    const results = [monitor, api, storage, lfs, r2];

    currentStatus = {
      ok: results.every(r => r.ok),
      noInternet: false,
      monitor: results[0],
      api: results[1],
      storage: results[2],
      lfs: results[3],
      r2: results[4],
    };

    lastCheck = Date.now();
    notifySubscribers();
    return currentStatus;
  } catch (error) {
    console.error("Error checking server status:", error);
    // Don't update status on error, keep previous status
    return currentStatus;
  }
};

// Function to notify all subscribers of status changes
const notifySubscribers = () => {
  subscribers.forEach(callback => callback(currentStatus));
};

// Subscribe to status updates
export const subscribeToStatus = callback => {
  subscribers.add(callback);
  // Return unsubscribe function
  return () => subscribers.delete(callback);
};

// Start the status check interval
export const startStatusCheck = (interval = STATUS_CHECK_INTERVAL) => {
  if (checkInterval) {
    clearInterval(checkInterval);
  }

  // Do an immediate check
  checkServerStatus(true).catch(console.error);

  // Every running launcher pings on this timer, so skip it while the window
  // is hidden and catch up when it comes back.
  checkInterval = setInterval(() => {
    if (document.hidden) return;
    checkServerStatus(true).catch(console.error);
  }, interval);

  const handleVisibilityChange = () => {
    if (!document.hidden && (!lastCheck || Date.now() - lastCheck >= interval)) {
      checkServerStatus(true).catch(console.error);
    }
  };
  document.addEventListener("visibilitychange", handleVisibilityChange);

  // Don't wait out the interval to notice the connection coming back
  const handleOnline = () => {
    if (!document.hidden) checkServerStatus(true).catch(console.error);
  };
  window.addEventListener("online", handleOnline);

  return () => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("online", handleOnline);
    if (checkInterval) {
      clearInterval(checkInterval);
      checkInterval = null;
    }
  };
};

// Get the current status without checking
export const getCurrentStatus = () => currentStatus;
