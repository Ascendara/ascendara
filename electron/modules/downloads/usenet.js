// Usenet downloads handed to the user's SABnzbd or NZBGet. Ascendara keeps a
// game folder with a .ascendara.json like any other download, follows the job
// in the client, then moves the finished files in and finishes the install.
const { ipcMain } = require("electron");
const fs = require("fs-extra");
const path = require("path");
const core = require("./usenet-core");
const { getSettingsManager } = require("../core/settings");
const { sanitizeGameName, sanitizeText } = require("../core/utils");
const { findGameExecutable, findInstaller } = require("./executableScan");

const POLL_MS = 3000;
// Games whose jobs this run follows, by folder name
const active = new Map();
let timer = null;
let polling = false;

const settings = () => getSettingsManager().getSettings();
const client = () => core.createClient(settings());
const nowSeconds = () => Math.floor(Date.now() / 1000);

function libraryDirs() {
  const s = settings();
  return [s.downloadDirectory, ...(s.additionalDirectories || [])].filter(Boolean);
}

async function locate(game) {
  const name = sanitizeGameName(sanitizeText(String(game || "")));
  if (!name || name === "." || name === "..") return null;
  for (const dir of libraryDirs()) {
    const file = path.join(dir, name, `${name}.ascendara.json`);
    const info = await fs.readJson(file).catch(() => null);
    if (info) return { name, dir: path.dirname(file), file, info };
  }
  return null;
}

async function save(target) {
  await fs.writeJson(target.file + ".tmp", target.info, { spaces: 2 });
  await fs.rename(target.file + ".tmp", target.file);
}

function failState(info, code, detail) {
  info.downloadingData = {
    ...info.downloadingData,
    downloading: false,
    error: true,
    message: `usenet.errors.${code}${detail ? `|${JSON.stringify({ detail: String(detail).slice(0, 300) })}` : ""}`,
    progressDownloadSpeeds: "0.00 B/s",
    timeUntilComplete: "",
  };
}

/** Move what the client downloaded into the game folder, then finish the install. */
async function finish(target, reported) {
  const s = settings();
  const local = core.mapPath(reported, s.usenetRemotePath, s.usenetLocalPath);
  if (!local || !(await fs.pathExists(local))) {
    failState(target.info, "pathNotFound", local || reported);
    return;
  }
  let source = local;
  // A single folder inside the job folder is the game itself
  const top = await fs.readdir(source);
  if (top.length === 1 && (await fs.stat(path.join(source, top[0]))).isDirectory()) {
    source = path.join(source, top[0]);
  }
  for (const entry of await fs.readdir(source)) {
    if (/\.(nzb|par2|sfv|nfo|url)$/i.test(entry)) continue;
    await fs.move(path.join(source, entry), path.join(target.dir, entry), {
      overwrite: false,
    });
  }
  await fs.remove(local).catch(() => {});

  const installer = findInstaller(target.dir);
  if (installer) {
    target.info.downloadingData = {
      downloading: false,
      pendingManualInstall: true,
      manualInstallerPath: installer,
      manualInstallDir: target.dir,
      progressCompleted: "100",
    };
    return;
  }
  const executable = findGameExecutable(target.dir);
  if (executable) target.info.executable = executable;
  delete target.info.downloadingData;
}

async function pollOne(name) {
  const target = await locate(name);
  const job = target?.info.usenet;
  if (!job || !target.info.downloadingData) {
    active.delete(name);
    return;
  }
  const data = target.info.downloadingData;
  if (data.error || data.pendingManualInstall) {
    active.delete(name);
    return;
  }
  const status = await core.createClient(settings()).job(job.id);
  if (status.state === "missing") {
    failState(target.info, "jobMissing");
  } else if (status.state === "failed") {
    failState(target.info, "jobFailed", status.message);
  } else if (status.state === "completed") {
    data.progressCompleted = "100";
    data.timeUntilComplete = "";
    await save(target);
    try {
      await finish(target, status.path);
      await core
        .createClient(settings())
        .forget(job.id)
        .catch(() => {});
    } catch (e) {
      failState(target.info, "moveFailed", e.message);
    }
  } else {
    // Ascendara's own pause wins over what the client reports
    const stopped = !!data.stopped;
    target.info.downloadingData = {
      ...data,
      downloading: !stopped,
      progressCompleted: String(Math.round((status.progress || 0) * 10) / 10),
      progressDownloadSpeeds: core.formatSpeed(stopped ? 0 : status.speed),
      timeUntilComplete:
        status.state === "processing"
          ? "Processing"
          : status.state === "queued"
            ? "Queued"
            : status.state === "paused"
              ? "Paused"
              : core.formatEta(status.eta),
      // The client is working on it, so the stall watchdog stays quiet
      lastProgress: nowSeconds(),
    };
  }
  await save(target);
  if (
    !target.info.downloadingData ||
    target.info.downloadingData.error ||
    target.info.downloadingData.pendingManualInstall
  ) {
    active.delete(name);
  }
}

