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
    if (isLinux) {
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
