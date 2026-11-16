// With settings.combineSources on, the official index stays in use and every
// picked external source joins a set instead of replacing the last one.
// settings.customSource stays the most recently picked source so screens that
// show "the" source keep working; the others live in settings.extraSources.

const keyOf = source => source?.url || null;

function uniqueByUrl(sources) {
  const seen = new Set();
  const result = [];
  // Later entries win so the freshest payload for a source is kept
  for (const source of [...sources].reverse()) {
    const key = keyOf(source);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.unshift(source);
  }
  return result;
}

/**
 * Whether search and downloads read from the official Ascendara index.
 * @param {object|null} settings
 */
export function usesOfficialIndex(settings) {
  return !settings?.customSourcesMode || !!settings?.combineSources;
}

/**
 * External sources in use, oldest first and the current pick last.
 * @param {object|null} settings
 * @returns {object[]} customSource-shaped payloads
 */
export function activeExternalSources(settings) {
  if (!settings?.customSourcesMode || !settings.customSource?.url) return [];
  const extras = settings.combineSources ? settings.extraSources || [] : [];
  return uniqueByUrl([...extras, settings.customSource]);
}

/**
 * Setting values that make `next` the current source. When combining, the
 * source it replaces stays in the set.
 * @returns {{ customSource: object, extraSources: object[] }}
 */
export function pickSource(settings, next) {
  const kept = settings?.combineSources
    ? activeExternalSources(settings).filter(s => keyOf(s) !== keyOf(next))
    : [];
  return { customSource: next, extraSources: kept };
}

/**
 * Setting values with `source` taken out of the set. When it was the current
 * source, the most recent remaining one takes its place.
 * @returns {{ customSourcesMode: boolean, customSource: object|null, extraSources: object[] }}
 */
export function dropSource(settings, source) {
  const rest = activeExternalSources(settings).filter(s => keyOf(s) !== keyOf(source));
  const current = rest.at(-1) || null;
  return {
    customSourcesMode: !!current,
    customSource: current,
    extraSources: rest.slice(0, -1),
  };
}

/**
 * Setting values with `previous` swapped for `next` wherever it sits in the set.
 * @returns {{ customSource: object|null, extraSources: object[] }}
 */
export function replaceSource(settings, previous, next) {
  const swap = s => (keyOf(s) === keyOf(previous) ? next : s);
  const current = settings?.customSource;
  return {
    customSource: current && keyOf(current) === keyOf(previous) ? next : current,
    extraSources: (settings?.extraSources || []).map(swap),
  };
}

// Stands for the Ascendara index in settings.sourceOrder
export const OFFICIAL_SOURCE_KEY = "official";

/**
 * The official index and every external source in use, in the order the user
 * arranged them. Sources missing from settings.sourceOrder go last, newest
 * last; the official index goes first until it is moved.
 * @returns {{ key: string, official: boolean, source: object|null }[]}
 */
export function orderedSources(settings) {
  const entries = [
    ...(usesOfficialIndex(settings)
      ? [{ key: OFFICIAL_SOURCE_KEY, official: true, source: null }]
      : []),
    ...activeExternalSources(settings).map(source => ({
      key: keyOf(source),
      official: false,
      source,
    })),
  ];
  const saved = Array.isArray(settings?.sourceOrder) ? settings.sourceOrder : [];
  const rank = key => {
    const i = saved.indexOf(key);
    if (i !== -1) return i;
    return key === OFFICIAL_SOURCE_KEY ? -1 : saved.length;
  };
  // Array sort is stable, so unranked sources keep the order they were added in
  return entries.sort((a, b) => rank(a.key) - rank(b.key));
}

/**
 * The settings.sourceOrder value with `key` moved to `toIndex`.
 * @returns {string[]}
 */
export function moveSource(settings, key, toIndex) {
  const keys = orderedSources(settings).map(entry => entry.key);
  const from = keys.indexOf(key);
  if (from === -1) return keys;
  keys.splice(from, 1);
  keys.splice(Math.max(0, Math.min(toIndex, keys.length)), 0, key);
  return keys;
}

/**
 * Stable key for the set and its order, used to tell cached catalogs apart.
 */
export function combinedSourceKey(settings) {
  return `combined:${orderedSources(settings)
    .map(entry => entry.key)
    .join("|")}`;
}

/**
 * Where a catalogue game comes from. External games name their source; games
 * from the Ascendara index are only called official when mixed with others.
 * @returns {{ official: boolean, name?: string }|null}
 */
export function gameSource(game, settings) {
  if (!game || !settings?.customSourcesMode) return null;
  if (typeof game.customSource === "string" && game.customSource.trim()) {
    return { official: false, name: game.customSource.trim() };
  }
  if (game.customSource === true) {
    const name = settings.customSource?.name?.trim();
    return name ? { official: false, name } : null;
  }
  if (!game.customSource && settings.combineSources) return { official: true };
  return null;
}
