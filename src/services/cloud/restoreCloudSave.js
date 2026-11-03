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

const OS_LABELS = { windows: "Windows", mac: "macOS", linux: "Linux" };

// Ludusavi records `os:` on each backup in mapping.yaml. Older mappings lack it,
// but a lettered drive (e.g. `drive-C: "C:"`) still marks a Windows backup.
function readBackupOs(yaml, archiveName) {
  const lines = yaml.split(/\r?\n/);
  const start = lines.findIndex(
    line => /^\s*- name:/.test(line) && line.includes(archiveName)
  );
  if (start !== -1) {
    const indent = lines[start].indexOf("-") + 2;
    for (const line of lines.slice(start + 1)) {
      const lead = line.search(/\S/);
      if (lead !== -1 && lead < indent) break;
      const os = /^\s*os:\s*["']?(\w+)/.exec(line)?.[1];
      if (os) return os;
    }
  }
  return /^\s*drive-[A-Za-z]:/m.test(yaml) ? "windows" : null;
}

function currentOs() {
  const platform = window.electron.getPlatform?.();
  if (platform === "win32") return "windows";
  if (platform === "darwin") return "mac";
  return platform === "linux" ? "linux" : null;
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
  const mappingYaml = await mapping.async("string");
  const ludusaviName = readMappingName(mappingYaml) || backup.gameName;
  // Save paths are OS-specific (e.g. %LOCALAPPDATA% vs ~/Library), so Ludusavi
  // can't place another OS's files and fails every entry with a vague error.
  const backupOs = readBackupOs(mappingYaml, archives[0].name);
  const localOs = currentOs();
  if (backupOs && localOs && backupOs !== localOs) {
    const from = OS_LABELS[backupOs] || backupOs;
    throw new Error(
      `This backup was made on ${from} and can't be restored on ${OS_LABELS[localOs]}. Restore it on a ${from} computer instead.`
    );
  }
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
