/**
 * Plugins Module
 * Installs, updates and serves community plugins. A plugin is a folder in
 * userData/plugins with a manifest.json and a script that runs in the renderer
 * with full access to the page. Work the page can't do itself (files,
 * downloads, archives, programs) goes through the "plugins-call" channel,
 * checked against the permissions in the plugin's manifest.
 */

const fs = require("fs-extra");
const path = require("path");
const crypto = require("crypto");
const { spawn, execFile } = require("child_process");
const { pipeline } = require("stream/promises");
const axios = require("axios");
const unzipper = require("unzipper");
const { app, ipcMain, shell, dialog, BrowserWindow } = require("electron");
const { appVersion, isDev } = require("../core/config");
const { getSettingsManager } = require("../core/settings");
const {
  getSelectedGameDirectories,
  getManagedGameDirectory,
} = require("../library/gameDirectories");
const { findGameAppId } = require("../library/gameAppId");
const { searchAchievementFolders } = require("../library/achievementFolderSearch");
const {
  API_VERSION,
  ID_PATTERN,
  PERMISSIONS,
  compareVersions,
  resolveInside,
  validateManifest,
  incompatibility,
} = require("./plugin-manifest");

// The official list lives in the plugins folder of the Ascendara repo, on the
// development branch, where plugin pull requests are merged.
const REGISTRY_URL =
  process.env.ASCENDARA_PLUGIN_REGISTRY ||
  "https://raw.githubusercontent.com/Ascendara/ascendara/development/plugins";
// From source, the list can be read from this checkout instead, so plugins can be
// tried before they're merged. Settings switches between the two.
const LOCAL_REGISTRY =
  isDev && !process.env.ASCENDARA_PLUGIN_REGISTRY
    ? path.join(__dirname, "..", "..", "..", "plugins")
    : null;
let useLocalRegistry = !!LOCAL_REGISTRY;
const REGISTRY_CACHE_MS = 5 * 60 * 1000;
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const MAX_PLUGIN_BYTES = 50 * 1024 * 1024;
const MAX_DOWNLOAD_BYTES = 4 * 1024 ** 3;
const MAX_EXEC_MS = 10 * 60 * 1000;

// `--safe-mode` starts Ascendara with every plugin off, for when one breaks the app.
const safeMode = process.argv.includes("--safe-mode");

const pluginsDirectory = () => path.join(app.getPath("userData"), "plugins");
const dataDirectory = id => path.join(app.getPath("userData"), "plugin-data", id);
const stateFile = () => path.join(pluginsDirectory(), "plugins.json");

let registryCache = null;
// pid -> { pluginId, child }
const processes = new Map();

function readState() {
  try {
    const state = fs.readJsonSync(stateFile());
    return {
      enabled: state?.enabled && typeof state.enabled === "object" ? state.enabled : {},
      sources: state?.sources && typeof state.sources === "object" ? state.sources : {},
    };
  } catch {
    return { enabled: {}, sources: {} };
  }
}

async function writeState(state) {
  await fs.ensureDir(pluginsDirectory());
  await fs.writeJson(`${stateFile()}.tmp`, state, { spaces: 2 });
  await fs.rename(`${stateFile()}.tmp`, stateFile());
}

function requireId(id) {
  if (typeof id !== "string" || !ID_PATTERN.test(id))
    throw new Error("Invalid plugin id");
  return id;
}

async function readManifest(folder, id = path.basename(folder)) {
  let manifest;
  try {
    manifest = await fs.readJson(path.join(folder, "manifest.json"));
  } catch (error) {
    throw new Error(
      error.code === "ENOENT"
        ? "manifest.json is missing"
        : "manifest.json is not valid JSON"
    );
  }
  return validateManifest(manifest, id);
}

async function readSource(folder, relative) {
  const file = resolveInside(folder, relative);
  if (!file) throw new Error(`${relative} must be inside the plugin folder`);
  if ((await fs.stat(file)).size > MAX_SOURCE_BYTES)
    throw new Error(`${relative} is larger than 2 MB`);
  return fs.readFile(file, "utf8");
}

