// Closes the programs listed in this plugin's options when a game starts, and
// opens them again when the last game closes. Windows only.
const POWERSHELL = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
const TASKKILL = "C:\\Windows\\System32\\taskkill.exe";
// Program names only: they end up in a PowerShell command
const SAFE_NAME = /^[A-Za-z0-9 ._()-]{1,100}$/;

const programNames = text =>
  String(text || "")
    .split(/[,;\n]/)
    .map(name => name.trim())
    .filter(name => SAFE_NAME.test(name))
    .map(name => (/\.exe$/i.test(name) ? name : `${name}.exe`));

module.exports = {
  start(ascendara) {
    if (ascendara.platform !== "win32") {
      ascendara.log("Close Apps While Gaming only works on Windows");
      return;
    }

    // Plugins restart whenever one is toggled; keep the running games across that
    window.__ascendaraCloseApps ??= { running: new Set() };
    const { running } = window.__ascendaraCloseApps;
    const closed = () => ascendara.storage.get("closed", []);
    const setClosed = list => ascendara.storage.set("closed", list);

    async function pathOf(exe) {
      const name = exe.replace(/\.exe$/i, "");
      const result = await ascendara.exec(POWERSHELL, [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Get-Process -Name '${name}' -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Path`,
      ]);
      return result.code === 0 ? result.stdout.trim() : "";
    }

    async function closeApps() {
      const force = ascendara.settings.get("force");
      const list = closed();
      for (const exe of programNames(ascendara.settings.get("programs"))) {
        const path = await pathOf(exe);
        if (!path) continue; // not running
        const args = ["/IM", exe, "/T"];
        if (force) args.unshift("/F");
        const result = await ascendara.exec(TASKKILL, args);
        if (result.code === 0) list.push({ exe, path });
        else ascendara.log(`Couldn't close ${exe}`, result.stderr);
      }
      setClosed(list);
      if (list.length > 0)
        ascendara.toast(`Closed ${list.map(app => app.exe).join(", ")} while you play`);
    }

    async function reopenApps() {
      const list = closed();
      setClosed([]);
      if (!ascendara.settings.get("reopen")) return;
      const reopened = new Set();
      for (const app of list) {
        if (reopened.has(app.path.toLowerCase())) continue;
        reopened.add(app.path.toLowerCase());
        try {
          await ascendara.run(app.path);
        } catch (error) {
          ascendara.log(`Couldn't reopen ${app.exe}`, error);
        }
      }
    }

    ascendara.games.onLaunch(name => {
      const first = running.size === 0;
      running.add(name);
      if (first) closeApps().catch(error => ascendara.log("Closing apps failed", error));
    });

    ascendara.games.onExit(name => {
      running.delete(name);
      if (running.size === 0)
        reopenApps().catch(error => ascendara.log("Reopening apps failed", error));
    });
  },
};
