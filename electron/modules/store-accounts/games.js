const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { assertStore } = require("./vault");
const { gameUrl } = require("./providers");

function matchesInstallation(store, id, candidate) {
  if (candidate.launcher !== store) return false;
  const localId = String(candidate.launcherId || "");
  return (
    localId === id || (store === "epic" && localId === id.split(":").at(-1))
  );
}

function createStoreGames({
  vault,
  directory,
  discover,
  downloadAssets,
  shell,
  sessions,
}) {
  const artworkJobs = new Map();
  const scans = new Map();
  const queues = Array.from({ length: 4 }, () => Promise.resolve());
  let nextQueue = 0;
  function owned(store, id) {
    assertStore(store);
    if (typeof id !== "string") throw new Error("Invalid store game");
    const game = vault.read(store)?.games.find((item) => item.id === id);
    if (!game)
      throw new Error(
        "This game is no longer in your connected library. Refresh your store accounts.",
      );
    return game;
  }
  async function installed(store, id, fresh = false) {
    let scan = scans.get(store);
    if (fresh || !scan || scan.until < Date.now()) {
      scan = { until: Infinity, result: null };
      scan.result = Promise.resolve().then(() => discover(store)).then(result => {
        scan.until = Date.now() + 15000;
        return result;
      });
      scans.set(store, scan);
    }
    try {
      return (await scan.result).games.find((game) =>
        matchesInstallation(store, id, game),
      );
    } catch {
      if (scans.get(store) === scan) scans.delete(store);
      throw new Error("Could not check installed games. Try again.");
    }
  }
  async function details(store, id) {
    const game = owned(store, id);
    const installation = await installed(store, id);
    return {
      id,
      store,
      name: game.name,
      installed: Boolean(installation),
      running: sessions.isRunning(`${store}:${id}`),
      installationSupported: process.platform === "win32" || store === "steam",
    };
  }
  async function openDirectory(store, id) {
    owned(store, id);
    const installation = await installed(store, id, true);
    if (!installation) throw new Error("This game is not installed on this device.");
    const directory = installation.installPath;
    if (typeof directory !== "string" || !path.isAbsolute(directory) ||
        !(await fs.stat(directory).catch(() => null))?.isDirectory()) {
      throw new Error("The game's installation folder could not be found.");
    }
    const failure = await shell.openPath(directory);
    if (failure) throw new Error(failure);
  }
  async function launchExecutable(store, id, name, installation) {
    const { installPath, executable } = installation;
    if (process.platform !== "win32" || typeof executable !== "string" ||
        typeof installPath !== "string" || !path.isAbsolute(executable)) return false;
    const relative = path.relative(installPath, executable);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return false;
    if (!(await fs.stat(executable).catch(() => null))?.isFile()) return false;
    try {
      await sessions.launch(`${store}:${id}`, name, installation);
      return true;
    } catch {
      // e.g. an exe that requires elevation; the store launcher can still start it
      return false;
    }
  }
  async function artwork(store, id) {
    const game = owned(store, id);
    const hash = crypto
      .createHash("sha256")
      .update(`${store}:${id}`)
      .digest("hex");
    const assetDirectory = path.join(directory, hash);
    const cached = await readArtwork(assetDirectory);
    if (cached.grid && cached.hero && cached.logo) return cached;
    if (!artworkJobs.has(hash)) {
      // Bound downloads without making the entire library wait on one slow game.
      const slot = nextQueue++ % queues.length;
      const task = queues[slot]
        .catch(() => {})
        .then(async () => {
          const options =
            store === "steam" && /^\d+$/.test(id)
              ? {
                  getImageUrls: async () => ({
                    grid: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900.jpg`,
                    hero: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_hero.jpg`,
                    logo: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/logo.png`,
                  }),
                }
              : {};
          await downloadAssets({ game: game.name, assetDirectory }, options);
        });
      queues[slot] = task;
      artworkJobs.set(hash, task);
      task.catch(() => {
        artworkJobs.delete(hash);
      });
    }
    await artworkJobs.get(hash);
    owned(store, id);
    return readArtwork(assetDirectory);
  }
  async function readArtwork(assetDirectory) {
    const result = {};
    for (const type of ["grid", "hero", "logo"]) {
      for (const extension of ["png", "jpg", "jpeg"]) {
        const file = path.join(
          assetDirectory,
          `${type}.ascendara.${extension}`,
        );
        try {
          const stat = await fs.lstat(file);
          if (
            !stat.isFile() ||
            stat.isSymbolicLink() ||
            stat.size > 20 * 1024 * 1024
          )
            continue;
          result[type] =
            `data:image/${extension === "png" ? "png" : "jpeg"};base64,${(await fs.readFile(file)).toString("base64")}`;
          break;
        } catch (error) {
          if (error.code !== "ENOENT")
            throw new Error("Could not read game artwork.");
        }
      }
    }
    return result;
  }
  async function open(store, id, intent = "auto") {
    const game = owned(store, id);
    if (!["auto", "store"].includes(intent))
      throw new Error("Invalid game action");
    const installation =
      intent === "auto" ? await installed(store, id, true) : null;
    if (installation) {
      // Start the game's own executable, like any other library game. The store
      // launcher is only used when discovery could not resolve an executable.
      if (await launchExecutable(store, id, game.name, installation)) {
        return { action: "launch", installed: true };
      }
      const {
        buildLauncherUri,
        validateLauncherUri,
      } = require("../launcher-discovery");
      const uri = buildLauncherUri(store, installation.launcherId);
      if (!uri || !validateLauncherUri(uri, store)) {
        throw new Error(
          "This installation cannot be launched. Open its store launcher to repair it.",
        );
      }
      try {
        await shell.openExternal(uri);
      } catch {
        throw new Error(
          "Could not start the store launcher. Check that it is installed and signed in.",
        );
      }
      return { action: "launch", installed: true };
    }
    // Opening the actual store page is reliable even without a registered desktop
    // protocol. Steam can install directly; other stores expose their library page.
    if (store === "steam" && intent !== "store") {
      try {
        await shell.openExternal(gameUrl(store, id));
        return { action: "install", installed: false };
      } catch {
        /* Use the browser when Steam's protocol is not registered. */
      }
    }
    if (store === "epic") {
      try {
        const appName = id.split(":").at(-1);
        await shell.openExternal(
          intent === "store"
            ? "com.epicgames.launcher://store/library"
            : `com.epicgames.launcher://apps/${encodeURIComponent(appName)}?action=install`,
        );
        return {
          action: intent === "store" ? "store" : "install",
          installed: false,
        };
      } catch {
        /* The store website is the fallback if Epic is not installed. */
      }
    }
    const url =
      store === "steam"
        ? `https://store.steampowered.com/app/${encodeURIComponent(id)}/`
        : store === "gog"
          ? `https://www.gog.com/account/gameDetails/${encodeURIComponent(id)}`
          : "https://store.epicgames.com/";
    try {
      await shell.openExternal(url);
    } catch {
      throw new Error(
        "Could not open the store. Check your default browser and launcher installation.",
      );
    }
    return { action: "store", installed: false };
  }
  return { details, artwork, open, openDirectory };
}
module.exports = { createStoreGames, matchesInstallation };
