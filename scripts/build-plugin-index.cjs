// Builds plugins/index.json, the official plugin list Ascendara reads from
// GitHub. Every file is pinned by its SHA-256, so the app installs exactly the
// version that was reviewed. Run after adding or updating a plugin:
//   node scripts/build-plugin-index.cjs
// With --check it only reports whether index.json is up to date.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { validateManifest } = require("../electron/modules/app/plugin-manifest");

const root = path.join(__dirname, "..", "plugins");
const indexFile = path.join(root, "index.json");
const MAX_PLUGIN_BYTES = 50 * 1024 * 1024;

function listFiles(folder, prefix = "") {
  return fs
    .readdirSync(folder, { withFileTypes: true })
    .filter(entry => !entry.name.startsWith("."))
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(entry => {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink())
        throw new Error(`${relative}: plugins can't contain links`);
      return entry.isDirectory()
        ? listFiles(path.join(folder, entry.name), relative)
        : [relative];
    });
}

function buildIndex() {
  const plugins = fs
    .readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith("."))
    .map(entry => entry.name)
    .sort()
    .map(id => {
      const folder = path.join(root, id);
      const manifest = validateManifest(
        JSON.parse(fs.readFileSync(path.join(folder, "manifest.json"), "utf8")),
        id
      );
      const files = listFiles(folder).map(file => {
        const bytes = fs.readFileSync(path.join(folder, file));
        return {
          path: file,
          sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
          size: bytes.length,
        };
      });
      for (const required of [manifest.main, manifest.style].filter(Boolean)) {
        if (!files.some(file => file.path === path.posix.normalize(required)))
          throw new Error(`${id}: ${required} is listed in manifest.json but missing`);
      }
      if (files.reduce((sum, file) => sum + file.size, 0) > MAX_PLUGIN_BYTES)
        throw new Error(`${id}: plugin is larger than 50 MB`);
      const listed = { ...manifest, files };
      delete listed.main;
      delete listed.style;
      return listed;
    });
  return `${JSON.stringify({ schema: 1, plugins }, null, 2)}\n`;
}

module.exports = { buildIndex };

if (require.main === module) {
  const index = buildIndex();
  if (process.argv.includes("--check")) {
    const current = fs.existsSync(indexFile) ? fs.readFileSync(indexFile, "utf8") : "";
    if (current !== index) {
      console.error(
        "plugins/index.json is out of date. Run: node scripts/build-plugin-index.cjs"
      );
      process.exit(1);
    }
    console.log("plugins/index.json is up to date");
  } else {
    fs.writeFileSync(indexFile, index);
    console.log(
      `Wrote ${JSON.parse(index).plugins.length} plugins to plugins/index.json`
    );
  }
}
