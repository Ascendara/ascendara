/**
 * Ascendara Exports
 * Exports chosen parts of Ascendara (library, stats, settings, appearance,
 * profile, retro setup, caches, game index) to one archive and imports the
 * parts the user picks. Library data is merged and never removed; settings,
 * appearance and profile take the backup's values. Secrets are never exported.
 */

const fs = require("fs-extra");
const path = require("path");
const crypto = require("crypto");
const JSZip = require("jszip");
const { getGameDirectories } = require("./gameDirectories");
const { sameGame } = require("./launcher-import");

const FORMAT = "ascendara-export";
const VERSION = 1;
const MAX_ARCHIVE_BYTES = 2 * 1024 ** 3;
const MAX_JSON_BYTES = 64 * 1024 ** 2;
const MAX_FILE_BYTES = 128 * 1024 ** 2;
const MAX_INDEX_FILES = 200000;
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png"];
const ASSET_ID = /^[a-zA-Z0-9_-]+$/;
const ASSET_FILE = /^(grid|hero|logo)\.ascendara\.(jpg|jpeg|png)$/i;
const STAT_FIELDS = ["playTime", "launchCount", "lastPlayed", "favorite"];

const CATEGORIES = [
  "library",
  "stats",
  "organization",
  "settings",
  "paths",
  "appearance",
  "profile",
  "retro",
  "caches",
  "gameIndex",
];
// Categories whose renderer storage is carried in the archive
const STORAGE_CATEGORIES = ["organization", "appearance", "profile", "caches"];

// Machine-specific settings, exported only with "paths"
const PATH_KEYS = [
  "downloadDirectory",
  "additionalDirectories",
  "localIndex",
  "localIndexPath",
  "crackDirectory",
  "watchingFolders",
  "wine",
  "proton",
];
const APPEARANCE_KEYS = ["theme", "customTheme", "sideScrollBar"];
// Runtime state that means nothing on another start
const TRANSIENT_KEYS = ["runningGames"];
const SECRET_PATTERN = /(secret|token|password|apikey|api_key|clientid|client_id)/i;
const EXTRA_SECRET_KEYS = ["giantBombKey", "torrentUsername", "torrentPassword"];

const safeFileName = name =>
  typeof name === "string" &&
  name.length > 0 &&
  name.length < 256 &&
  path.basename(name) === name &&
  !/[<>:"/\\|?*]/.test(name) &&
  ![...name].some(char => char.charCodeAt(0) < 32) &&
  name !== "." &&
  name !== "..";

const isSecretKey = (key, sensitiveKeys = []) =>
  sensitiveKeys.includes(key) ||
  EXTRA_SECRET_KEYS.includes(key) ||
  SECRET_PATTERN.test(key);

const isPlainObject = value =>
  value !== null && typeof value === "object" && !Array.isArray(value);

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function writeJsonAtomic(file, data) {
  await fs.ensureDir(path.dirname(file));
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify(data, null, 2));
    await fs.rename(temporary, file);
  } finally {
    await fs.remove(temporary).catch(() => {});
  }
}

async function findCover(gamesDirectory, gameName) {
  for (const ext of IMAGE_EXTENSIONS) {
    const file = path.join(gamesDirectory, `${gameName}.ascendara${ext}`);
    if (await fs.pathExists(file)) return file;
  }
  return null;
}

async function listInstalledGames(directories) {
  const games = [];
  for (const directory of directories) {
    let entries = [];
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === ".ascendara-updates") continue;
      const infoPath = path.join(directory, entry.name, `${entry.name}.ascendara.json`);
      const info = await readJson(infoPath);
      if (isPlainObject(info)) games.push({ folder: entry.name, infoPath, info });
    }
  }
  return games;
}

async function listCustomGames(directories) {
  const games = [];
  for (const directory of directories) {
    const data = await readJson(path.join(directory, "games.json"));
    for (const game of Array.isArray(data?.games) ? data.games : []) {
      if (game && !game._isDeleted && typeof game.game === "string") {
        games.push({ directory, game });
      }
    }
  }
  return games;
}

