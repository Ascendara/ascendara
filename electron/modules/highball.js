/**
 * Highball Module
 * Runs Windows games on Apple Silicon through the bundled Highball CLI
 * (https://github.com/gauthierpiarrette/highball, GPL-3.0), which manages Wine
 * engines with the DXMT, D3DMetal and DXVK renderers. Engines are downloaded on
 * first use into Ascendara's own Highball home, separate from the Highball app.
 */

const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const { spawn, execFile, execFileSync } = require("child_process");
const { ipcMain, shell } = require("electron");
const { isDev, isMac } = require("./config");
const { getSettingsManager } = require("./settings");

const HIGHBALL_HOME = path.join(
  os.homedir(),
  "Library/Application Support/ascendara/highball"
);
const D3DMETAL_LICENSE = "apple-gptk-license-2023-08-17";
const RENDERERS = ["dxmt", "d3dmetal", "dxvk", "vkd3d", "wined3d"];
const SHARED_BOTTLE = "ascendara";
const MB = 1048576;

let setupPromise = null;
let appleSilicon = null;

// Helpers

function resourceDir() {
  return isDev
    ? path.resolve(__dirname, "../../binaries/Highball/dist")
    : path.join(process.resourcesPath, "Highball");
}

function getBinary() {
  const binary = path.join(resourceDir(), "highball");
  return fs.existsSync(binary) ? binary : null;
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
  return isAppleSilicon() && !!getBinary();
}

function cliEnv(extra = {}) {
  return { ...process.env, ...extra, HIGHBALL_HOME };
}

/**
 * Run the Highball CLI. onLine receives each output line, including the
 * carriage-return progress lines of engine downloads.
 */
function runCli(args, { onLine, timeout = 0 } = {}) {
  const binary = getBinary();
  if (!binary)
    return Promise.reject(new Error("Highball is not bundled with this build."));
  return new Promise((resolve, reject) => {
    const proc = spawn(binary, args, { env: cliEnv() });
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
  };
  if (!status.supported) return status;

  status.rosetta = await hasRosetta();
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
  const manifest = readManifest();
  await runCli(["engine", "accept", manifest.id, D3DMETAL_LICENSE]);
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

function bottleNameFor(gameName) {
  const settings = getSettingsManager().getSettings();
  return settings.highballBottleMode === "per-game"
    ? `ascendara-${sanitizeSlug(gameName)}`
    : SHARED_BOTTLE;
}

function bottlePath(name) {
  return path.join(HIGHBALL_HOME, "bottles", name);
}

/**
 * Prepare everything a launch needs and return the GameHandler arguments.
 * Returns: { binary, bottle, renderer, home, prefix } or { error }
 */
async function buildLaunchConfig(gameName, rendererOverride, onProgress) {
  try {
    let status = await getStatus();
    if (!status.ready) status = await setup({ onProgress });

    const bottle = bottleNameFor(gameName);
    if (bottle !== SHARED_BOTTLE) {
      await ensureBottle(bottle, status.manifestId, onProgress);
      onProgress?.({
        stage: "done",
        message: "Game compatibility is ready.",
        percent: 100,
      });
    }

    const settings = getSettingsManager().getSettings();
    let renderer =
      rendererOverride && rendererOverride !== "auto"
        ? rendererOverride
        : settings.highballRenderer || "auto";
    if (!RENDERERS.includes(renderer)) renderer = "";
    if (renderer === "d3dmetal" && !status.d3dmetalAccepted) {
      console.warn("[Highball] D3DMetal license not accepted; using the bottle default");
      renderer = "";
    }

    return {
      binary: getBinary(),
      bottle,
      renderer,
      home: HIGHBALL_HOME,
      prefix: bottlePath(bottle),
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
  const name = shared ? SHARED_BOTTLE : `ascendara-${sanitizeSlug(gameName)}`;
  if (!fs.existsSync(bottlePath(name))) return { success: true };
  try {
    await runCli(["bottle", "delete", name]);
    return { success: true };
  } catch (error) {
    return { success: false, message: error.message };
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
    const target = gameName ? bottlePath(bottleNameFor(gameName)) : HIGHBALL_HOME;
    await fs.ensureDir(target);
    return shell.openPath(target);
  });
}

module.exports = {
  HIGHBALL_HOME,
  RENDERERS,
  isSupported,
  getStatus,
  setup,
  shouldUseHighball,
  bottleNameFor,
  buildLaunchConfig,
  resetBottle,
  registerHighballHandlers,
};
