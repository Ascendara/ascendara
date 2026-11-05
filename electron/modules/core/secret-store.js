/**
 * How a saved secret sits on disk, told apart by form. Free of Electron imports so it
 * can be tested under plain node.
 * - sealed: "ascsafe:v1:<base64>" from safeStorage. The ":" is deliberate: older
 *   builds take any value with a ":" as encrypted and leave it alone.
 * - legacy: "<32 hex>:<hex>", AES-256-CBC keyed by the machine id.
 * - plain:  anything else.
 * A value that fails to open reads as no value, never as ciphertext.
 */
const fs = require("fs");

const SAFE_PREFIX = "ascsafe:v1:";
const LEGACY_SHAPE = /^[0-9a-f]{32}:[0-9a-f]*$/i;
// A wrong AES key gives control characters or invalid UTF-8, even on the rare occasion
// the padding checks out. A pasted key may still carry an accent and must save as is.
// eslint-disable-next-line no-control-regex
const PLAUSIBLE_TEXT = /^[^\x00-\x08\x0b\x0c\x0e-\x1f\x7f�]+$/;

const OWNER_ONLY = 0o600;

const SECRET_KINDS = Object.freeze({
  EMPTY: "empty",
  SAFE: "safe",
  LEGACY: "legacy",
  PLAIN: "plain",
});

/** Which shape a stored value has. */
function classifySecret(value) {
  if (typeof value !== "string" || value === "") return SECRET_KINDS.EMPTY;
  if (value.startsWith(SAFE_PREFIX)) return SECRET_KINDS.SAFE;
  if (LEGACY_SHAPE.test(value)) return SECRET_KINDS.LEGACY;
  return SECRET_KINDS.PLAIN;
}

const isPlausibleSecret = value =>
  typeof value === "string" &&
  PLAUSIBLE_TEXT.test(value) &&
  classifySecret(value) === SECRET_KINDS.PLAIN;

/**
 * @param {Object} options
 * @param {Object} options.safeStorage - Electron's safeStorage, or undefined
 * @param {Function} options.isAppReady - safeStorage works only after app ready
 * @param {Object} options.legacy - { encrypt, decrypt } from encryption.js, both
 *   answering null on failure
 */
function createSecretStore({ safeStorage, isAppReady, legacy }) {
  // Fixed for the run once the app is ready. On Linux "basic_text" is a hard-coded
  // password: no real protection.
  let safeAvailable;
  const isSafeAvailable = () => {
    if (safeAvailable === undefined) {
      try {
        if (!isAppReady()) return false;
        safeAvailable =
          Boolean(safeStorage?.isEncryptionAvailable()) &&
          safeStorage.getSelectedStorageBackend?.() !== "basic_text";
      } catch {
        safeAvailable = false;
      }
    }
    return safeAvailable;
  };

  const openSafe = stored => {
    if (!isSafeAvailable()) return null;
    try {
      const value = safeStorage.decryptString(
        Buffer.from(stored.slice(SAFE_PREFIX.length), "base64")
      );
      return isPlausibleSecret(value) ? value : null;
    } catch {
      return null;
    }
  };

  const openLegacy = stored => {
    const value = legacy.decrypt(stored);
    // An older build given a sealed value can wrap it in its own encryption.
    if (classifySecret(value) === SECRET_KINDS.SAFE) return openSafe(value);
    return isPlausibleSecret(value) ? value : null;
  };

  // Every settings read opens every secret, and a decrypt is not free.
  const opened = new Map();

  /** The secret behind a stored value: { ok: true, value } or { ok: false }. */
  const open = stored => {
    const kind = classifySecret(stored);
    if (kind !== SECRET_KINDS.SAFE && kind !== SECRET_KINDS.LEGACY)
      return { ok: true, value: stored };
    if (opened.has(stored)) return { ok: true, value: opened.get(stored) };
    const value = kind === SECRET_KINDS.SAFE ? openSafe(stored) : openLegacy(stored);
    if (value === null) return { ok: false };
    opened.set(stored, value);
    return { ok: true, value };
  };

  /** The form a value should be in right now. */
  const targetKind = () => (isSafeAvailable() ? SECRET_KINDS.SAFE : SECRET_KINDS.LEGACY);

  /**
   * A stored form of a secret, read back and compared before it is returned:
   * { ok: true, value } or { ok: false }. Never answers with the secret itself.
   */
  const seal = value => {
    try {
      const kind = targetKind();
      const stored =
        kind === SECRET_KINDS.SAFE
          ? `${SAFE_PREFIX}${safeStorage.encryptString(value).toString("base64")}`
          : legacy.encrypt(value);
      if (classifySecret(stored) !== kind) return { ok: false };
      const check = open(stored);
      return check.ok && check.value === value
        ? { ok: true, value: stored }
        : { ok: false };
    } catch {
      return { ok: false };
    }
  };

  /** Drop the opened copies. A removed secret must not stay readable in memory. */
  const forget = () => opened.clear();

  return { forget, isSafeAvailable, open, seal, targetKind };
}

/**
 * Replace a file in one step: a crash leaves the old file or the new one, never a
 * half-written one. Throws when it could not, and the old file is then untouched.
 * Only this user can read the result: these files hold saved logins.
 * @param {Object} [options]
 * @param {boolean} [options.durable] - Also survive a power cut, by waiting for the
 *   disk. Blocks the main process meanwhile, so only for what can not be written again.
 */
function writeFileAtomic(filePath, text, { durable = false } = {}) {
  const temporary = `${filePath}.tmp`;
  let handle;
  try {
    handle = fs.openSync(temporary, "w", OWNER_ONLY);
    // A leftover file from a crash keeps its old mode through the open above.
    fs.fchmodSync(handle, OWNER_ONLY);
    fs.writeFileSync(handle, text);
    if (durable) fs.fsyncSync(handle);
    fs.closeSync(handle);
    handle = undefined;
    fs.renameSync(temporary, filePath);
  } catch (error) {
    if (handle !== undefined) {
      try {
        fs.closeSync(handle);
      } catch {
        // Already failing, the original error is the useful one.
      }
    }
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

module.exports = {
  OWNER_ONLY,
  SAFE_PREFIX,
  SECRET_KINDS,
  classifySecret,
  createSecretStore,
  writeFileAtomic,
};