// Files under a directory as forward-slash relative paths, skipping links
async function walkFiles(root) {
  const files = [];
  const visit = async relative => {
    let entries = [];
    try {
      entries = await fs.readdir(path.join(root, relative), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile() && !entry.name.endsWith(".tmp")) files.push(child);
    }
  };
  await visit("");
  return files;
}

// Resolve an archive-relative path inside root, refusing anything that escapes it
function safeJoin(root, relative) {
  if (typeof relative !== "string" || !relative || relative.includes("\0")) return null;
  const parts = relative.split("/");
  if (parts.some(part => !safeFileName(part))) return null;
  const target = path.resolve(root, ...parts);
  const rel = path.relative(path.resolve(root), target);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return target;
}

const localIndexDirectory = (settings, userData) =>
  settings.localIndex || path.join(path.dirname(userData), "ascendara", "localindex");

/** Sizes and counts shown next to each export option. */
async function getExportInfo(settings, userData) {
  const directories = settings.downloadDirectory ? getGameDirectories(settings) : [];
  const indexRoot = localIndexDirectory(settings, userData);
  let indexBytes = 0;
  let indexFiles = 0;
  for (const file of await walkFiles(indexRoot)) {
    try {
      indexBytes += (await fs.stat(path.join(indexRoot, ...file.split("/")))).size;
      indexFiles++;
    } catch {
      /* removed while counting */
    }
  }
  const retro = await readJson(path.join(userData, "retro", "library.json"));
  return {
    customGames: (await listCustomGames(directories)).length,
    installedGames: (await listInstalledGames(directories)).length,
    retroGames: Array.isArray(retro?.games) ? retro.games.length : 0,
    retroProfiles: isPlainObject(retro?.profiles)
      ? Object.keys(retro.profiles).length
      : 0,
    indexBytes,
    indexFiles,
    hasProfileImage: await fs.pathExists(
      path.join(userData, "profile_images", "profile.png")
    ),
  };
}

function splitSettings(settings, sensitiveKeys) {
  const general = {};
  const paths = {};
  const appearance = {};
  for (const [key, value] of Object.entries(settings || {})) {
    if (isSecretKey(key, sensitiveKeys) || TRANSIENT_KEYS.includes(key)) continue;
    if (PATH_KEYS.includes(key)) paths[key] = value;
    else if (APPEARANCE_KEYS.includes(key)) appearance[key] = value;
    else if (key === "ludusavi" && isPlainObject(value)) {
      const { backupLocation, ...rest } = value;
      general.ludusavi = rest;
      if (backupLocation) paths.ludusaviBackupLocation = backupLocation;
    } else general[key] = value;
  }
  return { general, paths, appearance };
}

/**
 * Build the archive.
 * @param {object} context - { settings, userData, appVersion, sensitiveKeys }
 * @param {object} options - { categories: string[], storage: { [category]: { key: value } } }
 */
