const ENDPOINTS = {
  monitor: "https://monitor.ascendara.app/",
  api: "https://api.ascendara.app/",
  storage: "https://cdn.ascendara.app/",
  lfs: "https://lfs.ascendara.app/",
  r2: "https://r2.ascendara.app/",
};

const checkEndpoint = async url => {
  try {
    const response = await window.electron.request(url, {
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
    };
  }
};

const checkInternetConnectivity = async () => {
  try {
    const response = await window.electron.request("https://monitor.ascendara.app/", {
      method: "HEAD",
      timeout: 5000,
    });

    // Treat error code 1033 as offline
    if (
      response.status === 1033 ||
      response.statusCode === 1033 ||
      String(response.status) === "1033" ||
      String(response.statusCode) === "1033"
    ) {
      return false;
    }

    // 302 redirect means online (server is responding and redirecting to home page)
    // Any 2xx or 3xx status code means the server is reachable
    const isOnline = response.ok || (response.status >= 200 && response.status < 400);
    return isOnline;
  } catch (error) {
    // Check if error contains status code 1033
    if (
      error.status === 1033 ||
      error.code === 1033 ||
      error.statusCode === 1033 ||
      String(error.status) === "1033" ||
      String(error.code) === "1033" ||
      String(error.statusCode) === "1033"
    ) {
      return false;
    }
    return false;
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

export const checkServerStatus = async (force = false) => {
  // Return cached status if available and not forced
  if (!force && currentStatus && lastCheck && Date.now() - lastCheck < CACHE_DURATION) {
    return currentStatus;
  }

  try {
    // First check internet connectivity
    const isOnline = await checkInternetConnectivity();

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
      lastCheck = Date.now();
      notifySubscribers();
      return currentStatus;
    }

    // We have internet, check all services
    const results = await Promise.all([
      checkEndpoint(ENDPOINTS.monitor),
      checkEndpoint(ENDPOINTS.api),
      checkEndpoint(ENDPOINTS.storage),
      checkEndpoint(ENDPOINTS.lfs),
      checkEndpoint(ENDPOINTS.r2),
    ]);

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
export const startStatusCheck = (interval = 30000) => {
  if (checkInterval) {
    clearInterval(checkInterval);
  }

  // Do an immediate check
  checkServerStatus(true).catch(console.error);

  checkInterval = setInterval(() => {
    checkServerStatus(true).catch(console.error);
  }, interval);

  return () => {
    if (checkInterval) {
      clearInterval(checkInterval);
      checkInterval = null;
    }
  };
};

// Get the current status without checking
export const getCurrentStatus = () => currentStatus;
