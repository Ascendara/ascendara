export function getGameName(game) {
  return game?.game || game?.name || "";
}

function normalizeGame(game, isCustom) {
  const custom = Boolean(isCustom || game?.isCustom || game?.custom);
  const name = getGameName(game);
  return {
    ...game,
    name: game?.name || name,
    game: game?.game || name,
    isCustom: custom,
    custom,
    __profileKey: `${custom ? "custom" : "installed"}:${name}`,
  };
}

function normalizeDirectory(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/\/+$/, "");
}

function isSameDirectory(left, right, isLinux) {
  const a = normalizeDirectory(left);
  const b = normalizeDirectory(right);
  if (!a || !b) return false;
  return isLinux ? a === b : a.toLocaleLowerCase() === b.toLocaleLowerCase();
}

export async function loadGameProfileCatalog() {
  const [installed, custom, linux, settings] = await Promise.all([
    window.electron.getGames(),
    window.electron.getCustomGames(),
    window.electron.isOnLinux(),
    window.electron.getSettings(),
  ]);

  const isLinux = Boolean(linux);
  const primaryDirectory = settings?.downloadDirectory || "";
  const supportedCustomGames = Array.isArray(custom)
    ? custom.filter(
        game =>
          !game?._sourceDir ||
          !primaryDirectory ||
          isSameDirectory(game._sourceDir, primaryDirectory, isLinux)
      )
    : [];

  // The upstream custom-game launch/profile handlers still use the primary games.json.
  // Hiding custom entries from additional folders is safer than presenting controls that
  // only update part of their state. Regular installed games remain fully supported.
  const merged = [
    ...(Array.isArray(installed) ? installed.map(game => normalizeGame(game, false)) : []),
    ...supportedCustomGames.map(game => normalizeGame(game, true)),
  ];

  const seen = new Set();
  const games = merged.filter(game => {
    if (!getGameName(game) || seen.has(game.__profileKey)) return false;
    seen.add(game.__profileKey);
    return true;
  });

  games.sort((a, b) => getGameName(a).localeCompare(getGameName(b)));
  return { games, isLinux };
}

export async function loadGameProfile(game, isLinux) {
  const gameName = getGameName(game);
  if (!gameName) throw new Error("Game name is unavailable");

  const [launchCommands, autoBackup, savePathsResult, umuId] = await Promise.all([
    window.electron.getLaunchCommands(gameName, game.isCustom).catch(() => ""),
    window.electron.isGameAutoBackupsEnabled(gameName, game.isCustom).catch(() => false),
    window.electron.getCustomSavePaths(gameName, game.isCustom),
    isLinux ? window.electron.umuGetGameId(gameName).catch(() => "") : Promise.resolve(""),
  ]);

  if (!savePathsResult?.success) {
    throw new Error(savePathsResult?.error || "Ascendara could not read custom save paths");
  }

  return {
    launchCommands:
      typeof launchCommands === "string"
        ? launchCommands
        : launchCommands?.launchCommands || launchCommands?.value || "",
    autoBackup: Boolean(autoBackup),
    umuId:
      typeof umuId === "string" || typeof umuId === "number"
        ? String(umuId || "")
        : String(umuId?.id || umuId?.umuId || ""),
    savePaths: savePathsResult.paths || [],
  };
}

export async function saveGameProfile(game, profile, isLinux) {
  const gameName = getGameName(game);
  if (!gameName) throw new Error("Game name is unavailable");

  const launchResult = await window.electron.saveLaunchCommands(
    gameName,
    profile.launchCommands,
    game.isCustom
  );
  if (launchResult !== true) {
    throw new Error("Ascendara could not save launch commands");
  }

  const autoBackupResult = profile.autoBackup
    ? await window.electron.enableGameAutoBackups(gameName, game.isCustom)
    : await window.electron.disableGameAutoBackups(gameName, game.isCustom);
  if (autoBackupResult !== true) {
    throw new Error("Ascendara could not update automatic save backups");
  }

  const savePaths = profile.savePaths.map(value => value.trim()).filter(Boolean);
  const savePathsResult = await window.electron.setCustomSavePaths(
    gameName,
    game.isCustom,
    savePaths
  );
  if (!savePathsResult?.success) {
    throw new Error(savePathsResult?.error || "Ascendara could not save custom save paths");
  }

  if (isLinux) {
    // The official UMU handler treats an empty value as "remove the per-game override".
    // Always send the field on Linux so clearing the input actually clears stale state.
    const umuResult = await window.electron.umuSetGameId(gameName, profile.umuId.trim());
    if (!umuResult?.success) {
      throw new Error(umuResult?.error || "Ascendara could not save the UMU game ID");
    }
  }

  return {
    ...profile,
    savePaths: savePathsResult.paths || savePaths,
  };
}
