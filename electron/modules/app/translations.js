/** Translation process ownership, progress, and installed language files. */
const fs = require("fs-extra");
const path = require("path");
const { spawn } = require("child_process");
const { ipcMain, BrowserWindow } = require("electron");
const { LANG_DIR, getHelperPath, getPythonPath, isDev } = require("../core/config");

let activeJob = null;
const LANGUAGE_CODE = /^[a-z]{2,8}(?:-[a-z0-9]{2,8})*$/i;

function validateLanguageCode(code) {
  if (typeof code !== "string" || !LANGUAGE_CODE.test(code))
    throw new Error("Invalid language code");
  return code;
}

function sendProgress(progress) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && !window.webContents.isDestroyed())
      window.webContents.send("translation-progress", progress);
  }
}

function startTranslationWatcher(window) {
  if (activeJob && window && !window.isDestroyed())
    window.webContents.send("translation-progress", activeJob.progress);
}

function isTranslationRunning() {
  return activeJob !== null;
}

async function runTranslation(languageCode, { updateKeys = false, source } = {}) {
  validateLanguageCode(languageCode);
  if (activeJob) throw new Error("A translation is already in progress");
  const job = {
    cancelled: false,
    process: null,
    progress: { languageCode, phase: "starting", progress: 0, timestamp: Date.now() },
  };
  // Reserve the slot before async filesystem work, including background updates.
  activeJob = job;
  sendProgress(job.progress);
  let interval;
  const id = `${process.pid}-${Date.now()}`;
  const progressPath = path.join(LANG_DIR, `.translation-${id}.progress`);
  const sourcePath = path.join(LANG_DIR, `.translation-${id}.source`);
  try {
    await fs.ensureDir(LANG_DIR);
    let executable = getHelperPath("AscendaraLanguageTranslation");
    const args = [];
    if (isDev) {
      executable = getPythonPath();
      args.push(
        path.resolve(
          __dirname,
          "../../../binaries/AscendaraLanguageTranslation/src/AscendaraLanguageTranslation.py"
        )
      );
    } else if (!fs.existsSync(executable))
      throw new Error("Translation tool is not installed");
    args.push(
      languageCode,
      "--output",
      path.join(LANG_DIR, `${languageCode}.json`),
      "--progress",
      progressPath
    );
    if (updateKeys) args.push("--updateKeys");
    if (source) {
      await fs.writeJson(sourcePath, source);
      args.push("--source", sourcePath);
    }
    if (job.cancelled) throw new Error("Translation cancelled");
    await new Promise((resolve, reject) => {
      const child = spawn(executable, args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      job.process = child;
      child.stdout.on("data", data => console.log(`Translation: ${data}`));
      child.stderr.on("data", data => console.log(`Translation: ${data}`));
      child.once("error", reject);
      child.once("close", code => {
        if (job.cancelled) reject(new Error("Translation cancelled"));
        else if (code === 0) resolve();
        else reject(new Error(`Translation process exited with code ${code}`));
      });
      interval = setInterval(() => {
        try {
          if (!fs.existsSync(progressPath)) return;
          const progress = fs.readJsonSync(progressPath);
          if (progress.languageCode !== languageCode) return;
          job.progress = progress;
          // Only process exit and validated output may announce completion.
          if (!["completed", "error", "cancelled"].includes(progress.phase))
            sendProgress(progress);
        } catch {
          /* Retry an unavailable progress file next tick. */
        }
      }, 250);
    });
    const translation = await fs.readJson(path.join(LANG_DIR, `${languageCode}.json`));
    if (
      !translation ||
      typeof translation !== "object" ||
      Array.isArray(translation) ||
      !Object.keys(translation).length
    ) {
      throw new Error("Translator did not produce a valid language file");
    }
    job.progress = {
      languageCode,
      phase: "completed",
      progress: 1,
      timestamp: Date.now(),
    };
    return true;
  } catch (error) {
    let detail = error.message;
    try {
      detail = (await fs.readJson(progressPath)).error || detail;
    } catch {}
    job.progress = {
      languageCode,
      phase: job.cancelled ? "cancelled" : "error",
      progress: 0,
      error: detail,
      timestamp: Date.now(),
    };
    throw new Error(detail);
  } finally {
    clearInterval(interval);
    await Promise.all([fs.remove(progressPath), fs.remove(sourcePath)]).catch(
      console.error
    );
    if (activeJob === job) activeJob = null;
    sendProgress(job.progress);
  }
}

function registerTranslationHandlers() {
  // Invocation resolves after the output is saved; progress events drive the UI.
  ipcMain.handle("start-translation", (_, code) => runTranslation(code));
  ipcMain.handle("cancel-translation", () => {
    if (!activeJob) return false;
    activeJob.cancelled = true;
    activeJob.process?.kill();
    return true;
  });
  ipcMain.handle("get-translation-progress", () => activeJob?.progress || null);
  ipcMain.handle("get-language-file", async (_, code) => {
    const filename = path.join(LANG_DIR, `${validateLanguageCode(code)}.json`);
    return (await fs.pathExists(filename)) ? fs.readJson(filename) : null;
  });
  ipcMain.handle("get-downloaded-languages", async () => {
    await fs.ensureDir(LANG_DIR);
    const files = await fs.readdir(LANG_DIR);
    const installed = [];
    for (const filename of files) {
      const code = filename.slice(0, -5);
      if (!filename.endsWith(".json") || !LANGUAGE_CODE.test(code)) continue;
      try {
        const data = await fs.readJson(path.join(LANG_DIR, filename));
        if (
          data &&
          typeof data === "object" &&
          !Array.isArray(data) &&
          Object.keys(data).length
        )
          installed.push(code);
      } catch {
        /* A damaged file is not an installed language. */
      }
    }
    return installed;
  });
  ipcMain.handle("language-file-exists", async (_, filename) => {
    if (typeof filename !== "string" || !filename.endsWith(".json")) return false;
    const code = filename.slice(0, -5);
    if (!LANGUAGE_CODE.test(code)) return false;
    return fs.pathExists(path.join(LANG_DIR, filename));
  });
  ipcMain.handle("start-translation-watcher", event =>
    startTranslationWatcher(BrowserWindow.fromWebContents(event.sender))
  );
  ipcMain.handle("stop-translation-watcher", () => {});
}

module.exports = {
  registerTranslationHandlers,
  startTranslationWatcher,
  runTranslation,
  isTranslationRunning,
};