async function buildLibraryArchive(
  context,
  { categories = CATEGORIES, storage = {} } = {}
) {
  const { settings, userData, appVersion = "", sensitiveKeys = [] } = context;
  const selected = CATEGORIES.filter(category => categories.includes(category));
  if (!selected.length) throw new Error("Choose at least one thing to export");
  const directories = settings.downloadDirectory ? getGameDirectories(settings) : [];
  const zip = new JSZip();
  const counts = {};

  if (selected.includes("library")) {
    const customGames = [];
    const seenAssets = new Set();
    for (const { directory, game } of await listCustomGames(directories)) {
      if (customGames.some(existing => sameGame(existing, game))) continue;
      const entry = { ...game, isRunning: false };
      delete entry._sourceDir;
      if (safeFileName(`${game.game}.ascendara.jpg`)) {
        const cover = await findCover(path.join(directory, "games"), game.game);
        if (cover) {
          entry._cover = path.basename(cover);
          zip.file(`covers/${entry._cover}`, await fs.readFile(cover));
        }
      }
      if (typeof game.assetDirectory === "string") {
        const assetId = path.basename(game.assetDirectory);
        if (ASSET_ID.test(assetId) && !seenAssets.has(assetId)) {
          seenAssets.add(assetId);
          let files = [];
          try {
            files = await fs.readdir(game.assetDirectory);
          } catch {
            /* assets were never downloaded */
          }
          for (const file of files.filter(name => ASSET_FILE.test(name))) {
            zip.file(
              `assets/${assetId}/${file}`,
              await fs.readFile(path.join(game.assetDirectory, file))
            );
          }
        }
      }
      customGames.push(entry);
    }
    zip.file("custom-games.json", JSON.stringify(customGames, null, 2));
    counts.library = customGames.length;
  }

  if (selected.includes("stats")) {
    const installed = (await listInstalledGames(directories)).map(({ folder, info }) => ({
      folder,
      game: info.game || info.name || folder,
      stats: Object.fromEntries(
        STAT_FIELDS.filter(field => info[field] !== undefined).map(field => [
          field,
          info[field],
        ])
      ),
      launchCommands: info.launchCommands,
    }));
    zip.file("installed-games.json", JSON.stringify(installed, null, 2));
    counts.stats = installed.length;
  }

  const split = splitSettings(settings, sensitiveKeys);
  if (selected.includes("settings")) {
    zip.file("settings.json", JSON.stringify(split.general, null, 2));
    counts.settings = Object.keys(split.general).length;
  }
  if (selected.includes("paths")) {
    zip.file("paths.json", JSON.stringify(split.paths, null, 2));
    counts.paths = Object.keys(split.paths).length;
  }
  if (selected.includes("appearance")) {
    zip.file("appearance-settings.json", JSON.stringify(split.appearance, null, 2));
  }

  if (selected.includes("profile")) {
    const image = path.join(userData, "profile_images", "profile.png");
    if (await fs.pathExists(image))
      zip.file("profile/profile.png", await fs.readFile(image));
  }

  if (selected.includes("retro")) {
    const retro = await readJson(path.join(userData, "retro", "library.json"));
    if (retro) zip.file("retro/library.json", JSON.stringify(retro));
    counts.retro = Array.isArray(retro?.games) ? retro.games.length : 0;
  }

  if (selected.includes("caches")) {
    const sizeCache = await readJson(path.join(userData, "games-size-cache.json"));
    if (sizeCache) zip.file("caches/games-size-cache.json", JSON.stringify(sizeCache));
  }

  if (selected.includes("gameIndex")) {
    const root = localIndexDirectory(settings, userData);
    const files = await walkFiles(root);
    if (files.length > MAX_INDEX_FILES)
      throw new Error("The game index has too many files");
    for (const file of files) {
      zip.file(`index/${file}`, await fs.readFile(path.join(root, ...file.split("/"))));
    }
    counts.gameIndex = files.length;
  }

  for (const category of STORAGE_CATEGORIES) {
    if (!selected.includes(category)) continue;
    const values = Object.fromEntries(
      Object.entries(storage?.[category] || {}).filter(
        ([key, value]) => typeof key === "string" && typeof value === "string"
      )
    );
    zip.file(`storage/${category}.json`, JSON.stringify(values));
    if (category === "organization") counts.organization = Object.keys(values).length;
  }

  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        format: FORMAT,
        version: VERSION,
        appVersion,
        platform: process.platform,
        exportedAt: new Date().toISOString(),
        categories: selected,
        counts,
      },
      null,
      2
    )
  );

  return {
    buffer: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
    categories: selected,
    counts,
  };
}

async function readEntry(zip, name, type, limit) {
  const entry = zip.file(name);
  if (!entry) return null;
  if (entry._data?.uncompressedSize > limit) throw new Error(`${name} is too large`);
  const data = await entry.async(type);
  if ((type === "string" ? Buffer.byteLength(data) : data.length) > limit) {
    throw new Error(`${name} is too large`);
  }
  return data;
}

