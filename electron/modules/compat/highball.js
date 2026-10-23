/**
 * Highball Module
 * Runs Windows games on Apple Silicon through the bundled Highball CLI
 * (https://github.com/gauthierpiarrette/highball, GPL-3.0), which manages Wine
 * engines with the DXMT, D3DMetal and DXVK renderers. Engines are downloaded on
 * first use into Ascendara's own Highball home, separate from the Highball app.
 * People who also use the Highball app can opt into sharing its home instead:
 * no second engine download, games in one of their environments and listed in
 * Highball's library.
 */

const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const { spawn, execFile, execFileSync } = require("child_process");
const { ipcMain, shell } = require("electron");
const { isDev, isMac } = require("../core/config");
const { getSettingsManager } = require("../core/settings");

const HIGHBALL_HOME = path.join(
  os.homedir(),
  "Library/Application Support/ascendara/highball"
);
const D3DMETAL_LICENSE = "apple-gptk-license-2023-08-17";
const RENDERERS = ["dxmt", "d3dmetal", "dxvk", "vkd3d", "wined3d"];
const SHARED_BOTTLE = "ascendara";
const MB = 1048576;
const APP_LOCATIONS = [
  "/Applications/Highball.app",
  path.join(os.homedir(), "Applications/Highball.app"),
];
const COVER_FILES = ["grid.ascendara.jpg", "grid.ascendara.png"];

let setupPromise = null;
let appleSilicon = null;
let appHome = null;
let syncPromise = null;

// Helpers

function resourceDir() {
  return isDev
    ? path.resolve(__dirname, "../../../binaries/Highball/dist")
    : path.join(process.resourcesPath, "Highball");
}

function getBundledBinary() {
  const binary = path.join(resourceDir(), "highball");
  return fs.existsSync(binary) ? binary : null;
}

function getBinary() {
  return usesApp() ? appCli(findApp()) : getBundledBinary();
}

/**
 * True on Apple Silicon, including when Ascendara itself runs under Rosetta
 */
function isAppleSilicon() {
  if (!isMac) return false;
  if (appleSilicon === null) {
    try {
      appleSilicon =
        execFileSync("/usr/sbin/sysctl", ["-n", "hw.optional.arm64"], {
          encoding: "utf8",
        }).trim() === "1";
    } catch {
      appleSilicon = false;
    }
  }
  return appleSilicon;
}

function isSupported() {
  return isAppleSilicon() && (!!getBundledBinary() || usesApp());
}

// The Highball app

function readVersion(appPath) {
  try {
    return execFileSync(
      "/usr/bin/plutil",
      [
        "-extract",
        "CFBundleShortVersionString",
        "raw",
        path.join(appPath, "Contents/Info.plist"),
      ],
      { encoding: "utf8" }
    ).trim();
  } catch {
    return null;
  }
}

function findApp() {
  const appPath = APP_LOCATIONS.find(location => fs.existsSync(location));
  return appPath ? { path: appPath, version: readVersion(appPath) } : null;
}

function bundledVersion() {
  try {
    const source = fs.readFileSync(path.join(resourceDir(), "SOURCE.txt"), "utf8");
    return (source.match(/^Highball v([\d.]+)/) || [])[1] || null;
  } catch {
    return null;
  }
}

/**
 * The CLI that may work on the app's data: the one the app ships, or else the
 * bundled one when it is the very same version. Another version would decode
 * a bottle.json without the fields it doesn't know and save it without them.
 */
function appCli(app) {
  if (!app) return null;
  const shipped = path.join(app.path, "Contents/Resources/tools/highball");
  if (fs.existsSync(shipped)) return shipped;
  return app.version && app.version === bundledVersion() ? getBundledBinary() : null;
}

function getAppInfo() {
  const app = findApp();
  if (!app) return { installed: false };
  return {
    installed: true,
    version: app.version,
    bundledVersion: bundledVersion(),
    compatible: !!appCli(app),
  };
}

function usesApp() {
  if (!isAppleSilicon()) return false;
  if (!getSettingsManager().getSetting("highballUseApp")) return false;
  return !!appCli(findApp());
}

