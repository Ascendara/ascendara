import i18n from "i18next";
import {
  uploadBackup,
  listBackups,
  getBackupDownloadUrl,
  verifyAscendAccess,
  auth,
} from "./firebaseService";

import expanded from "../../electron/modules/retro/expanded-catalogue.json";

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
  ...expanded.platforms.map(platform => platform.id),
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
  if (!uid) throw new Error(i18n.t("retro.errors.signIn"));
  if (!RETRO_PLATFORMS.has(platform)) throw new Error(i18n.t("retro.errors.unknownConsole"));
  if (!(await getRetroCloudAccess()))
    throw new Error(i18n.t("retro.errors.cloudSubscription"));
  assertAccount(uid);
  return uid;
}

function assertAccount(uid) {
  if (auth?.currentUser?.uid !== uid)
    throw new Error(i18n.t("retro.errors.accountChanged"));
}

export async function retroCall(method, ...args) {
  const api = window.electron?.retro;
  if (!api?.[method]) throw new Error(i18n.t("retro.errors.restart"));
  const premiumPlatform = id => expanded.platforms.some(platform => platform.id === id);
  let premiumLaunch = false;
  if (method === "launch") {
    const snapshot = await api.getState();
    if (!snapshot?.success) throw new Error(snapshot?.error || i18n.t("retro.errors.requestFailed"));
    const game = snapshot.data.games.find(game => game.id === args[0]);
    premiumLaunch =
      game &&
      (premiumPlatform(game.platform) ||
        expanded.emulators.some(
          emulator => emulator.id === snapshot.data.profiles[game.platform]?.adapter
        ));
  }
  if (
    premiumLaunch ||
    (["scan", "search", "website"].includes(method) && premiumPlatform(args[0])) ||
    (method === "saveProfile" &&
      (expanded.platforms.some(platform => platform.id === args[0]) ||
        expanded.emulators.some(emulator => emulator.id === args[1]?.adapter))) ||
    (method === "website" && args[1])
  ) {
    const uid = auth?.currentUser?.uid;
    if (!uid || !(await getRetroCloudAccess()))
      throw new Error(
        i18n.t("retro.errors.expandedSubscription")
      );
    assertAccount(uid);
  }
  const result = await api[method](...args);
  if (!result?.success) throw new Error(result?.error || i18n.t("retro.errors.requestFailed"));
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
  if (!result.success) throw new Error(result.error || i18n.t("retro.errors.uploadFailed"));
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
    throw new Error(result.error || i18n.t("retro.errors.downloadUnavailable"));
  if (result.gameName !== `Ascendara Retro - ${platform}`)
    throw new Error(i18n.t("retro.errors.wrongConsole"));
  assertAccount(uid);
  const response = await fetch(result.downloadUrl, {
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(i18n.t("retro.errors.downloadFailed", { status: response.status }));
  const limit = 256 * 1024 * 1024;
  if (Number(response.headers.get("content-length")) > limit)
    throw new Error(i18n.t("retro.errors.backupTooLarge"));
  const reader = response.body.getReader(),
    chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error(i18n.t("retro.errors.backupTooLarge"));
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
