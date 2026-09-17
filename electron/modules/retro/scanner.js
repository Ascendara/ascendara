const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { platforms } = require("./platforms");

const pathKey = file => process.platform === "win32" ? path.resolve(file).toLowerCase() : path.resolve(file);
const stripDisc = name => name.replace(/\s*[([](?:disc|disk|cd)\s*\d+(?:\s*of\s*\d+)?[)\]]/gi, "").trim();
const cleanTitle = name => stripDisc(name).replace(/\s*\[[^\]]*\]/g, "").replace(/\s*\((?:USA|Europe|Japan|World|Asia|En|Fr|De|Es|It|Rev\b|v\d)[^)]*\)/gi, "").trim();
const normalizeTitle = name => cleanTitle(name).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/,\s*the$/, "").replace(/^the\s+/, "").replace(/[^a-z0-9]/g, "");

function parseSfo(buffer) {
  if (buffer.length < 20 || buffer.readUInt32LE(0) !== 0x46535000) return {};
  const keys = buffer.readUInt32LE(8), data = buffer.readUInt32LE(12);
  const count = Math.min(buffer.readUInt32LE(16), 512), result = {};
  for (let i = 0; i < count; i++) {
    const p = 20 + i * 16;
    if (p + 16 > buffer.length) break;
    const k = keys + buffer.readUInt16LE(p), v = data + buffer.readUInt32LE(p + 12), size = buffer.readUInt32LE(p + 4);
    if (k >= buffer.length || v + size > buffer.length) continue;
    const end = buffer.indexOf(0, k);
    if (end < 0) continue;
    result[buffer.toString("utf8", k, end)] = buffer.toString("utf8", v, v + size).replace(/\0.*$/s, "");
  }
  return result;
}

