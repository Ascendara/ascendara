/**
 * Authentication Helper Utility
 * Provides a consistent way to make authenticated API requests
 * Uses time-based HMAC signatures that rotate every hour
 */

export function getClientVersionHeaders() {
  return typeof __APP_VERSION__ === "string"
    ? { "X-Ascendara-Version": __APP_VERSION__ }
    : {};
}

export async function getUserAuthHeaders(user, forceRefresh = false) {
  if (!user || typeof user.getIdToken !== "function") {
    throw new Error("Sign in to access your Ascend account.");
  }
  const token = await user.getIdToken(forceRefresh);
  return {
    ...getClientVersionHeaders(),
    Authorization: `Bearer ${token}`,
  };
}

export async function userAuthenticatedFetch(user, url, options = {}) {
  const target = new URL(url, "https://api.ascendara.app");
  if (target.origin !== "https://api.ascendara.app") {
    throw new Error("Account credentials may only be sent to the Ascendara API.");
  }
  const send = async forceRefresh => {
    const headers = new Headers(options.headers);
    const authHeaders = await getUserAuthHeaders(user, forceRefresh);
    for (const [name, value] of Object.entries(authHeaders)) headers.set(name, value);
    return fetch(target.href, { ...options, headers, redirect: "error" });
  };
  let response = await send(false);
  if (response.status === 401) response = await send(true);
  if (response.status === 426) {
    window.dispatchEvent(new CustomEvent("ascendara:update-required"));
  }
  return response;
}

/**
 * Get authentication token from API
 * @returns {Promise<string>} JWT token
 */
export async function getAuthToken() {
  try {
    const authHeaders = await window.electron.getAuthHeaders();
    const response = await fetch("https://api.ascendara.app/auth/token", {
      headers: { ...authHeaders, ...getClientVersionHeaders() },
    });

    if (!response.ok) {
      throw new Error("Failed to obtain token");
    }

    const data = await response.json();
    return data.token;
  } catch (error) {
    console.error("Error getting auth token:", error);
    throw error;
  }
}

/**
 * Make authenticated API request
 * @param {string} url - API endpoint URL
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>}
 */
export async function authenticatedFetch(url, options = {}) {
  const authHeaders = await window.electron.getAuthHeaders();

  const mergedOptions = {
    ...options,
    headers: {
      ...options.headers,
      ...authHeaders,
      ...getClientVersionHeaders(),
    },
  };

  return fetch(url, mergedOptions);
}
