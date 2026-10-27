"use strict";

const path = require("path");
const fs = require("fs").promises;
const ini = require("ini");
const { getSettings } = require("./userConfig.js");

const appData =
  process.env["APPDATA"] ||
  path.join(process.env.HOME || require("os").homedir(), ".config");
const learnedFile = path.join(appData, "Achievement Watcher/steam_cache/folders.json");

const EMU_CONFIG_FILES = [
  "ALI213.ini",
  "valve.ini",
  "hlm.ini",
  "ds.ini",
  "steam_api.ini",
  "SteamConfig.ini",
  "OnlineFix.ini",
];
const APPID_SEARCH_DEPTH = 3;
const APPID_SEARCH_MAX_DIRS = 200;
const APPID_RETRY_MS = 600000; // Re-check folders without an appid every 10 minutes
const SPACEWAR_APPID = "480"; // Placeholder appid emulators ship with

const GAME_LIST_TTL_MS = 5000; // Catch-up resolves many files back to back

const appidCache = new Map(); // folder -> { appid, checkedAt }
let gameList = null; // { games, at }

const normalizeName = name =>
  String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const normalizePath = p =>
  String(p || "")
    .replace(/\\/g, "/")
    .trim()
    .toLowerCase();

const exists = p =>
  fs
    .access(p)
    .then(() => true)
    .catch(() => false);

function libraryDirs(settings) {
  return [
    ...new Set(
      [settings.downloadDirectory, ...(settings.additionalDirectories || [])].filter(
        Boolean
      )
    ),
  ];
}

async function readJson(p) {
  try {
    return JSON.parse(await fs.readFile(p, "utf8"));
  } catch (e) {
    return null;
  }
}

// Every game Ascendara knows about: folders in each library directory, plus
// custom games from games.json (whose folder is wherever the executable is).
async function listGames() {
  if (gameList && Date.now() - gameList.at < GAME_LIST_TTL_MS) return gameList.games;
  const settings = await getSettings();
  const games = [];

  for (const libraryDir of libraryDirs(settings)) {
    let entries;
    try {
      entries = await fs.readdir(libraryDir, { withFileTypes: true });
    } catch (e) {
      continue;
    }
    for (const dirent of entries) {
      if (!dirent.isDirectory()) continue;
      const folder = path.join(libraryDir, dirent.name);
      const info = await readJson(path.join(folder, `${dirent.name}.ascendara.json`));
      let hasEmuConfig = false;
      for (const configFile of EMU_CONFIG_FILES) {
        if (await exists(path.join(folder, configFile))) {
          hasEmuConfig = true;
          break;
        }
      }
      games.push({
        kind: "ascendara",
        name: dirent.name,
        folder,
        isRunning: info?.isRunning === true,
        installed: !!info,
        hasEmuConfig,
        hasAchievements: await exists(path.join(folder, "achievements.ascendara.json")),
      });
    }
  }

  if (settings.downloadDirectory) {
    const gamesJsonPath = path.join(settings.downloadDirectory, "games.json");
    const gamesObj = await readJson(gamesJsonPath);
    if (Array.isArray(gamesObj?.games)) {
      for (const g of gamesObj.games) {
        if (g._isDeleted || typeof g.executable !== "string" || !g.executable) continue;
        games.push({
          kind: "custom",
          name: g.game || g.name || path.basename(path.dirname(g.executable)),
          folder: path.dirname(g.executable),
          executable: g.executable,
          gamesJsonPath,
          isRunning: g.isRunning === true,
        });
      }
    }
  }

  gameList = { games, at: Date.now() };
  return games;
}

function appidFromIni(info) {
  let found = null;
  for (const section of Object.values(info || {})) {
    if (!section || typeof section !== "object") continue;
    for (const [key, value] of Object.entries(section)) {
      const id = String(value).trim();
      if (!/^[0-9]+$/.test(id) || id === SPACEWAR_APPID) continue;
      // OnlineFix keeps the real id next to a fake one
      if (key.toLowerCase() === "realappid") return id;
      if (key.toLowerCase() === "appid" && !found) found = id;
    }
  }
  return found;
}

// Emulators read the game's appid from steam_appid.txt (next to steam_api,
// often a few folders deep) or from their ini config at the game root.
async function findAppId(folder) {
  for (const configFile of EMU_CONFIG_FILES) {
    try {
      const id = appidFromIni(
        ini.parse(await fs.readFile(path.join(folder, configFile), "utf8"))
      );
      if (id) return id;
    } catch (e) {}
  }

  let queue = [{ dir: folder, depth: 0 }];
  let visited = 0;
  while (queue.length && visited < APPID_SEARCH_MAX_DIRS) {
    const { dir, depth } = queue.shift();
    visited++;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (e) {
      continue;
    }
    for (const entry of entries) {
      if (entry.isFile() && entry.name.toLowerCase() === "steam_appid.txt") {
        try {
          const id = (await fs.readFile(path.join(dir, entry.name), "utf8")).trim();
          if (/^[0-9]+$/.test(id) && id !== SPACEWAR_APPID) return id;
        } catch (e) {}
      }
    }
    if (depth < APPID_SEARCH_DEPTH) {
      for (const entry of entries) {
        if (entry.isDirectory()) {
          queue.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
        }
      }
    }
  }
  return null;
}

async function getAppId(folder) {
  const cached = appidCache.get(folder);
  if (cached && (cached.appid || Date.now() - cached.checkedAt < APPID_RETRY_MS)) {
    return cached.appid;
  }
  const appid = await findAppId(folder);
  appidCache.set(folder, { appid, checkedAt: Date.now() });
  return appid;
}

async function loadLearned() {
  return (await readJson(learnedFile)) || {};
}

async function learn(appID, game) {
  const learned = await loadLearned();
  learned[appID] = game.executable || game.folder;
  await fs.mkdir(path.dirname(learnedFile), { recursive: true });
  await fs.writeFile(learnedFile, JSON.stringify(learned, null, 2), "utf8");
  console.log(`[Library] Linked appid ${appID} to ${learned[appID]}`);
}

// Finds which game an appid belongs to, so achievements land on the right
// game instead of whichever one happens to be flagged as running.
async function resolveGame(appID, schemaName) {
  appID = String(appID);
  const games = (await listGames()).filter(g => g.kind === "custom" || g.installed);

  for (const game of games) {
    if ((await getAppId(game.folder)) === appID) return game;
  }

  const learned = (await loadLearned())[appID];
  if (learned) {
    const match = games.find(
      g => normalizePath(g.executable || g.folder) === normalizePath(learned)
    );
    if (match) return match;
  }

  const wanted = normalizeName(schemaName);
  const byName = wanted ? games.filter(g => normalizeName(g.name) === wanted) : [];
  if (byName.length === 1) {
    await learn(appID, byName[0]);
    return byName[0];
  }

  const running = games.filter(g => g.isRunning);
  if (running.length === 1) {
    await learn(appID, running[0]);
    return running[0];
  }

  return null;
}

module.exports = {
  libraryDirs,
  listGames,
  getAppId,
  resolveGame,
  normalizePath,
};
