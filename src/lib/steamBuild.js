// Whether a catalog game was made from the build Steam currently serves. The
// API only knows this for sources that say which Steam build they posted, so
// null means unknown, not outdated.
export function steamBuildStatus(game) {
  const source = Number(game?.sourceBuildId);
  const latest = Number(game?.latestBuildId);
  if (!source || !latest) return null;
  // Steam build IDs only go up
  return source >= latest ? "latest" : "behind";
}
