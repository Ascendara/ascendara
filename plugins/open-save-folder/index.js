// Adds "Open save folder", "Set save folder" and "Copy executable path" to a
// game's Manage menu. Save folders come from the folder the user set, else
// Ludusavi's save locations, else the places emulators keep saves by Steam App
// ID (GSE Saves, Goldberg, CODEX, RUNE, OnlineFix, EMPRESS, ...).
const folderName = folder => folder.split(/[\\/]/).filter(Boolean).slice(-3).join(" › ");

module.exports = {
  start(ascendara) {
    // Remembers which games have a folder set, so Reset shows up right away
    const key = game => `custom:${game?.game || game?.name}`;
    const hasCustom = game =>
      ascendara.storage.get(key(game), (game?.customSavePaths || []).length > 0);

    ascendara.gameScreen.addAction({
      label: "Open save folder",
      async onClick(game) {
        const { folders } = await ascendara.games.saveFolders(game);
        if (folders.length === 0) {
          ascendara.toast(
            "No save folder found. Play the game once, or use Set save folder.",
            "error"
          );
          return;
        }
        await ascendara.openFolder(folders[0]);
        if (folders.length > 1) {
          ascendara.toast(
            `Opened ${folderName(folders[0])}. Also found: ${folders
              .slice(1, 4)
              .map(folderName)
              .join(", ")}. Wrong one? Use Set save folder.`
          );
        }
      },
    });

    ascendara.gameScreen.addAction({
      label: "Set save folder",
      async onClick(game) {
        const folder = await ascendara.games.pickSaveFolder(game);
        if (!folder) return;
        ascendara.storage.set(key(game), true);
        ascendara.toast(`Saves for this game now open ${folderName(folder)}`, "success");
      },
    });

    ascendara.gameScreen.addAction({
      label: "Reset save folder",
      when: hasCustom,
      async onClick(game) {
        await ascendara.games.clearSaveFolder(game);
        ascendara.storage.set(key(game), false);
        ascendara.toast("Save folder reset. It will be searched for again.", "success");
      },
    });

    ascendara.gameScreen.addAction({
      label: "Copy executable path",
      when: game => !!game?.executable,
      async onClick(game) {
        const executable = await ascendara.games.executable(game);
        if (!executable) {
          ascendara.toast("The game's executable wasn't found", "error");
          return;
        }
        await navigator.clipboard.writeText(executable);
        ascendara.toast("Executable path copied", "success");
      },
    });
  },
};
