// Electrobun entry point. Points `require("electron")` at the compatibility
// layer, then starts the existing main process from electron/app.js.
//
// The main-process tree is not bundled: it is copied next to this file as
// app/ascendara (stage-app.cjs) so its __dirname-relative paths, dynamic
// requires and native helpers keep working. Dev builds only carry a pointer
// back to the repository instead of a copy.

import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import { BuildConfig, Updater } from "electrobun/main";
import { electron } from "./shim/index.js";
import { configureRuntime, runtime } from "./shim/runtime.js";
import { configureSafeStorage } from "./shim/safe-storage.js";

const stageDir = path.resolve(import.meta.dir, "..", "ascendara");
const devPointer = path.join(stageDir, "dev-root.json");
const appRoot = fs.existsSync(devPointer)
  ? JSON.parse(fs.readFileSync(devPointer, "utf8")).root
  : stageDir;

const { channel } = await Updater.getLocalInfo();
const isPackaged = channel !== "dev";
const { version } = JSON.parse(
  fs.readFileSync(path.join(appRoot, "package.json"), "utf8")
);

configureRuntime({
  appRoot,
  resourcesPath: isPackaged ? path.join(stageDir, "resources") : appRoot,
  isPackaged,
  channel,
  version,
});

process.resourcesPath = runtime.resourcesPath;
process.type = "browser";
process.defaultApp = !isPackaged;
process.versions.electrobun = BuildConfig.getSync().electrobunVersion || "2";
configureSafeStorage(electron.app.getPath("userData"));

const shimPath = path.join(import.meta.dir, "__electron_shim__.js");
const shimModule = new Module(shimPath);
shimModule.filename = shimPath;
shimModule.loaded = true;
shimModule.exports = electron;
Module._cache[shimPath] = shimModule;

const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "electron") return shimPath;
  // Electron's asar-unaware fs; there is no asar here.
  if (request === "original-fs") return resolveFilename.call(this, "fs", ...rest);
  return resolveFilename.call(this, request, ...rest);
};

Module.createRequire(path.join(appRoot, "package.json"))("./electron/app.js");
