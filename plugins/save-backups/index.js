// Backs up a game's save folder when the game closes, keeping the newest few
// copies. Also adds "Back up saves now" and "Open save backups" to the Manage
// menu. Backups are zip files (tar.gz on macOS and Linux) in this plugin's folder.
module.exports = {
  start(ascendara) {
    const windows = ascendara.platform === "win32";
    const sep = windows ? "\\" : "/";
    const tar = windows ? "C:\\Windows\\System32\\tar.exe" : "/usr/bin/tar";
    const extension = windows ? ".zip" : ".tar.gz";

    const safeName = name =>
      String(name || "game")
        .replace(/[^a-zA-Z0-9 ._-]/g, "_")
        .trim() || "game";
    const backupFolder = name => `backups/${safeName(name)}`;
    const absolute = relative =>
      `${ascendara.dataPath}${sep}${relative.replace(/\//g, sep)}`;

    async function prune(name) {
      const keep = Math.max(1, Number(ascendara.settings.get("keep")) || 5);
      const entries = await ascendara.files.list(backupFolder(name));
      const archives = entries
        .filter(entry => !entry.directory && entry.name.endsWith(extension))
        .map(entry => entry.name)
        .sort();
      // Names start with a timestamp, so the oldest sort first. A game with
      // several save folders writes one archive per folder per backup.
      const stamps = [...new Set(archives.map(file => file.slice(0, 24)))];
      const expired = new Set(stamps.slice(0, Math.max(0, stamps.length - keep)));
      for (const file of archives) {
        if (expired.has(file.slice(0, 24)))
          await ascendara.files.remove(`${backupFolder(name)}/${file}`);
      }
    }

    async function backUp(game, { quiet = false } = {}) {
      const name = game?.game || game?.name;
      const { folders } = await ascendara.games.saveFolders(game);
      if (folders.length === 0) {
        if (!quiet) ascendara.toast(`No save folder found for ${name}`, "error");
        return false;
      }
      // Creates the folder; tar won't
      await ascendara.files.write(`${backupFolder(name)}/.keep`, "");
      // 24 characters, e.g. 2026-11-20T11-30-05-123Z
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      let saved = 0;
      for (const [index, folder] of folders.slice(0, 5).entries()) {
        const out = absolute(`${backupFolder(name)}/${stamp}-${index + 1}${extension}`);
        const args = windows
          ? ["-a", "-c", "-f", out, "-C", folder, "."]
          : ["-czf", out, "-C", folder, "."];
        const result = await ascendara.exec(tar, args, { timeout: 120000 });
        if (result.code === 0) saved++;
        else ascendara.log(`Backing up ${folder} failed`, result.stderr);
      }
      await prune(name);
      if (!quiet || ascendara.settings.get("notify")) {
        ascendara.toast(
          saved > 0 ? `Backed up ${name}'s saves` : `Couldn't back up ${name}'s saves`,
          saved > 0 ? "success" : "error"
        );
      }
      return saved > 0;
    }

    ascendara.games.onExit((_name, game) => {
      backUp(game, { quiet: true }).catch(error =>
        ascendara.log("Backup after exit failed", error)
      );
    });

    ascendara.gameScreen.addAction({
      label: "Back up saves now",
      onClick: game => backUp(game),
    });

    ascendara.gameScreen.addAction({
      label: "Open save backups",
      async onClick(game) {
        const name = game?.game || game?.name;
        if (!(await ascendara.files.exists(backupFolder(name)))) {
          ascendara.toast(`No backups of ${name} yet`, "error");
          return;
        }
        await ascendara.openFolder(absolute(backupFolder(name)));
      },
    });
  },
};
