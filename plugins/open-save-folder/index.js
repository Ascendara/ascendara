// Adds "Open save folder" and "Copy executable path" to a game's Manage menu.
// Save folders are found by the game's Steam App ID in the places emulators
// keep saves (GSE Saves, Goldberg, CODEX, RUNE, OnlineFix, EMPRESS, ...).
const folderName = folder => folder.split(/[\\/]/).filter(Boolean).slice(-3).join(" › ");

module.exports = {
  start(ascendara) {
    ascendara.gameScreen.addAction({
      label: "Open save folder",
      async onClick(game) {
        const { appId, folders } = await ascendara.games.saveFolders(game);
        if (!appId) {
          ascendara.toast(
            "Couldn't find this game's Steam App ID, so its save folder is unknown.",
            "error"
          );
          return;
        }
        if (folders.length === 0) {
          ascendara.toast(
            `No save folder found for App ID ${appId}. Play the game once first.`,
            "error"
          );
          return;
        }
        // The most specific match is usually the one with the saves in it
        const sorted = [...folders].sort((a, b) => b.length - a.length);
        await ascendara.openFolder(sorted[0]);
        if (sorted.length > 1) {
          ascendara.toast(
            `Opened ${folderName(sorted[0])}. Also found: ${sorted
              .slice(1, 4)
              .map(folderName)
              .join(", ")}`
          );
        }
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
