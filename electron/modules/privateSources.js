const { app, ipcMain, dialog, safeStorage, shell } = require("electron");
const fs = require("fs-extra");
const path = require("node:path");
const crypto = require("node:crypto");
const core = require("./privateSourceCore");
const { getSettingsManager } = require("./settings");
const { sanitizeGameName } = require("./utils");
const active = new Map();
let chain = Promise.resolve();
const root = () => path.join(app.getPath("userData"), "private-sources");
const serial = fn => { const next = chain.then(fn); chain = next.catch(() => {}); return next; };
async function read() {
  try { return await fs.readJson(path.join(root(), "sources.json")); }
  catch (e) { if (e.code === "ENOENT") return []; throw e; }
}
async function write(sources) {
  await fs.ensureDir(root());
  const file = path.join(root(), "sources.json");
  await fs.writeJson(file + ".tmp", sources, { spaces: 2, mode: 0o600 });
  await fs.rename(file + ".tmp", file);
}
function publicSource(s) {
  const { secret, index, overrides: _overrides, ...safe } = s;
  return { ...safe, hasToken: !!secret, count: index?.games.length || 0 };
}
function token(s) {
  return s.secret ? safeStorage.decryptString(Buffer.from(s.secret, "base64")) : undefined;
}
function find(sources, id) {
  const s = sources.find(s => s.id === id);
  if (!s) throw core.fail("sourceRemoved");
  return s;
}
function entry(s, id) {
  const g = s.index?.games.find(g => g.id === id);
  if (!g) throw core.fail("packageMissing");
  return { ...g, ...s.overrides?.[id] };
}
async function refresh(s) {
  try {
    s.index = s.type === "http" ? await core.fetchIndex(s.location, { token: token(s) })
      : await core.scan(s.location, s.id, s);
    s.index.games = s.index.games.filter(g => !s.ignore?.includes(g.path) &&
      !s.exclude?.some(e => g.path === e || g.path.startsWith(e + "/")));
    s.status = "online"; s.error = null; s.lastRefresh = new Date().toISOString();
  } catch (e) { s.status = "offline"; s.error = e.message; }
  return s;
}
// Cheap reachability probe that never rescans; slow shares count as offline
async function probe(s) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(core.fail("notResponding")); }, 8000);
  });
  const check = async () => {
    if (s.type === "http") {
      const res = await core.request(s.location, { token: token(s), headers: { Range: "bytes=0-0" }, signal: controller.signal });
      res.destroy();
    } else if (!(await fs.stat(s.location)).isDirectory()) throw core.fail("folderUnavailable");
  };
  try { await Promise.race([check(), timeout]); return { status: "online", error: null }; }
  catch (e) { return { status: "offline", error: e.code === "ENOENT" ? core.fail("folderUnavailable").message : e.message }; }
  finally { clearTimeout(timer); }
}
async function steamSearch(title) {
  const data = JSON.parse((await core.fetchBuffer(
    `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(title)}&l=english&cc=US`
  )).toString());
  return core.rankCandidates(title, (data.items || []).filter(c => Number.isSafeInteger(c.id))
    .slice(0, 20).map(c => ({ id: c.id, name: c.name,
      image: `https://cdn.akamai.steamstatic.com/steam/apps/${c.id}/header.jpg` })));
}
async function steamDetails(id) {
  if (!/^\d+$/.test(String(id))) throw core.fail("invalidSteamId");
  const data = JSON.parse((await core.fetchBuffer(
    `https://store.steampowered.com/api/appdetails?appids=${id}&l=english`
  )).toString())[id];
  if (!data?.success) throw core.fail("steamUnavailable");
  const g = data.data;
  return { title: g.name, identifiers: { steam: String(id) }, metadata: {
    description: String(g.short_description || "").replace(/<[^>]*>/g, ""),
    releaseDate: g.release_date?.date, genres: g.genres?.map(v => v.description) || [],
    developer: g.developers?.join(", "), publisher: g.publishers?.join(", "),
    screenshots: (g.screenshots || []).slice(0, 12).map(v => v.path_thumbnail).filter(v => {
      try { const u = core.httpUrl(v); return u.protocol === "https:" && /\.(steamstatic|steamusercontent)\.com$/.test(u.hostname); } catch { return false; }
    }),
  } };
}
async function matchAutomatic(s) {
  if (!s.metadataEnabled || !s.index) return;
  s.overrides ||= {};
  // Limit each refresh to 25 new lookups, preserving successful and negative cached matches.
  let remaining = 25;
  for (const g of s.index.games) {
    if (s.overrides[g.id] || remaining-- <= 0) continue;
    try {
      const candidates = await steamSearch(g.title);
      if (candidates[0]?.confidence === 1 && (candidates[1]?.confidence || 0) < 0.9)
        s.overrides[g.id] = { ...await steamDetails(candidates[0].id), match: "automatic" };
      else s.overrides[g.id] = { match: "needs-review" };
    } catch { break; } // Provider outage must not take the source offline.
  }
}
function catalog(s) {
  return { games: (s.index?.games || []).map(raw => {
    const g = entry(s, raw.id);
    return { game: g.title, name: g.title, gameID: `private-${s.id}-${g.id}`, imgID: null,
      size: `${(g.size / 1024 ** 3).toFixed(2)} GB`, category: g.metadata?.genres || [],
      customSource: s.name, privateSource: { sourceId: s.id, entryId: g.id },
      privateMetadata: g.metadata, privateMatch: g.match, packageType: g.type,
      download_links: { private: [`private:${s.id}:${g.id}`] }, releasedBy: s.name };
  }), metadata: { customSource: true, privateSource: true, source: s.name, games: s.index?.games.length || 0 } };
}
function imageMime(buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "image/png";
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return "image/jpeg";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  throw core.fail("invalidArtwork");
}
async function artwork(s, g, kind = "cover") {
  if (!["cover", "hero"].includes(kind)) throw core.fail("invalidArtworkKind");
  const ref = g.artwork?.[kind];
  const key = crypto.createHash("sha256").update(`${s.id}:${g.id}:${kind}:${ref}:${g.identifiers?.steam}:${g.artRevision || ""}`).digest("hex");
  const file = path.join(root(), "artwork", key);
  let buffer;
  try { buffer = await fs.readFile(file); } catch {
    if (g.uploadedArt) buffer = await fs.readFile(path.join(root(), "artwork", g.uploadedArt));
    else if (ref) {
      if (s.type === "http") buffer = await core.fetchBuffer(core.resolveReference(s.location, ref), { token: token(s) }, 2 * 1024 ** 2);
      else {
        const local = await core.confined(s.location, ref);
        if ((await fs.stat(local)).size > 2 * 1024 ** 2) throw core.fail("artworkTooLarge");
        buffer = await fs.readFile(local);
      }
    } else if (g.identifiers?.steam) buffer = await core.fetchBuffer(
      `https://cdn.akamai.steamstatic.com/steam/apps/${g.identifiers.steam}/header.jpg`, {}, 2 * 1024 ** 2);
    else return null;
    imageMime(buffer);
    await fs.ensureDir(path.dirname(file)); await fs.writeFile(file, buffer);
  }
  return `data:${imageMime(buffer)};base64,${buffer.toString("base64")}`;
}
async function locateDownload(game) {
  const name = sanitizeGameName(game);
  if (name !== game || !name || [".", ".."].includes(name)) return null;
  const settings = getSettingsManager().getSettings();
  for (const dir of [settings.downloadDirectory, ...(settings.additionalDirectories || [])].filter(Boolean)) {
    const file = path.join(dir, name, `${name}.ascendara.json`);
    try {
      const info = await fs.readJson(file);
      if (info.privateSource) return { file, info, dir: path.dirname(file) };
    } catch {}
  }
  return null;
}
async function start(sourceId, entryId, additionalDirIndex = 0, resume) {
  const s = find(await read(), sourceId), g = entry(s, entryId);
  const settings = getSettingsManager().getSettings();
  const base = additionalDirIndex === 0 ? settings.downloadDirectory : settings.additionalDirectories?.[additionalDirIndex - 1];
  if (!resume && !base) throw core.fail("noDownloadFolder");
  const name = resume?.info.game || `${sanitizeGameName(g.title).slice(0, 100) || "Game"} (${s.id.slice(0, 6)}-${crypto.createHash("sha256").update(g.id).digest("hex").slice(0, 6)})`;
  if (active.has(name)) throw core.fail("alreadyDownloading");
  const dir = resume?.dir || path.join(await fs.realpath(base), name);
  if (!resume) await fs.mkdir(dir); // Exclusive creation: never overwrite an existing library game.
  const file = path.join(dir, `${name}.ascendara.json`);
  const destination = path.join(dir, path.posix.basename(g.path));
  const info = resume?.info || { game: name, online: false, dlc: false, isVr: false,
    size: `${(g.size / 1024 ** 3).toFixed(2)} GB`, executable: "",
    privateSource: { sourceId, entryId, title: g.title, path: g.path, size: g.size, sha256: g.sha256 } };
  if (resume && (info.privateSource.path !== g.path || info.privateSource.size !== g.size || info.privateSource.sha256 !== g.sha256))
    throw core.fail("packageChanged");
  const controller = new AbortController();
  info.downloadingData = { downloading: true, progressCompleted: "0", progressDownloadSpeeds: "0 MB/s", ownerPid: process.pid };
  const save = async () => { await fs.writeJson(file + ".tmp", info, { spaces: 2 }); await fs.rename(file + ".tmp", file); };
  await save();
  let last = 0, pendingWrite = Promise.resolve();
  const started = Date.now();
  const job = { controller, promise: null }; active.set(name, job);
  job.promise = (async () => {
    try {
      await core.transfer({ source: s, game: g, destination, token: token(s), signal: controller.signal,
        onProgress(done, total) {
          if (Date.now() - last < 500) return; last = Date.now();
          info.downloadingData.progressCompleted = String(total ? done / total * 100 : 100);
          info.downloadingData.progressDownloadSpeeds = `${(done / 1048576 / Math.max(1, (Date.now() - started) / 1000)).toFixed(2)} MB/s`;
          pendingWrite = pendingWrite.then(save);
        } });
      await pendingWrite;
      info.downloadingData = { downloading: false, pendingManualInstall: true, progressCompleted: "100",
        manualInstallDir: dir, privatePackage: true,
        message: "privateSources.status.packageVerified" };
      info.privateSource.package = path.basename(destination);
    } catch (e) {
      await pendingWrite.catch(() => {});
      info.downloadingData = { downloading: false, stopped: true, progressCompleted: info.downloadingData.progressCompleted,
        message: controller.signal.aborted ? "privateSources.status.transferCancelled" : e.message };
    }
    await save(); active.delete(name);
  })().catch(e => { active.delete(name); console.error("Private transfer state error:", e.message); });
  return { success: true, game: name };
}
async function stop(game) {
  const job = active.get(game);
  if (job) { job.controller.abort(); await job.promise; return true; }
  const target = await locateDownload(game);
  // Let the existing process cancellation handler stop Python extraction.
  return !!target && !target.info.downloadingData?.extracting && !target.info.downloadingData?.verifying;
}
async function resume(game) {
  const target = await locateDownload(game);
  if (!target) return null;
  if (target.info.privateSource.package) throw core.fail("alreadyDownloaded");
  const p = target.info.privateSource;
  return start(p.sourceId, p.entryId, 0, target);
}
function registerPrivateSourceHandlers() {
  ipcMain.handle("private-sources-list", async () => (await read()).map(publicSource));
  ipcMain.handle("private-source-save", (_, input) => serial(async () => {
    const sources = await read();
    const previous = input?.id ? find(sources, input.id) : null;
    if (!input || !["http", "local", "smb"].includes(input.type) || typeof input.location !== "string" || !input.name?.trim())
      throw core.fail("missingFields");
    if (input.type === "http") core.httpUrl(input.location);
    else if (input.type === "smb" && process.platform === "win32") {
      if (!/^\\\\[^\\/]+\\[^\\/]+/.test(input.location) || /^\\\\[?.]\\/.test(input.location)) throw core.fail("invalidUncPath");
    } else if (!path.isAbsolute(input.location)) throw core.fail("relativePath");
    const exclude = input.exclude || [], ignore = input.ignore || [];
    if (!Array.isArray(exclude) || !Array.isArray(ignore) || exclude.length + ignore.length > 1000) throw core.fail("invalidExclusions");
    [...exclude, ...ignore].forEach(core.relativePath);
    const s = { ...previous, id: previous?.id || crypto.randomUUID(), name: input.name.trim().slice(0, 100),
      type: input.type, location: input.location, exclude, ignore, metadataEnabled: input.metadataEnabled === true };
    if (previous && (s.location !== previous.location || s.type !== previous.type)) {
      delete s.index; delete s.overrides; delete s.secret;
    }
    if (input.token) {
      if (s.type !== "http" || !safeStorage.isEncryptionAvailable() || safeStorage.getSelectedStorageBackend?.() === "basic_text")
        throw core.fail("secureStorageUnavailable");
      if (input.token.length > 4096 || /[\r\n]/.test(input.token)) throw core.fail("invalidToken");
      s.secret = safeStorage.encryptString(input.token).toString("base64");
    }
    if (input.clearToken) delete s.secret;
    await refresh(s); await matchAutomatic(s);
    await write([...sources.filter(v => v.id !== s.id), s]); return publicSource(s);
  }));
  ipcMain.handle("private-source-refresh", (_, id) => serial(async () => {
    const sources = await read(), s = find(sources, id); await refresh(s); await matchAutomatic(s); await write(sources); return publicSource(s);
  }));
  // Probes run outside the queue so a dead share can't stall saves and refreshes
  ipcMain.handle("private-sources-check", async () => {
    const results = new Map(await Promise.all((await read()).map(async s => [s.id, await probe(s)])));
    return serial(async () => {
      const sources = await read();
      for (const s of sources) Object.assign(s, results.get(s.id));
      await write(sources); return sources.map(publicSource);
    });
  });
  ipcMain.handle("private-source-remove", (_, id) => serial(async () => {
    await write((await read()).filter(s => s.id !== id)); return true;
  }));
  ipcMain.handle("private-source-catalog", async (_, id) => catalog(find(await read(), id)));
  ipcMain.handle("private-source-artwork", async (_, id, game, kind) => {
    const s = find(await read(), id); try { return await artwork(s, entry(s, game), kind); } catch { return null; }
  });
  ipcMain.handle("private-source-search", async (_, title) => {
    if (typeof title !== "string" || title.length > 300) throw core.fail("invalidSearch");
    return steamSearch(title);
  });
  ipcMain.handle("private-source-match", (_, id, game, override) => serial(async () => {
    const sources = await read(), s = find(sources, id); entry(s, game);
    const update = override.steamId ? await steamDetails(override.steamId) : {};
    if (typeof override.title === "string" && override.title.trim()) update.title = override.title.trim().slice(0, 300);
    if (typeof override.description === "string") update.metadata = { ...(update.metadata || entry(s, game).metadata), description: override.description.slice(0, 20000) };
    s.overrides ||= {}; s.overrides[game] = { ...s.overrides[game], ...update, match: "manual" };
    await write(sources); return catalog(s);
  }));
  ipcMain.handle("private-source-upload-art", (_, id, game) => serial(async () => {
    const sources = await read(), s = find(sources, id); entry(s, game);
    const choice = await dialog.showOpenDialog({ properties: ["openFile"], filters: [{ name: "Artwork", extensions: ["png", "jpg", "jpeg", "webp"] }] });
    if (choice.canceled) return false;
    if ((await fs.stat(choice.filePaths[0])).size > 2 * 1024 ** 2) throw core.fail("artworkTooLarge");
    const buffer = await fs.readFile(choice.filePaths[0]); imageMime(buffer);
    const key = crypto.randomUUID(); await fs.ensureDir(path.join(root(), "artwork"));
    await fs.writeFile(path.join(root(), "artwork", key), buffer);
    s.overrides ||= {}; s.overrides[game] = { ...s.overrides[game], uploadedArt: key, artRevision: key };
    await write(sources); return true;
  }));
  ipcMain.handle("private-source-folder", async () => {
    const choice = await dialog.showOpenDialog({ properties: ["openDirectory"] }); return choice.canceled ? null : choice.filePaths[0];
  });
  ipcMain.handle("private-source-download", (_, id, game, directory) => start(id, game, directory));
  ipcMain.handle("private-source-open-package", async (_, game) => {
    const target = await locateDownload(game);
    if (!target?.info.privateSource.package) throw core.fail("packageNotReady");
    const file = await core.confined(target.dir, target.info.privateSource.package);
    shell.showItemInFolder(file); return true;
  });
  ipcMain.handle("private-source-import-game", async (_, game, labels = {}) => {
    const target = await locateDownload(game);
    if (!target?.info.downloadingData?.pendingManualInstall || active.has(game)) throw core.fail("packageNotReady");
    const choice = await dialog.showOpenDialog({ title: labels.pickTitle, defaultPath: target.dir, properties: ["openFile"] });
    if (choice.canceled) return false;
    const relative = path.relative(target.dir, choice.filePaths[0]).split(path.sep).join("/");
    const selected = await core.confined(target.dir, relative);
    if (!((await fs.stat(selected)).isFile()) || /\.(iso|zip|7z|rar|json|txt)$/i.test(selected) ||
        selected === path.join(target.dir, target.info.privateSource.package))
      throw core.fail("executableOutsideLibrary");
    if (process.platform === "win32" && !/\.exe$/i.test(selected)) throw core.fail("windowsExecutableRequired");
    const answer = await dialog.showMessageBox({ type: "warning", buttons: [labels.cancel, labels.confirm], defaultId: 0, cancelId: 0,
      message: labels.message, detail: `${selected}\n${labels.detail}` });
    if (answer.response !== 1) return false;
    target.info.executable = selected; delete target.info.downloadingData;
    await fs.writeJson(target.file + ".tmp", target.info, { spaces: 2 }); await fs.rename(target.file + ".tmp", target.file);
    return true;
  });
  ipcMain.handle("private-source-export", async (_, id, labels = {}) => {
    const s = find(await read(), id);
    if (!s.index) throw core.fail("rescanFirst");
    const choice = await dialog.showSaveDialog({ defaultPath: "index.json", filters: [{ name: labels.fileType, extensions: ["json"] }] });
    if (choice.canceled) return false;
    await fs.writeJson(choice.filePath, { ...s.index, name: s.name, games: s.index.games.map(g => {
      const v = entry(s, g.id); return { ...g, title: v.title, metadata: v.metadata, identifiers: v.identifiers };
    }) }, { spaces: 2 }); return true;
  });
}
module.exports = { registerPrivateSourceHandlers, start, stop, resume, locateDownload, active };