/**
 * The home the app uses, as its CLI reports it, so a home moved with
 * "highball config home" is followed too.
 */
async function resolveAppHome() {
  if (!appHome) {
    const { stdout } = await runCli(["config"], { appDefaultHome: true });
    appHome = (stdout.match(/^home: (.+?) \((?:default|chosen)\)/m) || [])[1];
    if (!appHome) throw new Error("Could not find the Highball app's data folder.");
  }
  return appHome;
}

async function getHome() {
  return usesApp() ? resolveAppHome() : HIGHBALL_HOME;
}

async function cliEnv() {
  return { ...process.env, HIGHBALL_HOME: await getHome() };
}

/**
 * Run the Highball CLI. onLine receives each output line, including the
 * carriage-return progress lines of engine downloads. appDefaultHome runs it
 * without HIGHBALL_HOME, so it reports and uses the app's own home.
 */
async function runCli(args, { onLine, timeout = 0, appDefaultHome = false } = {}) {
  const binary = getBinary();
  if (!binary) throw new Error("Highball is not bundled with this build.");
  const env = appDefaultHome ? { ...process.env } : await cliEnv();
  if (appDefaultHome) delete env.HIGHBALL_HOME;
  return new Promise((resolve, reject) => {
    const proc = spawn(binary, args, { env });
    let stdout = "";
    let stderr = "";
    let pending = "";
    const timer = timeout ? setTimeout(() => proc.kill("SIGTERM"), timeout) : null;
    proc.stdout.on("data", data => {
      const text = data.toString();
      stdout += text;
      if (!onLine) return;
      const lines = (pending + text).split(/\r\n|\r|\n/);
      pending = lines.pop();
      lines.forEach(line => line.trim() && onLine(line));
    });
    proc.stderr.on("data", data => (stderr += data.toString()));
    proc.on("error", error => {
      if (timer) clearTimeout(timer);
      reject(error);
    });
    proc.on("close", code => {
      if (timer) clearTimeout(timer);
      if (onLine && pending.trim()) onLine(pending);
      if (code === 0) return resolve({ stdout, stderr });
      const message =
        (stderr.match(/error: (.+)/) || [])[1] || stderr.trim() || stdout.trim();
      reject(new Error(message || `highball ${args[0]} exited with code ${code}`));
    });
  });
}

function sanitizeSlug(name) {
  return String(name)
    .replace(/[^\w\s\-().]/g, "")
    .replace(/\s+/g, "_")
    .substring(0, 100);
}

function readManifest() {
  return fs.readJsonSync(path.join(resourceDir(), "engine-manifest.json"));
}

// Detection

function hasRosetta() {
  return new Promise(resolve =>
    execFile("/usr/bin/arch", ["-x86_64", "/usr/bin/true"], error => resolve(!error))
  );
}

/**
 * Install Rosetta 2. macOS asks for an administrator password.
 */
function installRosetta() {
  const command = "/usr/sbin/softwareupdate --install-rosetta --agree-to-license";
  return new Promise((resolve, reject) =>
    execFile(
      "/usr/bin/osascript",
      ["-e", `do shell script "${command}" with administrator privileges`],
      { timeout: 15 * 60 * 1000 },
      error =>
        error
          ? reject(new Error("Rosetta 2 was not installed. " + error.message))
          : resolve()
    )
  );
}

/**
 * Installed engines from `highball engine list`:
 * "<id>\t<wine version>\trenderers: dxmt,d3dmetal (licence not accepted),dxvk"
 */
async function listEngines() {
  const { stdout } = await runCli(["engine", "list"]);
  return stdout
    .split("\n")
    .filter(line => line.includes("\trenderers: "))
    .map(line => {
      const [id, wineVersion, rendererField] = line.split("\t");
      const renderers = rendererField
        .replace("renderers: ", "")
        .split(",")
        .map(r => r.trim())
        .filter(Boolean)
        .map(r => ({
          id: r.split(" ")[0],
          available: !r.includes("licence not accepted"),
        }));
      return {
        id,
        wineVersion,
        renderers,
        complete: !line.includes("INCOMPLETE"),
      };
    });
}

