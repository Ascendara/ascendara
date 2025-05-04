"use strict";

const path = require("path");
const urlParser = require("url");
const fs = require("fs").promises;
const https = require("https");
const http = require("http");
const { join } = require("path");
const { createWriteStream } = require("fs");

// Simple fetch wrapper for Node.js
async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    lib
      .get(url, res => {
        let data = "";
        res.on("data", chunk => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(err);
          }
        });
      })
      .on("error", reject);
  });
}

const steamLang = require("./steam.json");

async function downloadFile(url, destFolder) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const filename = url.split("/").pop();
    const dest = join(destFolder, filename);
    const file = createWriteStream(dest);
    lib
      .get(url, res => {
        if (res.statusCode !== 200) {
          reject(new Error("Failed to get file: " + res.statusCode));
          return;
        }
        res.pipe(file);
        file.on("finish", () => {
          file.close(() => resolve(dest));
        });
      })
      .on("error", err => {
        file.close();
        reject(err);
      });
  });
}

async function existsAndIsYoungerThan(filePath, { timeUnit = "M", time = 6 }) {
  // timeUnit: 'M' = months, 'd' = days, 'h' = hours, 'm' = minutes, 's' = seconds
  const now = Date.now();
  let msAgo;
  switch (timeUnit) {
    case "M":
      msAgo = time * 30 * 24 * 60 * 60 * 1000;
      break;
    case "d":
      msAgo = time * 24 * 60 * 60 * 1000;
      break;
    case "h":
      msAgo = time * 60 * 60 * 1000;
      break;
    case "m":
      msAgo = time * 60 * 1000;
      break;
    case "s":
      msAgo = time * 1000;
      break;
    default:
      msAgo = time * 1000;
      break;
  }
  try {
    const stats = await fs.stat(filePath);
    return now - stats.mtimeMs < msAgo;
  } catch (err) {
    if (err.code === "ENOENT") return false;
    throw err;
  }
}

module.exports.loadSteamData = async (appID, lang, key) => {
  if (!steamLang.some(language => language.api === lang)) {
    throw "Unsupported API language code";
  }

  const cache = path.join(
    process.env["APPDATA"],
    "Achievement Watcher/steam_cache/schema",
    lang
  );

  try {
    let filePath = path.join(`${cache}`, `${appID}.db`);
    let result;

    if (await existsAndIsYoungerThan(filePath, { timeUnit: "M", time: 6 })) {
      result = JSON.parse(await fs.readFile(filePath));
    } else {
      if (!key) {
        throw new Error("Steam Web API key is required to fetch achievement schema.");
      }
      result = await getSteamData(appID, lang, key);
      // Ensure cache directory exists before writing
      await fs.mkdir(cache, { recursive: true });
      fs.writeFile(filePath, JSON.stringify(result, null, 2)).catch(err => {
        console.log(err);
      });
    }

    return result;
  } catch (err) {
    throw `Could not load Steam data for ${appID} - ${lang}: ${err}`;
  }
};

module.exports.fetchIcon = async (url, appID) => {
  try {
    const cache = path.join(
      process.env["APPDATA"],
      `Achievement Watcher/steam_cache/icon/${appID}`
    );

    const filename = path.parse(urlParser.parse(url).pathname).base;

    let filePath = path.join(cache, filename);

    if (await fs.exists(filePath)) {
      return filePath;
    } else {
      return await downloadFile(url, cache);
    }
  } catch (err) {
    return url;
  }
};

async function getSteamData(appID, lang, key) {
  const url = `https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v0002/?key=${key}&appid=${appID}&l=${lang}&format=json`;

  const data = await fetchJson(url);

  const schema = data.game.availableGameStats;
  if (!(schema && schema.achievements && schema.achievements.length > 0))
    throw "Schema doesn't have any achievement";

  const result = {
    name: await findInAppList(+appID),
    appid: appID,
    binary: null,
    img: {
      header: `https://cdn.akamai.steamstatic.com/steam/apps/${appID}/header.jpg`,
      background: `https://cdn.akamai.steamstatic.com/steam/apps/${appID}/page_bg_generated_v6b.jpg`,
      portrait: `https://cdn.akamai.steamstatic.com/steam/apps/${appID}/library_600x900.jpg`,
      icon: null,
    },
    achievement: {
      total: schema.achievements.length,
      list: schema.achievements,
    },
  };

  return result;
}

async function findInAppList(appID) {
  if (!appID || !(Number.isInteger(appID) && appID > 0)) throw "ERR_INVALID_APPID";

  const cache = path.join(
    process.env["APPDATA"],
    "Achievement Watcher/steam_cache/schema"
  );
  const filepath = path.join(cache, "appList.json");

  try {
    const list = JSON.parse(await fs.readFile(filepath));
    const app = list.find(app => app.appid === appID);
    if (!app) throw "ERR_NAME_NOT_FOUND";
    return app.name;
  } catch {
    const url = "http://api.steampowered.com/ISteamApps/GetAppList/v0002/?format=json";

    const data = await fetchJson(url);

    let list = data.applist.apps;
    list.sort((a, b) => b.appid - a.appid); //recent first

    await fs.writeFile(filepath, JSON.stringify(list, null, 2));

    const app = list.find(app => app.appid === appID);
    if (!app) throw "ERR_NAME_NOT_FOUND";
    return app.name;
  }
}
