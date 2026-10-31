const fs = require("fs-extra");
const path = require("path");

const SCAN_PATTERN =
  /^(emp|custom)\.dll$|^win.*\.dll$|^(online|steam).*\.(dll|ini|json)$|^eos.*\.dll$|^epicfix.*\.dll$|^(winmm|dlllist)\.txt$|^launch_data\.of.*$/i;

// Files that only ship with an Online-Fix / SteamFix / FreeTP / Photon fix.
// steam_api*.dll and EOS SDK DLLs are in plenty of regular games, so they
// only contribute overrides once one of these markers is present.
const MARKER_PATTERN =
  /^online.*\.(dll|ini|json)$|^steamfix.*\.ini$|^epicfix.*\.dll$|^launch_data\.of.*$/i;

// Bump when detection rules change so stored results get rescanned
const SCAN_VERSION = 3;

const MAX_SCAN_DIRS = 16;
const UE_SEARCH_DEPTH = 4;
const SKIP_SCAN_DIR = /^(?:engine|saved|content|node_modules)$/i;

const stripDllExt = n => n.replace(/\.dll$/i, "");

function isInside(root, target) {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

// Unreal games keep the real binary in <Project>/Binaries/<Platform>. The exe
// at the game root is only a bootstrap, so fixes live next to the engine
// binary instead. Walk a bounded part of the tree and collect those folders,
// skipping Engine/Saved/Content so we never pick up third-party Steam DLLs.
function collectUeBinaryDirs(gameDir) {
  const dirs = [];
  const queue = [{ dir: gameDir, depth: 0 }];
  let visited = 0;
  while (queue.length && visited < 4000 && dirs.length < MAX_SCAN_DIRS) {
    const { dir, depth } = queue.shift();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.isSymbolicLink()) continue;
      if (e.name.startsWith(".") || SKIP_SCAN_DIR.test(e.name)) continue;
      const full = path.join(dir, e.name);
      visited += 1;
      if (
        /^(?:Win64|Win32|WinGDK|Linux|Mac)$/i.test(e.name) &&
        path.basename(dir).toLowerCase() === "binaries"
      ) {
        dirs.push(full);
        continue;
      }
      if (depth < UE_SEARCH_DEPTH) queue.push({ dir: full, depth: depth + 1 });
    }
  }
  return dirs;
}

function collectScanDirs(gameDir, { executable, extraScanDirs } = {}) {
  const candidates = [gameDir];
  if (typeof executable === "string" && executable.trim()) {
    const abs = path.isAbsolute(executable)
      ? executable
      : path.resolve(gameDir, executable);
    candidates.push(path.dirname(abs));
  }
  if (Array.isArray(extraScanDirs)) candidates.push(...extraScanDirs);
  candidates.push(...collectUeBinaryDirs(gameDir));

  const seen = new Set();
  const dirs = [];
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate) continue;
    const resolved = path.resolve(candidate);
    if (!isInside(gameDir, resolved)) continue;
    let stat;
    try {
      stat = fs.statSync(resolved);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    const key = resolved.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    dirs.push(resolved);
    if (dirs.length >= MAX_SCAN_DIRS) break;
  }
  return dirs;
}

function parseIni(content) {
  const sections = { Main: {} };
  let current = "Main";
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) continue;
    const sec = line.match(/^\[(.+)\]$/);
    if (sec) {
      current = sec[1];
      sections[current] = sections[current] || {};
      continue;
    }
    const kv = line.match(/^([^=]+)=(.*)$/);
    if (kv) sections[current][kv[1].trim()] = kv[2].trim();
  }
  return sections;
}

function writeIniValue(content, section, key, value) {
  const lines = content.split(/\r?\n/);
  let start = -1,
    end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const sec = lines[i].trim().match(/^\[(.+)\]$/);
    if (!sec) continue;
    if (start !== -1) {
      end = i;
      break;
    }
    if (sec[1] === section) start = i;
  }
  if (start === -1) {
    lines.push("", `[${section}]`, `${key}=${value}`);
    return lines.join("\n");
  }
  for (let i = start + 1; i < end; i++) {
    const m = lines[i].match(/^([^=]+)=/);
    if (m && m[1].trim() === key) {
      lines[i] = `${key}=${value}`;
      return lines.join("\n");
    }
  }
  lines.splice(end, 0, `${key}=${value}`);
  return lines.join("\n");
}

