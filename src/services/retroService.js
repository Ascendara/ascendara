import {
  uploadBackup,
  listBackups,
  getBackupDownloadUrl,
  verifyAscendAccess,
  auth,
} from "./firebaseService";

const RETRO_BACKUP_PREFIX = "Ascendara Retro - ";
const RETRO_PLATFORMS = new Set([
  "ps1",
  "ps2",
  "ps3",
  "psp",
  "gamecube",
  "wii",
  "nes",
  "snes",
  "n64",
  "gb",
  "gbc",
  "gba",
]);

export function retroBackupPlatform(gameName) {
  if (typeof gameName !== "string" || !gameName.startsWith(RETRO_BACKUP_PREFIX))
    return null;
  const platform = gameName.slice(RETRO_BACKUP_PREFIX.length);
  return RETRO_PLATFORMS.has(platform) ? platform : null;
}

export async function getRetroCloudAccess() {
  const result = await verifyAscendAccess();
  if (result.error) throw new Error(result.error);
  return result.isSubscribed === true || result.isVerified === true;
}

async function requireRetroCloudAccess(platform) {
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Sign in to use Retro cloud saves.");
  if (!RETRO_PLATFORMS.has(platform)) throw new Error("Unknown Retro console");
  if (!(await getRetroCloudAccess()))
    throw new Error("An active Ascend subscription is required for Retro cloud saves.");
  assertAccount(uid);
  return uid;
}

function assertAccount(uid) {
  if (auth?.currentUser?.uid !== uid)
    throw new Error("Your account changed. Please try again.");
}

export async function retroCall(method, ...args) {
  const api = window.electron?.retro;
  if (!api?.[method]) throw new Error("Restart Ascendara to enable Retro.");
  const result = await api[method](...args);
  if (!result?.success) throw new Error(result?.error || "Retro request failed");
  return result.data;
}

export async function uploadRetroBackup(platform) {
  const uid = await requireRetroCloudAccess(platform);
  const backup = await retroCall("backup", platform, true);
  assertAccount(uid);
  const result = await uploadBackup(
    new File([new Uint8Array(backup.bytes)], backup.name, { type: "application/zip" }),
    `Ascendara Retro - ${platform}`,
    backup.name
  );
  if (!result.success) throw new Error(result.error || "Cloud upload failed");
  return result;
}

export async function listRetroBackups(platform) {
  const uid = await requireRetroCloudAccess(platform);
  const result = await listBackups(`Ascendara Retro - ${platform}`);
  assertAccount(uid);
  if (result.error) throw new Error(result.error);
  return (result.backups || [])
    .filter(backup => retroBackupPlatform(backup.gameName) === platform)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function restoreRetroCloudBackup(platform, backupId) {
  const uid = await requireRetroCloudAccess(platform);
  const result = await getBackupDownloadUrl(backupId);
  if (result.error || !result.downloadUrl)
    throw new Error(result.error || "Backup download unavailable");
  if (result.gameName !== `Ascendara Retro - ${platform}`)
    throw new Error("This backup belongs to a different console");
  assertAccount(uid);
  const response = await fetch(result.downloadUrl, {
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`Backup download failed (${response.status})`);
  const limit = 256 * 1024 * 1024;
  if (Number(response.headers.get("content-length")) > limit)
    throw new Error("Backup exceeds 256 MB");
  const reader = response.body.getReader(),
    chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("Backup exceeds 256 MB");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  assertAccount(uid);
  return retroCall("restore", platform, bytes);
}
