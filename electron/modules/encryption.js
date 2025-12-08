/**
 * Encryption Module
 * Handles encryption and decryption of sensitive data
 */

const crypto = require("crypto");
const { machineIdSync } = require("node-machine-id");

/**
 * Generate encryption key based on machine ID
 */
function generateEncryptionKey() {
  const machineId = machineIdSync(true);
  return crypto.createHash("sha256").update(machineId).digest("hex").substring(0, 32);
}

/**
 * Encrypt text using AES-256-CBC
 * @param {string} text - Text to encrypt
 * @returns {string} - Encrypted text in format "iv:encrypted"
 */
function encrypt(text) {
  if (!text) return "";
  try {
    const key = generateEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(key), iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    return `${iv.toString("hex")}:${encrypted}`;
  } catch (error) {
    console.error("Encryption error:", error);
    return text; // Return original text on error
  }
}

/**
 * Decrypt text encrypted with encrypt()
 * @param {string} encryptedText - Text in format "iv:encrypted"
 * @returns {string} - Decrypted text
 */
function decrypt(encryptedText) {
  if (!encryptedText || !encryptedText.includes(":")) return encryptedText;
  try {
    const key = generateEncryptionKey();
    const parts = encryptedText.split(":");
    const iv = Buffer.from(parts[0], "hex");
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(key), iv);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    console.error("Decryption error:", error);
    return encryptedText; // Return encrypted text on error
  }
}

module.exports = {
  generateEncryptionKey,
  encrypt,
  decrypt,
};
