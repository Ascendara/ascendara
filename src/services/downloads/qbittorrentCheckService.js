/**
 * Check if qBittorrent WebUI is running and get its version
 * @returns {Promise<{active: boolean, version?: string, error?: string}>}
 */
const checkQbittorrentStatus = async overrides => {
  console.log("[qbitCheckService] Starting qBittorrent status check...");
  try {
    // Read credentials/endpoint from settings (or use explicit overrides).
    // Passing undefined fields lets the main-process handler fall back to
    // the user's configured values in ascendarasettings.json.
    const creds = {};
    if (overrides?.host) creds.host = overrides.host;
    if (overrides?.port) creds.port = overrides.port;
    if (overrides?.username) creds.username = overrides.username;
    if (overrides?.password) creds.password = overrides.password;

    console.log("[qbitCheckService] Attempting authentication...");
    const loginResult = await window.qbittorrentApi.login(creds);

    console.log("[qbitCheckService] Auth response:", loginResult);
    if (!loginResult.success) {
      throw new Error("Authentication failed: " + loginResult.error);
    }
    console.log("[qbitCheckService] Authentication successful");

    // Make multiple attempts for version check with increasing delays
    const delays = [100, 500, 1000];
    let lastError = null;

    for (const delay of delays) {
      try {
        console.log(`[qbitCheckService] Waiting ${delay}ms before version check...`);
        await new Promise(resolve => setTimeout(resolve, delay));

        console.log("[qbitCheckService] Fetching version...");
        const versionResult = await window.qbittorrentApi.getVersion();

        console.log("[qbitCheckService] Version response:", versionResult);
        if (versionResult.success) {
          console.log("[qbitCheckService] Retrieved version:", versionResult.version);
          return { active: true, version: versionResult.version };
        }
        lastError = versionResult.error;
      } catch (err) {
        lastError = err.message;
        console.error(
          `[qbitCheckService] Version check attempt failed after ${delay}ms:`,
          err
        );
      }
    }

    throw new Error("Failed to get version after multiple attempts: " + lastError);
  } catch (error) {
    console.error("[qbitCheckService] Error:", error.message);
    console.error("[qbitCheckService] Full error:", error);
    return {
      active: false,
      error: error.message.includes("Authentication failed")
        ? "Authentication failed"
        : "qBittorrent WebUI not responding",
    };
  }
};

export default checkQbittorrentStatus;
