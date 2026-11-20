// Pauses game downloads while a game is running, so they don't eat bandwidth
// or disk speed, and resumes them when the last game closes.
const ACTIVE = new Set(["downloading", "updating"]);

module.exports = {
  start(ascendara) {
    // Plugins restart whenever one is toggled; keep the running games across
    // that. Only a fresh app start finds this missing.
    const freshStart = !window.__ascendaraPauseWhilePlaying;
    window.__ascendaraPauseWhilePlaying ??= { running: new Set() };
    const { running } = window.__ascendaraPauseWhilePlaying;

    // Kept in storage so a restart of Ascendara mid-game doesn't forget them
    const paused = () => ascendara.storage.get("paused", []);
    const setPaused = names => ascendara.storage.set("paused", names);

    async function resumeAll() {
      const names = paused();
      setPaused([]);
      let resumed = 0;
      for (const name of names) {
        try {
          await ascendara.downloads.resume(name);
          resumed++;
        } catch (error) {
          ascendara.log(`Couldn't resume ${name}`, error);
        }
      }
      if (resumed > 0)
        ascendara.toast(
          `Resumed ${resumed} download${resumed === 1 ? "" : "s"}`,
          "success"
        );
    }

    ascendara.games.onLaunch(async name => {
      running.add(name);
      const downloads = await ascendara.downloads.list();
      const active = downloads.filter(download => ACTIVE.has(download.status));
      if (active.length === 0) return;
      const names = new Set(paused());
      for (const download of active) {
        try {
          await ascendara.downloads.pause(download.name);
          names.add(download.name);
        } catch (error) {
          ascendara.log(`Couldn't pause ${download.name}`, error);
        }
      }
      setPaused([...names]);
      ascendara.toast(
        `Paused ${active.length} download${active.length === 1 ? "" : "s"} while you play`
      );
    });

    ascendara.games.onExit(name => {
      running.delete(name);
      if (running.size > 0) return;
      if (ascendara.settings.get("autoResume")) {
        resumeAll().catch(error => ascendara.log("Resuming downloads failed", error));
      } else {
        setPaused([]);
      }
    });

    // Left over from a session that ended while Ascendara was closed
    if (freshStart && paused().length > 0) {
      ascendara.toast(
        `${paused().length} download${paused().length === 1 ? " was" : "s were"} paused while you played. Resume them from Downloads.`
      );
      setPaused([]);
    }
  },
};
