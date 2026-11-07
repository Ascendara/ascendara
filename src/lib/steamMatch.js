// Matches torrent index names ("Name: Deluxe Edition, v1.0 + 5 DLCs") to
// Steam by cleaning off repack, version, edition and bundle tags, and accepts
// only an exact name match. Pure: callers pass the lookup, so tests run it too.

const BUNDLE_WORDS =
  "soundtracks?|ost|bundle|bonus(?:es)?|dlcs?|artbooks?|art book|season pass|expansions?";
const PACKAGING_WORDS =
  "super deluxe|deluxe|gold|game of the year|goty|complete|ultimate|ultra|premium|standard|collector'?s|founder'?s|founders|special|limited|anniversary|digital|day one|launch";
const RELEASE_GROUPS =
  "codex|plaza|skidrow|reloaded|cpy|empress|tenoke|rune|flt|doge|darksiders|elamigos|fitgirl|dodi|gog|p2p|razor1911|hoodlum|prophet|tinyiso|simplex|kaos";

// "& Soundtrack Bundle", "– -Bonuses", "+ All DLCs", "incl. 5 DLC" up to the end
const BUNDLE_TAIL = new RegExp(
  `(?:\\s*[&+,:]|\\s+[\\-–—]|\\s+and\\b|\\s+with\\b|\\s+incl(?:uding|\\.)?)[\\s\\-–—:]*(?:[\\w'’.]+\\s+){0,3}?(?:${BUNDLE_WORDS})\\b.*$`,
  "i"
);
const PACKAGING_EDITION = new RegExp(
  `\\b(?:digital\\s+)?(?:${PACKAGING_WORDS})\\s+edition\\b`,
  "gi"
);
const TRAILING_TAG = new RegExp(
  `[\\s\\-–—:&+,]+(?:${BUNDLE_WORDS}|goty|repack|digital deluxe)$`,
  "i"
);
const RELEASE_GROUP = new RegExp(`\\s*-\\s*(?:${RELEASE_GROUPS})$`, "i");
const VERSION_TAGS = [
  /\bv\d+(?:[._-]\d+)*[a-z]?\b/gi,
  /\b(?:build|update|patch|version)\s*[#.]?\s*\d[\d.]*\b/gi,
  /\brepack(?:ed)?(?:\s+by\s+\S+)?/gi,
  /\bmulti\s?\d+\b/gi,
];
// FitGirl lists extras after the version: "Name, v1.0 + Friend's Pass"
const EXTRAS_TAIL = /\s*,[\s,]*\+.*$/;

const tidy = text =>
  text
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—:&+,.]+|[\s\-–—:&+,]+$/g, "")
    .trim();

export function cleanGameTitle(title) {
  if (typeof title !== "string") return "";
  let text = title.replace(/[™®©]/g, "").normalize("NFKC");
  text = text.replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g, " ");
  for (const tag of VERSION_TAGS) text = text.replace(tag, " ");
  text = text.replace(EXTRAS_TAIL, "");
  text = text.replace(BUNDLE_TAIL, "");
  text = text.replace(PACKAGING_EDITION, " ");
  text = tidy(text);
  let previous;
  do {
    previous = text;
    text = tidy(text.replace(TRAILING_TAG, "").replace(RELEASE_GROUP, ""));
  } while (text !== previous);
  return text;
}

// Comparison form: case, accents, punctuation and "&" vs "and" do not matter
export function titleKey(title) {
  return cleanGameTitle(title)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isConfidentMatch(indexTitle, foundTitle) {
  const key = titleKey(indexTitle);
  return key !== "" && key === titleKey(foundTitle);
}

// One cleaned-name Steam lookup per title for the session, shared by the game
// page and the page preparer; only an exact name match is kept, and a failed
// lookup may be retried
const steamMatches = new Map();

export function matchSteamDetails(title, lookup) {
  const key = titleKey(title);
  if (!key || !lookup) return Promise.resolve(null);
  if (!steamMatches.has(key)) {
    const pending = Promise.resolve()
      .then(() => lookup(cleanGameTitle(title)))
      .then(details =>
        details?.name && isConfidentMatch(title, details.name) ? details : null
      )
      .catch(error => {
        steamMatches.delete(key);
        throw error;
      });
    steamMatches.set(key, pending);
  }
  return steamMatches.get(key);
}

// Game page details: the index name first, as before. Torrent index names
// ("Name Deluxe Edition, v1.0 + Bonus") also try the cleaned name when the
// first answer is missing or a different game, and keep the first answer if
// the cleaned name finds nothing better
export async function findGameDetails(title, lookup) {
  const details = (await lookup(title)) ?? null;
  if (cleanGameTitle(title) === String(title).trim()) return details;
  if (details?.name && isConfidentMatch(title, details.name)) return details;
  try {
    return (await matchSteamDetails(title, lookup)) ?? details;
  } catch (error) {
    if (details) return details;
    throw error;
  }
}
