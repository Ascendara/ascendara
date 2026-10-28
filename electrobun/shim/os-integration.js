// OS registration that Electron did internally: login items, the ascendara://
// scheme on Windows and Linux (macOS reads urlSchemes from Info.plist), and
// relaunching after exit.

import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { launcherPath, macAppBundle } from "./runtime.js";

const APP_ID = "com.tagoworks.ascendara";
const APP_NAME = "Ascendara";

function run(command, args) {
  return new Promise(resolve => {
    execFile(command, args, { windowsHide: true }, error => {
      if (error)
        console.warn(`[Electrobun] ${command} ${args[0] || ""} failed:`, error.message);
      resolve(!error);
    });
  });
}

function quoteWin(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function xmlEscape(value) {
  return String(value).replace(/[<>&"']/g, char => `&#${char.charCodeAt(0)};`);
}

function desktopExec(args) {
  return [launcherPath(), ...args]
    .map(arg => `"${String(arg).replace(/(["\\`$])/g, "\\$1")}"`)
    .join(" ");
}

function writeFileSafe(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents, "utf8");
}

export async function setLoginItemSettings({ openAtLogin = false, args = [] } = {}) {
  try {
    if (process.platform === "darwin") {
      const plist = path.join(os.homedir(), "Library", "LaunchAgents", `${APP_ID}.plist`);
      if (!openAtLogin) {
        fs.rmSync(plist, { force: true });
        return;
      }
      const bundle = macAppBundle();
      const program = bundle
        ? ["/usr/bin/open", "-a", bundle, "--args", ...args]
        : [launcherPath(), ...args];
      writeFileSafe(
        plist,
        `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${APP_ID}</string>
  <key>ProgramArguments</key><array>${program.map(arg => `<string>${xmlEscape(arg)}</string>`).join("")}</array>
  <key>RunAtLoad</key><true/>
</dict></plist>
`
      );
    } else if (process.platform === "win32") {
      const key = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
      if (!openAtLogin) {
        await run("reg", ["delete", key, "/v", APP_NAME, "/f"]);
        return;
      }
      const command = [quoteWin(launcherPath()), ...args.map(quoteWin)].join(" ");
      await run("reg", ["add", key, "/v", APP_NAME, "/t", "REG_SZ", "/d", command, "/f"]);
    } else {
      const file = path.join(
        process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"),
        "autostart",
        "ascendara.desktop"
      );
      if (!openAtLogin) {
        fs.rmSync(file, { force: true });
        return;
      }
      writeFileSafe(
        file,
        `[Desktop Entry]\nType=Application\nName=${APP_NAME}\nExec=${desktopExec(args)}\nX-GNOME-Autostart-enabled=true\n`
      );
    }
  } catch (error) {
    console.warn("[Electrobun] Could not update login item:", error.message);
  }
}

export function getLoginItemSettings() {
  let openAtLogin = false;
  if (process.platform === "darwin") {
    openAtLogin = fs.existsSync(
      path.join(os.homedir(), "Library", "LaunchAgents", `${APP_ID}.plist`)
    );
  } else if (process.platform !== "win32") {
    openAtLogin = fs.existsSync(
      path.join(
        process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"),
        "autostart",
        "ascendara.desktop"
      )
    );
  }
  return {
    openAtLogin,
    openAsHidden: false,
    wasOpenedAtLogin: false,
    wasOpenedAsHidden: false,
  };
}

export async function setAsDefaultProtocolClient(scheme) {
  if (!/^[a-z][a-z0-9+.-]*$/i.test(scheme)) return false;
  try {
    if (process.platform === "win32") {
      const root = `HKCU\\Software\\Classes\\${scheme}`;
      const command = `${quoteWin(launcherPath())} "%1"`;
      return (
        (await run("reg", ["add", root, "/ve", "/d", `URL:${APP_NAME}`, "/f"])) &&
        (await run("reg", ["add", root, "/v", "URL Protocol", "/d", "", "/f"])) &&
        (await run("reg", [
          "add",
          `${root}\\shell\\open\\command`,
          "/ve",
          "/d",
          command,
          "/f",
        ]))
      );
    }
    if (process.platform === "linux") {
      const dataHome =
        process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
      const desktopFile = `ascendara-${scheme}-handler.desktop`;
      writeFileSafe(
        path.join(dataHome, "applications", desktopFile),
        `[Desktop Entry]\nType=Application\nName=${APP_NAME}\nExec=${desktopExec([])} %u\nNoDisplay=true\nMimeType=x-scheme-handler/${scheme};\n`
      );
      return run("xdg-mime", ["default", desktopFile, `x-scheme-handler/${scheme}`]);
    }
    // macOS registers the scheme from the bundle's Info.plist (electrobun.config.ts).
    return true;
  } catch (error) {
    console.warn("[Electrobun] Could not register protocol handler:", error.message);
    return false;
  }
}

// Start a fresh copy once this process has exited, like Electron's relaunch().
export function scheduleRelaunch(args = []) {
  const pid = process.pid;
  if (process.platform === "win32") {
    const launch = [launcherPath(), ...args].map(
      arg => `'${String(arg).replace(/'/g, "''")}'`
    );
    const script = `Wait-Process -Id ${pid} -ErrorAction SilentlyContinue; Start-Process -FilePath ${launch[0]}${launch.length > 1 ? ` -ArgumentList ${launch.slice(1).join(",")}` : ""}`;
    spawn(
      "powershell.exe",
      ["-NoProfile", "-WindowStyle", "Hidden", "-Command", script],
      {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      }
    ).unref();
    return;
  }
  const bundle = macAppBundle();
  const target = bundle
    ? ["open", "-n", bundle, ...(args.length ? ["--args", ...args] : [])]
    : [launcherPath(), ...args];
  const quoted = target.map(arg => `'${String(arg).replace(/'/g, "'\\''")}'`).join(" ");
  spawn(
    "/bin/sh",
    ["-c", `while kill -0 ${pid} 2>/dev/null; do sleep 0.2; done; ${quoted} &`],
    {
      detached: true,
      stdio: "ignore",
    }
  ).unref();
}
