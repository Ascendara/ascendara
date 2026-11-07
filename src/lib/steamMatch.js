// Matches torrent index names ("Name: Deluxe Edition, v1.0 + 5 DLCs") to
// Steam by cleaning off repack, version, edition and bundle tags, and accepts
// only an exact name match. Pure: callers pass the lookup, so tests run it too.

const BUNDLE_WORDS =
  "soundtracks?|ost|bundle|bonus(?:es)?|dlcs?|artbooks?|art book|season pass|expansions?";
const PACKAGING_WORDS =
  "super deluxe|deluxe|gold|game of the year|goty|complete|ultimate|ultra|premium|standard|collector'?s|founder'?s|special|limited|anniversary|digital|day one|launch|starter|elite|year one|absolute";
const RELEASE_GROUPS =
  "codex|plaza|skidrow|reloaded|cpy|empress|tenoke|rune|flt|doge|darksiders|elamigos|fitgirl|dodi|gog|p2p|razor1911|hoodlum|prophet|tinyiso|simplex|kaos";

// "& Soundtrack Bundle", "– -Bonuses", "+ All DLCs", "+ Skill Battle Booster
// Pack DLC" up to the end
const BUNDLE_TAIL = new RegExp(
  `(?:\\s*[&+,:]|\\s+[\\-–—]|\\s+and\\b|\\s+with\\b|\\s+incl(?:uding|\\.)?)[\\s\\-–—:]*(?:[\\w'’.]+\\s+){0,4}?(?:${BUNDLE_WORDS})\\b.*$`,
  "i"
);
// Stacked words too ("Premium Deluxe Edition"), with a season number in front
// ("2.0 Starter Edition") or "Complete" after it
const PACKAGING_EDITION = new RegExp(
  `(?:\\b\\d+(?:\\.\\d+)+\\s+)?\\b(?:(?:${PACKAGING_WORDS})\\s+){1,4}edition(?:\\s+complete)?\\b`,
  "gi"
);
const TRAILING_TAG = new RegExp(
  `[\\s\\-–—:&+,]+(?:${BUNDLE_WORDS}|goty|repack|digital deluxe)$`,
  "i"
);
const RELEASE_GROUP = new RegExp(`\\s*-\\s*(?:${RELEASE_GROUPS})$`, "i");
const VERSION_TAGS = [
  /\bv\d+(?:[._-]\d+)*[a-z]?(?:\/v?\d+(?:[._-]\d+)*[a-z]?)*\b/gi,
  /\bv\.?\s?cl\d+\b/gi,
  /\b(?:build|update|patch|version|hotfix)\s*[#.]?\s*\d[\d.]*\b/gi,
  /\brepack(?:ed)?(?:\s+by\s+\S+)?/gi,
  /\bmulti\s?\d+\b/gi,
];
// FitGirl lists extras after the version: "Name, v1.0 + Friend's Pass",
// "Name, Steam + Multiplayer", or what is left of them: "Name, /Bonuses"
const EXTRAS_TAIL = /\s*,[^,+]{0,30}\+.*$|\s*,\s*\/.*$/;
// "+ Windows 7 Fix", "+ Lam Bug Fix"
const FIX_TAIL = /\s*\+\s*(?:[\w'’.]+\s+){0,3}(?:bug\s*)?fix\b.*$/i;
// Repack notes left at the end: "– MS Store", "– 2.0.1", "– Hotfix",
// "Updates posted", "Crackfix", "– for v1.10+"
const SUFFIX_TAG =
  /(?:[\s\-–—,+:]+(?:(?:ms|microsoft) store|v?\d+(?:\.\d+){2,}[a-z]?|hotfix|crackfix|updates posted|for)|[\s\-–—:]+v?\d+(?:\.\d+){2,})[\s+]*$/i;
// ", EU/US"
const REGION_TAG = /,\s*(?:EU|US|JP|ASIA)(?:\s*\/\s*(?:EU|US|JP|ASIA))*$/;
// Scene names: "Anno.1800.Crackfix-EMPRESS"
const SCENE_NAME = /^[\w'’-]+(?:[._][\w'’-]+){2,}$/;

const tidy = text =>
  text
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—:&+,.]+/, "")
    // keeps the closing dash of a name like "GUILTY GEAR -STRIVE-"
    .replace(/(\s-[^\s-][^-]*[^\s-]-)?[\s\-–—:&+,]*$/, (_, pair) => pair ?? "")
    .trim();

export function cleanGameTitle(title) {
  if (typeof title !== "string") return "";
  let text = title.replace(/[™®©]/g, "").normalize("NFKC").trim();
  if (SCENE_NAME.test(text)) text = text.replace(/[._]/g, " ");
  text = text.replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g, " ");
  for (const tag of VERSION_TAGS) text = text.replace(tag, " ");
  text = text.replace(EXTRAS_TAIL, "");
  text = text.replace(FIX_TAIL, "");
  text = text.replace(BUNDLE_TAIL, "");
  text = text.replace(PACKAGING_EDITION, " ");
  // An edition taken out of "Name – Deluxe Edition, ..." leaves "Name – ,"
  text = tidy(text.replace(/\s+[-–—:]\s*,/g, ","));
  let previous;
  do {
    previous = text;
    text = tidy(
      text
        .replace(TRAILING_TAG, "")
        .replace(RELEASE_GROUP, "")
        .replace(SUFFIX_TAG, "")
        .replace(REGION_TAG, "")
    );
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

// Steam entries that are not the game itself; cleaning can strip "Soundtrack"
// or "DLC", so these are checked on the names before cleaning
const EXTRA_CONTENT = /\b(?:demo|soundtrack|ost|playtest|dlc)\b/i;
const ASKS_FOR_DLC = /\b(?:dlcs?|pack)\b/i;

export function isConfidentMatch(indexTitle, foundTitle) {
  const key = titleKey(indexTitle);
  if (key === "" || key !== titleKey(foundTitle)) return false;
  const extra = String(foundTitle).match(EXTRA_CONTENT)?.[0];
  if (!extra || EXTRA_CONTENT.test(cleanGameTitle(indexTitle))) return true;
  return /^dlc$/i.test(extra) && ASKS_FOR_DLC.test(String(indexTitle));
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
// first answer is missing or a different game. An answer whose name is not the
// cleaned name (a Demo, the base game for a DLC pack) is never shown
// A lookup that throws means Steam was not reached: that is passed on so the
// page can offer a retry, never turned into "not on Steam"
export async function findGameDetails(title, lookup) {
  let details = null;
  let failure = null;
  try {
    details = (await lookup(title)) ?? null;
  } catch (error) {
    failure = error;
  }
  const matched = details?.name && isConfidentMatch(title, details.name) ? details : null;
  if (matched || cleanGameTitle(title) === String(title).trim()) {
    if (failure) throw failure;
    return matched;
  }
  return matchSteamDetails(title, lookup);
}
