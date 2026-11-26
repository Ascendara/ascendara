// Runs DS4Windows while games are running, so PlayStation controllers show up
// to games as Xbox controllers. Downloads DS4Windows on first use. Windows only.
const VERSION = "3.9.9";
const URL = `https://github.com/schmaldeo/DS4Windows/releases/download/v${VERSION}/DS4Windows_${VERSION}_x64.zip`;
const SHA256 = "70c4fe79ef63c039e603e298f73dc41a971a9884348288c8a7eb9dc739c4cb9f";
const SC = "C:\\Windows\\System32\\sc.exe";
const TASKLIST = "C:\\Windows\\System32\\tasklist.exe";
const TASKKILL = "C:\\Windows\\System32\\taskkill.exe";
const CERTUTIL = "C:\\Windows\\System32\\certutil.exe";

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
  start(ascendara) {
    if (ascendara.platform !== "win32") {
      ascendara.log("DS4Windows only works on Windows");
      return;
    }

    // Plugins restart whenever one is toggled; keep the state across that
    window.__ascendaraDs4 ??= { running: new Set(), pid: null, busy: null };
    const state = window.__ascendaraDs4;
    const folder = `ds4windows-${VERSION}`;
    const bundled = `${ascendara.dataPath}\\${folder}\\DS4Windows\\DS4Windows.exe`;

    async function isRunning() {
      const result = await ascendara.exec(TASKLIST, [
        "/FI",
        "IMAGENAME eq DS4Windows.exe",
        "/NH",
        "/FO",
        "CSV",
      ]);
      return /"DS4Windows\.exe"/i.test(result.stdout);
    }

    async function driverInstalled() {
      const result = await ascendara.exec(SC, ["query", "ViGEmBus"]);
      return result.code === 0;
    }

    async function program() {
      const own = String(ascendara.settings.get("path") || "").trim();
      if (own) {
        if (!/\.exe$/i.test(own)) throw new Error("The DS4Windows path must end in .exe");
        return own;
      }
      if (await ascendara.files.exists(`${folder}/DS4Windows/DS4Windows.exe`))
        return bundled;
      const archive = `DS4Windows_${VERSION}.zip`;
      ascendara.toast(`Downloading DS4Windows ${VERSION}...`);
      await ascendara.download(URL, archive);
      const hash = await ascendara.exec(CERTUTIL, [
        "-hashfile",
        `${ascendara.dataPath}\\${archive}`,
        "SHA256",
      ]);
      if (!hash.stdout.replace(/\s/g, "").toLowerCase().includes(SHA256)) {
        await ascendara.files.remove(archive);
        throw new Error("The downloaded DS4Windows didn't match the expected file");
      }
      await ascendara.extract(archive, folder);
      await ascendara.files.remove(archive);
      return bundled;
    }

    // A fresh DS4Windows finds controllers but leaves them without a profile, so
    // games never see an Xbox controller. Give every empty slot the Default
    // profile. DS4Windows creates both files on its first run and rewrites
    // Profiles.xml when it exits, so this only runs before it starts.
    async function assignProfiles() {
      const settings = `${folder}/DS4Windows/Profiles.xml`;
      if (
        !(await ascendara.files.exists(settings)) ||
        !(await ascendara.files.exists(`${folder}/DS4Windows/Profiles/Default.xml`))
      )
        return;
      let xml = await ascendara.files.read(settings);
      const original = xml;
      for (let slot = 1; slot <= 8; slot++) {
        const tag = `Controller${slot}`;
        if (new RegExp(`<${tag}>[^<]+</${tag}>`).test(xml)) continue;
        xml = xml
          .replace(new RegExp(`\\s*<${tag}\\s*/>|\\s*<${tag}>\\s*</${tag}>`), "")
          .replace("</Profile>", `  <${tag}>Default</${tag}>\n</Profile>`);
      }
      if (xml !== original) await ascendara.files.write(settings, xml);
    }

    async function open() {
      // The user's own DS4Windows may already be open
      if (state.pid || (await isRunning())) return;
      const exe = await program();
      if (exe === bundled) await assignProfiles();
      const ready = await driverInstalled();
      // Without the driver, show the window so its welcome screen can install it
      let exited = false;
      const child = await ascendara.run(exe, ready ? ["-m"] : [], {
        onExit: code => {
          exited = true;
          if (state.pid === child?.pid) state.pid = null;
          if (code !== 0 && code !== null)
            ascendara.log(`DS4Windows exited with code ${code}`);
        },
      });
      if (!exited) state.pid = child.pid;
      if (!ready) {
        ascendara.toast(
          "DS4Windows needs the ViGEmBus driver. Click Install in its welcome window, then start the game again.",
          "info"
        );
      }
    }

    async function close() {
      // Only close a DS4Windows this plugin started
      const pid = state.pid;
      if (!pid) return;
      state.pid = null;
      const exe = String(ascendara.settings.get("path") || "").trim() || bundled;
      // Asks the running DS4Windows to disconnect the controllers and exit
      await ascendara.exec(exe, ["-command", "Shutdown"], { timeout: 10000 });
      for (let i = 0; i < 10 && (await isRunning()); i++) await wait(500);
      if (await isRunning()) await ascendara.exec(TASKKILL, ["/PID", String(pid), "/F"]);
    }

    // One open or close at a time, in the order they were asked for
    const queue = task => {
      state.busy = (state.busy || Promise.resolve()).then(task).catch(error => {
        ascendara.log("DS4Windows failed", error);
        ascendara.toast(`DS4Windows: ${error.message || error}`, "error");
      });
      return state.busy;
    };

    const always = () => ascendara.settings.get("mode") === "always";

    if (always()) queue(open);

    // stop() also runs when any plugin is toggled, and start() follows right
    // after. Only close DS4Windows if this plugin stayed off.
    const generation = (state.generation = (state.generation || 0) + 1);
    module.exports.stop = () => {
      setTimeout(() => {
        if (state.generation === generation) queue(close);
      }, 3000);
    };

    ascendara.settings.onChange((_values, key) => {
      if (key !== "mode") return;
      if (always()) queue(open);
      else if (state.running.size === 0) queue(close);
    });

    ascendara.games.onLaunch(name => {
      state.running.add(name);
      queue(open);
    });

    ascendara.games.onExit(name => {
      state.running.delete(name);
      if (state.running.size === 0 && !always()) queue(close);
    });
  },
};
