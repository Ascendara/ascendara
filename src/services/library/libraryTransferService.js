// What can go into an Ascendara export, in display order. Storage keys are the
// renderer's localStorage entries for that category; "merge" fills in what is
// missing, "replace" takes the backup's values.
export const TRANSFER_CATEGORIES = [
  { id: "library", defaultOn: true },
  { id: "stats", defaultOn: true },
  {
    id: "organization",
    defaultOn: true,
    policy: "merge",
    keys: [
      "game-favorites",
      "game-favorites-meta",
      "play-later-games",
      "folder-favorites",
      "library-folders",
      "library-folderPlacement",
      "game-ratings",
      "game-status",
      "recentGames",
      "library-tab-order",
      "library-hidden-tabs",
      "library-store-display",
      "library-groupBy",
      "library-sortMode",
      "library-sortOrder",
      "library-viewMode",
      "library-installedOnly",
      "library-wishlist-hidden",
    ],
    prefixes: ["play-later-image-", "game-show-logo-", "launch-with-trainer-"],
  },
  { id: "settings", defaultOn: true },
  { id: "paths", defaultOn: false },
  {
    id: "appearance",
    defaultOn: true,
    policy: "replace",
    keys: [
      "ascendara-theme",
      "custom-theme-colors",
      "ascendara-boot-colors",
      "ascendara-logo",
      "navSize",
      "sideScrollBar",
    ],
  },
  {
    id: "profile",
    defaultOn: true,
    policy: "replace",
    keys: ["userProfile", "profileImage", "avatarMode", "selectedEmoji", "useEmoji"],
  },
  { id: "retro", defaultOn: true },
  {
    id: "caches",
    defaultOn: false,
    policy: "merge",
    keys: ["library-value-cache-v2", "library-value-game-count-v2", "recentSearches"],
  },
  { id: "gameIndex", defaultOn: false },
];

const categoryById = id => TRANSFER_CATEGORIES.find(category => category.id === id);

const ownsKey = (category, key) =>
  Boolean(
    category?.keys?.includes(key) ||
    category?.prefixes?.some(prefix => key.startsWith(prefix))
  );

export function collectStorage(categories) {
  const storage = {};
  for (const id of categories) {
    const category = categoryById(id);
    if (!category?.keys) continue;
    const values = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && ownsKey(category, key)) {
          const value = localStorage.getItem(key);
          if (value !== null) values[key] = value;
        }
      }
    } catch (error) {
      console.error(`Could not read ${id} storage:`, error);
    }
    storage[id] = values;
  }
  return storage;
}

export function countStorage(id) {
  return Object.keys(collectStorage([id])[id] || {}).length;
}

const parse = value => {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

const identity = item =>
  item && typeof item === "object"
    ? String(item.id ?? item.game ?? item.name ?? JSON.stringify(item))
    : JSON.stringify(item);

// Current values win; the backup only fills in what is missing
export function mergeStorageValue(current, imported) {
  if (current === null || current === undefined || current === "") return imported;
  const a = parse(current);
  const b = parse(imported);
  if (Array.isArray(a) && Array.isArray(b)) {
    const seen = new Set(a.map(identity));
    return JSON.stringify([...a, ...b.filter(item => !seen.has(identity(item)))]);
  }
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a)) {
    return JSON.stringify({ ...b, ...a });
  }
  return current;
}

export function applyStorage(storage) {
  let applied = 0;
  for (const [id, values] of Object.entries(storage || {})) {
    const category = categoryById(id);
    if (!category?.keys) continue;
    for (const [key, value] of Object.entries(values || {})) {
      if (!ownsKey(category, key) || typeof value !== "string") continue;
      try {
        const current = localStorage.getItem(key);
        const next =
          category.policy === "replace" ? value : mergeStorageValue(current, value);
        if (next !== current) {
          localStorage.setItem(key, next);
          applied++;
        }
      } catch (error) {
        console.error(`Could not restore ${key}:`, error);
      }
    }
  }
  return applied;
}

export function getExportInfo() {
  return window.electron.getLibraryExportInfo();
}

export function exportLibrary(categories) {
  return window.electron.exportLibrary({
    categories,
    storage: collectStorage(categories),
  });
}

export function inspectBackup() {
  return window.electron.inspectLibraryBackup();
}

export async function importBackup(token, categories) {
  const result = await window.electron.importLibrary(token, categories);
  if (!result?.success) return result;
  return { ...result, storageApplied: applyStorage(result.storage) };
}