async function listBottles() {
  const { stdout } = await runCli(["bottle", "list"]);
  return stdout
    .split("\n")
    .filter(line => line.includes("\tengine="))
    .map(line => {
      const [name, engine, renderer] = line.split("\t");
      return {
        name,
        engine: engine.replace("engine=", ""),
        renderer: renderer.replace("renderer=", ""),
      };
    });
}

async function getStatus() {
  const status = {
    supported: isSupported(),
    appleSilicon: isAppleSilicon(),
    bundled: !!getBinary(),
    rosetta: false,
    engine: null,
    ready: false,
    d3dmetalAccepted: false,
    renderers: [],
    home: HIGHBALL_HOME,
    app: getAppInfo(),
    usingApp: usesApp(),
  };
  if (!status.supported) return status;

  status.rosetta = await hasRosetta();
  if (status.usingApp) return getAppStatus(status);
  const manifest = readManifest();
  status.manifestId = manifest.id;
  status.downloadSize = Object.values(manifest.components).reduce(
    (sum, c) => sum + (c.size || 0),
    0
  );
  try {
    const engines = await listEngines();
    status.engine = engines.find(e => e.id === manifest.id && e.complete) || null;
    if (status.engine) {
      status.renderers = status.engine.renderers;
      status.d3dmetalAccepted = status.engine.renderers.some(
        r => r.id === "d3dmetal" && r.available
      );
    }
    const bottles = await listBottles();
    status.ready =
      status.rosetta &&
      !!status.engine &&
      bottles.some(b => b.name === SHARED_BOTTLE && b.engine === manifest.id);
  } catch (error) {
    status.error = error.message;
  }
  return status;
}

function setEngineStatus(status, engine) {
  status.engine = engine;
  if (!engine) return;
  status.renderers = engine.renderers;
  status.d3dmetalAccepted = engine.renderers.some(
    r => r.id === "d3dmetal" && r.available
  );
}

/**
 * Status when sharing the Highball app's home: ready once the chosen
 * environment exists and its engine is installed.
 */
async function getAppStatus(status) {
  try {
    status.home = await getHome();
    const [engines, bottles] = await Promise.all([listEngines(), listBottles()]);
    const name = bottleNameFor();
    const bottle = bottles.find(b => b.name === name);
    status.bottle = name;
    status.bottles = bottles.map(b => b.name);
    setEngineStatus(
      status,
      engines.find(e => e.complete && e.id === bottle?.engine) ||
        engines.find(e => e.complete) ||
        null
    );
    status.ready =
      status.rosetta && !!bottle && !!status.engine && status.engine.id === bottle.engine;
  } catch (error) {
    status.error = error.message;
  }
  return status;
}

// Setup

/**
 * Create a bottle, or move an existing one onto the current engine.
 */
async function ensureBottle(name, engineId, onProgress) {
  const existing = (await listBottles()).find(b => b.name === name);
  if (!existing) {
    onProgress?.({ stage: "bottle", message: "Preparing the Windows environment..." });
    await runCli(["bottle", "create", name, "--engine", engineId]);
  } else if (existing.engine !== engineId) {
    onProgress?.({ stage: "bottle", message: "Updating the Windows environment..." });
    await runCli(["bottle", "set", name, "engine", engineId]);
  }
}

/**
 * Install Rosetta, the engine and the shared bottle as needed. Concurrent
 * callers share one run. onProgress receives { stage, message, percent }.
 */
