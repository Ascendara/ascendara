const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");
const { promisify } = require("util");
const run = promisify(execFile);

function runtimePath(platform = process.platform, current = process.env.PATH || "") {
  const extra =
    platform === "darwin"
      ? [
          "/opt/homebrew/bin",
          "/usr/local/bin",
          "/Applications/Wine Stable.app/Contents/Resources/wine/bin",
          path.join(
            os.homedir(),
            "Applications/Wine Stable.app/Contents/Resources/wine/bin"
          ),
        ]
      : ["/usr/local/bin", "/usr/bin", "/bin"];
  return [...new Set([...current.split(path.delimiter), ...extra].filter(Boolean))].join(
    path.delimiter
  );
}

function findCommand(name, searchPath = runtimePath()) {
  for (const dir of searchPath.split(path.delimiter)) {
    const candidate = path.join(dir, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {}
  }
  return null;
}

async function findWine() {
  if (process.platform === "win32") return null;
  for (const name of ["wine", "wine64"]) {
    const binary = findCommand(name);
    if (!binary) continue;
    try {
      const { stdout } = await run(binary, ["--version"], {
        timeout: 15000,
        env: { ...process.env, PATH: runtimePath() },
      });
      return {
        name: "System Wine",
        type: "wine",
        path: binary,
        version: stdout.trim(),
        source: "system",
      };
    } catch {}
  }
  return null;
}

function linuxWineCommand(find = findCommand) {
  if (!find("pkexec"))
    throw new Error(
      "Install Wine and Winetricks using your distribution's software manager, then check again. Automatic setup requires pkexec and a running authentication agent."
    );
  if (find("apt-get"))
    return "dpkg --add-architecture i386 && apt-get update && apt-get install -y wine wine32 winetricks";
  if (find("dnf")) return "dnf install -y wine winetricks";
  if (find("pacman")) return "pacman -S --needed --noconfirm wine winetricks";
  if (find("zypper")) return "zypper --non-interactive install wine winetricks";
  throw new Error(
    "Install Wine and Winetricks using your distribution's software manager, then check again. This distribution does not support automatic setup."
  );
}

module.exports = { runtimePath, findCommand, findWine, linuxWineCommand };
