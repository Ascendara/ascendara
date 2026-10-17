export const storeNames = { steam: "Steam", epic: "Epic Games", gog: "GOG" };
export const defaultStoreDisplay = {
  enabled: false,
  stores: ["steam", "epic", "gog"],
};

export function readStoreDisplay() {
  try {
    const value = JSON.parse(localStorage.getItem("library-store-display"));
    return {
      enabled: value?.enabled === true,
      stores: Array.isArray(value?.stores)
        ? value.stores.filter((id) => Object.hasOwn(storeNames, id))
        : defaultStoreDisplay.stores,
    };
  } catch {
    return defaultStoreDisplay;
  }
}

export function storeLibraryEntries(accounts, preferences, installed) {
  if (!preferences.enabled) return [];
  const normalize = (name) =>
    String(name || "")
      .normalize("NFKC")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  const local = installed.filter((game) => game && !game._isDeleted);
  const names = new Set(
    local.map((game) =>
      normalize(typeof game === "string" ? game : game.game || game.name),
    ),
  );
  const ids = new Set(
    local
      .filter((game) => game.launcher && game.launcherId)
      .map((game) => `${game.launcher}:${game.launcherId}`),
  );
  const seen = new Set();
  return accounts
    .filter(
      (account) =>
        account.connected && preferences.stores.includes(account.store),
    )
    .flatMap((account) =>
      account.games.map((item) => ({ ...item, store: account.store })),
    )
    .filter((item) => {
      const key = `${item.store}:${item.id}`;
      if (seen.has(key) || ids.has(key) || names.has(normalize(item.name)))
        return false;
      seen.add(key);
      return true;
    })
    .map((item) => ({
      ...item,
      game: item.name,
      _isStoreOwned: true,
      _storeKey: `owned:${item.store}:${item.id}`,
    }));
}
