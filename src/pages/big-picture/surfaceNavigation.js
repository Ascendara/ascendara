// Pure navigation keeps ragged rows and refreshed results reachable.
export function moveFocus(rows, current, direction) {
  const populated = rows.filter(row => row.length);
  if (!populated.length) return null;
  let row = populated.findIndex(items => items.includes(current));
  if (row < 0) return populated[0][0];
  let column = populated[row].indexOf(current);
  if (direction === "LEFT") column = Math.max(0, column - 1);
  if (direction === "RIGHT") column = Math.min(populated[row].length - 1, column + 1);
  if (direction === "UP") row = Math.max(0, row - 1);
  if (direction === "DOWN") row = Math.min(populated.length - 1, row + 1);
  return populated[row][Math.min(column, populated[row].length - 1)];
}

export function readStoredList(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export const gameName = game => game.game || game.name || game.title || "";

// Titles are display labels, not identities: catalogue variants and custom installs
// can share a title (or even an artwork ID). Keep every record independently reachable.
// Assign before pagination so repeated records on separate pages cannot share focus.
export function gameEntries(games) {
  const occurrences = new Map();
  return games.map(game => {
    const identity = JSON.stringify([
      game.isCustom ? "custom" : "game",
      game.id ?? null,
      game.imgID ?? null,
      game.source ?? null,
      gameName(game),
      game.executable ?? null,
      game.version ?? null,
    ]);
    const occurrence = occurrences.get(identity) || 0;
    occurrences.set(identity, occurrence + 1);
    return { game, key: `${identity}:${occurrence}` };
  });
}

export function libraryGames(games, { query = "", favorites, folder, sort = "name", hiddenFolders = [] } = {}) {
  const hidden = new Set(hiddenFolders.flatMap(item => (item.items || []).map(gameName)));
  return games.filter(game => {
    const name = gameName(game);
    return !game.isFolder && !hidden.has(name) &&
      name.toLocaleLowerCase().includes(query.toLocaleLowerCase()) &&
      (!favorites || favorites.includes(name)) &&
      (!folder || folder.items?.some(item => gameName(item) === name));
  }).sort((a, b) => sort === "playtime"
    ? (Number(b.playTime) || 0) - (Number(a.playTime) || 0) || gameName(a).localeCompare(gameName(b))
    : sort === "recent"
      ? (Date.parse(b.lastPlayed) || 0) - (Date.parse(a.lastPlayed) || 0) || gameName(a).localeCompare(gameName(b))
      : gameName(a).localeCompare(gameName(b)));
}
