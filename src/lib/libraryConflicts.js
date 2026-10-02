import { dedupeLibraryGames, getLibraryIdentityKey } from "./libraryGames.js";

const normalizePath = value => {
  const path = (value || "").replace(/\\/g, "/").replace(/\/+$/, "");
  return /^[a-z]:/i.test(path) || path.startsWith("//") ? path.toLowerCase() : path;
};

export function readLibraryChoices() {
  try {
    const value = JSON.parse(
      localStorage.getItem("library-install-choices") ||
        localStorage.getItem("big-picture-library-choices") ||
        "{}"
    );
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

export function libraryInstallKey(game) {
  let executable = normalizePath(game.executable);
  if (
    executable &&
    !/^(?:[a-z]:\/|\/)/i.test(executable) &&
    game._sourceDir &&
    !game.isCustom
  ) {
    const title = (game.game || game.name || "").replace(/[<>:"/\\|?*]/g, "");
    executable = normalizePath(`${game._sourceDir}/${title}/${executable}`);
  }
  // An absolute executable identifies the same install even when imported twice.
  if (/^(?:[a-z]:\/|\/)/i.test(executable)) return executable;
  return JSON.stringify([
    normalizePath(game._sourceDir),
    game.isCustom === true,
    game.game || game.name,
    executable,
    game.gameID || game.id || "",
  ]);
}

// Folder membership is title-based; hydrate its snapshots with the user's visible installs.
export function reconcileFolderItems(items, visibleGames) {
  const seen = new Set();
  return items.flatMap(item => {
    const identity = getLibraryIdentityKey(item);
    if (seen.has(identity)) return [];
    seen.add(identity);
    const matches = visibleGames.filter(game => getLibraryIdentityKey(game) === identity);
    return matches.length ? matches.map(game => ({ ...item, ...game })) : [item];
  });
}

export function resolveLibraryConflicts(records, choices = {}) {
  const groups = new Map();
  records
    .filter(game => !game._isDeleted)
    .forEach((game, index) => {
      const key = getLibraryIdentityKey(game) || `unknown:${index}`;
      if (!groups.has(key)) groups.set(key, new Map());
      const installs = groups.get(key);
      const install = libraryInstallKey(game);
      const previous = installs.get(install);
      installs.set(install, previous ? dedupeLibraryGames([previous, game])[0] : game);
    });
  const games = [];
  const conflicts = [];
  for (const [identity, installs] of groups) {
    const variants = [...installs.values()];
    if (variants.length === 1) {
      games.push(variants[0]);
      continue;
    }
    // A changed set of installations needs a new decision.
    const key = JSON.stringify([identity, [...installs.keys()].sort()]);
    const choice = choices[key];
    if (choice === "both")
      games.push(...variants.map(game => ({ ...game, _hasMultipleInstalls: true })));
    else if (installs.has(choice)) games.push(installs.get(choice));
    else {
      conflicts.push({ key, variants });
      games.push(...variants.map(game => ({ ...game, _hasMultipleInstalls: true })));
    }
  }
  return { games, conflicts };
}
