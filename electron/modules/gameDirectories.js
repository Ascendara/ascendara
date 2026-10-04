const fs = require("fs");
const path = require("path");

// A directory can be configured more than once, including through a junction.
// Scan each physical location once so every consumer receives one set of records.
function getGameDirectories(settings) {
  const seen = new Set();
  return [settings.downloadDirectory, ...(settings.additionalDirectories || [])]
    .filter(Boolean)
    .filter(directory => {
      let resolved = path.resolve(directory);
      try {
        resolved = fs.realpathSync.native(resolved);
      } catch {
        // Missing directories are handled by the caller's normal read logic.
      }
      const identity = process.platform === "win32" ? resolved.toLowerCase() : resolved;
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
}

function getSelectedGameDirectories(settings, installation) {
  const directories = getGameDirectories(settings);
  if (!installation?._sourceDir) return directories;
  const identity = directory => {
    let resolved = path.resolve(directory);
    try { resolved = fs.realpathSync.native(resolved); } catch {}
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  };
  const selected = directories.filter(
    directory => identity(directory) === identity(installation._sourceDir)
  );
  if (!selected.length) throw new Error("Selected library directory is no longer configured");
  return selected;
}

function getManagedGameDirectory(directory, game, installation) {
  const folder = installation?._folderName || game.replace(/[<>:"/\\|?*]/g, "");
  const root = path.resolve(directory);
  const target = path.resolve(root, folder);
  if (!folder || path.dirname(target) !== root || target === root) {
    throw new Error("Invalid game folder");
  }
  return target;
}

module.exports = { getGameDirectories, getSelectedGameDirectories, getManagedGameDirectory };
