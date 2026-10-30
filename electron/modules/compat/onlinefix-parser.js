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
const SCAN_VERSION = 2;

const stripDllExt = n => n.replace(/\.dll$/i, "");

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

async function parseOnlineFix(gameDir) {
  if (!gameDir || !fs.existsSync(gameDir)) return null;
  let files;
  try {
    files = fs
      .readdirSync(gameDir, { withFileTypes: true })
      .filter(d => d.isFile() && SCAN_PATTERN.test(d.name))
      .map(d => d.name);
  } catch {
    return null;
  }
  if (!files.some(name => MARKER_PATTERN.test(name))) return null;

  const overrides = [];
  const addOverride = (dll, mode = "n") => {
    const key = dll.toLowerCase();
    if (!overrides.some(o => o.startsWith(key + "="))) overrides.push(`${key}=${mode}`);
  };

  let fakeAppId = null,
    realAppId = null,
    fixType = "steam";

  for (const name of files) {
    const lower = name.toLowerCase();

    if (/^(winmm|dlllist)\.txt$/i.test(name)) {
      try {
        for (const raw of fs.readFileSync(path.join(gameDir, name), "utf8").split("\n")) {
          const t = raw.trim();
          if (!t.toLowerCase().endsWith(".dll")) continue;
          addOverride(stripDllExt(path.basename(t.replace(/\\/g, "/"))), "n");
        }
      } catch {}
      continue;
    }

    if (/^(online|steam)fix\.ini$/i.test(name)) {
      const filePath = path.join(gameDir, name);
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
      const newton = path.join(gameDir, "Newtonsoft.Json.dll");
      if (fs.existsSync(path.join(gameDir, "Launcher.exe")) && !fs.existsSync(newton)) {
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
