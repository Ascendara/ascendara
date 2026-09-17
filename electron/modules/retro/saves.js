const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const JSZip = require("jszip");
const LIMIT = 256 * 1024 * 1024;

function safeRelative(name) {
  return typeof name === "string" && name.length > 0 && !name.includes("\\") && !name.includes(":") && !name.includes("\0") && !name.startsWith("/") && name.split("/").every(p => p && p !== "." && p !== "..");
}
async function checkRoot(root) {
  if (!root || !path.isAbsolute(root)) throw new Error("Select a save folder in console setup first");
  const stat = await fs.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Save folder must be a real directory");
}
async function safeTarget(root, relative) {
  if (!safeRelative(relative)) throw new Error("Invalid save path");
  let current = root;
  for (const part of relative.split("/")) {
    current = path.join(current, part);
    try { if ((await fs.lstat(current)).isSymbolicLink()) throw new Error("Save paths cannot contain symbolic links"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  return current;
}
async function createBackup(root, platform) {
  await checkRoot(root);
  const zip = new JSZip(), files = [];
  let size = 0;
  async function walk(dir, prefix = "") {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const relative = prefix + entry.name;
      if (!safeRelative(relative)) throw new Error("Unsupported save filename");
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) { await walk(file, `${relative}/`); continue; }
      if (!entry.isFile()) continue;
      const stat = await fs.stat(file);
      size += stat.size;
      if (size > LIMIT || files.length >= 10000) throw new Error("Save backup exceeds 256 MB or 10,000 files. Select a smaller save folder.");
      const data = await fs.readFile(file);
      zip.file(`saves/${relative}`, data);
      files.push({ path: relative, size: data.length, sha256: crypto.createHash("sha256").update(data).digest("hex") });
    }
  }
  await walk(root);
  if (!files.length) throw new Error("The selected save folder is empty");
  zip.file("retro-manifest.json", JSON.stringify({ format: "ascendara-retro", version: 1, platform, createdAt: new Date().toISOString(), files }));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
async function restoreBackup(root, platform, bytes, recoveryDirectory) {
  await checkRoot(root);
  if (bytes.length > LIMIT) throw new Error("Backup is too large");
  const zip = await JSZip.loadAsync(bytes);
  const manifestEntry = zip.file("retro-manifest.json");
  if (!manifestEntry || manifestEntry._data.uncompressedSize > 4 * 1024 ** 2) throw new Error("Invalid Retro backup manifest");
  const manifest = JSON.parse(await manifestEntry.async("string"));
  if (manifest.format !== "ascendara-retro" || manifest.version !== 1 || manifest.platform !== platform || !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > 10000) throw new Error("This backup does not belong to this console");
  const validated = [], seen = new Set();
  let total = 0;
  for (const item of manifest.files) {
    const target = await safeTarget(root, item.path);
    const key = process.platform === "win32" ? target.toLowerCase() : target;
    if (seen.has(key)) throw new Error("Duplicate save path in backup");
    seen.add(key);
    const entry = zip.file(`saves/${item.path}`);
    if (!entry || !Number.isSafeInteger(item.size) || item.size < 0 || entry._data.uncompressedSize !== item.size || (total += item.size) > LIMIT) throw new Error("Invalid or oversized save file");
    const data = await entry.async("nodebuffer");
    if (crypto.createHash("sha256").update(data).digest("hex") !== item.sha256) throw new Error("Backup checksum failed");
    validated.push({ target, data });
  }
  // Keep a complete recovery snapshot before touching any existing saves.
  let recovery = null;
  try {
    const snapshot = await createBackup(root, platform);
    await fs.mkdir(recoveryDirectory, { recursive: true });
    recovery = path.join(recoveryDirectory, `${platform}-before-restore-${Date.now()}.zip`);
    await fs.writeFile(recovery, snapshot, { flag: "wx" });
  } catch (error) { if (error.message !== "The selected save folder is empty") throw error; }
  const changed = [];
  try {
    for (const item of validated) {
      let previous = null;
      try { previous = await fs.readFile(item.target); } catch (error) { if (error.code !== "ENOENT") throw error; }
      changed.push({ target: item.target, previous });
      await fs.mkdir(path.dirname(item.target), { recursive: true });
      await fs.writeFile(item.target, item.data);
    }
  } catch (error) {
    for (const item of changed.reverse()) {
      try { if (item.previous) await fs.writeFile(item.target, item.previous); else await fs.unlink(item.target); } catch { /* Recovery snapshot is retained. */ }
    }
    throw new Error(`Restore failed: ${error.message}. Recovery backup: ${recovery || "none (folder was empty)"}`);
  }
  return { restored: validated.length, recovery };
}
module.exports = { createBackup, restoreBackup, safeRelative, safeTarget, checkRoot, LIMIT };
