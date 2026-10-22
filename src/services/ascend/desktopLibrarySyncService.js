/** Keep the companion's installed library current and execute its launch queue. */
import recentGamesService from "../library/recentGamesService";

const MONITOR = "https://monitor.ascendara.app";
let timer = null;
let user = null;
let busy = false;
let lastSync = 0;
let nextSyncAttempt = 0;
const handled = new Map();

async function gameId(game, isCustom) {
  const identity = JSON.stringify([
    isCustom,
    game.game || game.name,
    game._sourceDir || "",
    game._folderName || "",
    isCustom ? game.executable || "" : "",
  ]);
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
  return Array.from(new Uint8Array(hash).slice(0, 16), byte =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function localGames() {
  const [installed, custom] = await Promise.all([
    window.electron.getGames(),
    window.electron.getCustomGames(),
  ]);
  const entries = [
    ...(installed || [])
      .filter(
        game =>
          !game._isDeleted &&
          !game.downloadingData?.downloading &&
          !game.downloadingData?.extracting
      )
      .map(game => ({ game, isCustom: false })),
    ...(custom || [])
      .filter(game => !game._isDeleted)
      .map(game => ({ game, isCustom: true })),
  ];
  const resolved = await Promise.all(
    entries.map(async ({ game, isCustom }) => ({
      id: await gameId(game, isCustom),
      game,
      isCustom,
    }))
  );
  return resolved.filter(({ game }) => game.game || game.name);
}

async function authorizedFetch(path, options = {}) {
  const token = await user.getIdToken();
  const response = await fetch(`${MONITOR}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(12000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || `Monitor returned ${response.status}`);
  return result;
}

async function tick() {
  if (busy || !user || !window.electron) return;
  busy = true;
  try {
    const currentUser = user;
    for (const [id, outcome] of handled) {
      if (Date.now() - outcome.at > 5 * 60 * 1000) handled.delete(id);
      else if (!outcome.acknowledged) {
        try {
          await authorizedFetch("/library/commands/acknowledge", {
            method: "POST",
            body: JSON.stringify({
              commandId: id,
              status: outcome.status,
              error: outcome.error,
            }),
          });
          outcome.acknowledged = true;
        } catch (error) {
          console.error("[DesktopLibrary] Could not acknowledge launch:", error);
        }
      }
    }
    let games = null;
    if (Date.now() >= nextSyncAttempt && Date.now() - lastSync >= 15000) {
      try {
        games = await localGames();
        if (currentUser !== user) return;
        await authorizedFetch("/library/sync", {
          method: "POST",
          body: JSON.stringify({
            games: games.map(({ id, game, isCustom }) => ({
              id,
              name: game.game || game.name,
              isCustom,
              version: game.version || "",
              playTime: game.playTime || 0,
              launchCount: game.launchCount || 0,
              lastPlayed: game.lastPlayed || "",
              favorite: Boolean(game.favorite),
              description: game.desc || game.description || "",
              size: game.size || "",
              categories: game.category || game.categories || [],
              online: game.online === true,
              dlc: game.dlc === true,
            })),
          }),
        });
        lastSync = Date.now();
      } catch (error) {
        nextSyncAttempt = Date.now() + 15000;
        console.error("[DesktopLibrary] Library sync failed:", error);
      }
    }
    const sessions = await window.electron.getRunningGameSessions();
    if (currentUser !== user) return;
    if (!games) games = await localGames();
    await authorizedFetch("/library/activity", {
      method: "POST",
      body: JSON.stringify({
        sessions: sessions.flatMap(session => {
          const entry = games.find(
            ({ game, isCustom }) =>
              isCustom === session.isCustom &&
              (game.game || game.name) === session.name &&
              (!session.sourceDir || game._sourceDir === session.sourceDir) &&
              (!isCustom || game.executable === session.executable)
          );
          return entry
            ? [
                {
                  gameId: entry.id,
                  sessionId: session.sessionId,
                  startedAt: session.startedAt,
                  canStop: session.canStop,
                },
              ]
            : [];
        }),
      }),
    });
    const { commands } = await authorizedFetch(
      `/library/commands/${encodeURIComponent(user.uid)}?actions=launch,stop`
    );
    if (currentUser !== user) return;
    if (commands.length && !games) games = await localGames();
    for (const command of commands) {
      let outcome = handled.get(command.id);
      if (!outcome) {
        try {
          await authorizedFetch("/library/commands/claim", {
            method: "POST",
            body: JSON.stringify({ commandId: command.id }),
          });
        } catch (error) {
          // Another signed-in desktop may have claimed this request.
          continue;
        }
        let status = "completed";
        let error = "";
        try {
          const entry = games.find(game => game.id === command.gameId);
          if (!entry) throw new Error("Game is no longer installed.");
          const { game, isCustom } = entry;
          const name = game.game || game.name;
          if (command.action === "stop") {
            await window.electron.stopGame(name, command.sessionId);
          } else if (command.action === "launch" || !command.action) {
            if (await window.electron.isGameRunning(name))
              throw new Error("This game is already running.");
            if (game.online && !game.launchCount)
              throw new Error(
                "Launch this game once in Ascendara before using remote play."
              );
            if (
              game.online &&
              (await window.electron.isOnWindows()) &&
              !(await window.electron.isSteamRunning())
            ) {
              throw new Error("Start Steam on your desktop before launching this game.");
            }
            if (game.isVr)
              throw new Error(
                "Open this VR game in Ascendara to review its launch options."
              );
            const result = await window.electron.playGame(
              name,
              isCustom,
              game.backups === true,
              false,
              null,
              false,
              game._sourceDir
                ? { _sourceDir: game._sourceDir, executable: game.executable }
                : null
            );
            if (result === false || result?.success === false)
              throw new Error(result?.error || "Game launch failed.");
            recentGamesService.addRecentGame({
              game: name,
              name: game.name,
              imgID: game.imgID,
              version: game.version,
              isCustom,
              online: game.online,
              dlc: game.dlc,
            });
          } else {
            throw new Error("Unknown game command.");
          }
        } catch (cause) {
          status = "failed";
          error = cause instanceof Error ? cause.message : "Game launch failed.";
        }
        outcome = { status, error, at: Date.now(), acknowledged: false };
        handled.set(command.id, outcome);
      }
      try {
        await authorizedFetch("/library/commands/acknowledge", {
          method: "POST",
          body: JSON.stringify({
            commandId: command.id,
            status: outcome.status,
            error: outcome.error,
          }),
        });
        outcome.acknowledged = true;
      } catch (cause) {
        console.error("[DesktopLibrary] Could not acknowledge launch:", cause);
      }
    }
  } catch (error) {
    console.error("[DesktopLibrary] Sync or command check failed:", error);
  } finally {
    busy = false;
  }
}

export function initializeDesktopLibrarySync(signedInUser) {
  stopDesktopLibrarySync();
  if (!signedInUser) return;
  user = signedInUser;
  void tick();
  timer = setInterval(() => {
    void tick();
  }, 3000);
}

export function stopDesktopLibrarySync() {
  if (timer) clearInterval(timer);
  timer = null;
  user = null;
  lastSync = 0;
  nextSyncAttempt = 0;
  handled.clear();
}
