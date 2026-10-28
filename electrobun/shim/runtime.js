// Where the Ascendara main-process tree lives and how this process was started.
// main.js fills this in before anything requires "electron".

import path from "node:path";

export const runtime = {
  // Directory that holds package.json and electron/ (Electron's app.getAppPath()).
  appRoot: "",
  // Directory that holds the helper binaries and public/ (process.resourcesPath).
  resourcesPath: "",
  isPackaged: false,
  channel: "dev",
  version: "0.0.0",
};

export function configureRuntime(values) {
  Object.assign(runtime, values);
}

// The native launcher Electrobun ships next to the Bun binary. It is what the OS
// should start for login items, the URL scheme and relaunches.
export function launcherPath() {
  const dir = path.dirname(process.execPath);
  if (process.platform === "win32") return path.join(dir, "launcher.exe");
  return path.join(dir, "launcher");
}

// The .app bundle on macOS, used where the OS expects an application.
export function macAppBundle() {
  const match = process.execPath.match(/^(.*?\.app)\/Contents\/MacOS\//);
  return match ? match[1] : null;
}
