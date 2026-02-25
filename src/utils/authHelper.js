/**
 * Authentication Helper Utility
 * Provides a consistent way to make authenticated API requests
 * Uses time-based HMAC signatures that rotate every hour
 */

/**
 * Get authentication token from API
 * @returns {Promise<string>} JWT token
 */
export async function getAuthToken() {
  try {
    const authHeaders = await window.electron.getAuthHeaders();
    const response = await fetch("https://api.ascendara.app/auth/token", {
      headers: authHeaders,
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
    },
  };

  return fetch(url, mergedOptions);
}
