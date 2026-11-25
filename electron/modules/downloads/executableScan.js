const fs = require("fs");
const path = require("path");

// Installers, redistributables and tools that ship next to a game's executable
const NOT_THE_GAME = [
  "unins",
  "setup",
  "redist",
  "vcredist",
  "directx",
  "dxsetup",
  "quicksfv",
  "checksum",
  "md5",
  "readme",
  "crashreport",
  "crashpad",
];

/** The largest .exe under `root` that isn't an installer or tool, or null. */
function findGameExecutable(root) {
  const candidates = [];
  const walk = dir => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.toLowerCase().endsWith(".exe")) {
        const lower = entry.name.toLowerCase();
        if (NOT_THE_GAME.some(word => lower.includes(word))) continue;
        try {
          candidates.push({ path: fullPath, size: fs.statSync(fullPath).size });
        } catch {}
      }
    }
  };
  walk(root);
  candidates.sort((a, b) => b.size - a.size);
  return candidates[0]?.path || null;
}

/** A repack installer (setup.exe and the like) at the top of `root`, or null. */
function findInstaller(root) {
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }
  const installer = entries.find(
    e => e.isFile() && /^(setup|install(er)?).*\.exe$/i.test(e.name)
  );
  return installer ? path.join(root, installer.name) : null;
}

module.exports = { findGameExecutable, findInstaller };
