const fs = require("node:fs");
const path = require("node:path");

const urls = new Map();
let instance = 0;

// Load the application's small ESM modules without changing the Electron package type.
function moduleUrl(filename) {
  if (urls.has(filename)) return urls.get(filename);
  if (filename.endsWith(".json")) {
    const json = `export default ${fs.readFileSync(filename, "utf8")};`;
    urls.set(
      filename,
      `data:text/javascript;base64,${Buffer.from(json).toString("base64")}`
    );
    return urls.get(filename);
  }
  const source = fs
    .readFileSync(filename, "utf8")
    .replace(/\bfrom\s+["'](\.[^"']+)["']/g, (_, relative) => {
      let dependency = path.resolve(path.dirname(filename), relative);
      if (!path.extname(dependency)) dependency += ".js";
      return `from ${JSON.stringify(moduleUrl(dependency))}`;
    });
  const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  urls.set(filename, url);
  return url;
}

exports.loadModule = (filename, { fresh = false } = {}) => {
  const url = moduleUrl(path.resolve(__dirname, "../..", filename));
  return import(fresh ? `${url}#${instance++}` : url);
};