async function pollAll() {
  if (polling) return;
  polling = true;
  try {
    for (const name of [...active.keys()]) {
      try {
        await pollOne(name);
      } catch (e) {
        // The client being briefly down must not fail the download
        if (!["unreachable", "timeout"].includes(e?.code))
          console.error("[Usenet]", name, e.message);
      }
    }
  } finally {
    polling = false;
    if (!active.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  }
}

function follow(name) {
  active.set(name, true);
  if (!timer) timer = setInterval(pollAll, POLL_MS);
}

/** Pick up jobs from earlier runs. */
async function reattach() {
  for (const dir of libraryDirs()) {
    const entries = await fs.readdir(dir).catch(() => []);
    for (const name of entries) {
      const info = await fs
        .readJson(path.join(dir, name, `${name}.ascendara.json`))
        .catch(() => null);
      const data = info?.downloadingData;
      if (info?.usenet && data && !data.error && !data.pendingManualInstall) follow(name);
    }
  }
}

async function start(options = {}) {
  const s = settings();
  if (!s.usenetEnabled) throw core.fail("notConfigured");
  const usenetClient = core.createClient(s);
  const name = sanitizeGameName(sanitizeText(String(options.game || "")));
  if (!name || name === "." || name === "..") throw core.fail("invalidGame");
  const base =
    (options.directoryIndex || 0) === 0
      ? s.downloadDirectory
      : s.additionalDirectories?.[options.directoryIndex - 1];
  if (!base) throw core.fail("noDownloadFolder");

  const nzb = await require("../sources/torznab").fetchNzb(options.result);
  const dir = path.join(base, name);
  try {
    await fs.mkdir(dir); // Exclusive: never mix into an existing game folder
  } catch (e) {
    if (e.code === "EEXIST") throw core.fail("folderExists");
    throw e;
  }
  try {
    const id = await usenetClient.add(nzb, name);
    const target = {
      name,
      dir,
      file: path.join(dir, `${name}.ascendara.json`),
      info: {
        game: name,
        online: !!options.online,
        dlc: !!options.dlc,
        isVr: false,
        version: "",
        size: String(options.size || ""),
        executable: "",
        gameID: options.gameID || undefined,
        imgID: options.imgID || undefined,
        usenet: {
          client: s.usenetClient,
          id,
          title: String(options.result?.title || "").slice(0, 300),
          indexer: String(options.result?.indexer || "").slice(0, 100),
        },
        downloadingData: {
          downloading: true,
          progressCompleted: "0",
          progressDownloadSpeeds: "0.00 B/s",
          timeUntilComplete: "Queued",
          lastProgress: nowSeconds(),
        },
      },
    };
    await save(target);
    follow(name);
    require("../library/steamgrid")
      .fetchGameAssets(name, dir)
      .catch(e => console.warn("[Usenet] Artwork failed:", e.message));
    return { success: true, game: name };
  } catch (e) {
    await fs.remove(dir).catch(() => {});
    throw e;
  }
}

/**
 * Stop hook for the shared stop-download flow. Pauses the job, or deletes it
 * from the client when the download is being removed. False for other games.
 */
async function stop(game, remove = false) {
  const target = await locate(game);
  const job = target?.info.usenet;
  if (!job || !target.info.downloadingData) return false;
  const c = client();
  try {
    if (remove) await c.remove(job.id);
    else await c.pause(job.id);
  } catch (e) {
    console.warn("[Usenet] Client did not take the stop:", e.message);
  }
  if (remove) active.delete(target.name);
  return true;
}

/** Resume hook: null for games that are not Usenet downloads. */
async function resume(game) {
  const target = await locate(game);
  const job = target?.info.usenet;
  if (!job || !target.info.downloadingData) return null;
  await client().resume(job.id);
  target.info.downloadingData = {
    ...target.info.downloadingData,
    stopped: false,
    error: false,
    message: undefined,
    downloading: true,
    lastProgress: nowSeconds(),
  };
  await save(target);
  follow(target.name);
  return { success: true, game: target.name };
}

const wrap =
  fn =>
  async (_event, ...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      if (!e?.code) console.error("[Usenet]", e);
      return {
        error: e?.code || "badResponse",
        detail: e?.code ? undefined : e?.message,
      };
    }
  };

function registerUsenetHandlers() {
  ipcMain.handle(
    "usenet-test",
    wrap(() => client().test())
  );
  ipcMain.handle("usenet-start", wrap(start));
  setTimeout(
    () => reattach().catch(e => console.error("[Usenet] Reattach failed:", e)),
    5000
  );
}

module.exports = { registerUsenetHandlers, start, stop, resume, active };