async function listInstalled() {
  await fs.ensureDir(pluginsDirectory());
  const { enabled, sources } = readState();
  const entries = await fs.readdir(pluginsDirectory(), { withFileTypes: true });
  const plugins = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const base = {
      id: entry.name,
      enabled: enabled[entry.name] === true,
      source: sources[entry.name] || "local",
    };
    try {
      const manifest = await readManifest(path.join(pluginsDirectory(), entry.name));
      plugins.push({
        ...manifest,
        ...base,
        incompatible: incompatibility(manifest, appVersion),
      });
    } catch (error) {
      plugins.push({ ...base, name: entry.name, permissions: [], error: error.message });
    }
  }
  return plugins.sort((a, b) => a.name.localeCompare(b.name));
}

// The manifest of an installed, enabled plugin. Plugin calls must pass this.
async function requireActive(id) {
  requireId(id);
  if (safeMode) throw new Error("Plugins are off in safe mode");
  if (!readState().enabled[id]) throw new Error("This plugin is turned off");
  return readManifest(path.join(pluginsDirectory(), id));
}

//=============================================================================
// REGISTRY
//=============================================================================

// Reads a file from the official list as bytes, with a readable error.
async function readRegistryFile(relative, timeout) {
  if (useLocalRegistry) {
    const file = resolveInside(LOCAL_REGISTRY, relative);
    if (!file || !(await fs.pathExists(file)))
      throw new Error(`${relative} isn't in this checkout's plugins folder`);
    return fs.readFile(file);
  }
  try {
    const { data } = await axios.get(
      `${REGISTRY_URL}/${relative.split("/").map(encodeURIComponent).join("/")}`,
      { timeout, responseType: "arraybuffer", maxContentLength: MAX_SOURCE_BYTES * 5 }
    );
    return Buffer.from(data);
  } catch (error) {
    const status = error.response?.status;
    if (status === 404)
      throw new Error(
        relative === "index.json"
          ? "The official plugin list isn't published yet"
          : `${relative} is missing from the official plugin list`
      );
    if (status) throw new Error(`GitHub returned an error (${status}). Try again later.`);
    throw new Error("Couldn't reach GitHub. Check your internet connection.");
  }
}

async function fetchRegistry(force) {
  if (!force && registryCache && Date.now() - registryCache.at < REGISTRY_CACHE_MS)
    return registryCache.index;
  let data;
  try {
    data = JSON.parse(await readRegistryFile("index.json", 15000));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("The plugin list isn't valid JSON");
    throw error;
  }
  if (data?.schema !== 1 || !Array.isArray(data.plugins))
    throw new Error("The plugin list is in a format this version can't read");
  registryCache = { at: Date.now(), index: data };
  return data;
}

async function installFromRegistry(id) {
  requireId(id);
  const index = await fetchRegistry(true);
  const entry = index.plugins.find(plugin => plugin.id === id);
  if (!entry) throw new Error("This plugin is no longer in the plugin list");
  const reason = incompatibility(entry, appVersion);
  if (reason) throw new Error(reason);
  if (!Array.isArray(entry.files) || !entry.files.length)
    throw new Error("The plugin list has no files for this plugin");

  const staging = path.join(pluginsDirectory(), `.staging-${id}`);
  await fs.remove(staging);
  await fs.ensureDir(staging);
  try {
    let total = 0;
    for (const file of entry.files) {
      const target = resolveInside(staging, file.path);
      if (!target) throw new Error(`Unsafe file path in the plugin list: ${file.path}`);
      const bytes = await readRegistryFile(`${id}/${file.path}`, 30000);
      total += bytes.length;
      if (total > MAX_PLUGIN_BYTES) throw new Error("Plugin is larger than 50 MB");
      // The list pins each file, so what installs is exactly what was reviewed.
      if (crypto.createHash("sha256").update(bytes).digest("hex") !== file.sha256)
        throw new Error(
          "A plugin file changed since the list was published. Try again shortly."
        );
      await fs.ensureDir(path.dirname(target));
      await fs.writeFile(target, bytes);
    }
    const manifest = await readManifest(staging, id);
    if (manifest.version !== entry.version)
      throw new Error("The plugin's manifest doesn't match the plugin list");
    await replacePlugin(id, staging);
  } catch (error) {
    await fs.remove(staging);
    throw error;
  }
  const state = readState();
  state.sources[id] = "registry";
  state.enabled[id] = true;
  await writeState(state);
}

