export const normalizeGameName = name =>
  (name || "")
    .replace(/[<>:"/\\|?*]/g, "")
    .trim()
    .toLowerCase();

export const getGameDisplayName = game => game?.game || game?.name || "";

export const getLibraryIdentityKey = game => {
  const normalizedName = normalizeGameName(getGameDisplayName(game));
  if (game?.isFolder && normalizedName) return `folder:${normalizedName}`;
  if (normalizedName) return `name:${normalizedName}`;
  if (game?.gameID) return `id:${game.gameID}`;
  if (game?._queueId) return `queued:${game._queueId}`;
  return "";
};

const toFiniteNumber = value => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const getComparableTime = value => {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsedAsNumber = Number(value);
  if (Number.isFinite(parsedAsNumber)) return parsedAsNumber;
  const parsedAsDate = Date.parse(value);
  return Number.isFinite(parsedAsDate) ? parsedAsDate : 0;
};

const pickMostRecentValue = (a, b) =>
  getComparableTime(b) > getComparableTime(a) ? b : a;

const mergeDuplicateLibraryGame = (existing, incoming) => {
  const existingIsInstalled = existing?.isCustom === false || existing?.custom === false;
  const incomingIsInstalled = incoming?.isCustom === false || incoming?.custom === false;

  // Prefer installed-game metadata over custom-game metadata, but keep the
  // highest stats so the user's hours do not disappear when duplicates merge.
  const preferred = incomingIsInstalled && !existingIsInstalled ? incoming : existing;
  const secondary = preferred === existing ? incoming : existing;

  return {
    ...preferred,
    isCustom: preferred.isCustom ?? preferred.custom ?? false,
    custom: preferred.isCustom ?? preferred.custom ?? false,
    game: getGameDisplayName(preferred) || getGameDisplayName(secondary),
    name: preferred?.name || preferred?.game || secondary?.name || secondary?.game,
    playTime: Math.max(
      toFiniteNumber(existing?.playTime),
      toFiniteNumber(incoming?.playTime)
    ),
    launchCount: Math.max(
      toFiniteNumber(existing?.launchCount),
      toFiniteNumber(incoming?.launchCount)
    ),
    lastPlayed: pickMostRecentValue(existing?.lastPlayed, incoming?.lastPlayed),
    _isDownloading: Boolean(existing?._isDownloading || incoming?._isDownloading),
    _isQueued: Boolean(existing?._isQueued || incoming?._isQueued),
  };
};

export const dedupeLibraryGames = gameList => {
  const deduped = new Map();

  for (const [index, game] of (gameList || []).entries()) {
    const identityKey = getLibraryIdentityKey(game) || `unknown:${index}`;

    const existing = deduped.get(identityKey);
    deduped.set(identityKey, existing ? mergeDuplicateLibraryGame(existing, game) : game);
  }

  return Array.from(deduped.values());
};
