// Free space a download needs, from the catalog's download size and, once
// players have reported it, the game's measured install size.
import { formatBytes } from "@/services/app/systemHealthService";

// The downloader never lets extraction fill the disk past this
const KEEP_FREE = 1024 ** 3;
// Without a measured size, assume the archive expands this much: compressed
// Unity textures reach about 3x, most other games stay well below it
const UNKNOWN_EXPANSION = 3;
const UNITS = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };

export function parseSize(size) {
  const match = String(size || "")
    .trim()
    .match(/^([\d.]+)\s*(B|KB|MB|GB|TB)$/i);
  return match ? parseFloat(match[1]) * UNITS[match[2].toUpperCase()] : null;
}

/**
 * One size line for places with room for a single number: the measured
 * install size once known, the download size until then.
 */
export function catalogSizeText(game, t) {
  if (game?.installSize > 0) {
    return t("downloads.installSize", { size: formatBytes(game.installSize) });
  }
  return game?.size ? t("downloads.downloadSize", { size: game.size }) : null;
}

/**
 * "blocked" when even the download won't fit, "low" when the install may not,
 * otherwise "ok". Unknown sizes or free space never block a download.
 */
export function checkInstallSpace(game, freeSpace) {
  const download = parseSize(game?.size);
  if (!download || !Number.isFinite(freeSpace) || freeSpace <= 0) {
    return { status: "ok" };
  }
  if (freeSpace < download + KEEP_FREE) {
    return { status: "blocked", needed: download + KEEP_FREE };
  }
  const install =
    Number.isFinite(game.installSize) && game.installSize > 0
      ? game.installSize
      : download * UNKNOWN_EXPANSION;
  if (freeSpace < install + KEEP_FREE) {
    return { status: "low", needed: install + KEEP_FREE, measured: !!game.installSize };
  }
  return { status: "ok" };
}
