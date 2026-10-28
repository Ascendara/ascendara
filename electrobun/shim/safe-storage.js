// safeStorage replacement. A random 256-bit key is kept in the OS secret store
// (macOS Keychain, Windows DPAPI, libsecret on Linux) and values are sealed with
// AES-256-GCM. Values written by Electron (Chromium OSCrypt "v10"/"v11") are
// still readable so existing store accounts and tokens survive the move.

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const PREFIX = Buffer.from("ebs1");
const SERVICE = "Ascendara Electrobun Safe Storage";
const ACCOUNT = "Ascendara";
// Electron's own keychain entry, read only to decrypt legacy values.
const LEGACY_SERVICE = "Ascendara Safe Storage";
const LEGACY_ACCOUNT = "Ascendara Key";

let userDataDir = "";
let masterKey;
let backend = null;
let legacyKeys;

export function configureSafeStorage(directory) {
  userDataDir = directory;
}

function exec(command, args, input) {
  return execFileSync(command, args, {
    encoding: "utf8",
    input,
    stdio: ["pipe", "pipe", "ignore"],
    windowsHide: true,
    timeout: 20000,
  }).trim();
}

function powershell(script) {
  return exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script]);
}

function dpapi(action, base64) {
  return powershell(
    `Add-Type -AssemblyName System.Security; [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::${action}([Convert]::FromBase64String('${base64}'), $null, 'CurrentUser'))`
  );
}

function loadOrCreateKey() {
  if (process.platform === "darwin") {
    try {
      return {
        key: Buffer.from(
          exec("security", ["find-generic-password", "-w", "-s", SERVICE, "-a", ACCOUNT]),
          "base64"
        ),
        backend: "keychain_access",
      };
    } catch {
      const key = crypto.randomBytes(32);
      exec("security", [
        "add-generic-password",
        "-U",
        "-s",
        SERVICE,
        "-a",
        ACCOUNT,
        "-w",
        key.toString("base64"),
      ]);
      return { key, backend: "keychain_access" };
    }
  }
  if (process.platform === "win32") {
    const file = path.join(userDataDir, "safe-storage.key");
    if (fs.existsSync(file)) {
      return {
        key: Buffer.from(
          dpapi("Unprotect", fs.readFileSync(file, "utf8").trim()),
          "base64"
        ),
        backend: "dpapi",
      };
    }
    const key = crypto.randomBytes(32);
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(file, dpapi("Protect", key.toString("base64")), { mode: 0o600 });
    return { key, backend: "dpapi" };
  }
  const attributes = ["application", "ascendara", "purpose", "safe-storage"];
  try {
    const stored = exec("secret-tool", ["lookup", ...attributes]);
    if (stored) return { key: Buffer.from(stored, "base64"), backend: "gnome_libsecret" };
  } catch {}
  const key = crypto.randomBytes(32);
  exec(
    "secret-tool",
    ["store", "--label", SERVICE, ...attributes],
    key.toString("base64")
  );
  return { key, backend: "gnome_libsecret" };
}

function getKey() {
  if (masterKey !== undefined) return masterKey;
  try {
    const loaded = loadOrCreateKey();
    if (loaded.key.length !== 32) throw new Error("Stored key has the wrong length");
    masterKey = loaded.key;
    backend = loaded.backend;
  } catch (error) {
    console.warn("[Electrobun] Secure storage is unavailable:", error.message);
    masterKey = null;
    backend = "basic_text";
  }
  return masterKey;
}

function getLegacyKeys() {
  if (legacyKeys) return legacyKeys;
  legacyKeys = {};
  try {
    if (process.platform === "darwin") {
      const password = exec("security", [
        "find-generic-password",
        "-w",
        "-s",
        LEGACY_SERVICE,
        "-a",
        LEGACY_ACCOUNT,
      ]);
      legacyKeys.v10 = crypto.pbkdf2Sync(password, "saltysalt", 1003, 16, "sha1");
    } else if (process.platform === "win32") {
      const state = JSON.parse(
        fs.readFileSync(path.join(userDataDir, "Local State"), "utf8")
      );
      const wrapped = Buffer.from(state.os_crypt.encrypted_key, "base64").subarray(5);
      legacyKeys.v10 = Buffer.from(
        dpapi("Unprotect", wrapped.toString("base64")),
        "base64"
      );
    } else {
      legacyKeys.v10 = crypto.pbkdf2Sync("peanuts", "saltysalt", 1, 16, "sha1");
      try {
        const password = exec("secret-tool", ["lookup", "application", "ascendara"]);
        if (password)
          legacyKeys.v11 = crypto.pbkdf2Sync(password, "saltysalt", 1, 16, "sha1");
      } catch {}
    }
  } catch (error) {
    console.warn("[Electrobun] Electron-era secrets cannot be read:", error.message);
  }
  return legacyKeys;
}

function decryptLegacy(buffer) {
  const version = buffer.subarray(0, 3).toString("latin1");
  const keys = getLegacyKeys();
  const key = keys[version];
  if (!key)
    throw new Error(
      "Error while decrypting the ciphertext provided to safeStorage.decryptString."
    );
  const payload = buffer.subarray(3);
  if (process.platform === "win32") {
    const nonce = payload.subarray(0, 12);
    const tag = payload.subarray(payload.length - 16);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(payload.subarray(12, payload.length - 16)),
      decipher.final(),
    ]).toString("utf8");
  }
  const decipher = crypto.createDecipheriv("aes-128-cbc", key, Buffer.alloc(16, 0x20));
  return Buffer.concat([decipher.update(payload), decipher.final()]).toString("utf8");
}

export const safeStorage = {
  isEncryptionAvailable() {
    return getKey() !== null;
  },

  getSelectedStorageBackend() {
    getKey();
    return backend;
  },

  setUsePlainTextEncryption() {},

  encryptString(plainText) {
    const key = getKey();
    if (!key) throw new Error("Encryption is not available.");
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const sealed = Buffer.concat([
      cipher.update(String(plainText), "utf8"),
      cipher.final(),
    ]);
    return Buffer.concat([PREFIX, iv, sealed, cipher.getAuthTag()]);
  },

  decryptString(encrypted) {
    const buffer = Buffer.from(encrypted);
    if (!buffer.subarray(0, PREFIX.length).equals(PREFIX)) return decryptLegacy(buffer);
    const key = getKey();
    if (!key) throw new Error("Encryption is not available.");
    const iv = buffer.subarray(PREFIX.length, PREFIX.length + 12);
    const tag = buffer.subarray(buffer.length - 16);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(buffer.subarray(PREFIX.length + 12, buffer.length - 16)),
      decipher.final(),
    ]).toString("utf8");
  },
};
