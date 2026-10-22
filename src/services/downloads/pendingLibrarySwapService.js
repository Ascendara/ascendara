const STORAGE_KEY = "ascendara_pending_launcher_swaps";

function readMap() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeMap(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage quota or disabled - safe to ignore, the swap simply won't be tracked
  }
}

// Tracks a game that the user chose to switch from an imported (launcher-tied)
// copy to an Ascendara-managed download, so the imported entry can be removed
// once that download actually finishes.
const pendingLibrarySwapService = {
  add(catalogGameName, importedGameName) {
    if (!catalogGameName || !importedGameName) return;
    const map = readMap();
    map[catalogGameName] = importedGameName;
    writeMap(map);
  },

  take(catalogGameName) {
    if (!catalogGameName) return null;
    const map = readMap();
    const importedGameName = map[catalogGameName];
    if (!importedGameName) return null;
    delete map[catalogGameName];
    writeMap(map);
    return importedGameName;
  },
};

export default pendingLibrarySwapService;
