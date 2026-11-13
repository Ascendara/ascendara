/**
 * Keeps safeStorage on the same Linux keyring every launch. Electron picks the keyring
 * from the desktop session, so a session without one (Steam Deck Game Mode, a bare
 * window manager) falls back to basic_text and can not open secrets sealed by KWallet
 * or libsecret: saved logins read as empty there. The keyring that sealed them is
 * remembered and asked for again before app ready.
 */
const fs = require("fs");
const path = require("path");

const FILE_NAME = "password-store.json";
// getSelectedStorageBackend() name -> --password-store value
const BACKENDS = {
  gnome_libsecret: "gnome-libsecret",
  kwallet: "kwallet",
  kwallet5: "kwallet5",
  kwallet6: "kwallet6",
};

const filePath = userData => path.join(userData, FILE_NAME);

/** The remembered --password-store value, or null. */
function readPinnedStore(userData) {
  try {
    const { store } = JSON.parse(fs.readFileSync(filePath(userData), "utf8"));
    return Object.values(BACKENDS).includes(store) ? store : null;
  } catch {
    return null;
  }
}

/** Before app ready: ask for the remembered keyring unless one was given. */
function pinPasswordStore({ app, platform = process.platform }) {
  if (platform !== "linux" || app.commandLine.hasSwitch("password-store")) return null;
  const store = readPinnedStore(app.getPath("userData"));
  if (store) app.commandLine.appendSwitch("password-store", store);
  return store;
}

/** After app ready: remember the keyring in use. A fallback to basic_text never replaces it. */
function rememberPasswordStore({ app, safeStorage, platform = process.platform }) {
  if (platform !== "linux") return null;
  let store;
  try {
    if (!safeStorage.isEncryptionAvailable()) return null;
    store = BACKENDS[safeStorage.getSelectedStorageBackend?.()];
  } catch {
    return null;
  }
  const userData = app.getPath("userData");
  if (!store || readPinnedStore(userData) === store) return store || null;
  try {
    fs.writeFileSync(filePath(userData), JSON.stringify({ store }));
  } catch (error) {
    console.error("Keyring choice not saved:", error?.message);
  }
  return store;
}

module.exports = { pinPasswordStore, rememberPasswordStore, readPinnedStore };
