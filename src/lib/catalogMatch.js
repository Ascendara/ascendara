// Groups the same game across catalogue sources and patch versions.
// Titles are cleaned of editions, extras and build numbers, then compared with
// Jaro-Winkler plus prefix/substring matching.

import { cleanGameTitle } from "./steamMatch.js";

const ROMAN_VALUES = {
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
  ix: 9,
  x: 10,
  xi: 11,
  xii: 12,
  xiii: 13,
  xiv: 14,
  xv: 15,
  xvi: 16,
  xvii: 17,
  xviii: 18,
  xix: 19,
  xx: 20,
  xxi: 21,
  xxii: 22,
  xxiii: 23,
  xxiv: 24,
  xxv: 25,
  xxvi: 26,
  xxvii: 27,
  xxviii: 28,
  xxix: 29,
  xxx: 30,
};

// Bare dotted builds ("0.4.6f13", "v1.2", "1.2.3") but never plain title
// numbers such as "Cyberpunk 2077".
const BARE_VERSION = /\bv?\.?\d+\.\d+(?:[._-]\d+)*[a-z]?\d*\b/gi;

const LEADING_DOT_VERSION = /(^|[\s\-–—:+,(])v?\.\d{2,}(?=$|[\s\-–—:+,).])/gi;
const MOD_TAGS = /\b(?:redmod|red4ext|redscript)\b/gi;

function stripVersionTokens(text) {
  return text.replace(LEADING_DOT_VERSION, "$1 ").replace(BARE_VERSION, " ");
}

