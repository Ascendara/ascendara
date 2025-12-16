/**
 * Torbox API Service
 * Handles authentication and debrid operations with the Torbox API
 */

// Always use proxy to avoid CORS issues (works in both dev and production)
const API_BASE_URL = "/api/torbox";

/**
 * Check if the Torbox service is enabled by verifying if an API key exists
 * @param {Object} settings - The application settings object
 * @returns {boolean} - True if the service is enabled (API key exists)
 */
export const isEnabled = settings => {
  return Boolean(settings?.torboxApiKey);
};

/**
 * Get the API key from settings
 * @param {Object} settings - The application settings object
 * @returns {string|null} - The API key or null if not set
 */
export const getApiKey = settings => {
  return settings?.torboxApiKey || null;
};

/**
 * Control web downloads (delete, etc.)
 * @param {string} apiKey - The Torbox API key for authorization
 * @param {Object} options - Control options
 * @param {number|string} [options.webdl_id] - The web download ID to operate on (optional if using all)
 * @param {string} options.operation - The operation to perform (e.g., "delete")
 * @param {boolean} [options.all] - Whether to apply the operation to all downloads (optional if using webdl_id)
 * @returns {Promise<Object>} - The API response
 * @throws {Error} - If the API request fails
 */
export const controlWebDownload = async (apiKey, options) => {
  if (!apiKey) throw new Error("API key is required");
  if (!options.operation) throw new Error("Operation is required");
  if (!options.webdl_id && options.all !== true)
    throw new Error("Either webdl_id or all=true is required");

  let base = API_BASE_URL;
  if (base.startsWith("/")) {
    base = window.location.origin + base;
  }

  const url = `${base}/webdl/controlwebdownload`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        webdl_id: options.webdl_id,
        operation: options.operation,
        all: options.all || false,
      }),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.detail || `Failed to ${options.operation} download`);
    }

    return data;
  } catch (error) {
    console.error(
      `[Torbox] Error controlling web download (${options.operation}):`,
      error
    );
    throw error;
  }
};

/**
 * Create a premium direct download link using the Torbox API
 * @param {string} link - The original link to convert to a premium download
 * @param {string} apiKey - The Torbox API key for authorization
 * @returns {Promise<Object>} - The API response containing the premium download link
 * @throws {Error} - If the API request fails
 */