function setup({ onProgress, acceptD3DMetal = false } = {}) {
  if (setupPromise) return setupPromise;
  setupPromise = (async () => {
    if (!isSupported()) {
      throw new Error("Highball needs an Apple Silicon Mac.");
    }
    if (!(await hasRosetta())) {
      onProgress?.({
        stage: "rosetta",
        message: "Installing Rosetta 2. Enter your password if macOS asks.",
      });
      await installRosetta();
    }

    // The app installs and updates its engines itself; an environment of the
    // person's own is used as it is, only a missing one is created
    if (usesApp()) {
      const status = await getStatus();
      if (!status.engine) {
        throw new Error("Open the Highball app once to finish its setup.");
      }
      if (!status.bottles?.includes(status.bottle)) {
        await ensureBottle(status.bottle, status.engine.id, onProgress);
      }
      onProgress?.({
        stage: "done",
        message: "Game compatibility is ready.",
        percent: 100,
      });
      return getStatus();
    }

    const manifest = readManifest();
    const engines = await listEngines();
    if (!engines.some(e => e.id === manifest.id && e.complete)) {
      const sizes = Object.fromEntries(
        Object.entries(manifest.components).map(([name, c]) => [name, c.size || 0])
      );
      const total = Object.values(sizes).reduce((a, b) => a + b, 0) || 1;
      const received = {};
      onProgress?.({
        stage: "engine",
        message: "Downloading game compatibility files...",
        percent: 0,
      });
      const args = [
        "engine",
        "install",
        path.join(resourceDir(), "engine-manifest.json"),
      ];
      // An accepted license carries over to engines installed by later Ascendara updates
      if (acceptD3DMetal || getSettingsManager().getSetting("highballD3DMetalAccepted")) {
        args.push("--accept-d3dmetal-license");
      }
      await runCli(args, {
        onLine: line => {
          // "  wine: 136 / 159 MB" while a component downloads
          const match = line.match(/^\s*([\w-]+): (\d+)(?: \/ (\d+))? MB/);
          if (!match || !(match[1] in sizes)) return;
          received[match[1]] = Math.min(
            Number(match[2]) * MB,
            sizes[match[1]] || Infinity
          );
          const done = Object.values(received).reduce((a, b) => a + b, 0);
          onProgress?.({
            stage: "engine",
            message: "Downloading game compatibility files...",
            percent: Math.min(99, Math.round((done / total) * 100)),
            receivedBytes: done,
            totalBytes: total,
          });
        },
      });
    }

    await ensureBottle(SHARED_BOTTLE, manifest.id, onProgress);
    onProgress?.({
      stage: "done",
      message: "Game compatibility is ready.",
      percent: 100,
    });
    return getStatus();
  })().finally(() => {
    setupPromise = null;
  });
  return setupPromise;
}

async function acceptD3DMetalLicense() {
  const engineId = usesApp() ? (await getStatus()).engine?.id : readManifest().id;
  if (!engineId) throw new Error("No Highball engine is installed yet.");
  await runCli(["engine", "accept", engineId, D3DMETAL_LICENSE]);
  getSettingsManager().updateSetting("highballD3DMetalAccepted", true);
  return getStatus();
}

function getD3DMetalLicenseText() {
  try {
    return fs.readFileSync(path.join(resourceDir(), "d3dmetal-license.txt"), "utf8");
  } catch {
    return "";
  }
}

// Launching

/**
 * Whether a Windows game should launch through Highball.
 * The per-game override wins over the global macRunner setting.
 */
function shouldUseHighball(gameRunnerOverride) {
  if (!isSupported()) return false;
  const settings = getSettingsManager().getSettings();
  const runner =
    gameRunnerOverride && gameRunnerOverride !== "auto"
      ? gameRunnerOverride
      : settings.macRunner || "auto";
  return runner !== "wine";
}

/**
 * The bottle a game runs in; without a game, the shared one. With the app's
 * home, the shared one is the environment chosen in Settings.
 */
function bottleNameFor(gameName) {
  const settings = getSettingsManager().getSettings();
  if (gameName && settings.highballBottleMode === "per-game") {
    return `ascendara-${sanitizeSlug(gameName)}`;
  }
  return (usesApp() && settings.highballAppBottle) || SHARED_BOTTLE;
}

function bottlePath(home, name) {
  return path.join(home, "bottles", name);
}

/**
 * Prepare everything a launch needs and return the GameHandler arguments.
 * Returns: { binary, bottle, renderer, home, prefix } or { error }
 */