const BUILD_IN_TITLE =
  /\b(?:build|update|patch|hotfix|version)\s*[#.]?\s*\d+(?:[._-]\d+)*\b/i;
const VERSION_IN_TITLE = /\b(?:v\.?\s*)?\d+\.\d+(?:[._-]\d+)*[a-z]?\d*\b/i;

const JARO_WINKLER_THRESHOLD = 0.95;
const MIN_SUBSTRING_LENGTH = 8;

function tidyNormalized(text) {
  return text
    .replace(/&/g, " and ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Comparison form of a catalogue title: no case, accents, punctuation,
 * edition/content tags or build numbers.
 */
export function normalizeCatalogTitle(title) {
  if (typeof title !== "string") return "";
  const prepared = stripVersionTokens(title.replace(MOD_TAGS, " "));
  const cleaned = cleanGameTitle(prepared);
  const text = stripVersionTokens(cleaned || prepared).replace(MOD_TAGS, " ");
  return tidyNormalized(text);
}

function numberSignature(key) {
  const parts = [];
  for (const token of key.split(" ")) {
    if (/^\d+$/.test(token)) {
      parts.push(String(Number(token)));
      continue;
    }
    const roman = ROMAN_VALUES[token];
    if (roman) parts.push(String(roman));
  }
  return parts.join(".");
}

function wordCount(key) {
  return key ? key.split(" ").length : 0;
}

function boundaryAt(text, index) {
  return index >= text.length || text[index] === " ";
}

function containsAtBoundaries(long, short) {
  let from = 0;
  while (from <= long.length - short.length) {
    const index = long.indexOf(short, from);
    if (index === -1) return false;
    const before = index === 0 || long[index - 1] === " ";
    const after = boundaryAt(long, index + short.length);
    if (before && after) return true;
    from = index + 1;
  }
  return false;
}

/** Jaro-Winkler similarity for two already-normalized strings. */
export function jaroWinkler(left, right) {
  if (left === right) return 1;
  if (!left || !right) return 0;

  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  const range = Math.max(0, Math.floor(longer.length / 2) - 1);
  const shortMatches = new Array(shorter.length).fill(false);
  const longMatches = new Array(longer.length).fill(false);

  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    const start = Math.max(0, i - range);
    const end = Math.min(i + range + 1, longer.length);
    for (let j = start; j < end; j++) {
      if (longMatches[j] || shorter[i] !== longer[j]) continue;
      shortMatches[i] = true;
      longMatches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let transpositions = 0;
  let j = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (!shortMatches[i]) continue;
    while (!longMatches[j]) j++;
    if (shorter[i] !== longer[j]) transpositions++;
    j++;
  }
  transpositions /= 2;

  const jaro =
    (matches / shorter.length +
      matches / longer.length +
      (matches - transpositions) / matches) /
    3;

  let prefix = 0;
  while (
    prefix < Math.min(4, shorter.length, longer.length) &&
    shorter[prefix] === longer[prefix]
  ) {
    prefix++;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

/** Compare two raw titles after normalization. */
export function titlesMatch(left, right) {
  return titlesMatchNormalized(normalizeCatalogTitle(left), normalizeCatalogTitle(right));
}

/** Compare two titles that are already in normalizeCatalogTitle form. */
export function titlesMatchNormalized(left, right) {
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length < 3 || right.length < 3) return false;
  // Different sequel/entry numbers mean different games, however close the text.
  if (numberSignature(left) !== numberSignature(right)) return false;

  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  if (wordCount(shorter) >= 2) {
    const startsWith = longer.startsWith(shorter) && boundaryAt(longer, shorter.length);
    const contained =
      shorter.length >= MIN_SUBSTRING_LENGTH && containsAtBoundaries(longer, shorter);
    if (startsWith || contained) return true;
  }

  return jaroWinkler(left, right) >= JARO_WINKLER_THRESHOLD;
}

/** Version-like text from a title, when sources leave it there. */
export function extractVersionFromTitle(title) {
  if (typeof title !== "string") return null;
  const build = title.match(BUILD_IN_TITLE);
  if (build) return build[0].trim();
  const version = title.match(VERSION_IN_TITLE);
  return version ? version[0].trim() : null;
}

/** Numbers in a version string, newest-comparable. */
export function parseVersion(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const numeric = text.match(/\d+(?:[._-]\d+)*/);
  if (!numeric) return null;
  const parts = [...text.matchAll(/\d+/g)].map(match => Number(match[0]));
  if (!parts.length) return null;
  const suffix =
    text
      .slice(numeric.index + numeric[0].length)
      .match(/[a-z]+/i)?.[0]
      ?.toLowerCase() || "";
  return { parts, suffix };
}

/** Returns a positive number when `left` is newer than `right`. */
export function compareVersions(left, right) {
  const a = typeof left === "string" || left == null ? parseVersion(left) : left;
  const b = typeof right === "string" || right == null ? parseVersion(right) : right;
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;

  const length = Math.max(a.parts.length, b.parts.length);
  for (let i = 0; i < length; i++) {
    const av = a.parts[i] ?? 0;
    const bv = b.parts[i] ?? 0;
    if (av !== bv) return av > bv ? 1 : -1;
  }

  if (a.suffix !== b.suffix) {
    // A release (no suffix) comes after a prerelease/build suffix.
    if (!a.suffix) return 1;
    if (!b.suffix) return -1;
    return a.suffix > b.suffix ? 1 : -1;
  }
  return 0;
}

function versionOf(entry) {
  return entry.version || extractVersionFromTitle(entry.game || entry.name || "") || null;
}

function compareCatalogEntries(left, right) {
  const byVersion = compareVersions(versionOf(left), versionOf(right));
  if (byVersion) return -byVersion;

  // Equal versions: the official index stays canonical.
  const leftOfficial = left.customSource ? 1 : 0;
  const rightOfficial = right.customSource ? 1 : 0;
  if (leftOfficial !== rightOfficial) return leftOfficial - rightOfficial;

  const byRank = (left.sourceRank ?? 0) - (right.sourceRank ?? 0);
  if (byRank) return byRank;

  const leftDate = left.latest_update ? Date.parse(left.latest_update) || 0 : 0;
  const rightDate = right.latest_update ? Date.parse(right.latest_update) || 0 : 0;
  return rightDate - leftDate;
}

function displayTitleOf(entry) {
  const raw = entry.game || entry.name || "";
  const prepared = stripVersionTokens(raw.replace(MOD_TAGS, " "));
  const text = stripVersionTokens(cleanGameTitle(prepared))
    .replace(MOD_TAGS, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—:&+,.]+|[\s\-–—:&+,]+$/g, "")
    .trim();
  return text;
}

/**
 * Collapse a flat catalogue into one entry per game.
 * @param {object[]} games games with `game`, optional `version` and `sourceRank`
 * @returns {{ games: object[], groups: Map<string, object[]> }} primary games
 * and the multi-entry groups used by the download page's source switcher.
 */
export function groupCatalogGames(games) {
  const groups = new Map();
  const aliases = new Map();
  const buckets = new Map();
  const titleCache = new Map();

  const normalized = title => {
    if (titleCache.has(title)) return titleCache.get(title);
    const key = normalizeCatalogTitle(title);
    titleCache.set(title, key);
    return key;
  };

  for (const game of games || []) {
    const rawTitle = game?.game || game?.name || "";
    const key = normalized(rawTitle) || `__untitled__ ${String(rawTitle).toLowerCase()}`;
    const bucket = key.split(" ").slice(0, 2).join(" ");

    let group = groups.get(aliases.get(key) || key);
    if (!group) {
      for (const candidateKey of buckets.get(bucket) || []) {
        if (titlesMatchNormalized(candidateKey, key)) {
          group = groups.get(candidateKey);
          break;
        }
      }
    }

    if (!group) {
      group = { key, entries: [] };
      groups.set(key, group);
      buckets.set(bucket, [...(buckets.get(bucket) || []), key]);
    }

    aliases.set(key, group.key);
    group.entries.push(game);
  }

  const result = [];
  const sourceGroups = new Map();

  for (const group of groups.values()) {
    const entries = group.entries.map(entry => {
      const copy = { ...entry, groupKey: group.key };
      if (!copy.version && copy.customSource) {
        const version = extractVersionFromTitle(copy.game || copy.name);
        if (version) copy.version = version;
      }
      return copy;
    });
    entries.sort(compareCatalogEntries);

    const primary = entries[0];
    if (primary.customSource) {
      const display = displayTitleOf(primary);
      if (display && normalizeCatalogTitle(display) === group.key) {
        primary.game = display;
        if (typeof primary.name === "string") primary.name = display;
      }
    }
    if (entries.length > 1) sourceGroups.set(group.key, entries);

    result.push(primary);
  }

  return { games: result, groups: sourceGroups };
}
