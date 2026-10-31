// Several self-hosted sources can be active together. The active set lives on
// settings.customSource; privateSourceId stays the first ID so code that only
// checks "is a self-hosted source active" keeps working.

/**
 * IDs of the self-hosted sources that are active, oldest first.
 * @param {object|null} customSource - settings.customSource
 * @returns {string[]}
 */
export function activePrivateSourceIds(customSource) {
  if (Array.isArray(customSource?.privateSourceIds))
    return customSource.privateSourceIds.filter(Boolean);
  return customSource?.privateSourceId ? [customSource.privateSourceId] : [];
}

/**
 * Builds the settings.customSource value for a set of self-hosted sources.
 * @param {object[]} sources - Sources from privateSources.list(), in activation order
 * @returns {object|null} null when the set is empty
 */
export function privateSourceSetting(sources) {
  if (!sources.length) return null;
  const ids = sources.map(s => s.id);
  return {
    id: ids.join("+"),
    name: sources.map(s => s.name).join(" + "),
    // The URL keys the game cache, so it changes whenever the set does
    url: `private:${ids.join(",")}`,
    privateSourceId: ids[0],
    privateSourceIds: ids,
    userProvided: true,
    gameCount: sources.reduce((total, s) => total + (s.count || 0), 0),
  };
}