function findRecursive(dir, name, depth = 6) {
  if (depth < 0) return null;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const e of entries) {
    if (e.isFile() && e.name.toLowerCase() === name.toLowerCase())
      return path.join(dir, e.name);
  }
  for (const e of entries) {
    if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules") {
      const found = findRecursive(path.join(dir, e.name), name, depth - 1);
      if (found) return found;
    }
  }
  return null;
}

async function parseOnlineFix(gameDir, options = {}) {
  if (!gameDir || !fs.existsSync(gameDir)) return null;

  const scanDirs = collectScanDirs(gameDir, options);
  const entries = [];
  for (const dir of scanDirs) {
    let dirents;
    try {
      dirents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const d of dirents) {
      if (d.isFile() && SCAN_PATTERN.test(d.name)) entries.push({ dir, name: d.name });
    }
  }

  // A marker can sit in the game root while the actual DLLs live next to the
  // real engine binary (e.g. Unreal's Binaries/Win64), so merge every scanned
  // folder before deciding whether this is an Online-Fix install.
  if (!entries.some(e => MARKER_PATTERN.test(e.name))) return null;

  const overrides = [];
  const addOverride = (dll, mode = "n") => {
    const key = dll.toLowerCase();
    if (!overrides.some(o => o.startsWith(key + "="))) overrides.push(`${key}=${mode}`);
  };

  let fakeAppId = null,
    realAppId = null,
    fixType = "steam";

  for (const { dir, name } of entries) {
    const lower = name.toLowerCase();
    const filePath = path.join(dir, name);

    if (/^(winmm|dlllist)\.txt$/i.test(name)) {
      try {
        for (const raw of fs.readFileSync(filePath, "utf8").split("\n")) {
          const t = raw.trim();
          if (!t.toLowerCase().endsWith(".dll")) continue;
          addOverride(stripDllExt(path.basename(t.replace(/\\/g, "/"))), "n");
        }
      } catch {}
      continue;
    }

    if (/^(online|steam)fix\.ini$/i.test(name)) {
      let content;
      try {
        content = fs.readFileSync(filePath, "utf8");
      } catch {
        continue;
      }
      const ini = parseIni(content);
      realAppId = ini["OnlineFix Linux"]?.RealAppId ?? ini.Main?.RealAppId ?? realAppId;
      fakeAppId = ini.Main?.FakeAppId ?? fakeAppId;
      if (lower === "steamfix.ini" && !ini["OnlineFix Linux"] && fakeAppId) {
        const origReal = ini.Main?.RealAppId || null;
        content = writeIniValue(content, "Main", "RealAppId", fakeAppId);
        if (origReal)
          content = writeIniValue(content, "OnlineFix Linux", "RealAppId", origReal);
        fixType = "freetp";
      }
      if (ini.Misc?.ExtraProtection !== undefined) {
        content = writeIniValue(content, "Misc", "ExtraProtection", "false");
      }
      try {
        fs.writeFileSync(filePath, content, "utf8");
      } catch {}
      continue;
    }

    if (/^launch_data\.of|^onlinefix\.json$/i.test(lower)) {
      fixType = "photon";
      const anchor = fs.existsSync(path.join(dir, "Launcher.exe")) ? dir : gameDir;
      const newton = path.join(anchor, "Newtonsoft.Json.dll");
      if (fs.existsSync(path.join(anchor, "Launcher.exe")) && !fs.existsSync(newton)) {
        const found = findRecursive(gameDir, "Newtonsoft.Json.dll");
        if (found && found !== newton) {
          try {
            fs.symlinkSync(found, newton);
          } catch {
            try {
              fs.copyFileSync(found, newton);
            } catch {}
          }
        } else {
          console.warn("[OnlineFix] Photon launcher sans Newtonsoft.Json.dll");
        }
      }
      continue;
    }

    if (/^eos.*\.dll$/i.test(name)) {
      fixType = "eos";
      addOverride(stripDllExt(name), "n");
      continue;
    }

    if (lower.endsWith(".dll")) {
      addOverride(stripDllExt(name), /^win.*\.dll$/i.test(name) ? "n,b" : "n");
    }
  }

  if (!overrides.length && !fakeAppId) return null;
  return {
    detected: true,
    fixType,
    overrides: overrides.join(";"),
    fakeAppId: fakeAppId || "480",
    realAppId: realAppId || fakeAppId || "480",
    useProtonDirect: true,
    _lastScan: Date.now(),
    _scanVersion: SCAN_VERSION,
  };
}

module.exports = { parseOnlineFix, SCAN_VERSION };
