// Adds "Install DXVK" and "Remove DXVK" to a game's Manage menu. DXVK runs
// Direct3D 8-11 on Vulkan, which fixes stutter and crashes in many older games.
// Files the game already had are backed up and put back on removal. Windows only.
const VERSION = "3.1.1";
const URL = `https://github.com/doitsujin/dxvk/releases/download/v${VERSION}/dxvk-${VERSION}.tar.gz`;
const ROBOCOPY = "C:\\Windows\\System32\\robocopy.exe";
const DLLS = {
  d3d8: ["d3d8.dll", "d3d9.dll"],
  d3d9: ["d3d9.dll"],
  d3d11: ["d3d11.dll", "dxgi.dll", "d3d10core.dll"],
};
const LABELS = { d3d8: "Direct3D 8", d3d9: "Direct3D 9", d3d11: "Direct3D 10/11" };

const folderOf = file => String(file).replace(/[\\/][^\\/]*$/, "");
const gameName = game => game?.game || game?.name;

module.exports = {
  start(ascendara) {
    if (ascendara.platform !== "win32") return;

    const data = relative => `${ascendara.dataPath}\\${relative.replace(/\//g, "\\")}`;
    const key = game => String(gameName(game)).replace(/[^a-zA-Z0-9 ._-]/g, "_");
    const installed = () => ascendara.storage.get("installed", {});

    // Robocopy exit codes below 8 mean success
    async function robocopy(from, to, files, extra = []) {
      const result = await ascendara.exec(ROBOCOPY, [
        from,
        to,
        ...files,
        "/R:1",
        "/W:1",
        "/NJH",
        "/NJS",
        "/NP",
        ...extra,
      ]);
      if (result.code >= 8) throw new Error(result.stdout.trim() || result.stderr.trim());
    }

    async function ensureDxvk() {
      const folder = `dxvk/dxvk-${VERSION}`;
      if (await ascendara.files.exists(`${folder}/x64/d3d11.dll`)) return folder;
      ascendara.toast(`Downloading DXVK ${VERSION}...`);
      await ascendara.download(URL, `dxvk-${VERSION}.tar.gz`);
      await ascendara.extract(`dxvk-${VERSION}.tar.gz`, "dxvk");
      await ascendara.files.remove(`dxvk-${VERSION}.tar.gz`);
      return folder;
    }

    ascendara.gameScreen.addAction({
      label: "Install DXVK",
      when: game => !!game?.executable && !installed()[key(game)],
      async onClick(game) {
        const api = ascendara.settings.get("api");
        const arch = ascendara.settings.get("arch");
        const files = DLLS[api] || DLLS.d3d11;
        const executable = await ascendara.games.executable(game);
        if (!executable) {
          ascendara.toast("The game's executable wasn't found", "error");
          return;
        }
        // DXVK goes next to the executable, which may be in a subfolder
        const gameFolder = folderOf(executable);
        const dxvk = await ensureDxvk();
        const backup = `backups/${key(game)}`;

        // Keep the game's own copies, e.g. a ReShade dxgi.dll
        await ascendara.files.write(`${backup}/.keep`, "");
        await robocopy(gameFolder, data(backup), files);
        await robocopy(data(`${dxvk}/${arch}`), gameFolder, files, ["/IS", "/IT"]);

        ascendara.storage.set("installed", {
          ...installed(),
          [key(game)]: { folder: gameFolder, files, version: VERSION },
        });
        ascendara.toast(
          `Installed DXVK (${LABELS[api] || LABELS.d3d11}, ${arch === "x32" ? "32-bit" : "64-bit"}) for ${gameName(game)}. If the game won't start, remove it again or try the other options.`,
          "success"
        );
      },
    });

    ascendara.gameScreen.addAction({
      label: "Remove DXVK",
      when: game => !!installed()[key(game)],
      async onClick(game) {
        const entry = installed()[key(game)];
        const backup = `backups/${key(game)}`;
        // Move DXVK's files out, then the backups back in
        await robocopy(entry.folder, data(`removed/${key(game)}`), entry.files, ["/MOV"]);
        await robocopy(data(backup), entry.folder, entry.files, ["/MOV", "/IS", "/IT"]);
        await ascendara.files.remove(`removed/${key(game)}`);
        await ascendara.files.remove(backup);

        const next = installed();
        delete next[key(game)];
        ascendara.storage.set("installed", next);
        ascendara.toast(`Removed DXVK from ${gameName(game)}`, "success");
      },
    });
  },
};
