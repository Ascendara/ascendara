const fs = require("fs-extra");
const path = require("path");
const crypto = require("crypto");

const LAUNCHER_IDS = ["steam", "epic", "gog", "ubisoft", "battlenet"];
const ACTIVE_PHASES = new Set(["scanning", "importing", "assets"]);
const normalizeName = name =>
  String(name || "")
    .replace(/[<>:"/\\|?*]/g, "")
    .trim()
    .toLowerCase();
const normalizePath = value => (value ? path.resolve(value).toLowerCase() : "");
const assetFiles = {
  grid: "grid.ascendara",
  hero: "hero.ascendara",
  logo: "logo.ascendara",
};

function readLibrary(directory, io = fs) {
  const filename = path.join(directory, "games.json");
  if (!io.existsSync(filename)) return { games: [] };
  const data = JSON.parse(io.readFileSync(filename, "utf8"));
  if (!Array.isArray(data.games)) throw new Error("Invalid games.json");
  return data;
}

function readExisting(settings, io = fs, installedCache = new Map()) {
  const games = [];
  for (const directory of new Set(
    [settings.downloadDirectory, ...(settings.additionalDirectories || [])].filter(
      Boolean
    )
  )) {
    const data = readLibrary(directory, io);
    games.push(
      ...data.games
        .filter(game => !game._isDeleted)
        .map(game => ({ ...game, _sourceDir: directory }))
    );
    if (!installedCache.has(directory)) {
      const installed = [];
      if (io.existsSync(directory)) {
        for (const entry of io.readdirSync(directory, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          const filename = path.join(
            directory,
            entry.name,
            `${entry.name}.ascendara.json`
          );
          if (!io.existsSync(filename)) continue;
          const game = JSON.parse(io.readFileSync(filename, "utf8"));
          if (!game._isDeleted) installed.push(game);
        }
      }
      installedCache.set(directory, installed);
    }
    games.push(...installedCache.get(directory));
  }
  return games;
}

function sameGame(a, b) {
  return (
    (a.launcher &&
      a.launcherId &&
      b.launcherId &&
      a.launcher === b.launcher &&
      String(a.launcherId) === String(b.launcherId)) ||
    (normalizeName(a.game || a.name) &&
      normalizeName(a.game || a.name) === normalizeName(b.game || b.name)) ||
    (a.executable &&
      b.executable &&
      normalizePath(a.executable) === normalizePath(b.executable))
  );
}

function saveImportedGame(candidate, settings, io = fs, installedCache) {
  const existing = readExisting(settings, io, installedCache).find(game =>
    sameGame(game, candidate)
  );
  if (existing) {
    if (existing._sourceDir && existing.launcher === candidate.launcher && candidate.executable &&
      (!existing.executable || !io.existsSync(existing.executable)) &&
      io.existsSync(candidate.executable) && io.statSync(candidate.executable).isFile()) {
      const directory = existing._sourceDir;
      const data = readLibrary(directory, io);
      const record = data.games.find(game => !game._isDeleted && sameGame(game, existing));
      if (record) {
        record.executable = candidate.executable;
        record.executables = candidate.executables || [candidate.executable];
        writeLibrary(directory, data, io);
        return { status: "skipped", record };
      }
    }
    return { status: "skipped", record: existing };
  }
  const data = readLibrary(settings.downloadDirectory, io);
  const gameName = String(candidate.game || "")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .trim()
    .replace(/[. ]+$/, "");
  if (!gameName || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(gameName))
    throw new Error("Invalid game name");
  const stubIndex = data.games.findIndex(
    game => game._isDeleted && normalizeName(game.game) === normalizeName(gameName)
  );
  const assetId = crypto
    .createHash("sha256")
    .update(
      `${candidate.launcher}:${candidate.launcherId || normalizePath(candidate.installPath)}`
    )
    .digest("hex")
    .slice(0, 24);
  const record = {
    ...(stubIndex >= 0 ? data.games[stubIndex] : {}),
    ...candidate,
    game: gameName,
    online: false,
    dlc: false,
    version: "-1",
    isRunning: false,
    assetDirectory: path.join(settings.downloadDirectory, "games", "imported", assetId),
  };
  delete record._isDeleted;
  delete record.deletedAt;
  delete record._sourceDir;
  if (stubIndex >= 0) data.games[stubIndex] = record;
  else data.games.push(record);
  writeLibrary(settings.downloadDirectory, data, io);
  return { status: "added", record };
}

function writeLibrary(directory, data, io) {
  io.ensureDirSync(directory);
  const filename = path.join(directory, "games.json");
  const temporary = `${filename}.${crypto.randomUUID()}.tmp`;
  try {
    io.writeFileSync(temporary, JSON.stringify(data, null, 2));
    io.renameSync(temporary, filename);
  } finally {
    if (io.existsSync(temporary)) io.unlinkSync(temporary);
  }
}

async function downloadImportedAssets(record, options = {}) {
  const download = options.download || require("axios").get;
  const getImageUrls = options.getImageUrls || require("./steamgrid").getImageUrls;
  const directory = record.assetDirectory;
  if (typeof directory !== "string" || !path.isAbsolute(directory))
    throw new Error("Invalid artwork directory");
  for (const folder of [
    path.dirname(path.dirname(directory)),
    path.dirname(directory),
    directory,
  ]) {
    if (await fs.pathExists(folder)) {
      const stat = await fs.lstat(folder);
      if (stat.isSymbolicLink() || !stat.isDirectory())
        throw new Error("Unsafe artwork directory");
    }
  }
  await fs.ensureDir(directory);
  const exists = base =>
    [".jpg", ".jpeg", ".png"].some(ext =>
      fs.existsSync(path.join(record.assetDirectory, base + ext))
    );
  if (Object.values(assetFiles).every(exists)) return "complete";
  const urls = await getImageUrls(record.game, { reportErrors: true });
  let failed = Boolean(urls.failed);
  for (const [type, base] of Object.entries(assetFiles)) {
    if (exists(base) || !urls[type]) continue;
    try {
      const url = new URL(urls[type]);
      if (
        url.protocol !== "https:" ||
        !["steamgriddb.com", "steamstatic.com"].some(
          host => url.hostname === host || url.hostname.endsWith(`.${host}`)
        )
      )
        throw new Error("Untrusted artwork host");
      const response = await download(url.href, {
        responseType: "arraybuffer",
        timeout: 20000,
        maxContentLength: 20 * 1024 * 1024,
        maxRedirects: 0,
      });
      const buffer = Buffer.from(response.data);
      const png = buffer
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const jpeg = buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
      if (!png && !jpeg) throw new Error("Unsupported artwork format");
      const filename = path.join(record.assetDirectory, base + (png ? ".png" : ".jpg"));
      const temporary = `${filename}.tmp`;
      try {
        await fs.writeFile(temporary, buffer);
        await fs.rename(temporary, filename);
      } finally {
        if (await fs.pathExists(temporary)) await fs.unlink(temporary);
      }
    } catch {
      failed = true;
    }
  }
  const count = Object.values(assetFiles).filter(exists).length;
  return count === 3 ? "complete" : count > 0 ? "partial" : failed ? "error" : "missing";
}

const artworkJobs = new Map();

function ensureImportedAssets(record) {
  if (artworkJobs.has(record.assetDirectory))
    return artworkJobs.get(record.assetDirectory);
  const task = downloadImportedAssets(record).finally(() =>
    artworkJobs.delete(record.assetDirectory)
  );
  artworkJobs.set(record.assetDirectory, task);
  return task;
}

function createLauncherImporter({
  getSettings,
  discover,
  publish = () => {},
  assetsUpdated = () => {},
  downloadAssets = ensureImportedAssets,
  saveGame = saveImportedGame,
  platform = process.platform,
}) {
  const supportedLaunchers = platform === "win32" ? LAUNCHER_IDS : ["steam"];
  let state = {
    id: null,
    revision: 0,
    phase: "idle",
    supportedLaunchers,
    launchers: [],
    items: [],
    imported: 0,
    skipped: 0,
    failed: 0,
    assetCompleted: 0,
    assetTotal: 0,
    error: null,
  };
  let cancelled = false;
  let running = Promise.resolve();
  const snapshot = () => structuredClone(state);
  const emit = () => {
    state.revision++;
    publish(snapshot());
  };

  async function run(ids, settings) {
    const candidates = [];
    const queue = [];
    const queuedAssets = new Set();
    const installedCache = new Map();
    try {
      for (const id of ids) {
        if (cancelled) break;
        const launcher = state.launchers.find(item => item.id === id);
        launcher.status = "scanning";
        emit();
        try {
          const result = await discover(id);
          launcher.found = result.games.length;
          launcher.warnings = result.warnings || [];
          launcher.status = "complete";
          candidates.push(...result.games);
        } catch {
          launcher.status = "error";
          launcher.warnings = ["scanFailed"];
        }
        emit();
      }
      if (!cancelled) {
        state.phase = "importing";
        emit();
        for (const candidate of candidates) {
          if (cancelled) break;
          const item = {
            game: candidate.game,
            launcher: candidate.launcher,
            launcherId: candidate.launcherId,
            status: "error",
            assets: null,
          };
          try {
            const { status, record } = saveGame(candidate, settings, fs, installedCache);
            item.game = record.game;
            item.status = status;
            state[status === "added" ? "imported" : "skipped"]++;
            if (
              record.assetDirectory &&
              record.launcher &&
              !queuedAssets.has(record.assetDirectory)
            ) {
              queuedAssets.add(record.assetDirectory);
              item.assets = "pending";
              queue.push({ record, item });
            }
          } catch {
            state.failed++;
          }
          state.items.push(item);
          emit();
          await new Promise(resolve => setImmediate(resolve));
        }
      }
      state.assetTotal = queue.length;
      if (!cancelled && queue.length) {
        state.phase = "assets";
        emit();
        for (const { record, item } of queue) {
          if (cancelled) break;
          item.assets = "downloading";
          emit();
          try {
            item.assets = await downloadAssets(record);
          } catch {
            item.assets = "error";
          }
          state.assetCompleted++;
          assetsUpdated(record.game);
          emit();
        }
      }
      state.phase = cancelled ? "cancelled" : "complete";
    } catch {
      state.phase = "error";
      state.error = "failed";
    }
    emit();
  }

  return {
    snapshot,
    start(ids) {
      if (ACTIVE_PHASES.has(state.phase)) return { success: false, error: "busy" };
      if (
        !Array.isArray(ids) ||
        !ids.length ||
        ids.length > supportedLaunchers.length ||
        ids.some(id => !supportedLaunchers.includes(id))
      )
        return { success: false, error: "invalidLaunchers" };
      const settings = structuredClone(getSettings());
      if (!settings.downloadDirectory)
        return { success: false, error: "directoryRequired" };
      cancelled = false;
      state = {
        ...state,
        id: crypto.randomUUID(),
        phase: "scanning",
        launchers: [...new Set(ids)].map(id => ({
          id,
          status: "pending",
          found: 0,
          warnings: [],
        })),
        items: [],
        imported: 0,
        skipped: 0,
        failed: 0,
        assetCompleted: 0,
        assetTotal: 0,
        error: null,
      };
      emit();
      running = new Promise(resolve => setImmediate(resolve)).then(() =>
        run([...new Set(ids)], settings)
      );
      return { success: true };
    },
    cancel() {
      if (!ACTIVE_PHASES.has(state.phase)) return false;
      cancelled = true;
      return true;
    },
    wait: () => running,
  };
}

function registerLauncherImportHandlers() {
  const { ipcMain, BrowserWindow } = require("electron");
  const { getSettingsManager } = require("./settings");
  const { discoverLauncherGames } = require("./launcher-discovery");
  const send = (channel, data) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed() && !win.webContents.isDestroyed())
        win.webContents.send(channel, data);
    }
  };
  const importer = createLauncherImporter({
    getSettings: () => getSettingsManager().getSettings(),
    discover: discoverLauncherGames,
    publish: state => send("launcher-import-progress", state),
    assetsUpdated: game => send("game-assets-updated", { game, success: true }),
  });
  ipcMain.handle("get-launcher-import-state", () => importer.snapshot());
  ipcMain.handle("start-launcher-import", (_, ids) => importer.start(ids));
  ipcMain.handle("cancel-launcher-import", () => importer.cancel());
}

module.exports = {
  createLauncherImporter,
  saveImportedGame,
  sameGame,
  downloadImportedAssets,
  ensureImportedAssets,
  registerLauncherImportHandlers,
};
