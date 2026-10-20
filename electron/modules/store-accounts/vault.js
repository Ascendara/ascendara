const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const STORES = ["steam", "epic", "gog"];
function assertStore(store) {
  if (!STORES.includes(store)) throw new Error("Unsupported store");
}

// This vault is deliberately separate from settings, library backups and cloud sync.
function createVault(directory, safeStorage) {
  const cache = new Map();
  function available() {
    return safeStorage.isEncryptionAvailable() &&
      safeStorage.getSelectedStorageBackend?.() !== "basic_text";
  }
  function filename(store) {
    assertStore(store);
    return path.join(directory, `${store}.bin`);
  }
  function read(store) {
    const file = filename(store);
    if (!fs.existsSync(file)) {
      cache.delete(store);
      return null;
    }
    if (!available()) throw new Error("Secure storage is unavailable. Unlock your system keyring and restart Ascendara.");
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || stat.size > 16 * 1024 * 1024)
      throw new Error("Invalid account storage");
    const stamp = `${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
    let entry = cache.get(store);
    if (entry?.stamp !== stamp) {
      entry = { stamp, value: JSON.parse(safeStorage.decryptString(fs.readFileSync(file))) };
      cache.set(store, entry);
    }
    // Callers update account records; never expose the cached object to mutation.
    return structuredClone(entry.value);
  }
  function write(store, value) {
    cache.delete(store);
    const file = filename(store);
    if (!available()) throw new Error("Secure storage is unavailable. Unlock your system keyring and restart Ascendara.");
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (fs.lstatSync(directory).isSymbolicLink()) throw new Error("Invalid account storage");
    const temporary = `${file}.${crypto.randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, safeStorage.encryptString(JSON.stringify(value)), { mode: 0o600, flag: "wx" });
      fs.renameSync(temporary, file);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }
  function remove(store) {
    cache.delete(store);
    fs.rmSync(filename(store), { force: true });
  }
  return { available, read, write, remove };
}
module.exports = { STORES, assertStore, createVault };
