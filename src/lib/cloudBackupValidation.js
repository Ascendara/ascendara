export const MAX_CLOUD_BACKUP_BYTES = 512 * 1024 * 1024;

export function validateBackupFolderName(name) {
  if (typeof name !== "string" || !name || /[\\/:\0]/.test(name) || name === "." || name === ".." || /[. ]$/.test(name)) {
    throw new Error("Invalid backup folder name");
  }
  return name;
}

export function validateCloudBackupEntries(zip) {
  const entries = Object.values(zip.files);
  if (!entries.length || entries.length > 1000) throw new Error("Invalid backup archive size");
  let total = 0;
  const names = new Set();
  for (const entry of entries) {
    const name = entry.name;
    validateBackupFolderName(name);
    if (entry.dir || (entry.unsafeOriginalName && entry.unsafeOriginalName !== name) ||
      (name !== "mapping.yaml" && !name.toLowerCase().endsWith(".zip")) ||
      (entry.unixPermissions && (entry.unixPermissions & 0xf000) === 0xa000)) {
      throw new Error("Unexpected path in backup archive");
    }
    if (names.has(name.toLowerCase())) throw new Error("Duplicate backup filename");
    names.add(name.toLowerCase());
    const size = entry._data?.uncompressedSize;
    if (!Number.isSafeInteger(size) || size < 0 || (total += size) > MAX_CLOUD_BACKUP_BYTES) {
      throw new Error("Backup archive exceeds the extraction limit");
    }
  }
  return entries;
}
