#!/usr/bin/env node
// Assembles .electrobun/stage, which electrobun.config.ts copies into the app
// as app/ascendara. Packaged builds get the main-process tree, the built UI,
// the npm packages the main process requires, and the platform helpers.
// Dev builds get a pointer back to this checkout instead.
//
//   node scripts/electrobun/stage-app.cjs --env=dev|canary|stable [--allow-missing]
//     [--resources=<json>]  replace this platform's resource list (built helpers)
//     [--highball=<dir>]    bundle Highball on macOS

const fs = require("node:fs");
const path = require("node:path");
const { builtinModules } = require("node:module");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const STAGE = path.join(ROOT, ".electrobun", "stage");
const args = Object.fromEntries(
  process.argv.slice(2).map(arg => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=");
    return [key, value];
  })
);
const env = args.env || "dev";
const platform = { darwin: "mac", win32: "win", linux: "linux" }[process.platform];

function copy(from, to) {
  fs.cpSync(from, to, { recursive: true, dereference: true, force: true });
}

function stageDev() {
  fs.writeFileSync(path.join(STAGE, "dev-root.json"), `${JSON.stringify({ root: ROOT })}\n`);
}

// Same steps the electron-builder scripts did: the built UI sits next to app.js
// so the local server can serve it from __dirname.
function stageUi(electronDir) {
  const build = path.join(ROOT, "build");
  const indexPath = path.join(build, "index.html");
  if (!fs.existsSync(indexPath)) throw new Error("build/index.html is missing; run `yarn build` first.");
  const index = fs.readFileSync(indexPath, "utf8").replaceAll('"/assets/', '"assets/');
  fs.writeFileSync(path.join(electronDir, "index.html"), index);
  for (const name of ["assets", "sounds", "guide", "icon.png", "no-image.png"]) {
    const source = path.join(build, name);
    if (fs.existsSync(source)) copy(source, path.join(electronDir, name));
  }
}

function mainProcessPackages() {
  const builtins = new Set([...builtinModules, "electron", "original-fs"]);
  const found = new Set();
  const pattern = /(?:require|import)\(\s*["']([^"'./][^"']*)["']\s*\)|from\s+["']([^"'./][^"']*)["']/g;
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(c?js|mjs)$/.test(entry.name)) {
        for (const match of fs.readFileSync(full, "utf8").matchAll(pattern)) {
          const specifier = (match[1] || match[2]).replace(/^node:/, "");
          const name = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0];
          if (!builtins.has(name)) found.add(name);
        }
      }
    }
  };
  walk(path.join(ROOT, "electron"));
  return [...found].sort();
}

// Copies each package the main process needs, plus its runtime dependencies,
// keeping node_modules nesting so resolution matches the checkout.
function stageNodeModules(target) {
  const copied = new Set();
  const findPackage = (name, fromDir) => {
    for (let dir = fromDir; ; dir = path.dirname(dir)) {
      const candidate = path.join(dir, "node_modules", name);
      if (fs.existsSync(path.join(candidate, "package.json"))) return candidate;
      if (dir === ROOT || dir === path.dirname(dir)) return null;
    }
  };
  const visit = (name, fromDir, optional) => {
    const dir = findPackage(name, fromDir);
    if (!dir) {
      if (optional) return;
      throw new Error(`Missing npm package "${name}" (needed from ${path.relative(ROOT, fromDir) || "."})`);
    }
    if (copied.has(dir)) return;
    copied.add(dir);
    const destination = path.join(target, path.relative(path.join(ROOT, "node_modules"), dir));
    fs.cpSync(dir, destination, {
      recursive: true,
      dereference: true,
      filter: source => !source.slice(dir.length).split(path.sep).includes("node_modules"),
    });
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    for (const dep of Object.keys(manifest.dependencies || {})) visit(dep, dir, false);
    for (const dep of Object.keys(manifest.optionalDependencies || {})) visit(dep, dir, true);
  };
  for (const name of mainProcessPackages()) visit(name, ROOT, false);
  return copied.size;
}

function stageResources(resourcesDir) {
  const lists = JSON.parse(fs.readFileSync(path.join(ROOT, "electrobun", "resources.json"), "utf8"));
  if (args.resources) lists[platform] = JSON.parse(fs.readFileSync(path.resolve(args.resources), "utf8"));
  const missing = [];
  for (const item of [...lists.common, ...lists[platform]]) {
    const source = path.resolve(ROOT, item.from);
    if (!fs.existsSync(source) || (fs.statSync(source).isFile() && fs.statSync(source).size === 0)) {
      missing.push(item.from);
      continue;
    }
    const destination =
      item.to === "." ? path.join(resourcesDir, path.basename(source)) : path.join(resourcesDir, item.to);
    copy(source, destination);
    if (platform !== "win" && path.basename(source).startsWith("Ascendara")) fs.chmodSync(destination, 0o755);
  }
  if (args.highball && platform === "mac") copy(path.resolve(args.highball), path.join(resourcesDir, "Highball"));
  if (missing.length) {
    const message = `Packaging resources missing or empty:\n  ${missing.join("\n  ")}`;
    if (args["allow-missing"] !== "true") throw new Error(message);
    console.warn(`[stage] ${message}`);
  }
}

// Electrobun wants a .iconset folder for macOS. Build every size from the
// 1024px image in the shipped macOS icon (the rounded-square artwork).
function stageMacIconset() {
  const iconset = path.join(ROOT, ".electrobun", "icon.iconset");
  const extracted = path.join(ROOT, ".electrobun", "icns.iconset");
  fs.rmSync(iconset, { recursive: true, force: true });
  fs.rmSync(extracted, { recursive: true, force: true });
  fs.mkdirSync(iconset, { recursive: true });
  execFileSync("iconutil", ["-c", "iconset", path.join(ROOT, "readme", "logo", "icns", "icon.icns"), "-o", extracted], {
    stdio: "ignore",
  });
  const source = path.join(extracted, "icon_512x512@2x.png");
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      const pixels = size * scale;
      const name = `icon_${size}x${size}${scale === 2 ? "@2x" : ""}.png`;
      execFileSync("sips", ["-z", String(pixels), String(pixels), source, "--out", path.join(iconset, name)], {
        stdio: "ignore",
      });
    }
  }
  fs.rmSync(extracted, { recursive: true, force: true });
}

function stagePackaged() {
  const electronDir = path.join(STAGE, "electron");
  copy(path.join(ROOT, "electron"), electronDir);
  stageUi(electronDir);

  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const { name, version, description, author, license } = manifest;
  fs.writeFileSync(
    path.join(STAGE, "package.json"),
    `${JSON.stringify({ name, productName: "Ascendara", version, description, author, license, main: "electron/app.js" }, null, 2)}\n`
  );

  const packages = stageNodeModules(path.join(STAGE, "node_modules"));
  stageResources(path.join(STAGE, "resources"));
  console.log(`[stage] ${env}: staged main process, UI, ${packages} npm packages and ${platform} resources`);
}

fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });
if (process.platform === "darwin") stageMacIconset();
if (env === "dev") stageDev();
else stagePackaged();
