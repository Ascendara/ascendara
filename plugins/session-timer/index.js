// Reminds you to take a break after playing for a while, and says how long a
// session lasted when the game closes.
const formatDuration = ms => {
  const minutes = Math.max(1, Math.round(ms / 60000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${minutes} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
};

module.exports = {
  start(ascendara) {
    // game name -> { startedAt, timer }
    const sessions = new Map();

    const schedule = name => {
      const session = sessions.get(name);
      if (!session) return;
      const minutes = Math.max(1, Number(ascendara.settings.get("remindAfter")) || 60);
      session.timer = setTimeout(() => {
        ascendara.toast(
          `You've been playing ${name} for ${formatDuration(Date.now() - session.startedAt)}. Time for a break?`,
          "warning"
        );
        if (ascendara.settings.get("repeat")) schedule(name);
      }, minutes * 60000);
    };

    ascendara.games.onLaunch(name => {
      if (!name || sessions.has(name)) return;
      sessions.set(name, { startedAt: Date.now(), timer: null });
      schedule(name);
    });

    ascendara.games.onExit(name => {
      const session = sessions.get(name);
      if (!session) return;
      clearTimeout(session.timer);
      sessions.delete(name);
      if (ascendara.settings.get("summary"))
        ascendara.toast(
          `You played ${name} for ${formatDuration(Date.now() - session.startedAt)}`
        );
    });

    // A changed reminder time applies to sessions already running
    ascendara.settings.onChange(() => {
      for (const [name, session] of sessions) {
        clearTimeout(session.timer);
        schedule(name);
      }
    });

    ascendara.onCleanup(() => {
      for (const session of sessions.values()) clearTimeout(session.timer);
      sessions.clear();
    });
  },
};