async function buildLaunchConfig(
  gameName,
  rendererOverride,
  onProgress,
  compatQuery,
  { executable, directory } = {}
) {
  try {
    let status = await getStatus();
    if (!status.ready) status = await setup({ onProgress });

    const bottle = bottleNameFor(gameName);
    if (bottle !== bottleNameFor()) {
      await ensureBottle(bottle, status.engine.id, onProgress);
      onProgress?.({
        stage: "done",
        message: "Game compatibility is ready.",
        percent: 100,
      });
    }

    // With the app's home the game starts as its program there, so the
    // settings made in Highball apply; only a mode chosen for this game in
    // Ascendara is passed on, Highball weighs everything else as for Play
    if (usesApp()) {
      const { program } = await ensureProgram({ game: gameName, executable, directory });
      const renderer =
        rendererOverride && RENDERERS.includes(rendererOverride) ? rendererOverride : "";
      const home = await getHome();
      return {
        binary: getBinary(),
        bottle,
        program,
        renderer,
        rendererSource: renderer ? "game" : "highball",
        launchArgs: [],
        home,
        prefix: bottlePath(home, bottle),
      };
    }

    // The per-game choice, then the global one, then highball-db's recommendation
    const settings = getSettingsManager().getSettings();
    let renderer =
      rendererOverride && rendererOverride !== "auto"
        ? rendererOverride
        : settings.highballRenderer || "auto";
    let rendererSource = "settings";
    let launchArgs = [];
    const compat = await require("./highball-db")
      .lookup(compatQuery || { title: gameName }, { detail: true })
      .catch(() => null);
    if (compat?.kind === "curated") {
      launchArgs = compat.launchArgs || [];
      if (renderer === "auto" && compat.renderer) {
        renderer = compat.renderer;
        rendererSource = "highball-db";
      }
    }
    if (!RENDERERS.includes(renderer)) renderer = "";
    if (renderer === "d3dmetal" && !status.d3dmetalAccepted) {
      console.warn("[Highball] D3DMetal license not accepted; using the bottle default");
      renderer = "";
    }

    const home = await getHome();
    return {
      binary: getBinary(),
      bottle,
      renderer,
      rendererSource,
      launchArgs,
      home,
      prefix: bottlePath(home, bottle),
    };
  } catch (error) {
    return { error: `Game compatibility setup failed: ${error.message}` };
  }
}

/**
 * Delete a game's own bottle, if it has one. The shared bottle is reset only
 * when asked explicitly, since every game uses it; the next launch recreates it.
 */
