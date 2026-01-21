/**
 * QR Code Generator Module
 * Generates QR codes for webapp connection URLs
 */

const QRCode = require("qrcode");

/**
 * Generate a QR code data URL for a given text/URL
 * @param {string} text - The text or URL to encode in the QR code
 * @param {object} options - QR code generation options
 * @returns {Promise<string>} - Data URL of the generated QR code
 */
async function generateQRCode(text, options = {}) {
  try {
    const defaultOptions = {
      errorCorrectionLevel: "M",
      type: "image/png",
      quality: 0.92,
      margin: 1,
      width: 256,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
      ...options,
    };

    const dataUrl = await QRCode.toDataURL(text, defaultOptions);
    return dataUrl;
  } catch (error) {
    console.error("Error generating QR code:", error);
    throw error;
  }
}

/**
 * Generate a QR code for webapp connection
 * @param {string} code - The 6-digit connection code
 * @returns {Promise<string>} - Data URL of the generated QR code
 */
async function generateWebappQRCode(code) {
  const url = `https://webview.ascendara.app/?code=${code}`;
  return generateQRCode(url);
}

module.exports = {
  generateQRCode,
  generateWebappQRCode,
};
