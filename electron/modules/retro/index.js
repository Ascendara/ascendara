const fs = require("fs-extra");
const path = require("path");
const { spawn, execFile } = require("child_process");
const { promisify } = require("util");
const axios = require("axios");
const { app, ipcMain, dialog, BrowserWindow, shell } = require("electron");
const { platforms, launchArguments, resolveAdapter, customArguments, extraExtensions } = require("./platforms");
const expanded = require("./expanded-catalogue.json");
const { scan, mergeScan, emptyScanHint, normalizeTitle, pathKey } = require("./scanner");
const saves = require("./saves");
const { identifyEmulator, detectFolders } = require("./detect");
const { setPlayingActivity, updateDiscordRPCToLibrary } = require("../app/discord-rpc");
const { API_URL } = require("../core/config");

// Covers and game info come from LaunchBox's database, kept on the Ascendara API.
// Only the library's games are looked up; the Catalogue tab searches online.
const METADATA_URL = `${API_URL}/retro/metadata`;
const RECHECK_UNMATCHED_MS = 7 * 24 * 60 * 60 * 1000;

// Requests to the metadata API, with the API's own message when it refuses one
// (for example "Retro metadata is not ready yet").
async function metadataRequest(request) {
  try {
    return (await request()).data;
  } catch (error) {
    const message = error.response?.data?.error;
    if (typeof message === "string" && message) throw new Error(message.slice(0, 200));
    if (error.response) throw new Error(`The game info service returned an error (${error.response.status}). Try again later.`);
    throw new Error("Couldn't reach the game info service. Check your internet connection.");
  }
}

