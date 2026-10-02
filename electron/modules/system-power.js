const { execFile } = require("child_process");

function shutdownCommand(platform) {
  if (platform === "win32") return ["shutdown.exe", ["/s", "/t", "0"]];
  if (platform === "linux") return ["systemctl", ["poweroff"]];
  if (platform === "darwin") return ["/usr/bin/osascript", ["-e", 'tell application "System Events" to shut down']];
  return null;
}

function shutdownSystem(platform = process.platform, execute = execFile) {
  const command = shutdownCommand(platform);
  if (!command) return Promise.resolve({ success: false, error: "System shutdown is unavailable on this platform." });
  return new Promise(resolve => {
    execute(command[0], command[1], { windowsHide: true, timeout: 15000 }, error => {
      resolve(error
        ? { success: false, error: "The system could not shut down. Check operating-system permissions and open applications, then try again." }
        : { success: true });
    });
  });
}

module.exports = { shutdownCommand, shutdownSystem };
