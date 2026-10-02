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

module.exports = { getGameDirectories };