async function replacePlugin(id, staging) {
  const target = path.join(pluginsDirectory(), id);
  await fs.remove(target);
  await fs.move(staging, target);
}

// Every file in a plugin folder with its size, for the install prompt.
async function listFolderFiles(folder, prefix = "") {
  const files = [];
  for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const file = path.join(folder, entry.name);
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error("Plugins can't contain links");
    if (entry.isDirectory()) files.push(...(await listFolderFiles(file, relative)));
    else files.push({ path: relative, size: (await fs.stat(file)).size });
  }
  return files;
}

// Folders picked for install, waiting on the user to confirm. Keyed by a token
// so the page can only install a folder the user picked in the dialog.
const pendingFolders = new Map();

async function pickFolder() {
  const result = await dialog.showOpenDialog({
    title: "Select a plugin folder",
    properties: ["openDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const source = result.filePaths[0];
  const manifest = await readManifest(source);
  if (path.resolve(path.dirname(source)) === path.resolve(pluginsDirectory()))
    throw new Error("This plugin is already in the plugins folder");
  if (await fs.pathExists(path.join(pluginsDirectory(), manifest.id)))
    throw new Error(
      `A plugin named "${manifest.id}" is already installed. Uninstall it first.`
    );
  const files = await listFolderFiles(source);
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_PLUGIN_BYTES)
    throw new Error("Plugin is larger than 50 MB");
  const token = crypto.randomUUID();
  pendingFolders.clear();
  pendingFolders.set(token, { source, id: manifest.id });
  return {
    ...manifest,
    token,
    files,
    incompatible: incompatibility(manifest, appVersion),
  };
}

async function installFromFolder(token) {
  const pending = pendingFolders.get(token);
  if (!pending) throw new Error("Pick the plugin folder again");
  pendingFolders.delete(token);
  // Read again, in case the folder changed while the prompt was open.
  const manifest = await readManifest(pending.source);
  if (manifest.id !== pending.id) throw new Error("The plugin folder changed");
  const staging = path.join(pluginsDirectory(), `.staging-${manifest.id}`);
  await fs.remove(staging);
  await fs.copy(pending.source, staging);
  await replacePlugin(manifest.id, staging);
  const state = readState();
  state.sources[manifest.id] = "local";
  state.enabled[manifest.id] = true;
  await writeState(state);
  return manifest;
}

async function uninstall(id) {
  requireId(id);
  for (const [pid, entry] of processes) {
    if (entry.pluginId === id) {
      entry.child.kill();
      processes.delete(pid);
    }
  }
  await fs.remove(path.join(pluginsDirectory(), id));
  await fs.remove(dataDirectory(id));
  const state = readState();
  delete state.enabled[id];
  delete state.sources[id];
  await writeState(state);
}

//=============================================================================
// PLUGIN CALLS
//=============================================================================

function dataPath(id, relative = ".") {
  const root = dataDirectory(id);
  if (relative === "." || relative === "") return root;
  const resolved = resolveInside(root, relative);
  if (!resolved) throw new Error(`"${relative}" is outside the plugin's folder`);
  return resolved;
}

// Programs can be absolute paths, or paths inside the plugin's own folder.
function programPath(id, file) {
  if (typeof file !== "string" || !file) throw new Error("Program path is required");
  return path.isAbsolute(file) ? file : dataPath(id, file);
}

function stringList(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some(item => typeof item !== "string"))
    throw new Error(`${label} must be a list of strings`);
  return value;
}

function sendEvent(sender, event) {
  if (!sender.isDestroyed()) sender.send("plugins-event", event);
}

async function download(sender, id, url, relative, downloadId) {
  if (!/^https:\/\//i.test(String(url))) throw new Error("Downloads must use https://");
  const target = dataPath(id, relative);
  await fs.ensureDir(path.dirname(target));
  const response = await axios.get(url, {
    responseType: "stream",
    timeout: 30000,
    maxRedirects: 10,
  });
  const total = Number(response.headers["content-length"]) || 0;
  if (total > MAX_DOWNLOAD_BYTES) throw new Error("Downloads are limited to 4 GB");
  let received = 0,
    lastReport = 0;
  response.data.on("data", chunk => {
    received += chunk.length;
    if (received > MAX_DOWNLOAD_BYTES)
      response.data.destroy(new Error("Downloads are limited to 4 GB"));
    if (Date.now() - lastReport > 250) {
      lastReport = Date.now();
      sendEvent(sender, {
        pluginId: id,
        type: "download-progress",
        downloadId,
        received,
        total,
      });
    }
  });
  const partial = `${target}.part`;
  await pipeline(response.data, fs.createWriteStream(partial));
  await fs.move(partial, target, { overwrite: true });
  sendEvent(sender, {
    pluginId: id,
    type: "download-progress",
    downloadId,
    received,
    total: received,
  });
  return target;
}

function runTool(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true, timeout: MAX_EXEC_MS }, error =>
      error ? reject(error) : resolve()
    );
  });
}

