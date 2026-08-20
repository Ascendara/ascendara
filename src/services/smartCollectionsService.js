import recentGamesService from "@/services/recentGamesService";

export function getLibraryGameName(game) {
  return game?.game || game?.name || "";
}

export function normalizePlayTime(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function formatPlayTime(value) {
  const seconds = normalizePlayTime(value);
  if (seconds <= 0) return "";
  if (seconds < 60) return "<1m";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

export async function loadSmartCollectionLibrary() {
  const [installed, custom] = await Promise.all([
    window.electron.getGames(),
    window.electron.getCustomGames(),
  ]);

  const normalized = [
    ...(Array.isArray(installed)
      ? installed.map(game => ({ ...game, isCustom: false }))
      : []),
    ...(Array.isArray(custom)
      ? custom.map(game => ({
          ...game,
          name: game.game || game.name,
          game: game.game || game.name,
          isCustom: true,
          custom: true,
        }))
      : []),
  ];

  const seen = new Set();
  const games = normalized.filter(game => {
    const name = getLibraryGameName(game);
    const key = `${game.isCustom ? "custom" : "installed"}:${name}`;
    if (!name || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    games,
    recentGames: recentGamesService.getRecentGames(),
  };
}

export function buildSmartCollections(games, recentGames) {
  const recentByName = new Map();
  for (const game of recentGames) {
    recentByName.set(getLibraryGameName(game), game);
  }

  const continuePlaying = recentGames
    .map(recent => games.find(game => getLibraryGameName(game) === getLibraryGameName(recent)))
    .filter(Boolean);

  return {
    recentByName,
    collections: [
      {
        id: "continue",
        games: continuePlaying,
      },
      {
        id: "neverPlayed",
        games: games.filter(
          game =>
            normalizePlayTime(game.playTime) <= 0 &&
            !recentByName.has(getLibraryGameName(game))
        ),
      },
      {
        id: "played",
        games: games.filter(
          game =>
            normalizePlayTime(game.playTime) > 0 ||
            recentByName.has(getLibraryGameName(game))
        ),
      },
      {
        id: "custom",
        games: games.filter(game => game.isCustom),
      },
      {
        id: "online",
        games: games.filter(game => Boolean(game.online)),
      },
      {
        id: "vr",
        games: games.filter(game => Boolean(game.isVr)),
      },
      {
        id: "dlc",
        games: games.filter(game => Boolean(game.dlc)),
      },
    ],
  };
}
