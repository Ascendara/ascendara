// Module-level caches so game artwork survives page switches (Library <-> GameScreen)
// without re-fetching via IPC. Keyed by game name; values are data URLs (or null
// when we've confirmed the asset doesn't exist).
export const gameImageCache = new Map();
export const heroImageCache = new Map();
export const logoImageCache = new Map();

export const clearGameImageCaches = gameId => {
  gameImageCache.delete(gameId);
  heroImageCache.delete(gameId);
  logoImageCache.delete(gameId);
};

const toDataUrl = base64 => (base64 ? `data:image/jpeg;base64,${base64}` : null);

// Prefer the portrait grid, then any banner already on disk
const readCoverFromDisk = async gameId => {
  for (const type of ["grid", "hero", undefined]) {
    try {
      const image = toDataUrl(await window.electron.getGameImage(gameId, type));
      if (image) return image;
    } catch (error) {
      console.warn("Could not load game image:", error);
    }
  }
  return null;
};

const resolveGameCover = async (gameId, isCustom) => {
  const onDisk = await readCoverFromDisk(gameId);
  if (onDisk) return onDisk;

  // Same artwork download the game page runs, so covers don't depend on
  // the page having been opened once
  try {
    if (await window.electron.ensureGameAssets(gameId)) {
      const downloaded = await readCoverFromDisk(gameId);
      if (downloaded) return downloaded;
    }
  } catch (error) {
    console.warn("Could not download game artwork:", error);
  }

  // Still nothing: installed games re-download their header, custom and
  // imported games look up SteamGridDB by name
  if (!isCustom) {
    try {
      return toDataUrl(await window.electron.repairGameImage(gameId));
    } catch (error) {
      console.warn("Could not repair game image:", error);
      return null;
    }
  }
  try {
    const { default: sgSvc } = await import("@/services/images/steamGridImageService");
    return sgSvc.pickUrl(await sgSvc.getAssets(gameId), "card") || null;
  } catch {
    return null;
  }
};

const pendingCovers = new Map();

// Shared by every library surface so folder previews get the same repair and
// SteamGridDB fallbacks as the main grid, even when no library card mounts
export const loadGameCover = game => {
  const gameId = game?.game || game?.name;
  if (!gameId) return Promise.resolve(null);
  if (gameImageCache.get(gameId)) return Promise.resolve(gameImageCache.get(gameId));
  if (!pendingCovers.has(gameId)) {
    pendingCovers.set(
      gameId,
      resolveGameCover(gameId, game.isCustom)
        .then(image => {
          if (image) gameImageCache.set(gameId, image);
          return image;
        })
        .finally(() => pendingCovers.delete(gameId))
    );
  }
  return pendingCovers.get(gameId);
};
