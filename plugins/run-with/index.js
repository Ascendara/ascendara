// Adds "Run with <tool>" to a game's Manage menu, which starts the game
// through a program picked in this plugin's options, such as a mod launcher
// or an injector. {exe} and {dir} in the arguments become the game's
// executable and folder.
const splitArgs = text =>
  (String(text || "").match(/"[^"]*"|\S+/g) || []).map(arg =>
    arg.startsWith('"') && arg.endsWith('"') ? arg.slice(1, -1) : arg
  );

const fileName = file => String(file).split(/[\\/]/).pop();
const folderOf = file => String(file).replace(/[\\/][^\\/]*$/, "");

module.exports = {
  start(ascendara) {
    let removeAction = null;

    const register = settings => {
      if (removeAction) removeAction();
      removeAction = null;
      const tool = String(settings.tool || "").trim();
      if (!tool) return;
      const label = settings.label?.trim() || fileName(tool).replace(/\.exe$/i, "");

      removeAction = ascendara.gameScreen.addAction({
        label: `Run with ${label}`,
        when: game => !!game?.executable,
        async onClick(game) {
          const executable = await ascendara.games.executable(game);
          if (!executable) {
            ascendara.toast("The game's executable wasn't found", "error");
            return;
          }
          const args = splitArgs(settings.args).map(arg =>
            arg.replaceAll("{exe}", executable).replaceAll("{dir}", folderOf(executable))
          );
          await ascendara.run(tool, args, {
            cwd: settings.toolFolder ? folderOf(tool) : folderOf(executable),
          });
          ascendara.toast(`Started ${game.game || game.name} with ${label}`, "success");
        },
      });
    };

    register(ascendara.settings.all());
    ascendara.settings.onChange(register);
  },
};
