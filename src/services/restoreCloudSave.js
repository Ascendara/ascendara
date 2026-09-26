import { getBackupDownloadUrl } from "./firebaseService";
import { retroBackupPlatform, restoreRetroCloudBackup } from "./retroService";
import {
  MAX_CLOUD_BACKUP_BYTES,
  validateBackupFolderName,
  validateCloudBackupEntries,
} from "@/lib/cloudBackupValidation";

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
      if (size > MAX_CLOUD_BACKUP_BYTES)
        throw new Error("Cloud backup is too large");
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
  if (
    archives.length !== 1 ||
    !entries.some(entry => entry.name === "mapping.yaml")
  ) {
    throw new Error("Backup must contain one save archive and mapping.yaml");
  }
  // Resolve canonical Ludusavi titles just as the upload service does.
  const local = await window.electron.ludusavi("list-backups", backup.gameName);
  if (!local?.success)
    throw new Error(local?.error || "Unable to locate local backups");
  const existing = Object.values(local.data?.games || {})[0];
  const folder = existing?.backupPath || `${location}/${folderName}`;
  for (const entry of entries) {
    const written = await window.electron.writeFile(
      `${folder}/${entry.name}`,
      await entry.async("uint8array")
    );
    if (written === false || written?.success === false)
      throw new Error(written?.error || "Failed to save backup files");
  }
  const restored = await window.electron.ludusavi(
    "restore",
    backup.gameName,
    archives[0].name
  );
  if (!restored?.success)
    throw new Error(restored?.error || "Failed to restore saves");
  return restored;
}