async function extract(id, archiveRelative, destinationRelative) {
  const archive = dataPath(id, archiveRelative);
  const destination = dataPath(id, destinationRelative);
  await fs.ensureDir(destination);
  if (/\.zip$/i.test(archive)) {
    const directory = await unzipper.Open.file(archive);
    for (const entry of directory.files) {
      const target = resolveInside(destination, entry.path);
      if (!target)
        throw new Error(`Archive entry points outside the folder: ${entry.path}`);
      if (entry.type === "Directory") {
        await fs.ensureDir(target);
        continue;
      }
      await fs.ensureDir(path.dirname(target));
      await pipeline(entry.stream(), fs.createWriteStream(target));
      // Keep executable bits from archives made on macOS and Linux.
      const mode = (entry.externalFileAttributes >>> 16) & 0o777;
      if (mode && process.platform !== "win32") await fs.chmod(target, mode);
    }
    return destination;
  }
  // tar reads .tar.* everywhere, and .7z on Windows 10+ and macOS (libarchive).
  // 7-Zip is the fallback for .7z when it's installed.
  const attempts = [["tar", ["-xf", archive, "-C", destination]]];
  if (/\.7z$/i.test(archive)) {
    for (const command of ["7z", "7zz", "7za", "C:\\Program Files\\7-Zip\\7z.exe"])
      attempts.push([command, ["x", "-y", `-o${destination}`, archive]]);
  }
  let lastError;
  for (const [command, args] of attempts) {
    try {
      await runTool(command, args);
      return destination;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Couldn't extract ${path.basename(archive)}: ${lastError.message}`);
}

async function run(sender, id, file, args, options = {}) {
  const program = programPath(id, file);
  if (!(await fs.stat(program)).isFile()) throw new Error("Program not found");
  const cwd = options.cwd ? programPath(id, options.cwd) : path.dirname(program);
  const child = spawn(program, stringList(args, "Arguments"), {
    cwd,
    shell: false,
    stdio: "ignore",
    windowsHide: false,
  });
  await new Promise((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
  processes.set(child.pid, { pluginId: id, child });
  child.once("exit", code => {
    processes.delete(child.pid);
    sendEvent(sender, { pluginId: id, type: "process-exit", pid: child.pid, code });
  });
  return child.pid;
}

function exec(id, file, args, options = {}) {
  const program = programPath(id, file);
  const timeout = Math.min(Number(options.timeout) || 60000, MAX_EXEC_MS);
  return new Promise(resolve => {
    execFile(
      program,
      stringList(args, "Arguments"),
      {
        cwd: options.cwd ? programPath(id, options.cwd) : path.dirname(program),
        timeout,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) =>
        resolve({
          code: error ? (typeof error.code === "number" ? error.code : 1) : 0,
          stdout: String(stdout),
          stderr: String(
            stderr || (error && typeof error.code !== "number" ? error.message : "")
          ),
        })
    );
  });
}

function gameDirectory(game) {
  if (!game || typeof game !== "object") throw new Error("Pass the game object");
  const name = game.game || game.name;
  if (game.isCustom) {
    const directory = game.launcher
      ? game.installPath
      : path.isAbsolute(game.executable || "")
        ? path.dirname(game.executable)
        : null;
    if (directory && fs.existsSync(directory)) return directory;
    return null;
  }
  const settings = getSettingsManager().getSettings();
  for (const directory of getSelectedGameDirectories(settings, game)) {
    const folder = getManagedGameDirectory(directory, name, game);
    if (fs.existsSync(folder)) return folder;
  }
  return null;
}

// Full path to the game's executable. Library games can store it relative to
// their folder.
function gameExecutable(game) {
  if (!game || typeof game !== "object") throw new Error("Pass the game object");
  const executable = typeof game.executable === "string" ? game.executable : "";
  if (!executable) return null;
  if (path.isAbsolute(executable)) return fs.existsSync(executable) ? executable : null;
  const directory = gameDirectory(game);
  if (!directory) return null;
  const resolved = path.join(directory, executable);
  return fs.existsSync(resolved) ? resolved : null;
}

async function gameAppId(game) {
  if (game && typeof game === "object") {
    const known = String(game.steamAppId || game.appid || "").trim();
    if (/^\d{1,10}$/.test(known)) return known;
  }
  return findGameAppId(gameDirectory(game));
}

// Emulator save folders named after the game's App ID, the same places the
// Achievement Watcher looks.
async function gameSaveFolders(game) {
  const appId = await gameAppId(game);
  if (!appId) return { appId: null, folders: [] };
  let documentsPath;
  try {
    documentsPath = app.getPath("documents");
  } catch {}
  const found = await searchAchievementFolders({
    appId,
    watchedFolders: getSettingsManager().getSettings().watchingFolders,
    documentsPath,
    maxMs: 5000,
  });
  return { appId, folders: found.success ? found.results : [] };
}

// Only folders, so this needs no permission: opening a folder can't run anything.
async function openFolder(target) {
  if (typeof target !== "string" || !path.isAbsolute(target))
    throw new Error("openFolder takes a full folder path");
  const stats = await fs.stat(target).catch(() => null);
  if (!stats?.isDirectory()) throw new Error("Folder not found");
  const error = await shell.openPath(target);
  if (error) throw new Error(error);
}

const calls = {
  "files.read": (_sender, id, relative) => fs.readFile(dataPath(id, relative), "utf8"),
  "files.write": async (_sender, id, relative, text) => {
    if (typeof text !== "string") throw new Error("files.write takes text");
    const file = dataPath(id, relative);
    await fs.ensureDir(path.dirname(file));
    await fs.writeFile(file, text);
  },
  "files.exists": (_sender, id, relative) => fs.pathExists(dataPath(id, relative)),
  "files.list": async (_sender, id, relative = ".") => {
    const folder = dataPath(id, relative);
    if (!(await fs.pathExists(folder))) return [];
    const entries = await fs.readdir(folder, { withFileTypes: true });
    return entries.map(entry => ({ name: entry.name, directory: entry.isDirectory() }));
  },
  "files.remove": (_sender, id, relative) => fs.remove(dataPath(id, relative)),
  "games.directory": (_sender, _id, game) => gameDirectory(game),
  "games.appId": (_sender, _id, game) => gameAppId(game),
  "games.executable": (_sender, _id, game) => gameExecutable(game),
  "games.saveFolders": (_sender, _id, game) => gameSaveFolders(game),
  openFolder: (_sender, _id, target) => openFolder(target),
  download: { permission: "downloads", call: download },
  extract: { permission: "downloads", call: (_sender, ...args) => extract(...args) },
  run: { permission: "processes", call: run },
  exec: { permission: "processes", call: (_sender, ...args) => exec(...args) },
  kill: {
    permission: "processes",
    call: (_sender, id, pid) => {
      const entry = processes.get(pid);
      if (!entry || entry.pluginId !== id)
        throw new Error("Not a process this plugin started");
      entry.child.kill();
    },
  },
  openPath: {
    permission: "processes",
    call: async (_sender, id, target) => {
      const error = await shell.openPath(programPath(id, target));
      if (error) throw new Error(error);
    },
  },
};

//=============================================================================
// IPC
//=============================================================================

function registerPluginHandlers() {
  ipcMain.handle("plugins-list", async () => ({
    safeMode,
    appVersion,
    apiVersion: API_VERSION,
    permissions: PERMISSIONS,
    // "local" or "github" when running from source, so the list can be switched
    registrySource: LOCAL_REGISTRY ? (useLocalRegistry ? "local" : "github") : null,
    plugins: await listInstalled(),
  }));

  ipcMain.handle("plugins-set-registry-source", (_event, source) => {
    if (!LOCAL_REGISTRY) throw new Error("Only available when running from source");
    useLocalRegistry = source === "local";
    registryCache = null;
  });

  ipcMain.handle("plugins-registry", async (_event, force) => {
    const index = await fetchRegistry(force === true);
    const installed = new Map((await listInstalled()).map(plugin => [plugin.id, plugin]));
    return index.plugins
      .filter(plugin => typeof plugin.id === "string" && ID_PATTERN.test(plugin.id))
      .map(({ files, ...plugin }) => {
        const local = installed.get(plugin.id);
        return {
          ...plugin,
          files: Array.isArray(files)
            ? files.map(file => ({ path: file.path, size: file.size }))
            : [],
          installedPermissions: local ? local.permissions || [] : null,
          installedVersion: local?.version || null,
          update: !!local?.version && compareVersions(plugin.version, local.version) > 0,
          incompatible: incompatibility(plugin, appVersion),
        };
      });
  });

  ipcMain.handle("plugins-install", (_event, id) => installFromRegistry(id));
  ipcMain.handle("plugins-pick-folder", () => pickFolder());
  ipcMain.handle("plugins-install-folder", (_event, token) => installFromFolder(token));
  ipcMain.handle("plugins-uninstall", (_event, id) => uninstall(id));

  ipcMain.handle("plugins-set-enabled", async (_event, id, enabled) => {
    requireId(id);
    const state = readState();
    if (enabled) state.enabled[id] = true;
    else delete state.enabled[id];
    await writeState(state);
  });

  // Sources of enabled plugins, for the renderer to run. Nothing in safe mode.
  ipcMain.handle("plugins-sources", async () => {
    if (safeMode) return [];
    const sources = [];
    for (const plugin of await listInstalled()) {
      if (!plugin.enabled) continue;
      if (plugin.error || plugin.incompatible) {
        sources.push({
          id: plugin.id,
          name: plugin.name,
          error: plugin.error || plugin.incompatible,
        });
        continue;
      }
      const folder = path.join(pluginsDirectory(), plugin.id);
      try {
        sources.push({
          id: plugin.id,
          name: plugin.name,
          version: plugin.version,
          permissions: plugin.permissions,
          appVersion,
          platform: process.platform,
          dataPath: dataDirectory(plugin.id),
          settings: plugin.settings || [],
          code: plugin.main ? await readSource(folder, plugin.main) : "",
          style: plugin.style ? await readSource(folder, plugin.style) : "",
        });
      } catch (error) {
        sources.push({ id: plugin.id, name: plugin.name, error: error.message });
      }
    }
    return sources;
  });

  ipcMain.handle("plugins-call", async (event, id, method, ...args) => {
    const manifest = await requireActive(id);
    if (!Object.hasOwn(calls, method)) throw new Error(`Unknown plugin call "${method}"`);
    const entry =
      typeof calls[method] === "function" ? { call: calls[method] } : calls[method];
    if (entry.permission && !manifest.permissions.includes(entry.permission))
      throw new Error(
        `Add "${entry.permission}" to the plugin's permissions to use ${method}`
      );
    return entry.call(event.sender, id, ...args);
  });

  ipcMain.handle("plugins-open-folder", async () => {
    await fs.ensureDir(pluginsDirectory());
    return shell.openPath(pluginsDirectory());
  });

  // Lets every window know when the plugin set changes, so all of them reload.
  ipcMain.handle("plugins-changed", event => {
    for (const window of BrowserWindow.getAllWindows())
      if (!window.isDestroyed() && window.webContents !== event.sender)
        window.webContents.send("plugins-reload");
  });
}

module.exports = { registerPluginHandlers };
