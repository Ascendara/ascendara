const fs = require("fs-extra");
const path = require("path");
const { spawn, execFile } = require("child_process");
const { promisify } = require("util");
const { Worker } = require("worker_threads");
const { app, ipcMain, dialog, BrowserWindow, shell } = require("electron");
const { platforms, launchArguments, resolveAdapter, customArguments } = require("./platforms");
const { scan, mergeScan, normalizeTitle, pathKey } = require("./scanner");
const saves = require("./saves");
const { setPlayingActivity, updateDiscordRPCToLibrary } = require("../discord-rpc");

function registerRetroHandlers() {
  const directory = path.join(app.getPath("userData"), "retro");
  const stateFile = path.join(directory, "library.json");
  const catalogueFile = path.join(directory, "catalogue.json");
  const recoveryDirectory = path.join(directory, "backups");
  fs.ensureDirSync(directory);
  let state = { version: 1, profiles: {}, games: [] }, loadError = null;
  try {
    if (fs.existsSync(stateFile)) state = fs.readJsonSync(stateFile);
    if (state.version !== 1 || !Array.isArray(state.games) || !state.profiles) throw new Error("Invalid library structure");
  } catch (error) { loadError = `Retro library could not be loaded: ${error.message}. Your file is preserved at ${stateFile}.`; }
  let catalogue = { games: [], updatedAt: null }, titleIndex = new Map();
  let job = null, worker = null;
  const running = new Map(), busyProfiles = new Set();
  const persist = () => {
    fs.writeJsonSync(`${stateFile}.tmp`, state);
    fs.renameSync(`${stateFile}.tmp`, stateFile);
  };
  const emit = (event = {}) => {
    for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send("retro-changed", { job, ...event });
  };
  const loadCatalogue = () => {
    if (fs.existsSync(catalogueFile)) catalogue = fs.readJsonSync(catalogueFile);
    titleIndex = new Map();
    for (const game of catalogue.games) {
      for (const name of [game.title, ...(game.aliases || [])]) {
        const key = `${game.platform}:${normalizeTitle(name)}`;
        if (!titleIndex.has(key)) titleIndex.set(key, new Map());
        titleIndex.get(key).set(game.id, game);
      }
    }
  };
  try { loadCatalogue(); } catch (error) { console.warn("[Retro] Catalogue cache could not be loaded", error.message); }
  const matchGames = () => {
    for (const game of state.games) {
      if (game.metadataId || game.manualMetadata) continue;
      const matches = titleIndex.get(`${game.platform}:${normalizeTitle(game.title)}`);
      if (matches?.size === 1) applyMetadata(game, [...matches.values()][0], false);
    }
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
  handle("state", () => ({ ...state, platforms: Object.values(platforms), job, running: [...running.keys()], catalogue: { count: catalogue.games.length, updatedAt: catalogue.updatedAt } }));
  handle("pick", async kind => {
    const folders = ["romFolder", "saveFolder"].includes(kind);
    if (!folders && !["executable", "core", "catalogue", "cover", "backup"].includes(kind)) throw new Error("Unknown selection type");
    const filters = {
      catalogue: [{ name: "LaunchBox metadata", extensions: ["xml", "zip"] }],
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
    state.profiles[id] = { adapter, arguments: input.arguments || "", executable: input.executable || "", core: input.core || "", romFolders: [...new Set(input.romFolders)], saveFolder: input.saveFolder || "", fullscreen: input.fullscreen !== false };
    try { persist(); } catch (error) { if (old) state.profiles[id] = old; else delete state.profiles[id]; throw error; }
    emit();
  });
  handle("scan", async id => {
    requirePlatform(id); requireIdle();
    const profile = state.profiles[id];
    if (!profile?.romFolders?.length) throw new Error("Add a ROM folder in console setup first");
    job = { phase: "scanning", platform: id, inspected: 0 }; emit();
    // The task belongs to the main process and survives navigation away from Retro.
    (async () => {
      try {
        const result = await scan(id, profile.romFolders, progress => { job = { ...progress, platform: id }; emit(); });
        state.games = mergeScan(state.games, result.games, id);
        matchGames(); persist();
        job = null; emit({ message: `Found ${result.games.length} games`, warnings: result.warnings.slice(0, 20) });
      } catch (error) { job = null; emit({ error: error.message }); }
    })();
  });
  handle("catalogue", source => {
    requireIdle();
    if (source && (typeof source !== "string" || !path.isAbsolute(source) || !/\.(xml|zip)$/i.test(source))) throw new Error("Select Metadata.xml or Metadata.zip");
    job = { phase: "catalogue" }; emit();
    worker = new Worker(path.join(__dirname, "catalogue-worker.js"), { workerData: { directory, source: source || null } });
    let finished = false, lastProgress = 0;
    const finish = error => {
      if (finished) return;
      finished = true; worker = null; job = null;
      if (error) emit({ error });
      else {
        try { loadCatalogue(); matchGames(); persist(); emit({ message: `Catalogue ready: ${catalogue.games.length.toLocaleString()} games` }); }
        catch (failure) { emit({ error: failure.message }); }
      }
    };
    worker.on("message", message => {
      if (message.error) finish(message.error);
      else if (message.done) finish();
      else if (message.progress && Date.now() - lastProgress > 300) { lastProgress = Date.now(); job = message.progress; emit(); }
    });
    worker.on("error", error => finish(error.message));
    worker.on("exit", code => { if (!finished) finish(`Catalogue worker stopped (${code})`); });
  });
  handle("search", (id, query) => {
    requirePlatform(id);
    const term = normalizeTitle(String(query || "").slice(0, 200));
    if (!term) return catalogue.games.filter(g => g.platform === id).slice(0, 60);
    return catalogue.games.filter(g => g.platform === id && [g.title, ...(g.aliases || [])].some(n => normalizeTitle(n).includes(term))).slice(0, 60);
  });
  handle("update-game", (id, input) => {
    requireIdle();
    const game = requireGame(id);
    if (input.metadataId) {
      const metadata = catalogue.games.find(g => g.id === String(input.metadataId) && g.platform === game.platform);
      if (!metadata) throw new Error("Catalogue match not found for this console");
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
  handle("website", id => shell.openExternal(requirePlatform(id).website));
  handle("launch", async (id, discIndex = 0) => {
    const game = requireGame(id), profile = state.profiles[game.platform];
    if (!profile?.executable) throw new Error("Select an emulator in console setup first");
    requireClosed(game.platform);
    if (!Number.isInteger(discIndex) || !game.files[discIndex]) throw new Error("Select a valid disc");
    busyProfiles.add(game.platform);
    try {
      await validateFile(profile.executable, "Emulator executable");
      await validateFile(game.files[discIndex], "Game file");
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
  app.on("before-quit", () => { flushSessions(); worker?.terminate(); });

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
}

module.exports = { registerRetroHandlers };
