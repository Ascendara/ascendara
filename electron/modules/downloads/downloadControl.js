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

async function stopHelpers(
  name,
  directory,
  knownPids,
  { cooperative = true, windows = process.platform === "win32" } = {}
) {
  const find = async () =>
    matchingHelpers(await listHelpers(windows), name, directory, knownPids);
  let remaining = await find();
  if (cooperative) {
    const deadline = Date.now() + 3000;
    while (remaining.length && Date.now() < deadline) {
      await delay(150);
      remaining = await find();
    }
  }
  for (const p of remaining) {
    try {
      if (windows) await run("taskkill", ["/F", "/T", "/PID", String(p.pid)]);
      else process.kill(p.pid, "SIGKILL");
    } catch (error) {
      // A cooperative exit can race the kill. The final process listing decides.
      if ((await find()).some(live => live.pid === p.pid)) throw error;
    }
  }
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!(await find()).length) return;
    await delay(100);
  }
  throw new Error("The downloader is still running. Please try pausing again.");
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

module.exports = {
  matchingHelpers,
  listHelpers,
  stopHelpers,
  createOperationLock,
  waitForSpawn,
};
