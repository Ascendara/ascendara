// powerSaveBlocker through each OS's own inhibitor process, and a powerMonitor
// that emits "resume" when the clock jumps (the process was suspended).

import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";

const blockers = new Map();
let nextBlockerId = 1;

function startInhibitor(type) {
  const preventDisplay = type === "prevent-display-sleep";
  if (process.platform === "darwin") {
    return spawn(
      "caffeinate",
      [preventDisplay ? "-di" : "-i", "-w", String(process.pid)],
      { stdio: "ignore" }
    );
  }
  if (process.platform === "win32") {
    // ES_CONTINUOUS | ES_SYSTEM_REQUIRED (| ES_DISPLAY_REQUIRED) held by a helper
    // that exits with us.
    const flags = preventDisplay ? "0x80000003" : "0x80000001";
    const script = `$sig='[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);';$t=Add-Type -MemberDefinition $sig -Name P -Namespace W -PassThru;$null=$t::SetThreadExecutionState(${flags});Wait-Process -Id ${process.pid}`;
    return spawn(
      "powershell.exe",
      ["-NoProfile", "-WindowStyle", "Hidden", "-Command", script],
      {
        stdio: "ignore",
        windowsHide: true,
      }
    );
  }
  return spawn(
    "systemd-inhibit",
    [
      "--what",
      preventDisplay ? "idle:sleep" : "sleep",
      "--who",
      "Ascendara",
      "--why",
      "Background task",
      "--mode",
      "block",
      "tail",
      `--pid=${process.pid}`,
      "-f",
      "/dev/null",
    ],
    { stdio: "ignore" }
  );
}

export const powerSaveBlocker = {
  start(type) {
    const id = nextBlockerId++;
    try {
      const child = startInhibitor(type);
      child.on("error", () => blockers.delete(id));
      blockers.set(id, child);
    } catch {
      blockers.set(id, null);
    }
    return id;
  },
  stop(id) {
    const child = blockers.get(id);
    blockers.delete(id);
    try {
      child?.kill();
    } catch {}
    return true;
  },
  isStarted(id) {
    return blockers.has(id);
  },
};

class PowerMonitor extends EventEmitter {
  constructor() {
    super();
    this._last = Date.now();
    this._timer = null;
  }

  on(event, listener) {
    super.on(event, listener);
    this._watch();
    return this;
  }

  _watch() {
    if (this._timer) return;
    this._timer = setInterval(() => {
      const now = Date.now();
      if (now - this._last > 30000) this.emit("resume");
      this._last = now;
    }, 5000);
    this._timer.unref?.();
  }

  getSystemIdleState() {
    return "unknown";
  }

  getSystemIdleTime() {
    return 0;
  }

  isOnBatteryPower() {
    return false;
  }
}

export const powerMonitor = new PowerMonitor();
