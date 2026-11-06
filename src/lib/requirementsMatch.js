// Finds minimum PC requirements for games whose index entry has none, by
// looking the cleaned-up name up on Steam and accepting only an exact name
// match. Pure: the caller passes the lookup, so this runs in tests too.

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

const STEAM_LABELS = {
  OS: "os",
  Processor: "cpu",
  Memory: "ram",
  Graphics: "gpu",
  DirectX: "directx",
  Storage: "storage",
  "Hard Drive": "storage",
  "Hard Disk Space": "storage",
};
// Steam's HTML loses its line breaks, so labels run straight into the
// previous value ("...operating systemOS *: Windows 10Processor: ...")
const STEAM_LABEL =
  /(OS(?: \*)?|Processor|Memory|Graphics|DirectX|Storage|Hard Drive|Hard Disk Space|Sound Card|Network|Additional Notes|VR Support):\s*/g;

export function parseSteamMinimum(text) {
  if (typeof text !== "string" || !text) return null;
  const labels = [...text.matchAll(STEAM_LABEL)];
  const reqs = {};
  labels.forEach((match, index) => {
    const key = STEAM_LABELS[match[1].replace(" *", "")];
    if (!key || reqs[key]) return;
    const end = index + 1 < labels.length ? labels[index + 1].index : text.length;
    const value = text.slice(match.index + match[0].length, end).trim();
    if (value) reqs[key] = value;
  });
  return Object.keys(reqs).length ? reqs : null;
}

function toMatch(details, indexTitle) {
  if (!details?.name || !isConfidentMatch(indexTitle, details.name)) return null;
  const minReqs = parseSteamMinimum(details.system_requirements?.minimum);
  return minReqs ? { name: details.name, minReqs } : null;
}

// One lookup per title for the session; failed lookups may be retried
const matches = new Map();

export function matchRequirements(title, { known, lookup } = {}) {
  const key = titleKey(title);
  if (!key) return Promise.resolve(null);
  if (!matches.has(key)) {
    const pending = (async () => {
      const fromKnown = toMatch(known, title);
      if (fromKnown || !lookup) return fromKnown;
      return toMatch(await lookup(cleanGameTitle(title)), title);
    })().catch(error => {
      matches.delete(key);
      console.error("Failed to match system requirements:", error);
      return null;
    });
    matches.set(key, pending);
  }
  return matches.get(key);
}
