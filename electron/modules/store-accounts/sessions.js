const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const POLL_MS = 15000;
// Consecutive empty polls before a session ends, so a game restarting through
// its store (or a launcher stub handing off to the real exe) isn't cut short.
const MISSES_TO_END = 2;

// Counts running processes whose executable lives in the install folder. The
// folder is passed through the environment so it never becomes script text.
function countProcessesIn(directory) {
  return new Promise(resolve => {
    childProcess.execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$root = $env:ASCENDARA_GAME_DIR.TrimEnd('\\') + '\\'; @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) }).Count",
      ],
      { env: { ...process.env, ASCENDARA_GAME_DIR: directory }, windowsHide: true, timeout: 20000 },
      (error, stdout) => resolve(error ? 0 : Number.parseInt(stdout.trim(), 10) || 0)
    );
  });
}

// Playtime for store games, keyed by "store:id" like the renderer's storeGameKey
function createPlaytimeStore(file) {
  let cache = null;
  function read() {
    if (!cache) {
      try {
        cache = JSON.parse(fs.readFileSync(file, "utf8"));
      } catch {
        cache = {};
      }
      if (!cache || typeof cache !== "object" || Array.isArray(cache)) cache = {};
    }
    return cache;
  }
  function update(key, change) {
    const data = read();
    data[key] = change({ playTime: 0, launchCount: 0, ...data[key] });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(data));
    fs.renameSync(temporary, file);
    return data[key];
  }
  return { get: key => read()[key] || null, update };
}

function createStoreSessions({
  playtime,
  spawn = childProcess.spawn,
  countProcesses = countProcessesIn,
  now = Date.now,
  onLaunch = () => {},
  onClose = () => {},
}) {
  const active = new Map();

  function finish(session) {
    if (active.get(session.key) !== session) return;
    clearInterval(session.timer);
    active.delete(session.key);
    const seconds = Math.max(0, Math.round((session.lastSeen - session.startedAt) / 1000));
    const record = playtime.update(session.key, entry => ({
      ...entry,
      playTime: entry.playTime + seconds,
    }));
    onClose({ key: session.key, game: session.game, playTime: record.playTime, durationMs: seconds * 1000 });
  }

  async function poll(session) {
    if (session.polling) return;
    session.polling = true;
    try {
      if (session.childAlive) {
        session.lastSeen = now();
        return;
      }
      const count = await countProcesses(session.directory);
      if (count > 0) {
        session.lastSeen = now();
        session.misses = 0;
      } else if (++session.misses >= MISSES_TO_END) {
        finish(session);
      }
    } finally {
      session.polling = false;
    }
  }

  async function launch(key, game, { installPath, executable }) {
    if (active.has(key)) return;
    const child = spawn(executable, [], {
      cwd: path.dirname(executable),
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });
    await new Promise((resolve, reject) => {
      child.once("error", () =>
        reject(new Error("Could not launch this game. Check its installation."))
      );
      child.once("spawn", resolve);
    });
    child.unref();

    const session = {
      key,
      game,
      directory: installPath,
      startedAt: now(),
      lastSeen: now(),
      childAlive: true,
      misses: 0,
      polling: false,
    };
    child.once("exit", () => {
      session.childAlive = false;
      session.lastSeen = now();
    });
    session.timer = setInterval(() => void poll(session), POLL_MS);
    active.set(key, session);
    playtime.update(key, entry => ({
      ...entry,
      launchCount: entry.launchCount + 1,
      lastPlayed: new Date(session.startedAt).toISOString(),
    }));
    onLaunch({ key, game });
  }

  // Keep the time played so far when Ascendara quits mid-session
  function shutdown() {
    for (const session of [...active.values()]) {
      if (session.childAlive) session.lastSeen = now();
      finish(session);
    }
  }

  return { launch, shutdown, isRunning: key => active.has(key) };
}

module.exports = { createStoreSessions, createPlaytimeStore, countProcessesIn };