async function readJsonEntry(zip, name) {
  const text = await readEntry(zip, name, "string", MAX_JSON_BYTES);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${name} is not valid`);
  }
}

async function openArchive(bytes) {
  if (bytes.length > MAX_ARCHIVE_BYTES) throw new Error("Export file is too large");
  let zip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new Error("This file is not an Ascendara export");
  }
  const manifest = await readJsonEntry(zip, "manifest.json");
  if (manifest?.format !== FORMAT) {
    throw new Error("This file is not an Ascendara export");
  }
  if (!Number.isInteger(manifest.version) || manifest.version > VERSION) {
    throw new Error("This export was made by a newer version of Ascendara");
  }
  const categories = Array.isArray(manifest.categories)
    ? CATEGORIES.filter(category => manifest.categories.includes(category))
    : [];
  return { zip, manifest: { ...manifest, categories } };
}

/** Read what a backup holds without changing anything. */
async function inspectLibraryArchive(bytes) {
  const { manifest } = await openArchive(bytes);
  return {
    categories: manifest.categories,
    counts: isPlainObject(manifest.counts) ? manifest.counts : {},
    exportedAt: manifest.exportedAt,
    appVersion: manifest.appVersion,
    platform: manifest.platform,
  };
}

async function importLibrary(zip, settings) {
  const summary = { added: 0, skipped: 0 };
  const customGames = (await readJsonEntry(zip, "custom-games.json")) || [];
  if (!Array.isArray(customGames)) throw new Error("This export is damaged");
  const root = settings.downloadDirectory;
  const gamesDirectory = path.join(root, "games");
  const existing = (await listCustomGames(getGameDirectories(settings))).map(
    item => item.game
  );
  const gamesFilePath = path.join(root, "games.json");
  const target = (await readJson(gamesFilePath)) || {};
  if (!Array.isArray(target.games)) target.games = [];
  let changed = false;

  for (const raw of customGames) {
    const name = typeof raw?.game === "string" ? raw.game.trim() : "";
    if (
      !isPlainObject(raw) ||
      !name ||
      /[/\\]/.test(raw.game) ||
      name === "." ||
      name === ".."
    ) {
      summary.skipped++;
      continue;
    }
    if (existing.some(game => sameGame(game, raw))) {
      summary.skipped++;
      continue;
    }
    const entry = { ...raw, isRunning: false };
    const cover = entry._cover;
    delete entry._cover;
    delete entry._sourceDir;
    delete entry._isDeleted;
    delete entry.deletedAt;

    if (typeof entry.assetDirectory === "string") {
      const assetId = path.basename(entry.assetDirectory);
      if (ASSET_ID.test(assetId)) {
        const assetDirectory = path.join(gamesDirectory, "imported", assetId);
        entry.assetDirectory = assetDirectory;
        const prefix = `assets/${assetId}/`;
        for (const file of Object.keys(zip.files)) {
          const base = file.slice(prefix.length);
          if (!file.startsWith(prefix) || !ASSET_FILE.test(base)) continue;
          const destination = path.join(assetDirectory, base);
          if (await fs.pathExists(destination)) continue;
          const data = await readEntry(zip, file, "nodebuffer", MAX_FILE_BYTES);
          await fs.ensureDir(assetDirectory);
          await fs.writeFile(destination, data);
        }
      } else {
        delete entry.assetDirectory;
      }
    }

    const ext = typeof cover === "string" ? path.extname(cover) : "";
    if (
      IMAGE_EXTENSIONS.includes(ext.toLowerCase()) &&
      cover === `${entry.game}.ascendara${ext}` &&
      safeFileName(cover) &&
      !(await findCover(gamesDirectory, entry.game))
    ) {
      const data = await readEntry(zip, `covers/${cover}`, "nodebuffer", MAX_FILE_BYTES);
      if (data) {
        await fs.ensureDir(gamesDirectory);
        await fs.writeFile(path.join(gamesDirectory, cover), data);
      }
    }

    target.games.push(entry);
    existing.push(entry);
    summary.added++;
    changed = true;
  }
  if (changed) await writeJsonAtomic(gamesFilePath, target);
  return summary;
}

async function importStats(zip, settings) {
  const summary = { restored: 0, missing: 0 };
  const saved = (await readJsonEntry(zip, "installed-games.json")) || [];
  if (!Array.isArray(saved)) throw new Error("This export is damaged");
  const installed = await listInstalledGames(getGameDirectories(settings));
  const normalize = value =>
    String(value || "")
      .trim()
      .toLowerCase();
  const number = value => (Number.isFinite(value) && value >= 0 ? value : 0);

  for (const item of saved) {
    if (!isPlainObject(item)) continue;
    const match =
      installed.find(game => normalize(game.folder) === normalize(item.folder)) ||
      installed.find(
        game => normalize(game.info.game || game.info.name) === normalize(item.game)
      );
    if (!match) {
      summary.missing++;
      continue;
    }
    const info = { ...match.info };
    const stats = isPlainObject(item.stats) ? item.stats : {};
    let updated = false;
    for (const field of ["playTime", "launchCount"]) {
      if (number(stats[field]) > number(info[field])) {
        info[field] = stats[field];
        updated = true;
      }
    }
    const savedPlayed = Date.parse(stats.lastPlayed);
    if (Number.isFinite(savedPlayed) && !(Date.parse(info.lastPlayed) >= savedPlayed)) {
      info.lastPlayed = stats.lastPlayed;
      updated = true;
    }
    if (stats.favorite === true && info.favorite !== true) {
      info.favorite = true;
      updated = true;
    }
    if (
      typeof item.launchCommands === "string" &&
      item.launchCommands &&
      !info.launchCommands
    ) {
      info.launchCommands = item.launchCommands;
      updated = true;
    }
    if (updated) {
      await writeJsonAtomic(match.infoPath, info);
      summary.restored++;
    }
  }
  return summary;
}

// Settings from the backup, minus anything this PC must decide for itself
async function collectSettingChanges(zip, categories, settings, sensitiveKeys) {
  const changes = {};
  const summary = {};
  const usable = (key, value) =>
    !isSecretKey(key, sensitiveKeys) &&
    !TRANSIENT_KEYS.includes(key) &&
    value !== undefined;

  if (categories.includes("settings")) {
    const general = (await readJsonEntry(zip, "settings.json")) || {};
    let applied = 0;
    for (const [key, value] of Object.entries(isPlainObject(general) ? general : {})) {
      if (
        !usable(key, value) ||
        PATH_KEYS.includes(key) ||
        APPEARANCE_KEYS.includes(key)
      ) {
        continue;
      }
      if (key === "ludusavi" && isPlainObject(value)) {
        // The backup folder is a path, so only "paths" may change it
        const rest = { ...value };
        delete rest.backupLocation;
        changes.ludusavi = {
          ...(settings.ludusavi || {}),
          ...(changes.ludusavi || {}),
          ...rest,
        };
      } else changes[key] = value;
      applied++;
    }
    summary.settings = { applied };
  }

  if (categories.includes("appearance")) {
    const appearance = (await readJsonEntry(zip, "appearance-settings.json")) || {};
    for (const key of APPEARANCE_KEYS) {
      if (isPlainObject(appearance) && appearance[key] !== undefined)
        changes[key] = appearance[key];
    }

    // Older exports stored this Appearance preference only in renderer storage.
    // Migrate that value into authoritative settings when the structured
    // appearance payload does not already contain it.
    if (changes.sideScrollBar === undefined) {
      const legacyStorage = (await readJsonEntry(zip, "storage/appearance.json")) || {};
      const legacySideScrollBar = isPlainObject(legacyStorage)
        ? legacyStorage.sideScrollBar
        : undefined;
      if (legacySideScrollBar === "true" || legacySideScrollBar === "false") {
        changes.sideScrollBar = legacySideScrollBar === "true";
      }
    }
  }

  if (categories.includes("paths")) {
    const paths = (await readJsonEntry(zip, "paths.json")) || {};
    let applied = 0;
    let missing = 0;
    const exists = async value =>
      typeof value === "string" && (await fs.pathExists(value));
    for (const [key, value] of Object.entries(isPlainObject(paths) ? paths : {})) {
      if (key === "ludusaviBackupLocation") {
        if (await exists(value)) {
          changes.ludusavi = {
            ...(settings.ludusavi || {}),
            ...(changes.ludusavi || {}),
            backupLocation: value,
          };
          applied++;
        } else missing++;
      } else if (!PATH_KEYS.includes(key) || !usable(key, value)) {
        continue;
      } else if (key === "additionalDirectories" || key === "watchingFolders") {
        const kept = [];
        for (const directory of Array.isArray(value) ? value : []) {
          if (await exists(directory)) kept.push(directory);
          else missing++;
        }
        changes[key] = kept;
        applied++;
      } else if (key === "wine" || key === "proton") {
        if (isPlainObject(value)) {
          changes[key] = { ...(settings[key] || {}), ...value };
          applied++;
        }
      } else if (typeof value !== "string" || !value || (await exists(value))) {
        changes[key] = value;
        applied++;
      } else missing++;
    }
    summary.paths = { applied, missing };
  }
  return { changes, summary };
}

async function importProfile(zip, userData) {
  const data = await readEntry(zip, "profile/profile.png", "nodebuffer", MAX_FILE_BYTES);
  if (!data) return { image: false };
  const directory = path.join(userData, "profile_images");
  await fs.ensureDir(directory);
  await fs.writeFile(path.join(directory, "profile.png"), data);
  return { image: true };
}

async function importRetro(zip, userData) {
  const saved = await readJsonEntry(zip, "retro/library.json");
  if (
    !saved ||
    saved.version !== 1 ||
    !Array.isArray(saved.games) ||
    !isPlainObject(saved.profiles)
  ) {
    return { added: 0, profiles: 0 };
  }
  const file = path.join(userData, "retro", "library.json");
  const current = (await readJson(file)) || { version: 1, profiles: {}, games: [] };
  if (!Array.isArray(current.games)) current.games = [];
  if (!isPlainObject(current.profiles)) current.profiles = {};
  let profiles = 0;
  for (const [platform, profile] of Object.entries(saved.profiles)) {
    const existing = current.profiles[platform];
    if (isPlainObject(profile) && (!existing || !existing.executable)) {
      current.profiles[platform] = profile;
      profiles++;
    }
  }
  const ids = new Set(current.games.map(game => game?.id));
  let added = 0;
  for (const game of saved.games) {
    if (isPlainObject(game) && game.id && !ids.has(game.id)) {
      current.games.push(game);
      ids.add(game.id);
      added++;
    }
  }
  if (added || profiles) await writeJsonAtomic(file, current);
  return { added, profiles };
}

async function importCaches(zip, userData) {
  const sizeCache = await readJsonEntry(zip, "caches/games-size-cache.json");
  const file = path.join(userData, "games-size-cache.json");
  if (isPlainObject(sizeCache)) {
    const current = (await readJson(file)) || {};
    await writeJsonAtomic(file, {
      ...sizeCache,
      ...(isPlainObject(current) ? current : {}),
    });
  }
  return {};
}

async function importGameIndex(zip, settings, userData) {
  const root = localIndexDirectory(settings, userData);
  if (await fs.pathExists(path.join(root, "ascendara_games.json"))) {
    return { restored: false, reason: "exists" };
  }
  const files = Object.keys(zip.files).filter(
    name => name.startsWith("index/") && !zip.files[name].dir
  );
  if (!files.length) return { restored: false, reason: "empty" };
  if (files.length > MAX_INDEX_FILES)
    throw new Error("The game index has too many files");
  let written = 0;
  for (const name of files) {
    const target = safeJoin(root, name.slice("index/".length));
    if (!target) continue;
    const data = await readEntry(zip, name, "nodebuffer", MAX_FILE_BYTES);
    await fs.ensureDir(path.dirname(target));
    await fs.writeFile(target, data);
    written++;
  }
  return { restored: written > 0, files: written, root };
}

/**
 * Import the chosen categories from an archive.
 * @param {object} context - { settings, userData, sensitiveKeys, saveSettings(changes) }
 * @returns {{ summary, storage, categories }} storage is for the renderer to apply
 */
async function applyLibraryArchive(context, bytes, requested = CATEGORIES) {
  const { settings, userData, sensitiveKeys = [], saveSettings } = context;
  const { zip, manifest } = await openArchive(bytes);
  const categories = manifest.categories.filter(category => requested.includes(category));
  const needsLibrary = ["library", "stats"].some(category =>
    categories.includes(category)
  );
  if (needsLibrary && !settings?.downloadDirectory) {
    throw new Error("Download directory not set");
  }
  const summary = {};

  if (categories.includes("library"))
    summary.library = await importLibrary(zip, settings);
  if (categories.includes("stats")) summary.stats = await importStats(zip, settings);
  if (categories.includes("profile"))
    summary.profile = await importProfile(zip, userData);
  if (categories.includes("retro")) summary.retro = await importRetro(zip, userData);
  if (categories.includes("caches")) summary.caches = await importCaches(zip, userData);

  const settingChanges = {};
  if (categories.includes("gameIndex")) {
    summary.gameIndex = await importGameIndex(zip, settings, userData);
    if (summary.gameIndex.restored && !settings.localIndex) {
      settingChanges.localIndex = summary.gameIndex.root;
      settingChanges.usingLocalIndex = true;
    }
    delete summary.gameIndex.root;
  }

  const collected = await collectSettingChanges(zip, categories, settings, sensitiveKeys);
  Object.assign(summary, collected.summary);
  Object.assign(settingChanges, collected.changes);
  if (Object.keys(settingChanges).length) {
    if (!saveSettings || !(await saveSettings(settingChanges))) {
      throw new Error("Could not save the imported settings");
    }
  }

  const storage = {};
  for (const category of STORAGE_CATEGORIES) {
    if (!categories.includes(category)) continue;
    const values = await readJsonEntry(zip, `storage/${category}.json`);
    storage[category] = isPlainObject(values)
      ? Object.fromEntries(
          Object.entries(values).filter(([, value]) => typeof value === "string")
        )
      : {};
  }

  return { summary, storage, categories };
}

function registerLibraryTransferHandlers() {
  const { ipcMain, dialog, app } = require("electron");
  const { getSettingsManager } = require("../core/settings");
  const settingsManager = getSettingsManager();
  // Picked backup files, so the renderer refers to them without passing paths
  const pending = new Map();

  const context = () => ({
    settings: settingsManager.getSettings(),
    userData: app.getPath("userData"),
    appVersion: app.getVersion(),
    sensitiveKeys: settingsManager.sensitiveKeys || [],
    saveSettings: changes => {
      const success = settingsManager.saveSettings(changes);
      if (success) ipcMain.emit("settings-updated", settingsManager.getSettings());
      return success;
    },
  });

  ipcMain.handle("get-library-export-info", async () => {
    try {
      const { settings, userData } = context();
      return { success: true, info: await getExportInfo(settings, userData) };
    } catch (error) {
      console.error("Error reading library export info:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("export-library", async (_, options = {}) => {
    try {
      const date = new Date().toISOString().slice(0, 10);
      const result = await dialog.showSaveDialog({
        title: "Create Ascendara Export",
        defaultPath: `ascendara-export-${date}.zip`,
        filters: [{ name: "Ascendara Export", extensions: ["zip"] }],
      });
      if (result.canceled || !result.filePath) return { success: false, canceled: true };
      const built = await buildLibraryArchive(context(), {
        categories: Array.isArray(options.categories) ? options.categories : [],
        storage: isPlainObject(options.storage) ? options.storage : {},
      });
      await fs.writeFile(result.filePath, built.buffer);
      return {
        success: true,
        filePath: result.filePath,
        categories: built.categories,
        counts: built.counts,
        bytes: built.buffer.length,
      };
    } catch (error) {
      console.error("Error exporting library:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("inspect-library-backup", async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: "Restore from Ascendara Export",
        filters: [{ name: "Ascendara Export", extensions: ["zip"] }],
        properties: ["openFile"],
      });
      if (result.canceled || !result.filePaths?.length) {
        return { success: false, canceled: true };
      }
      const file = result.filePaths[0];
      if ((await fs.stat(file)).size > MAX_ARCHIVE_BYTES) {
        return { success: false, error: "Export file is too large" };
      }
      const backup = await inspectLibraryArchive(await fs.readFile(file));
      const token = crypto.randomUUID();
      pending.clear();
      pending.set(token, file);
      return { success: true, token, fileName: path.basename(file), ...backup };
    } catch (error) {
      console.error("Error reading Ascendara export:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("import-library", async (_, token, categories) => {
    try {
      const file = pending.get(token);
      if (!file) return { success: false, error: "Choose the export file again" };
      const imported = await applyLibraryArchive(
        context(),
        await fs.readFile(file),
        Array.isArray(categories) ? categories : []
      );
      pending.delete(token);
      return { success: true, ...imported };
    } catch (error) {
      console.error("Error importing library:", error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = {
  CATEGORIES,
  getExportInfo,
  buildLibraryArchive,
  inspectLibraryArchive,
  applyLibraryArchive,
  registerLibraryTransferHandlers,
};
