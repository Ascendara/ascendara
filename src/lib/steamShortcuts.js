import { toast } from "sonner";

// Steam reads non-Steam shortcuts the same way on Linux (Steam Deck) and Windows
export const canAddToSteam = () =>
  ["linux", "win32"].includes(window.electron?.getPlatform?.());

const gameName = game => (typeof game === "string" ? game : game?.game || game?.name);

/**
 * Every installed game that can be launched, for "Add all to Steam"
 */
export const getPlayableGames = async () => {
  const [installed, custom] = await Promise.all([
    window.electron.getGames().catch(() => []),
    window.electron.getCustomGames().catch(() => []),
  ]);
  return [
    ...(installed || []).filter(game => {
      const state = game.downloadingData || {};
      return (
        !state.downloading &&
        !state.extracting &&
        !state.updating &&
        !state.stopped &&
        !state.verifying
      );
    }),
    ...(custom || []).filter(game => !game._isDeleted),
  ]
    .map(gameName)
    .filter(Boolean);
};

/**
 * Add games to Steam as non-Steam games, artwork included. When Steam is
 * running it has to restart to load them: `restartSteam` does that right away,
 * otherwise a toast offers it.
 */
export const addGamesToSteam = async (games, t, { restartSteam = false } = {}) => {
  const names = [...new Set((games || []).map(gameName).filter(Boolean))];
  if (!names.length) {
    toast.info(t("library.steamShortcuts.noGames"));
    return null;
  }

  let result;
  try {
    result = await window.electron.addGamesToSteam(names, { restartSteam });
  } catch (error) {
    console.error("Could not add games to Steam:", error);
    result = { success: false };
  }

  if (!result?.success) {
    const key = {
      "steam-not-found": "library.steamShortcuts.errors.steamNotFound",
      "steam-user-not-found": "library.steamShortcuts.errors.userNotFound",
      "steam-did-not-close": "library.steamShortcuts.errors.steamDidNotClose",
    }[result?.error];
    toast.error(t(key || "library.steamShortcuts.errors.generic"));
    return result;
  }

  if (result.needsRestart) {
    const count = result.pending.length;
    toast(t("library.steamShortcuts.restartNeeded", { count }), {
      description: t("library.steamShortcuts.restartNeededDescription"),
      duration: 20000,
      action: {
        label: t("library.steamShortcuts.restartSteam"),
        onClick: () => addGamesToSteam(result.pending, t, { restartSteam: true }),
      },
    });
    return result;
  }

  const count = result.added.length;
  if (!count) {
    toast.info(
      names.length === 1
        ? t("library.steamShortcuts.alreadyInSteam")
        : t("library.steamShortcuts.allAlreadyInSteam")
    );
  } else if (result.restarting) {
    toast.success(
      t(
        result.gameMode
          ? "library.steamShortcuts.restartingGameMode"
          : "library.steamShortcuts.restarting",
        { count }
      )
    );
  } else {
    toast.success(t("library.steamShortcuts.added", { count }));
  }
  window.dispatchEvent(new CustomEvent("ascendara:steam-shortcuts-updated"));
  return result;
};
