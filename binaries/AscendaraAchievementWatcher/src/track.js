"use strict";

const path = require("path");
const fs = require("fs").promises;

const appData =
  process.env["APPDATA"] ||
  path.join(process.env.HOME || require("os").homedir(), ".config");
const cache = path.join(appData, "Achievement Watcher/steam_cache/data");

module.exports.load = async appID => {
  try {
    return JSON.parse(await fs.readFile(path.join(cache, `${appID}.db`), "utf8"));
  } catch (err) {
    return [];
  }
};

module.exports.save = async (appID, achievements) => {
  const dir = cache;
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, `${appID}.db`),
    JSON.stringify(achievements, null, null),
    "utf8"
  );
};
