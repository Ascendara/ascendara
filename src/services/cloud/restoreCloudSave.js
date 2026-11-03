import { getBackupDownloadUrl } from "../firebase/firebaseService";
import { retroBackupPlatform, restoreRetroCloudBackup } from "../library/retroService";
import {
  MAX_CLOUD_BACKUP_BYTES,
  validateBackupFolderName,
  validateCloudBackupEntries,
} from "@/lib/cloudBackupValidation";

// Must match CLOUD_RESTORE_PREFIX in electron/modules/library/ludusavi.js.
const CLOUD_RESTORE_PREFIX = "ascendara-cloud-restore-";

// Reads the top-level `name:` Ludusavi writes, plain or quoted.
function readMappingName(yaml) {
  const raw = /^name:[ \t]*(.+?)[ \t]*$/m.exec(yaml)?.[1];
  if (!raw) return null;
  try {
    if (raw.startsWith('"')) return JSON.parse(raw);
    if (raw.startsWith("'")) return raw.slice(1, -1).replace(/''/g, "'");
  } catch {
    return null;
  }
  return raw;
}

// Cloud uploads contain a Ludusavi zip AND its mapping.yaml, not a raw save zip.
export async function restoreCloudSave(backup, settings) {
  const platform = retroBackupPlatform(backup.gameName);
  if (platform) return restoreRetroCloudBackup(platform, backup.backupId);
  const location = settings.ludusavi?.backupLocation;
  if (!settings.ludusavi?.enabled || !location) {
    throw new Error(
      "Enable save backups and choose a backup location in Local Saves first."
    );
  }
  const folderName = validateBackupFolderName(backup.gameName);
  const result = await getBackupDownloadUrl(backup.backupId);
  if (!result.downloadUrl || result.error)
    throw new Error(result.error || "Backup download unavailable");
  if (result.gameName && result.gameName !== backup.gameName)
    throw new Error("Backup belongs to a different game");
  const response = await fetch(result.downloadUrl, {
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error("Failed to download backup");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_CLOUD_BACKUP_BYTES) throw new Error("Cloud backup is too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await new Blob(chunks).arrayBuffer());
  const entries = validateCloudBackupEntries(zip);
  const archives = entries.filter(
    entry => entry.name.endsWith(".zip") && !entry.name.endsWith("_cloud.zip")
  );
  const mapping = entries.find(entry => entry.name === "mapping.yaml");
  if (archives.length !== 1 || !mapping) {
    throw new Error("Backup must contain one save archive and mapping.yaml");
  }
  // Ludusavi finds backups by the exact title in mapping.yaml, which can differ
  // from the cloud entry's name (e.g. "Astroneer" vs "ASTRONEER"), so restore by it.
  const ludusaviName = readMappingName(await mapping.async("string")) || backup.gameName;
  // Stage in a temp folder rather than the local backup folder, so the cloud
  // mapping.yaml never replaces the local one (which lists older local backups).
  // The main process deletes the staging folder once the restore finishes.
  const stagingDir = `${await window.electron.getTempPath()}/${CLOUD_RESTORE_PREFIX}${Date.now()}`;
  for (const entry of entries) {
    const written = await window.electron.writeFile(
      `${stagingDir}/${folderName}/${entry.name}`,
      await entry.async("uint8array")
    );
    if (written === false || written?.success === false)
      throw new Error(written?.error || "Failed to save backup files");
  }
  const restored = await window.electron.ludusavi(
    "restore",
    ludusaviName,
    archives[0].name,
    { stagingDir }
  );
  if (!restored?.success) throw new Error(restored?.error || "Failed to restore saves");
  return restored;
}
