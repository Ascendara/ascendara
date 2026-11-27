export const DEFAULT_NAVIGATION_ORDER = [
  "/",
  "/search",
  "/library",
  "/downloads",
  "/debriddownloads",
  "/profile",
  "/ascend",
  "/workshopdownloader",
  "/settings",
];

export function normalizeNavigationOrder(order) {
  const knownPaths = new Set(DEFAULT_NAVIGATION_ORDER);
  const normalized = Array.isArray(order)
    ? order.filter((path, index) => knownPaths.has(path) && order.indexOf(path) === index)
    : [];

  return [
    ...normalized,
    ...DEFAULT_NAVIGATION_ORDER.filter(path => !normalized.includes(path)),
  ];
}