function registerRetroHandlers() {
  const directory = path.join(app.getPath("userData"), "retro");
  const stateFile = path.join(directory, "library.json");
  const recoveryDirectory = path.join(directory, "backups");
  fs.ensureDirSync(directory);
  let state = { version: 1, profiles: {}, games: [] }, loadError = null;
  try {
    if (fs.existsSync(stateFile)) state = fs.readJsonSync(stateFile);
    if (state.version !== 1 || !Array.isArray(state.games) || !state.profiles) throw new Error("Invalid library structure");
  } catch (error) { loadError = `Retro library could not be loaded: ${error.message}. Your file is preserved at ${stateFile}.`; }
  let catalogueStatus = { count: 0, updatedAt: null, checkedAt: 0 }, matching = null, matchAgain = false;
  let job = null;
  const running = new Map(), busyProfiles = new Set();
  const persist = () => {
    fs.writeJsonSync(`${stateFile}.tmp`, state);
    fs.renameSync(`${stateFile}.tmp`, stateFile);
  };
  const emit = (event = {}) => {
    for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send("retro-changed", { job, ...event });
  };
  // Older versions downloaded the whole LaunchBox catalogue. Remove it and look
  // every automatically matched game up again from the API.
  for (const file of ["catalogue.json", "catalogue-download.zip"]) {
    const legacy = path.join(directory, file);
    if (!fs.existsSync(legacy)) continue;
    try {
      fs.removeSync(legacy);
      for (const game of state.games) if (!game.manualMetadata) { delete game.metadataId; delete game.metadataCheckedAt; }
      if (!loadError) persist();
    } catch (error) { console.warn("[Retro] Could not remove the old catalogue", error.message); }
  }
  const platformFor = catalogueName => Object.values(platforms).find(p => p.catalogue && p.catalogue === catalogueName)?.id;
  // Looks up covers and info for games that don't have them yet. Games with no
  // match are asked about again after a week, in case LaunchBox adds them.
  const matchGames = () => {
    // A scan can add games while a lookup is out; run once more afterwards.
    if (matching) { matchAgain = true; return matching; }
    matching = (async () => {
      const now = Date.now();
      const pending = state.games.filter(game => !game.metadataId && !game.manualMetadata && platforms[game.platform]?.catalogue && !(now - (game.metadataCheckedAt || 0) < RECHECK_UNMATCHED_MS));
      const byPlatform = new Map();
      for (const game of pending) {
        if (!byPlatform.has(game.platform)) byPlatform.set(game.platform, []);
        byPlatform.get(game.platform).push(game);
      }
      let changed = false;
      for (const [id, games] of byPlatform) {
        for (let start = 0; start < games.length; start += 500) {
          const batch = games.slice(start, start + 500);
          try {
            const data = await metadataRequest(() => axios.post(`${METADATA_URL}/match`, { platform: platforms[id].catalogue, keys: [...new Set(batch.map(game => normalizeTitle(game.title)))] }, { timeout: 30000 }));
            for (const requested of batch) {
              // A scan may have replaced or removed the game while the request was out.
              const game = state.games.find(g => g.id === requested.id);
              if (!game || game.metadataId || game.manualMetadata) continue;
              const metadata = data?.matches?.[normalizeTitle(game.title)];
              if (metadata) applyMetadata(game, metadata, false);
              game.metadataCheckedAt = now;
              changed = true;
            }
          } catch (error) { console.warn(`[Retro] Metadata lookup for ${id} failed:`, error.message); }
        }
      }
      if (changed) { persist(); emit(); }
    })().finally(() => {
      matching = null;
      if (matchAgain) { matchAgain = false; matchGames(); }
    });
    return matching;
  };
  // Checked hourly, or every five minutes while the API isn't answering.
  const refreshCatalogueStatus = async () => {
    if (Date.now() - catalogueStatus.checkedAt < (catalogueStatus.count ? 60 : 5) * 60 * 1000) return;
    catalogueStatus.checkedAt = Date.now();
    try {
      const data = await metadataRequest(() => axios.get(METADATA_URL, { timeout: 15000 }));
      const names = new Set(Object.values(platforms).map(p => p.catalogue).filter(Boolean));
      const count = Object.entries(data?.platforms || {}).reduce((sum, [name, n]) => sum + (names.has(name) ? Number(n) || 0 : 0), 0);
      const becameReady = count > 0 && !catalogueStatus.count;
      catalogueStatus = { count, updatedAt: data?.updatedAt || null, checkedAt: catalogueStatus.checkedAt };
      emit();
      // Games added while the API was unavailable are matched once it answers.
      if (becameReady) matchGames();
    } catch (error) { console.warn("[Retro] Catalogue status unavailable:", error.message); }
  };
  function applyMetadata(game, metadata, manual) {
    Object.assign(game, { metadataId: metadata.id, title: metadata.title, year: metadata.year, genres: metadata.genres, description: metadata.description, developer: metadata.developer, cover: metadata.cover, manualMetadata: manual });
  }
  const requirePlatform = id => { if (!Object.hasOwn(platforms, id)) throw new Error("Unknown Retro console"); return platforms[id]; };
  const requireGame = id => { const game = state.games.find(g => g.id === id); if (!game) throw new Error("Retro game not found"); return game; };
  const requireIdle = () => { if (job) throw new Error("Wait for the current Retro task to finish"); };
  const requireClosed = id => {
    if (busyProfiles.size || [...running.values()].some(s => s.platform === id || pathKey(s.executable) === pathKey(state.profiles[id]?.executable || directory))) throw new Error("Wait for the current task and close the emulator before changing its setup or saves");
  };
  async function checkExternalProcess(executable) {
    if (!executable || process.platform !== "win32") return;
    const basename = path.basename(executable);
    if (!/^[\w .()-]+\.exe$/i.test(basename)) return;
    const { stdout } = await promisify(execFile)("tasklist.exe", ["/FI", `IMAGENAME eq ${basename}`, "/FO", "CSV", "/NH"], { windowsHide: true, timeout: 10000 });
    if (stdout.toLowerCase().includes(`"${basename.toLowerCase()}"`)) throw new Error(`Close ${basename} before continuing so Retro can track the session and protect saves.`);
  }
  async function validateFile(filename, label) {
    if (typeof filename !== "string" || !path.isAbsolute(filename)) throw new Error(`${label} must be an absolute path`);
    if (!(await fs.stat(filename)).isFile()) throw new Error(`${label} is not a file`);
  }
  function handle(channel, callback) {
    ipcMain.handle(`retro-${channel}`, async (_event, ...args) => {
      try { if (loadError) throw new Error(loadError); return { success: true, data: await callback(...args) }; }
      catch (error) { console.warn(`[Retro] ${channel}:`, error.message); return { success: false, error: error.message }; }
    });
  }
  // Other console shows the name the user gave it.
  const platformList = () => Object.values(platforms).map(platform => platform.id === "other" && state.profiles.other?.consoleName ? { ...platform, name: state.profiles.other.consoleName } : platform);
  handle("state", () => {
    refreshCatalogueStatus();
    return { ...state, platforms: platformList(), job, running: [...running.keys()], catalogue: { count: catalogueStatus.count, updatedAt: catalogueStatus.updatedAt } };
  });
  handle("pick", async kind => {
    const folders = ["romFolder", "saveFolder"].includes(kind);
    if (!folders && !["executable", "core", "cover", "backup"].includes(kind)) throw new Error("Unknown selection type");
    const filters = {
      cover: [{ name: "Cover image", extensions: ["png", "jpg", "jpeg", "webp"] }],
      backup: [{ name: "Retro backup", extensions: ["zip"] }],
      core: [{ name: "RetroArch core", extensions: ["dll", "so", "dylib"] }],
    };
    const result = await dialog.showOpenDialog({ title: `Select ${kind.replace(/([A-Z])/g, " $1").toLowerCase()}`, properties: [folders ? "openDirectory" : "openFile"], ...(filters[kind] ? { filters: filters[kind] } : {}) });
    return result.canceled ? null : result.filePaths[0];
  });
  handle("save-profile", async (id, input) => {
    requirePlatform(id); requireIdle(); requireClosed(id);
    if (!input || !Array.isArray(input.romFolders) || input.romFolders.length > 32) throw new Error("Invalid emulator configuration");
    const adapter = resolveAdapter(id, input);
    customArguments(input.arguments);
    const extensions = extraExtensions(input.extensions);
    const consoleName = id === "other" && typeof input.consoleName === "string" ? input.consoleName.trim().slice(0, 40) : "";
    if (input.executable) {
      await validateFile(input.executable, "Emulator executable");
      if (process.platform === "win32" && path.extname(input.executable).toLowerCase() !== ".exe") throw new Error("Select the emulator's .exe file");
    }
    if (adapter === "retroarch" && input.core) await validateFile(input.core, "RetroArch core");
    for (const folder of input.romFolders) {
      if (typeof folder !== "string" || !path.isAbsolute(folder) || !(await fs.stat(folder)).isDirectory()) throw new Error("ROM folder does not exist");
    }
    if (input.saveFolder) await saves.checkRoot(input.saveFolder);
    requireIdle(); requireClosed(id);
    const old = state.profiles[id];
    state.profiles[id] = { adapter, arguments: input.arguments || "", executable: input.executable || "", core: input.core || "", romFolders: [...new Set(input.romFolders)], extensions, ...(consoleName ? { consoleName } : {}), saveFolder: input.saveFolder || "", fullscreen: input.fullscreen !== false };
    try { persist(); } catch (error) { if (old) state.profiles[id] = old; else delete state.profiles[id]; throw error; }
    emit();
  });
  // Scans one console, or several in a row when Add games sets up more than one.
  handle("scan", async ids => {
    const list = Array.isArray(ids) ? [...new Set(ids)] : [ids];
    if (!list.length || list.length > 64) throw new Error("Choose a console to scan");
    for (const id of list) {
      requirePlatform(id);
      if (!state.profiles[id]?.romFolders?.length) throw new Error("Add a ROM folder in console setup first");
    }
    requireIdle();
    job = { phase: "scanning", platform: list[0], inspected: 0 }; emit();
    // The task belongs to the main process and survives navigation away from Retro.
    (async () => {
      let found = 0;
      const warnings = [];
      for (const id of list) {
        const profile = state.profiles[id];
        try {
          const result = await scan(id, profile.romFolders, progress => { job = { ...progress, platform: id }; emit(); }, profile.extensions || []);
          state.games = mergeScan(state.games, result.games, id);
          matchGames(); persist();
          found += result.games.length;
          if (!result.games.length) warnings.push(emptyScanHint(id, result.skipped, profile.consoleName || undefined));
          warnings.push(...result.warnings);
        } catch (error) { warnings.push(`${platforms[id].name}: ${error.message}`); }
      }
      job = null;
      if (found) emit({ message: `Found ${found} games`, warnings: warnings.slice(0, 20) });
      else emit({ warnings: warnings.slice(0, 20) });
    })();
  });
  handle("detect", async roots => {
    if (!Array.isArray(roots) || !roots.length || roots.length > 32) throw new Error("Choose up to 32 folders");
    for (const root of roots) {
      if (typeof root !== "string" || !path.isAbsolute(root) || !(await fs.stat(root)).isDirectory()) throw new Error("Folder does not exist");
    }
    return detectFolders(roots);
  });
  handle("identify-emulator", async executable => {
    await validateFile(executable, "Emulator executable");
    return identifyEmulator(executable);
  });
  handle("search", async (id, query) => {
    const platform = requirePlatform(id);
    if (!platform.catalogue) return [];
    const data = await metadataRequest(() => axios.get(`${METADATA_URL}/search`, { params: { platform: platform.catalogue, q: String(query || "").slice(0, 200) }, timeout: 15000 }));
    return (data?.games || []).map(game => ({ ...game, platform: id }));
  });
  handle("update-game", async (id, input) => {
    requireIdle();
    const game = requireGame(id);
    if (input.metadataId) {
      if (!/^\d{1,20}$/.test(String(input.metadataId))) throw new Error("Catalogue match not found for this console");
      const metadata = await metadataRequest(() => axios.get(`${METADATA_URL}/game/${input.metadataId}`, { timeout: 15000 }));
      if (platformFor(metadata?.platform) !== game.platform) throw new Error("Catalogue match not found for this console");
      applyMetadata(game, metadata, true);
    } else if (input.title !== undefined) {
      if (typeof input.title !== "string" || !input.title.trim() || input.title.length > 250) throw new Error("Enter a game title");
      game.title = input.title.trim(); game.manualMetadata = true;
      game.year = String(input.year || "").slice(0, 4); game.genres = String(input.genres || "").slice(0, 200);
    }
    if (typeof input.favorite === "boolean") game.favorite = input.favorite;
    persist(); emit();
  });
  handle("cover", async (id, filename) => {
    const game = requireGame(id);
    await validateFile(filename, "Cover image");
    const ext = path.extname(filename).toLowerCase();
    if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext) || (await fs.stat(filename)).size > 5 * 1024 ** 2) throw new Error("Select a PNG, JPEG or WebP image under 5 MB");
    game.cover = `data:image/${ext === ".jpg" ? "jpeg" : ext.slice(1)};base64,${(await fs.readFile(filename)).toString("base64")}`;
    persist(); emit();
  });
  handle("remove", id => {
    requireIdle(); if (running.has(id) || busyProfiles.size) throw new Error("Close the game and wait for the current task first");
    requireGame(id); state.games = state.games.filter(g => g.id !== id); persist(); emit();
  });
  handle("reveal", id => shell.showItemInFolder(requireGame(id).files[0]));
  handle("website", (id, emulatorId) => {
    if (!emulatorId) return shell.openExternal(requirePlatform(id).website);
    const entry = [...expanded.emulators, ...expanded.resources].find(item => item.id === emulatorId);
    if (!entry) throw new Error("Unknown Retro resource");
    return shell.openExternal(entry.website);
  });
  handle("launch", async (id, discIndex = 0) => {
    const game = requireGame(id), profile = state.profiles[game.platform];
    if (!profile?.executable) throw new Error("Select an emulator in console setup first");
    requireClosed(game.platform);
    if (!Number.isInteger(discIndex) || !game.files[discIndex]) throw new Error("Select a valid disc");
    busyProfiles.add(game.platform);
    try {
      await validateFile(profile.executable, "Emulator executable");
      try {
        await validateFile(game.files[discIndex], "Game file");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        game.missing = true;
        persist(); emit();
        throw new Error("This game's ROM file is missing. Restore it or update the console's ROM folder and rescan.");
      }
      if (resolveAdapter(game.platform, profile) === "retroarch") await validateFile(profile.core, "RetroArch core");
      for (const file of game.dependencies || []) await validateFile(file, "Referenced disc or track");
      await checkExternalProcess(profile.executable);
      const args = launchArguments(game.platform, profile, game.files[discIndex]);
      const child = spawn(profile.executable, args, { cwd: path.dirname(profile.executable), shell: false, stdio: ["ignore", "ignore", "pipe"], windowsHide: false });
      let errorOutput = "", started = false;
      child.stderr.on("data", chunk => { errorOutput = (errorOutput + chunk.toString()).slice(-3000); });
      child.once("exit", code => {
        const session = running.get(id);
        if (session) {
          game.playTime = (game.playTime || 0) + Math.max(0, Math.floor((Date.now() - session.accountedAt) / 1000));
          running.delete(id);
          updateDiscordRPCToLibrary(`retro:${id}`);
          try { persist(); } catch (error) { emit({ error: `Could not save playtime: ${error.message}` }); }
        }
        if (started) emit(code ? { error: `${path.basename(profile.executable)} exited (${code}). ${errorOutput || "Open the emulator to check BIOS, firmware, and game compatibility."}` } : {});
      });
      await new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("spawn", () => {
          started = true;
          running.set(id, { platform: game.platform, executable: profile.executable, accountedAt: Date.now() });
          setPlayingActivity(game.title, `retro:${id}`);
          game.lastPlayed = new Date().toISOString(); game.launchCount = (game.launchCount || 0) + 1;
          try { persist(); } catch (error) { emit({ error: `Game started, but session could not be saved: ${error.message}` }); }
          emit(); resolve();
        });
      });
    } finally { busyProfiles.delete(game.platform); }
  });
  const flushSessions = () => {
    if (!running.size) return;
    for (const [id, session] of running) {
      const game = requireGame(id), seconds = Math.floor((Date.now() - session.accountedAt) / 1000);
      game.playTime = (game.playTime || 0) + seconds; session.accountedAt += seconds * 1000;
    }
    try { persist(); } catch (error) { console.warn("[Retro] Session save failed", error.message); }
  };
  const timer = setInterval(flushSessions, 30000); timer.unref();
  app.on("before-quit", flushSessions);

  async function withSaves(id, callback) {
    requirePlatform(id); requireClosed(id);
    busyProfiles.add(id);
    try {
      const profile = state.profiles[id];
      await saves.checkRoot(profile?.saveFolder);
      await checkExternalProcess(profile.executable);
      return await callback(profile.saveFolder);
    } finally { busyProfiles.delete(id); }
  }
  handle("backup", (id, cloud = false) => withSaves(id, async root => {
    const bytes = await saves.createBackup(root, id);
    if (cloud) return { bytes, name: `Retro-${id}-${new Date().toISOString().replace(/[:.]/g, "-")}.zip` };
    const selected = await dialog.showSaveDialog({ title: "Save Retro backup", defaultPath: `Retro-${id}-${Date.now()}.zip`, filters: [{ name: "Retro backup", extensions: ["zip"] }] });
    if (selected.canceled) return null;
    await fs.writeFile(selected.filePath, bytes); return { path: selected.filePath };
  }));
  handle("restore", (id, input) => withSaves(id, async root => {
    let bytes;
    if (typeof input === "string") { await validateFile(input, "Backup"); if ((await fs.stat(input)).size > saves.LIMIT) throw new Error("Backup is too large"); bytes = await fs.readFile(input); }
    else { if (!input || input.byteLength > saves.LIMIT) throw new Error("Invalid backup"); bytes = Buffer.from(input); }
    const answer = await dialog.showMessageBox({ type: "warning", buttons: ["Cancel", "Restore saves"], defaultId: 0, cancelId: 0, message: `Restore ${platforms[id].name} saves?`, detail: "Close this emulator on every device first. Files in the backup will replace matching local saves. Shared memory cards can contain several games. A recovery copy will be kept before changes." });
    if (answer.response !== 1) return null;
    return saves.restoreBackup(root, id, bytes, recoveryDirectory);
  }));
  handle("recovery-folder", async () => { await fs.ensureDir(recoveryDirectory); return shell.openPath(recoveryDirectory); });
  handle("cards", id => withSaves(id, async root => {
    if (!["ps1", "ps2"].includes(id)) return [];
    const entries = await fs.readdir(root, { withFileTypes: true });
    const cards = [];
    for (const entry of entries) if (entry.isFile() && /\.(ps2|mcd|mcr)$/i.test(entry.name)) {
      const stat = await fs.stat(path.join(root, entry.name)); cards.push({ name: entry.name, size: stat.size });
    }
    return cards;
  }));
  handle("card-action", (id, original, name, duplicate) => withSaves(id, async root => {
// eslint-disable-next-line no-control-regex -- Reject control characters in external paths.
    if (!["ps1", "ps2"].includes(id) || typeof name !== "string" || !/^[^<>:"/\\|?*\x00-\x1f]+\.(ps2|mcd|mcr)$/i.test(name) || path.basename(original) !== original) throw new Error("Invalid memory card name");
    if (path.extname(name).toLowerCase() !== path.extname(original).toLowerCase()) throw new Error("Keep the original memory card extension");
    const source = await saves.safeTarget(root, original), target = await saves.safeTarget(root, name);
    if (!(await fs.lstat(source)).isFile()) throw new Error("Memory card not found");
    // COPYFILE_EXCL prevents overwriting another card. Renaming keeps a recovery copy.
    await fs.copyFile(source, target, fs.constants.COPYFILE_EXCL);
    if (!duplicate) {
      await fs.ensureDir(recoveryDirectory);
      await fs.copyFile(source, path.join(recoveryDirectory, `${Date.now()}-${original}`), fs.constants.COPYFILE_EXCL);
      await fs.unlink(source);
    }
  }));
  if (!loadError) matchGames();
}

module.exports = { registerRetroHandlers };
