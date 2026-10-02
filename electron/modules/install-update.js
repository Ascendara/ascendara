const fs = require("fs-extra");
const path = require("path");
const { spawn } = require("child_process");
const { app } = require("electron");

// Share the same installation path for automatic updates and branch switches.
module.exports = async function installUpdate(installerPath, isLinux) {
  let command = installerPath;
  let args = [];
  let stagingDir;
  try {
    if (process.platform === "darwin") {
      const match = process.execPath.match(/^(.*?\.app)\/Contents\/MacOS\//);
      if (!match) throw new Error("Automatic updates require an installed macOS app.");
      const target = match[1];
      const parent = path.dirname(target);
      stagingDir = fs.mkdtempSync(path.join(parent, ".ascendara-update-"));
      const extracted = path.join(stagingDir, "extracted");
      fs.mkdirSync(extracted);
      await new Promise((resolve, reject) => {
        const child = spawn("ditto", ["-x", "-k", installerPath, extracted]);
        child.once("error", reject);
        child.once("close", code =>
          code === 0
            ? resolve()
            : reject(new Error(`Could not extract macOS update (${code}).`))
        );
      });
      const apps = fs.readdirSync(extracted).filter(name => name.endsWith(".app"));
      if (apps.length !== 1)
        throw new Error("The macOS update archive must contain one app.");
      const stagedApp = path.join(stagingDir, apps[0]);
      const executable = path.join(stagedApp, "Contents", "MacOS");
      if (
        !fs.existsSync(path.join(stagedApp, "Contents", "Info.plist")) ||
        !fs.existsSync(executable)
      ) {
        throw new Error("The macOS update archive does not contain a valid app.");
      }
      fs.moveSync(path.join(extracted, apps[0]), stagedApp);
      fs.removeSync(extracted);
      const scriptPath = path.join(stagingDir, "install.sh");
      fs.writeFileSync(
        scriptPath,
        `#!/bin/sh
while kill -0 "$1" 2>/dev/null; do sleep 1; done
if mv "$3" "$4"; then
  if mv "$2" "$3"; then
    rm -rf "$4"
    open "$3"
    rm -f "$0"
    rmdir "$5"
  else
    mv "$4" "$3"
  fi
fi
`
      );
      command = "sh";
      args = [
        scriptPath,
        String(process.pid),
        stagedApp,
        target,
        path.join(stagingDir, "backup.app"),
        stagingDir,
      ];
    } else if (isLinux) {
      if (!process.env.APPIMAGE) {
        throw new Error("Automatic updates require running the installed AppImage.");
      }
      const target = fs.realpathSync(process.env.APPIMAGE);
      // Stage beside the installed image so replacement is an atomic rename and
      // permission/disk errors are reported while the app can still show them.
      stagingDir = fs.mkdtempSync(path.join(path.dirname(target), ".ascendara-update-"));
      const stagedImage = path.join(stagingDir, "Ascendara.AppImage");
      await fs.copy(installerPath, stagedImage);
      fs.chmodSync(stagedImage, 0o755);
      const scriptPath = path.join(stagingDir, "install.sh");
      fs.writeFileSync(
        scriptPath,
        `#!/bin/sh
while kill -0 "$1" 2>/dev/null; do sleep 1; done
if mv -f -- "$2" "$3"; then
  rm -f -- "$0"
  rmdir -- "$4"
  "$3" &
fi
`
      );
      command = "sh";
      args = [scriptPath, String(process.pid), stagedImage, target, stagingDir];
    }

    await new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        detached: true,
        stdio: "ignore",
        cwd: isLinux ? path.dirname(process.env.APPIMAGE) : undefined,
      });
      child.once("error", reject);
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    });
  } catch (error) {
    if (stagingDir) await fs.remove(stagingDir);
    throw error;
  }
  app.isQuitting = true;
  app.quit();
};
