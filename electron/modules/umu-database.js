const fs = require("fs-extra");
const path = require("path");
const { ipcMain } = require("electron");
const { linuxConfigDir, isLinux } = require("./config");

const UMU_CSV_URL =
  "https://raw.githubusercontent.com/Open-Wine-Components/umu-database/main/umu-database.csv";
const CSV_CACHE_PATH = path.join(linuxConfigDir, "umu-database.csv");
const CSV_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// ─── Download / Cache ───────────────────────────────────────────────

async function refreshUmuDatabase() {
  const needsRefresh =
    !fs.existsSync(CSV_CACHE_PATH) ||
    Date.now() - fs.statSync(CSV_CACHE_PATH).mtimeMs > CSV_MAX_AGE_MS;

  if (!needsRefresh) return { success: true, source: "cache" };

  try {
    const res = await fetch(UMU_CSV_URL, {
      headers: { "User-Agent": "Ascendara-Launcher" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    fs.ensureDirSync(linuxConfigDir);
    await fs.writeFile(CSV_CACHE_PATH, text, "utf8");
    console.log("[UMU-DB] Database refreshed from network");
    return { success: true, source: "network" };
  } catch (err) {
    console.error("[UMU-DB] Refresh failed:", err.message);
    return { success: false, error: err.message };
  }
}

// ─── Parsing CSV ─────────────────────────────────────────────────────────
// Format : TITLE,STORE,CODENAME,UMU_ID,COMMON ACRONYM (Optional),NOTE (Optional),EXE_STRINGS (Optional)

function parseCsvLine(line) {
  const cols = [];
  let current = "";
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes; continue; }
    if (char === "," && !inQuotes) { cols.push(current.trim()); current = ""; continue; }
    current += char;
  }
  cols.push(current.trim());
  return cols;
}

function parseUmuCsv(csvText) {
  const lines = csvText.split("\n");
  const entries = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = parseCsvLine(line);
    if (cols.length < 4) continue;

    entries.push({
      title: cols[0],        // TITLE
      store: cols[1]?.toLowerCase(), // STORE
      codename: cols[2],     // CODENAME
      umuId: cols[3],        // UMU_ID (ex: "umu-20920")
      acronym: cols[4] || "", // COMMON ACRONYM (optional)
      note: cols[5] || "",   // NOTE (optional)
      exeStrings: cols[6] || "", // EXE_STRINGS (optional)
    });
  }

  return entries;
}

// ─── Research ────────────────────────────────────────────────────────────

async function findUmuId(gameName) {
  if (!fs.existsSync(CSV_CACHE_PATH)) {
    const refresh = await refreshUmuDatabase();
    if (!refresh.success) return null;
  }

  const csv = await fs.readFile(CSV_CACHE_PATH, "utf8");
  const entries = parseUmuCsv(csv);
  const needle = gameName.toLowerCase().trim();

  // 1. Exact match on the title
  for (const entry of entries) {
    if (entry.title?.toLowerCase() === needle) return entry.umuId;
  }

  // 2. Exact match on the acronym
  for (const entry of entries) {
    if (entry.acronym && entry.acronym.toLowerCase() === needle) return entry.umuId;
  }

  // 3. Partial match on the title
  let bestMatch = null;
  let bestScore = 0;

  for (const entry of entries) {
    if (!entry.title || !entry.umuId) continue;
    const entryTitle = entry.title.toLowerCase();

    let score = 0;
    if (entryTitle.includes(needle)) score = needle.length / entryTitle.length;
    else if (needle.includes(entryTitle)) score = entryTitle.length / needle.length;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry.umuId;
    }
  }

  return bestScore >= 0.7 ? bestMatch : null;
}

// ─── Read / Write in game's json ──────────────────────────────

function getGameJsonPath(gameDir) {
  return path.join(gameDir, ".ascendara.json");
}

async function getGameUmuId(gameDir) {
  const jsonPath = getGameJsonPath(gameDir);
  if (!fs.existsSync(jsonPath)) return null;
  try {
    const data = await fs.readJson(jsonPath);
    return data.umuId || null;
  } catch {
    return null;
  }
}

async function setGameUmuId(gameDir, umuId) {
  const jsonPath = getGameJsonPath(gameDir);
  try {
    const data = fs.existsSync(jsonPath) ? await fs.readJson(jsonPath) : {};
    if (!umuId || umuId.trim() === "") {
      delete data.umuId;
    } else {
      data.umuId = umuId.trim();
    }
    await fs.writeJson(jsonPath, data, { spaces: 2 });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function autoDetectAndSaveUmuId(gameName, gameDir) {
  const found = await findUmuId(gameName);
  if (found) {
    await setGameUmuId(gameDir, found);
    console.log(`[UMU-DB] Auto-detected ID for "${gameName}": ${found}`);
  } else {
    console.log(`[UMU-DB] No ID found for "${gameName}"`);
  }
  return found;
}

// ─── IPC Handlers ────────────────────────────────────────────────────────

function registerUmuDatabaseHandlers() {
  if (!isLinux) return;

  ipcMain.handle("umu-refresh-database", async () => refreshUmuDatabase());
  ipcMain.handle("umu-find-id", async (_, gameName) => findUmuId(gameName));
  ipcMain.handle("umu-get-game-id", async (_, gameDir) => getGameUmuId(gameDir));
  ipcMain.handle("umu-set-game-id", async (_, gameDir, umuId) => setGameUmuId(gameDir, umuId));
  ipcMain.handle("umu-auto-detect", async (_, gameName, gameDir) => autoDetectAndSaveUmuId(gameName, gameDir));
}

// ─── Exports ─────────────────────────────────────────────────────────────

module.exports = {
  refreshUmuDatabase,
  findUmuId,
  getGameUmuId,
  setGameUmuId,
  autoDetectAndSaveUmuId,
  registerUmuDatabaseHandlers,
};