async function resetBottle(gameName, { shared = false } = {}) {
  // An environment of the Highball app may hold far more than Ascendara's games
  if (shared && usesApp()) {
    return { success: false, message: "Reset this environment in the Highball app." };
  }
  const name = shared ? SHARED_BOTTLE : `ascendara-${sanitizeSlug(gameName)}`;
  try {
    if (!fs.existsSync(bottlePath(await getHome(), name))) return { success: true };
    await runCli(["bottle", "delete", name]);
    return { success: true };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

// Highball library

/**
 * The programs added to a bottle: "name\tpath[\tid=<uuid>][\targs=...]".
 * Highball 0.10.22 and older print no id and can't set covers or remove.
 */
async function listPins(bottle) {
  const { stdout } = await runCli(["pin", "list", bottle]);
  return stdout
    .split("\n")
    .filter(line => line.includes("\t"))
    .map(line => {
      const [name, programPath, ...fields] = line.split("\t");
      const id = fields.find(field => field.startsWith("id="));
      return { name, path: programPath, id: id ? id.slice(3) : null };
    });
}

function findCover(directory) {
  if (!directory) return null;
  const cover = COVER_FILES.map(file => path.join(directory, file)).find(fs.existsSync);
  return cover || null;
}

/**
 * Make sure an installed game is a program in its environment of the Highball
 * app, with Ascendara's grid art as its cover when that Highball version can
 * set one. Returns the environment and the program's name.
 */
async function ensureProgram({ game, executable, directory }) {
  if (!executable || !fs.existsSync(executable)) {
    throw new Error(`Game executable not found: ${executable}`);
  }
  let status = await getStatus();
  if (!status.ready) status = await setup();
  const bottle = bottleNameFor(game);
  if (bottle !== status.bottle) await ensureBottle(bottle, status.engine.id);

  const existing = (await listPins(bottle)).find(
    pin => pin.name.toLowerCase() === game.toLowerCase()
  );
  if (existing) return { bottle, program: existing.name, created: false };

  const { stdout } = await runCli(["pin", "add", bottle, game, executable]);
  const id = (stdout.match(/\tid=([0-9A-F-]+)/i) || [])[1];
  const cover = findCover(directory);
  if (id && cover) {
    await runCli(["pin", "set", bottle, game, "cover", cover]).catch(error =>
      console.warn(`[Highball] Could not set the cover for ${game}:`, error.message)
    );
  }
  return { bottle, program: game, created: true };
}

/**
 * Add an installed game to the Highball app's library. Does nothing unless
 * the app's home is shared.
 */
async function addToLibrary(game) {
  if (!usesApp()) return { success: false, skipped: true };
  try {
    const { bottle } = await ensureProgram(game);
    return { success: true, bottle };
  } catch (error) {
    console.error(`[Highball] Could not add ${game.game} to the library:`, error);
    return { success: false, message: error.message };
  }
}

/**
 * Keep the Highball app's library in step with the installed games: add the
 * missing ones, and take out the ones Ascendara added that are no longer
 * installed. Programs added in Highball itself are never touched.
 * installed: [{ game, executable, directory }]
 */
function syncLibrary(installed) {
  if (syncPromise) return syncPromise;
  syncPromise = (async () => {
    const result = { added: 0, removed: 0, failed: 0 };
    const manager = getSettingsManager();
    if (!usesApp() || manager.getSetting("highballSyncLibrary") === false) return result;
    const owned = new Set(manager.getSetting("highballSyncedGames") || []);
    for (const game of installed) {
      try {
        const { created } = await ensureProgram(game);
        if (created) {
          owned.add(game.game);
          result.added++;
        }
      } catch (error) {
        console.warn(`[Highball] Could not sync ${game.game}:`, error.message);
        result.failed++;
      }
    }
    const names = new Set(installed.map(game => game.game.toLowerCase()));
    for (const name of [...owned]) {
      if (names.has(name.toLowerCase())) continue;
      await removeFromLibrary(name);
      owned.delete(name);
      result.removed++;
    }
    manager.updateSetting("highballSyncedGames", [...owned]);
    return result;
  })().finally(() => {
    syncPromise = null;
  });
  return syncPromise;
}

/**
 * Take an uninstalled game out of the Highball app's library again, where
 * that Highball version can remove programs.
 */
async function removeFromLibrary(game) {
  if (!usesApp()) return;
  try {
    const bottle = bottleNameFor(game);
    const pin = (await listPins(bottle)).find(
      p => p.name.toLowerCase() === game.toLowerCase()
    );
    if (pin?.id) await runCli(["pin", "remove", bottle, pin.name]);
  } catch (error) {
    console.warn(`[Highball] Could not remove ${game} from the library:`, error.message);
  }
}

// IPC Handlers

function registerHighballHandlers() {
  ipcMain.handle("highball-get-status", () => getStatus());

  ipcMain.handle("highball-setup", async (event, options = {}) => {
    try {
      const status = await setup({
        acceptD3DMetal: !!options.acceptD3DMetal,
        onProgress: progress =>
          !event.sender.isDestroyed() &&
          event.sender.send("highball-setup-progress", progress),
      });
      return { success: true, status };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("highball-accept-d3dmetal", async () => {
    try {
      return { success: true, status: await acceptD3DMetalLicense() };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("highball-get-d3dmetal-license", () => getD3DMetalLicenseText());

  ipcMain.handle("highball-reset-bottle", (_, gameName, options) =>
    resetBottle(gameName, options)
  );

  ipcMain.handle("highball-open-bottle", async (_, gameName) => {
    const home = await getHome();
    const target = gameName ? bottlePath(home, bottleNameFor(gameName)) : home;
    await fs.ensureDir(target);
    return shell.openPath(target);
  });
}

module.exports = {
  HIGHBALL_HOME,
  RENDERERS,
  isSupported,
  usesApp,
  addToLibrary,
  removeFromLibrary,
  syncLibrary,
  getStatus,
  setup,
  shouldUseHighball,
  bottleNameFor,
  buildLaunchConfig,
  resetBottle,
  registerHighballHandlers,
};
