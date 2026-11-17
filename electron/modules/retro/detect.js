const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const { platforms } = require("./platforms");
const expanded = require("./expanded-catalogue.json");

const MAX_FILES = 100000;
// Files that sit next to games but are never games themselves.
const IGNORED = new Set(["txt", "nfo", "md", "pdf", "jpg", "jpeg", "png", "gif", "webp", "bmp", "ico", "url", "ini", "cfg", "json", "xml", "log", "sav", "srm", "state", "db", "dat", "sfv", "md5", "sha1", "lnk", "html", "htm", "exe", "dll", "so", "dylib", "ds_store"]);

// Emulator executables, matched by file name. Built-in adapters first, then
// the Ascend presets, then emulators that only work as a custom emulator.
const EMULATORS = [
  [/dolphinxr/, "dolphinxr"],
  [/duckstation/, "duckstation"],
  [/pcsx2/, "pcsx2"],
  [/rpcs3/, "rpcs3"],
  [/ppsspp/, "ppsspp"],
  [/dolphin/, "dolphin"],
  [/retroarch/, "retroarch"],
  [/xemu/, "xemu"],
  [/xenia/, "xenia"],
  [/flycast/, "flycast"],
  [/^gens/, "gens"],
  [/mednafen/, "mednafen"],
  [/melonds/, "melonds"],
  [/desmume/, "desmume"],
  [/azahar|citra|lime3ds/, "azahar"],
  [/cemu/, "cemu"],
  [/eden|yuzu|suyu|citron|sudachi/, "eden"],
  [/fceux/, "fceux"],
  [/ryujinx|ryubing/, "custom", ["switch"]],
];

// RetroArch cores for the consoles Retro runs through RetroArch, best first.
const CORES = {
  nes: ["nestopia", "fceumm", "mesen", "quicknes"],
  snes: ["snes9x", "bsnes", "mesen-s"],
  n64: ["mupen64plus_next", "parallel_n64"],
  gb: ["gambatte", "sameboy", "gearboy", "mgba"],
  gbc: ["gambatte", "sameboy", "gearboy", "mgba"],
  gba: ["mgba", "vbam", "vba_next", "gpsp"],
};

function adapterPlatforms(adapter) {
  const preset = expanded.emulators.find(entry => entry.id === adapter && entry.args);
  if (preset) return preset.platforms;
  return Object.values(platforms).filter(platform => platform.adapter === adapter).map(platform => platform.id);
}

async function findCores(executable) {
  const folders = [path.join(path.dirname(executable), "cores")];
  if (process.platform === "darwin") folders.push(path.join(os.homedir(), "Library", "Application Support", "RetroArch", "cores"));
  if (process.platform === "linux") folders.push(path.join(os.homedir(), ".config", "retroarch", "cores"));
  const cores = {};
  for (const folder of folders) {
    let files;
    try { files = await fs.readdir(folder); } catch { continue; }
    const libraries = files.filter(file => /_libretro\.(dll|so|dylib)$/i.test(file));
    for (const [platform, names] of Object.entries(CORES)) {
      if (cores[platform]) continue;
      for (const name of names) {
        const pick = libraries.find(file => file.toLowerCase().startsWith(`${name}_libretro.`));
        if (pick) { cores[platform] = path.join(folder, pick); break; }
      }
    }
  }
  return cores;
}

/** Which emulator an executable is, from its file name, and the consoles it runs. */
async function identifyEmulator(executable) {
  const name = path.basename(executable, path.extname(executable)).toLowerCase();
  const match = EMULATORS.find(([pattern]) => pattern.test(name));
  if (!match) return { adapter: "custom", platforms: [], cores: {} };
  const [, adapter, only] = match;
  return {
    adapter,
    platforms: only || adapterPlatforms(adapter),
    cores: adapter === "retroarch" ? await findCores(executable) : {},
  };
}

async function readAt(file, position, length) {
  const handle = await fs.open(file, "r");
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, position);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

// Disc images share extensions, but their headers say which console they're for.
// PS1 and PS2 discs share a header, so both come back as "playstation".
async function identifyImage(file) {
  try {
    const header = await readAt(file, 0, 32);
    if (header.length === 32) {
      if (header.readUInt32BE(0x18) === 0x5d1c9ea3) return "wii";
      if (header.readUInt32BE(0x1c) === 0xc2339f3d) return "gamecube";
    }
    const system = (await readAt(file, 0x8008, 32)).toString("latin1").trim();
    if (system.startsWith("PSP GAME")) return "psp";
    if (system.startsWith("PLAYSTATION")) return "playstation";
  } catch { /* Unreadable images stay ambiguous. */ }
  return null;
}

/**
 * Walks folders and groups the files by the console they belong to. Each group
 * has the file types it covers, a file count, the console it was detected as
 * (or null), and the consoles that could read it.
 */
async function detectFolders(roots) {
  const owners = ext => Object.values(platforms).filter(platform => platform.id !== "other" && platform.extensions.includes(ext)).map(platform => platform.id);
  const byPlatform = new Map(), byExtension = new Map(), visited = new Set();
  let inspected = 0, truncated = false;
  const add = (map, key, ext, extra = {}) => {
    const group = map.get(key) || { extensions: new Set(), count: 0, ...extra };
    group.extensions.add(ext);
    group.count++;
    map.set(key, group);
  };
  async function walk(directory, depth) {
    if (depth > 16 || truncated || visited.has(directory)) return;
    visited.add(directory);
    let entries;
    try { entries = await fs.readdir(directory, { withFileTypes: true }); } catch { return; }
    // A CUE sheet's tracks are part of the same game, not games of their own.
    const hasCue = entries.some(entry => entry.isFile() && /\.cue$/i.test(entry.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { await walk(file, depth + 1); continue; }
      if (!entry.isFile()) continue;
      if (++inspected > MAX_FILES) { truncated = true; return; }
      if (entry.name.toUpperCase() === "EBOOT.BIN" && path.basename(directory).toUpperCase() === "USRDIR") {
        add(byPlatform, "ps3", "EBOOT.BIN");
        continue;
      }
      const ext = path.extname(entry.name).slice(1).toLowerCase();
      if (!ext || IGNORED.has(ext) || (hasCue && ["bin", "img"].includes(ext))) continue;
      const candidates = owners(ext);
      const image = ["iso", "gcm"].includes(ext) ? await identifyImage(file) : null;
      const detected = image === "playstation" ? null : image || (candidates.length === 1 ? candidates[0] : null);
      if (detected) add(byPlatform, detected, ext);
      else if (image === "playstation") add(byExtension, "playstation", ext, { candidates: ["ps2", "ps1"] });
      else add(byExtension, ext, ext, { candidates });
    }
  }
  for (const root of roots) await walk(path.resolve(root), 0);
  const groups = [
    ...[...byPlatform].map(([platform, group]) => ({ platform, candidates: [platform], ...group })),
    ...[...byExtension].map(([, group]) => ({ platform: null, ...group })),
  ].map(group => ({ ...group, extensions: [...group.extensions].sort() }));
  return { groups: groups.sort((a, b) => b.count - a.count), inspected: Math.min(inspected, MAX_FILES), truncated };
}

module.exports = { identifyEmulator, detectFolders, identifyImage };
