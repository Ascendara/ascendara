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

/**
 * Stable key for the set, used to tell cached catalogs apart.
 * @param {object[]} sources
 */
export function combinedSourceKey(sources) {
  return `combined:${sources.map(keyOf).join("|")}`;
}