async function scan(platformId, roots, onProgress = () => {}) {
  const platform = platforms[platformId];
  if (!platform) throw new Error("Unknown console");
  const candidates = new Map(), visited = new Set(), warnings = [];
  let inspected = 0;
  async function walk(directory, depth = 0) {
    if (depth > 64 || visited.has(pathKey(directory))) return;
    visited.add(pathKey(directory));
    let entries;
    try { entries = await fs.readdir(directory, { withFileTypes: true }); }
    catch (error) { warnings.push(`${directory}: ${error.message}`); return; }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { await walk(file, depth + 1); continue; }
      if (!entry.isFile()) continue;
      if (++inspected % 100 === 0) onProgress({ phase: "scanning", inspected, found: candidates.size });
      const ext = path.extname(file).slice(1).toLowerCase();
      if (platformId === "ps3") {
        if (entry.name.toUpperCase() !== "EBOOT.BIN" || path.basename(directory).toUpperCase() !== "USRDIR") continue;
      } else if (!platform.extensions.includes(ext)) continue;
      // Raw GameCube/Wii images carry a platform magic; shared ISO extensions
      // alone are not enough to distinguish the two consoles.
      if (["gamecube", "wii"].includes(platformId) && ["iso", "gcm"].includes(ext)) {
        const handle = await fs.open(file, "r");
        try {
          const header = Buffer.alloc(32);
          const { bytesRead } = await handle.read(header, 0, header.length, 0);
          if (bytesRead === 32) {
            const detected = header.readUInt32BE(0x18) === 0x5d1c9ea3 ? "wii" : header.readUInt32BE(0x1c) === 0xc2339f3d ? "gamecube" : null;
            if (detected && detected !== platformId) continue;
          }
        } finally { await handle.close(); }
      }
      let name = path.basename(file, path.extname(file)), serial = null;
      if (platformId === "ps3") {
        const gameDir = path.dirname(directory);
        name = path.basename(gameDir).toUpperCase() === "PS3_GAME" ? path.basename(path.dirname(gameDir)) : path.basename(gameDir);
        try { const sfo = parseSfo(await fs.readFile(path.join(gameDir, "PARAM.SFO"))); name = sfo.TITLE || name; serial = sfo.TITLE_ID || null; } catch { /* Folder name remains usable. */ }
      } else if (name.toUpperCase() === "EBOOT") name = path.basename(directory);
      candidates.set(pathKey(file), { file, name, serial, ext });
    }
  }
  for (const root of roots) await walk(root);
  // A CUE owns its tracks; a playlist owns its discs. Keep one playable entry.
  const referenced = new Set();
  for (const item of candidates.values()) {
    if (!["cue", "m3u"].includes(item.ext)) continue;
    try {
      const stat = await fs.stat(item.file);
      if (stat.size > 1024 * 1024) throw new Error("Descriptor exceeds 1 MB");
      const text = (await fs.readFile(item.file, "utf8")).replace(/^\uFEFF/, "");
      const refs = item.ext === "cue" ? [...text.matchAll(/^\s*FILE\s+(?:"([^"]+)"|(\S+))/gim)].map(m => m[1] || m[2]) : text.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith("#"));
      item.dependencies = refs.map(ref => path.resolve(path.dirname(item.file), ref));
      for (const ref of item.dependencies) referenced.add(pathKey(ref));
      item.missingDependencies = [];
      for (const ref of item.dependencies) {
        try { await fs.access(ref); } catch { item.missingDependencies.push(ref); }
      }
    } catch (error) { warnings.push(`${item.file}: ${error.message}`); }
  }
  // Include CUE tracks under playlists as dependencies too, and detect cycles.
  const dependenciesOf = (item, seen = new Set()) => {
    const key = pathKey(item.file);
    if (seen.has(key)) return [];
    seen.add(key);
    return (item.dependencies || []).flatMap(file => [file, ...(candidates.has(pathKey(file)) ? dependenciesOf(candidates.get(pathKey(file)), seen) : [])]);
  };
  const groups = new Map();
  for (const item of candidates.values()) {
    if (referenced.has(pathKey(item.file))) continue;
    // Preserve region/revision tags in identity; only strip explicit disc markers.
    const identity = `${platformId}:${pathKey(path.dirname(item.file))}:${stripDisc(item.name).toLowerCase()}`;
    if (!groups.has(identity)) groups.set(identity, { id: crypto.createHash("sha256").update(identity).digest("hex").slice(0, 24), platform: platformId, title: cleanTitle(item.name), sourceName: item.name, serial: item.serial, files: [], dependencies: [], missingDependencies: [] });
    const group = groups.get(identity);
    group.files.push(item.file);
    group.dependencies.push(...dependenciesOf(item));
    group.missingDependencies.push(...(item.missingDependencies || []));
  }
  for (const game of groups.values()) game.files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return { games: [...groups.values()], warnings, inspected };
}

function mergeScan(existing, scanned, platformId) {
  const remaining = new Map(existing.filter(g => g.platform === platformId).map(g => [g.id, g]));
  const merged = existing.filter(g => g.platform !== platformId);
  for (const game of scanned) {
    const relocated = [...remaining.values()].filter(g => stripDisc(g.sourceName || "") === stripDisc(game.sourceName || ""));
    const sameNames = scanned.filter(g => stripDisc(g.sourceName || "") === stripDisc(game.sourceName || ""));
    const old = remaining.get(game.id) || [...remaining.values()].find(g => g.files.some(f => game.files.some(n => pathKey(n) === pathKey(f)))) || (relocated.length === 1 && sameNames.length === 1 ? relocated[0] : null);
    if (old) remaining.delete(old.id);
    merged.push({ ...game, ...old, files: game.files, dependencies: game.dependencies, missingDependencies: game.missingDependencies, missing: false });
  }
  for (const old of remaining.values()) merged.push({ ...old, missing: true });
  return merged;
}

module.exports = { scan, mergeScan, normalizeTitle, cleanTitle, stripDisc, parseSfo, pathKey };
