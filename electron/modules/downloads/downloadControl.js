const { execFile } = require("child_process");

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const helper = /Ascendara(Downloader|GofileHelper|TorrentHandler)(?:\.exe|\.py)?/i;

function run(command, args) {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { windowsHide: true, timeout: 15000, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout) => (error ? reject(error) : resolve(stdout))
    );
  });
}

async function listHelpers(windows = process.platform === "win32") {
  if (windows) {
    const output = await run("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $_.Name -match '^Ascendara(Downloader|GofileHelper|TorrentHandler)(\\.exe)?$' } | Select-Object ProcessId,CommandLine)",
    ]);
    const parsed = JSON.parse(output.trim() || "[]") || [];
    return (Array.isArray(parsed) ? parsed : [parsed]).map(p => ({
      pid: Number(p.ProcessId),
      command: p.CommandLine || "",
    }));
  }
  const output = await run("ps", ["-A", "-o", "pid=,args="]);
  return output.split(/\r?\n/).flatMap(line => {
    const match = line.trim().match(/^(\d+)\s+(.*)$/);
    return match && helper.test(match[2])
      ? [{ pid: Number(match[1]), command: match[2] }]
      : [];
  });
}

function matchingHelpers(processes, name, directory, knownPids = []) {
  // Match a complete argument, never a substring ("Game" must not stop "Game 2").
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const argument = new RegExp(
    `(?:https?://|magnet:)\\S+"?\\s+(?:"${escaped}"|'${escaped}'|${escaped})(?=\\s+(?:true|false)(?:\\s|$))`,
    "i"
  );
  const escapedDirectory = directory.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const directoryArgument = new RegExp(
    `${escapedDirectory}(?:[/\\\\]|["']|$)`,
    process.platform === "win32" ? "i" : ""
  );
  return processes.filter(
    p =>
      p.pid !== process.pid &&
      Number.isInteger(p.pid) &&
      p.pid > 0 &&
      (knownPids.includes(p.pid) ||
        argument.test(p.command) ||
        directoryArgument.test(p.command))
  );
}

async function stopHelpers(name, directory, knownPids, options = {}) {
  const {
    cooperative = true,
    windows = process.platform === "win32",
    list = () => listHelpers(windows),
    kill = pid =>
      windows
        ? run("taskkill", ["/F", "/T", "/PID", String(pid)])
        : process.kill(pid, "SIGKILL"),
    graceMs = 3000,
    exitMs = 10000,
  } = options;
  let listError = null;
  // One slow or failed PowerShell/WMI listing means "unknown", not "running":
  // poll again instead of failing the whole pause or cancel on it.
  const find = async () => {
    try {
      const found = matchingHelpers(await list(), name, directory, knownPids);
      listError = null;
      return found;
    } catch (error) {
      listError = error;
      return null;
    }
  };
  const waitUntilGone = async (deadline, onRunning) => {
    for (;;) {
      const remaining = await find();
      if (remaining && !remaining.length) return true;
      if (Date.now() >= deadline) return false;
      if (remaining?.length && onRunning) await onRunning(remaining);
      await delay(150);
    }
  };

  if (cooperative && (await waitUntilGone(Date.now() + graceMs))) return;

  // The Windows helpers are PyInstaller onefile builds: a bootloader and its
  // child share one command line, and "taskkill /T" on the bootloader ends
  // both. The child can stay listed for a moment while it terminates, so a
  // second taskkill on it fails even though it is already on its way out.
  // Kill errors are therefore not fatal; only the process listing decides.
  const killedAt = new Map();
  const terminate = async remaining => {
    for (const { pid } of remaining) {
      const last = killedAt.get(pid);
      if (last && Date.now() - last < 2000) continue;
      killedAt.set(pid, Date.now());
      try {
        await kill(pid);
      } catch (error) {
        console.warn(`[downloads] Kill of helper ${pid} reported: ${error.message}`);
      }
    }
  };
  if (await waitUntilGone(Date.now() + exitMs, terminate)) return;
  throw (
    listError || new Error("The downloader is still running. Please try pausing again.")
  );
}

function createOperationLock() {
  const pending = new Map();
  return async (key, action) => {
    if (pending.has(key))
      throw new Error("Another download operation is still in progress.");
    pending.set(key, true);
    try {
      return await action();
    } finally {
      pending.delete(key);
    }
  };
}

function waitForSpawn(child) {
  return new Promise((resolve, reject) => {
    const failed = error => {
      child.removeListener("spawn", started);
      reject(error);
    };
    const started = () => {
      child.removeListener("error", failed);
      resolve();
    };
    child.once("error", failed);
    child.once("spawn", started);
  });
}

// A helper that fails right after starting (for example one too old for its
// arguments) never writes its own error, so the start would look successful.
function watchEarlyExit(child, onEarlyExit, windowMs = 5000) {
  const startedAt = Date.now();
  child.once("exit", (code, signal) => {
    if (code && !signal && Date.now() - startedAt < windowMs) onEarlyExit(code);
  });
}

module.exports = {
  watchEarlyExit,
  matchingHelpers,
  listHelpers,
  stopHelpers,
  createOperationLock,
  waitForSpawn,
};
