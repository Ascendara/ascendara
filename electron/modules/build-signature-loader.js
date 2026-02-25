/**
 * Build Signature Loader
 * Loads the build signature that was embedded during the build process
 * This signature is unique to each official build and cannot be replicated by forked projects
 */

const fs = require("fs");
const path = require("path");

let buildSignature = null;

/**
 * Load build signature from embedded file
 * @returns {Object|null} Build signature object or null if not found
 */
function loadBuildSignature() {
  if (buildSignature) {
    return buildSignature;
  }

  try {
    // In production, the signature file is embedded in the app
    const signaturePath = path.join(__dirname, "..", "build-signature.json");

    if (fs.existsSync(signaturePath)) {
      const signatureData = fs.readFileSync(signaturePath, "utf8");
      buildSignature = JSON.parse(signatureData);
      console.log("[Build Signature] Loaded:", buildSignature.buildId);
      return buildSignature;
    } else {
      console.warn(
        "[Build Signature] No signature file found - running in development mode"
      );
      return null;
    }
  } catch (error) {
    console.error("[Build Signature] Failed to load signature:", error.message);
    return null;
  }
}

/**
 * Get build signature for API requests
 * @returns {Object} Headers with build signature
 */
function getBuildSignatureHeaders() {
  const signature = loadBuildSignature();

  if (!signature) {
    // Development mode - no signature required
    return {};
  }

  return {
    "X-Build-ID": signature.buildId,
    "X-Build-Signature": signature.signature,
    "X-Build-Version": signature.version,
    "X-Build-Timestamp": signature.timestamp.toString(),
  };
}

module.exports = {
  loadBuildSignature,
  getBuildSignatureHeaders,
};