export const createPremiumDownloadLink = async (link, apiKey) => {
  console.log(
    "[Torbox] createPremiumDownloadLink called with:",
    link,
    "type:",
    typeof link
  );
  if (!link) {
    throw new Error("Link is required");
  }

  if (!apiKey) {
    throw new Error("API key is required");
  }

  try {
    // Create FormData object
    const formData = new FormData();
    formData.append("link", link);
    console.log(
      "[Torbox] Sending POST to",
      `${API_BASE_URL}/webdl/createwebdownload`,
      "with link:",
      link
    );

    const response = await fetch(`${API_BASE_URL}/webdl/createwebdownload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        // No Content-Type header needed as it's automatically set with boundary for FormData
      },
      body: formData,
    });
    console.log("[Torbox] Response status:", response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("[Torbox] Error response data:", errorData);
      throw new Error(
        errorData.message || `Failed to create premium download link: ${response.status}`
      );
    }

    return await response.json();
  } catch (error) {
    console.error("Torbox API error:", error);
    throw error;
  }
};

/**
 * Request a direct download link for a web download
 * @param {string} apiKey - The Torbox API key
 * @param {string} webdlId - The web download ID
 * @returns {Promise<string>} - The direct download URL
 * @throws {Error} - If the API request fails
 */
export const getDirectDownloadLink = async (apiKey, webdlId) => {
  if (!apiKey) {
    throw new Error("API key is required");
  }

  if (!webdlId) {
    throw new Error("Web download ID is required");
  }

  try {
    // Build the URL with query parameters
    // Ensure base is absolute for URL constructor
    let base = API_BASE_URL;
    if (base.startsWith("/")) {
      base = window.location.origin + base;
    }
    let url;
    try {
      url = new URL(`${base}/webdl/requestdl`);
    } catch (err) {
      console.error(
        "[Torbox] Failed to construct URL object:",
        err,
        "base:",
        base,
        "API_BASE_URL:",
        API_BASE_URL
      );
      throw err;
    }

    // Add required parameters
    url.searchParams.append("token", apiKey);
    url.searchParams.append("web_id", webdlId);

    // Always set zip_link to true (as string)
    url.searchParams.append("zip_link", "true");

    console.log("[Torbox] getDirectDownloadLink constructed URL:", url.toString());
    console.log("[Torbox] Params:", { token: apiKey, web_id: webdlId, zip_link: "true" });

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("[Torbox] getDirectDownloadLink error response:", errorData);
      if (errorData.detail) {
        console.error("[Torbox] API error detail:", errorData.detail);
      }
      throw new Error(
        errorData.message ||
          errorData.detail ||
          `Failed to get direct download link: ${response.status}`
      );
    }

    const data = await response.json();
    return data.download_url || data; // Return the download URL or the full response
  } catch (error) {
    console.error("Torbox API error:", error);
    throw error;
  }
};

/**
 * Get a direct download link for a URL in one step
 * This function combines createPremiumDownloadLink and getDirectDownloadLink
 * @param {string} link - The original link to convert to a premium download
 * @param {string} apiKey - The Torbox API key for authorization
 * @returns {Promise<string>} - The direct download URL
 * @throws {Error} - If any API request fails
 */
// Check the download state for a given webdownload ID
export const checkDownloadState = async (apiKey, webdlId) => {
  if (!apiKey) throw new Error("API key is required");
  if (!webdlId) throw new Error("Web download ID is required");

  let base = API_BASE_URL;
  if (base.startsWith("/")) {
    base = window.location.origin + base;
  }
  const url = `${base}/webdl/mylist?d=${webdlId}`;
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    const data = await response.json();
    if (!data.success || !Array.isArray(data.data)) {
      throw new Error(data.detail || "Failed to check download state");
    }
    return data.data;
  } catch (error) {
    console.error("[Torbox] Error checking download state:", error);
    throw error;
  }
};

/**
 * Get all downloads for the current user
 * @param {string} apiKey - The Torbox API key for authorization
 * @returns {Promise<Array>} - Array of download objects
 * @throws {Error} - If the API request fails
 */
export const getAllDownloads = async apiKey => {
  if (!apiKey) throw new Error("API key is required");

  let base = API_BASE_URL;
  if (base.startsWith("/")) {
    base = window.location.origin + base;
  }
  const url = `${base}/webdl/mylist`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    const data = await response.json();

    if (!data.success || !Array.isArray(data.data)) {
      throw new Error(data.detail || "Failed to fetch downloads list");
    }

    return data.data;
  } catch (error) {
    console.error("[Torbox] Error fetching downloads:", error);
    throw error;
  }
};

export const getDirectDownloadLinkFromUrl = async (
  link,
  apiKey,
  webdownloadId = null
) => {
  console.log(
    "[Torbox] getDirectDownloadLinkFromUrl called with:",
    link,
    "type:",
    typeof link,
    "webdownloadId:",
    webdownloadId
  );
  if (!link) {
    throw new Error("Link is required");
  }
  if (!apiKey) {
    throw new Error("API key is required");
  }
  try {
    // Step 1: Create the premium download
    console.log("[Torbox] Creating premium download for link:", link);
    const createResult = await createPremiumDownloadLink(link, apiKey);
    if (
      !createResult.success ||
      !createResult.data ||
      !createResult.data.webdownload_id
    ) {
      console.error("[Torbox] createPremiumDownloadLink error:", createResult);
      if (createResult.detail) {
        console.error("[Torbox] API error detail:", createResult.detail);
      }
      throw new Error(
        "Failed to create premium download: " + (createResult.detail || "Unknown error")
      );
    }
    const createdWebdownloadId = createResult.data.webdownload_id;
    console.log("[Torbox] Premium download created with ID:", createdWebdownloadId);
    // Step 2: Fetch the mylist (all downloads)
    let base = API_BASE_URL;
    if (base.startsWith("/")) {
      base = window.location.origin + base;
    }
    const url = `${base}/webdl/mylist`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    const data = await response.json();
    if (!data.success || !Array.isArray(data.data)) {
      throw new Error(data.detail || "Failed to fetch web downloads list");
    }
    // Optionally filter for the specific webdownloadId (either passed or just created)
    const idToCheck = webdownloadId || createdWebdownloadId;
    const found = data.data.find(item => String(item.id) === String(idToCheck));
    if (!found) {
      throw new Error("Could not find created download in list");
    }
    if (found.download_state === "cached") {
      // Download is ready
      return { status: "ready", item: found, webdownloadId: idToCheck };
    } else {
      return {
        status: found.download_state,
        progress: found.progress,
        eta: found.eta,
        webdownloadId: idToCheck,
        item: found,
      };
    }
  } catch (error) {
    if (error && error.response) {
      // If error has a response (e.g., from axios), log it
      console.error("[Torbox] API error response:", error.response);
      if (error.response.data && error.response.data.detail) {
        console.error("[Torbox] API error detail:", error.response.data.detail);
      }
    }
    console.error("[Torbox] API error in getDirectDownloadLinkFromUrl:", error);
    throw error;
  }
};

/**
 * Fetch user information from the TorBox API
 * @param {string} apiKey - The Torbox API key for authorization
 * @returns {Promise<Object>} - The user information object
 * @throws {Error} - If the API request fails
 */
export const getUserInfo = async apiKey => {
  if (!apiKey) {
    throw new Error("API key is required");
  }

  try {
    const response = await fetch(`${API_BASE_URL}/user/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.detail || "Failed to fetch user information");
    }

    return data.data;
  } catch (error) {
    console.error("[Torbox] Error fetching user information:", error);
    throw error;
  }
};

export default {
  isEnabled,
  getApiKey,
  getDirectDownloadLinkFromUrl,
  getUserInfo,
};
