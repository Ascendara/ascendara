/**
 * How a saved secret (a debrid key, a Twitch value) sits on disk. Kept free of
 * Electron imports so it can be tested under plain node.
 *
 * Three shapes exist, told apart by their form:
 * - sealed:  "ascsafe:v1:<base64>", from Electron safeStorage (the OS keychain or
 *            DPAPI). The ":" is deliberate: builds before this format treat any
 *            value with a ":" as already encrypted and leave it in place.
 * - legacy:  "<32 hex>:<hex>", AES-256-CBC with a key from the machine id. Still
 *            used when safeStorage is not available.
 * - plain:   anything else, for example a token containing ":" or a value written
 *            before encryption existed.
 *
 * A failed read yields no value at all, so ciphertext never reaches a service as
 * if it were a key. Nothing here logs a value.
 */
const fs = require("fs");

const SAFE_PREFIX = "ascsafe:v1:";
const LEGACY_SHAPE = /^[0-9a-f]{32}:[0-9a-f]*$/i;
// Keys, tokens and client ids are text. A wrong AES key gives control characters or
// invalid UTF-8, even on the rare occasion the padding happens to check out. A pasted
// key may still carry a stray non-breaking space or accent, and must save as it is.
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
  // On Linux "basic_text" means a hard-coded password: no real protection.
  const isSafeAvailable = () => {
    try {
      return (
        Boolean(isAppReady()) &&
        Boolean(safeStorage?.isEncryptionAvailable()) &&
        safeStorage.getSelectedStorageBackend?.() !== "basic_text"
      );
    } catch {
      return false;
    }
  };

  // get-settings reads every secret and an OS decrypt is not free.
  const opened = new Map();

  const openSafe = stored => {
    if (!isSafeAvailable()) return { ok: false, reason: "unavailable" };
    if (opened.has(stored)) return { ok: true, value: opened.get(stored) };
    try {
      const value = safeStorage.decryptString(
        Buffer.from(stored.slice(SAFE_PREFIX.length), "base64")
      );
      if (!isPlausibleSecret(value)) return { ok: false, reason: "corrupt" };
      opened.set(stored, value);
      return { ok: true, value };
    } catch {
      return { ok: false, reason: "corrupt" };
    }
  };

  const openLegacy = stored => {
    let value;
    try {
      value = legacy.decrypt(stored);
    } catch {
      value = null;
    }
    if (!value || value === stored) return { ok: false, reason: "corrupt" };
    // An older build given a sealed value can wrap it in its own encryption.
    if (classifySecret(value) === SECRET_KINDS.SAFE) return openSafe(value);
    return isPlausibleSecret(value)
      ? { ok: true, value }
      : { ok: false, reason: "corrupt" };
  };

  /** The secret behind a stored value: { ok: true, value } or { ok: false, reason }. */
  const open = stored => {
    const kind = classifySecret(stored);
    if (kind === SECRET_KINDS.SAFE) return openSafe(stored);
    if (kind === SECRET_KINDS.LEGACY) return openLegacy(stored);
    return { ok: true, value: stored };
  };

  const sealSafe = value => {
    try {
      const stored = `${SAFE_PREFIX}${safeStorage.encryptString(value).toString("base64")}`;
      const check = openSafe(stored);
      return check.ok && check.value === value
        ? { ok: true, value: stored }
        : { ok: false };
    } catch {
      return { ok: false };
    }
  };

  const sealLegacy = value => {
    try {
      const stored = legacy.encrypt(value);
      if (classifySecret(stored) !== SECRET_KINDS.LEGACY) return { ok: false };
      const check = openLegacy(stored);
      return check.ok && check.value === value
        ? { ok: true, value: stored }
        : { ok: false };
    } catch {
      return { ok: false };
    }
  };

  /**
   * A stored form of a secret, read back and compared before it is returned:
   * { ok: true, value } or { ok: false }. Never answers with the secret itself.
   */
  const seal = value => (isSafeAvailable() ? sealSafe(value) : sealLegacy(value));

  /** The form a value should be in right now. */
  const targetKind = () => (isSafeAvailable() ? SECRET_KINDS.SAFE : SECRET_KINDS.LEGACY);

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
  isPlausibleSecret,
  writeFileAtomic,
};
