/**
 * Resolves everything the download page shows up top (game info, artwork
 * overrides, SteamGridDB art, the index cover) and preloads the chosen images
 * before the page opens, so its artwork appears once instead of swapping in.
 */
import artworkOverrideService from "./artworkOverrideService";
import steamGridImageService from "./steamGridImageService";
import imageCacheService from "./imageCacheService";
import steamService from "./gameInfoService";

// Longest a click waits before opening the page with whatever is ready
const PREPARE_TIMEOUT_MS = 2500;
const COVER_IMAGE_TIMEOUT_MS = 2000;
// The banner is a large screenshot; past this it fades in on the page instead
const BANNER_IMAGE_TIMEOUT_MS = 1000;
const ENTRY_TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 60;

// key -> { promise, result, at }
const entries = new Map();

const keyFor = game => `${game?.gameID || ""}::${game?.game || ""}::${game?.imgID || ""}`;

const settle = (promise, fallback = null) =>
  Promise.resolve(promise).then(
    value => value ?? fallback,
    () => fallback
  );

// URLs already loaded and decoded this session, so the page can show them
// without any fade-in, however many times it renders or remounts
const readyImages = new Set();

export const isImageReady = url => !!url && readyImages.has(url);
export const markImageReady = url => {
  if (url) readyImages.add(url);
};

const preloadImage = (url, timeoutMs) =>
  new Promise(resolve => {
    if (!url) return resolve(false);
    if (readyImages.has(url)) return resolve(true);
    const img = new Image();
    const timer = setTimeout(() => resolve(false), timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      // Decoding up front keeps the first paint from stalling on the image
      Promise.resolve(img.decode?.())
        .catch(() => {})
        .then(() => {
          // Still recorded when it finishes after the timeout
          readyImages.add(url);
          resolve(true);
        });
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(false);
    };
    img.src = url;
  });

const loadIndexImage = async game => {
  if (game.imgID) return imageCacheService.getImage(game.imgID);
  // Custom-source games have no imgID, so their banner comes from SteamGridDB
  if (!game.game) return null;
  const assets =
    steamGridImageService.peek(game.game) ||
    (await steamGridImageService.getAssets(game.game));
  return steamGridImageService.pickUrl(assets, "hero");
};

// A cached answer is used right away and refreshed in the background, so a
// round trip to the API only holds the page the first time a game is opened
const resolveOverride = async game => {
  if (!game.gameID || game.privateSource) return null;
  const cached = artworkOverrideService.peek(game.gameID);
  if (cached !== undefined) {
    artworkOverrideService.fetch(game.gameID).catch(() => {});
    return cached;
  }
  return settle(artworkOverrideService.fetch(game.gameID));
};

const resolveCover = async (game, overridePromise) => {
  const override = await overridePromise;
  if (override?.gridUrl) return override.gridUrl;
  return game.game ? settle(steamGridImageService.getCover(game.game)) : null;
};

const resolveGamePage = async game => {
  const usesOverrides = !!(game.gameID && !game.privateSource);
  const overridePromise = resolveOverride(game);
  const [override, steamData, indexImage, coverGridUrl] = await Promise.all([
    overridePromise,
    game.game ? settle(steamService.getGameDetails(game.game)) : null,
    settle(loadIndexImage(game)),
    resolveCover(game, overridePromise),
  ]);

  // Same precedence the download page renders with
  const steamCover = steamData?.cover
    ? steamService.formatImageUrl(steamData.cover.url, "cover_big")
    : null;
  const banner =
    override?.heroUrl ||
    (steamData?.screenshots?.[0]
      ? steamService.formatImageUrl(steamData.screenshots[0].url, "screenshot_huge")
      : indexImage);

  await Promise.all([
    preloadImage(banner, BANNER_IMAGE_TIMEOUT_MS),
    preloadImage(coverGridUrl || steamCover, COVER_IMAGE_TIMEOUT_MS),
  ]);

  return {
    key: keyFor(game),
    usesOverrides,
    override: override || null,
    steamData: steamData || null,
    cachedImage: indexImage || null,
    coverGridUrl: coverGridUrl || null,
  };
};

const prune = () => {
  const now = Date.now();
  for (const [key, entry] of entries) {
    if (entry.result && now - entry.at > ENTRY_TTL_MS) entries.delete(key);
  }
  while (entries.size > MAX_ENTRIES) {
    entries.delete(entries.keys().next().value);
  }
};

const start = game => {
  const key = keyFor(game);
  const existing = entries.get(key);
  if (existing && (!existing.result || Date.now() - existing.at < ENTRY_TTL_MS)) {
    return existing;
  }
  const entry = { promise: null, result: null, at: Date.now() };
  entry.promise = resolveGamePage(game)
    .then(result => {
      entry.result = result;
      entry.at = Date.now();
      return result;
    })
    .catch(error => {
      console.error("Failed to prepare game page:", error);
      entries.delete(key);
      return null;
    });
  entries.set(key, entry);
  prune();
  return entry;
};

const gamePagePreparer = {
  /** The finished preparation for a game, or null if it isn't ready yet. */
  peek(game) {
    if (!game) return null;
    const entry = entries.get(keyFor(game));
    return entry?.result && Date.now() - entry.at < ENTRY_TTL_MS ? entry.result : null;
  },

  /** Starts preparing in the background, e.g. when a card is hovered. */
  prefetch(game) {
    if (game?.game || game?.gameID) start(game);
  },

  /**
   * Resolves once the page is ready, or after a short ceiling so a slow
   * network never blocks opening a game. Resolves null on timeout or failure.
   */
  prepare(game) {
    if (!game?.game && !game?.gameID) return Promise.resolve(null);
    const { promise } = start(game);
    return Promise.race([
      promise,
      new Promise(resolve => setTimeout(() => resolve(null), PREPARE_TIMEOUT_MS)),
    ]);
  },

  matches(result, game) {
    return !!result && result.key === keyFor(game);
  },
};

export default gamePagePreparer;
