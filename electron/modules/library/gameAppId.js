/**
 * Finds the Steam App ID of an installed game from its folder: the one the
 * Achievement Watcher recorded, the emulator's ini at the game root, or a
 * steam_appid.txt next to steam_api (often a few folders deep).
 */

const fs = require("fs-extra");
const path = require("path");

const EMU_CONFIG_FILES = [
  "OnlineFix.ini",
  "ALI213.ini",
  "valve.ini",
  "hlm.ini",
  "ds.ini",
  "steam_api.ini",
  "SteamConfig.ini",
];
const SEARCH_DEPTH = 3;
const SEARCH_MAX_DIRS = 200;
// The placeholder appid emulators ship with
const SPACEWAR_APPID = "480";

// Section -> { key: value }. Emulator configs are simple enough for this.
function parseIni(content) {
  const sections = { "": {} };
  let current = "";
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) continue;
    const section = line.match(/^\[(.+)\]$/);
    if (section) {
      current = section[1];
      sections[current] = sections[current] || {};
      continue;
    }
    const pair = line.match(/^([^=]+)=(.*)$/);
    if (pair) sections[current][pair[1].trim()] = pair[2].trim();
  }
  return sections;
}

const validAppId = value => {
  const id = String(value ?? "").trim();
  return /^\d{1,10}$/.test(id) && id !== SPACEWAR_APPID ? id : null;
};

function appIdFromIni(info) {
  let found = null;
  for (const section of Object.values(info || {})) {
    if (!section || typeof section !== "object") continue;
    for (const [key, value] of Object.entries(section)) {
      const id = validAppId(value);
      if (!id) continue;
      // OnlineFix keeps the real id next to a fake one
      if (key.toLowerCase() === "realappid") return id;
      if (key.toLowerCase() === "appid" && !found) found = id;
    }
  }
  return found;
}

async function findGameAppId(folder) {
  if (!folder) return null;

  try {
    const recorded = await fs.readJson(path.join(folder, "achievements.ascendara.json"));
    const id = validAppId(recorded?.appid);
    if (id) return id;
  } catch {}

  for (const file of EMU_CONFIG_FILES) {
    try {
      const id = appIdFromIni(
        parseIni(await fs.readFile(path.join(folder, file), "utf8"))
      );
      if (id) return id;
    } catch {}
  }

  const queue = [{ dir: folder, depth: 0 }];
  let visited = 0;
  while (queue.length && visited < SEARCH_MAX_DIRS) {
    const { dir, depth } = queue.shift();
    visited++;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isFile() && entry.name.toLowerCase() === "steam_appid.txt") {
        try {
          const id = validAppId(await fs.readFile(path.join(dir, entry.name), "utf8"));
          if (id) return id;
        } catch {}
      }
    }
    if (depth < SEARCH_DEPTH) {
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.isSymbolicLink())
          queue.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
      }
    }
  }
  return null;
}

module.exports = { findGameAppId, appIdFromIni, parseIni };
