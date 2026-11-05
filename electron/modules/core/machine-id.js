/**
 * Machine ID
 * node-machine-id runs `cmd /c reg query` synchronously with no timeout on
 * every call. Settings decrypt on every read, so the main thread spawned two
 * processes per IPC call, and a spawn that never reported its exit froze the
 * app for good. The ID never changes, so it is read once, with a timeout.
 */

const path = require("path");
const { execFileSync } = require("child_process");
const { machineIdSync } = require("node-machine-id");

let cached = null;

// Same registry value and parsing as node-machine-id, so existing encrypted
// settings keep decrypting
function readWindowsMachineGuid() {
  const windir = process.env.windir || process.env.SystemRoot || "C:\\Windows";
  const wow64 = process.arch === "ia32" && "PROCESSOR_ARCHITEW6432" in process.env;
  const reg = path.join(windir, wow64 ? "sysnative" : "System32", "reg.exe");
  const output = execFileSync(
    reg,
    [
      "QUERY",
      "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography",
      "/v",
      "MachineGuid",
    ],
    { encoding: "utf8", timeout: 5000, windowsHide: true }
  );
  const id = output
    .split("REG_SZ")[1]
    ?.replace(/\r+|\n+|\s+/gi, "")
    .toLowerCase();
  if (!id) throw new Error("MachineGuid not found in registry output");
  return id;
}

/**
 * The raw (unhashed) machine ID, matching machineIdSync(true)
 * @returns {string}
 */
function getMachineId() {
  if (cached) return cached;
  if (process.platform === "win32") {
    try {
      cached = readWindowsMachineGuid();
      return cached;
    } catch (error) {
      console.warn("[machine-id] Direct registry read failed:", error.message);
    }
  }
  cached = machineIdSync(true);
  return cached;
}

module.exports = { getMachineId };
