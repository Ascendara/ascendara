/**
 * Translations Module
 * Handles language translation operations
 */

const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const { ipcMain, BrowserWindow } = require("electron");
const { isDev, isWindows, LANG_DIR, appDirectory } = require("./config");

let currentTranslationProcess = null;
const TRANSLATION_PROGRESS_FILE = path.join(
  os.homedir(),
  "translation_progress.ascendara.json"
);
let translationWatcher = null;

/**
 * Start translation progress watcher
 */
function startTranslationWatcher(window) {
  if (translationWatcher) {
    translationWatcher.close();
  }

  const dir = path.dirname(TRANSLATION_PROGRESS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  try {
    translationWatcher = fs.watch(dir, (eventType, filename) => {
      if (filename === "translation_progress.ascendara.json") {
        try {
          if (fs.existsSync(TRANSLATION_PROGRESS_FILE)) {
            const progress = JSON.parse(
              fs.readFileSync(TRANSLATION_PROGRESS_FILE, "utf8")
            );
            window.webContents.send("translation-progress", progress);
          }
        } catch (error) {
          console.error("Error reading translation progress:", error);
        }
      }
    });
  } catch (error) {
    console.error("Error setting up translation progress watcher:", error);
  }
}

/**
 * Register translation IPC handlers
 */
function registerTranslationHandlers() {
  ipcMain.handle("start-translation", async (event, langCode) => {
    try {
      if (currentTranslationProcess) {
        throw new Error("A translation is already in progress");
      }

      await fs.writeJson(TRANSLATION_PROGRESS_FILE, {
        languageCode: langCode,
        phase: "starting",
        progress: 0,
        timestamp: Date.now(),
      });

      const translationExePath = isDev
        ? path.join(
            "./binaries/AscendaraLanguageTranslation/dist/AscendaraLanguageTranslation.exe"
          )
        : path.join(appDirectory, "/resources/AscendaraLanguageTranslation.exe");

      if (!fs.existsSync(translationExePath)) {
        console.error("Translation executable not found at:", translationExePath);
        event.sender.send("translation-progress", {
          languageCode: langCode,
          phase: "error",
          progress: 0,
          error: "Translation executable not found",
          timestamp: Date.now(),
        });
        return false;
      }

      currentTranslationProcess = spawn(translationExePath, [langCode], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      currentTranslationProcess.stdout.on("data", data => {
        console.log(`Translation stdout: ${data}`);
      });

      currentTranslationProcess.stderr.on("data", data => {
        console.error(`Translation stderr: ${data}`);
      });

      const progressInterval = setInterval(async () => {
        try {
          if (fs.existsSync(TRANSLATION_PROGRESS_FILE)) {
            const progress = await fs.readJson(TRANSLATION_PROGRESS_FILE);
            event.sender.send("translation-progress", progress);

            if (progress.phase === "completed" || progress.phase === "error") {
              clearInterval(progressInterval);
              currentTranslationProcess = null;
            }
          }
        } catch (error) {
          console.error("Error reading translation progress:", error);
        }
      }, 100);

      currentTranslationProcess.on("close", code => {
        console.log(`Translation process exited with code ${code}`);
        clearInterval(progressInterval);

        if (code === 0) {
          event.sender.send("translation-progress", {
            languageCode: langCode,
            phase: "completed",
            progress: 1,
            timestamp: Date.now(),
          });
        } else {
          event.sender.send("translation-progress", {
            languageCode: langCode,
            phase: "error",
            progress: 0,
            timestamp: Date.now(),
          });
        }

        currentTranslationProcess = null;
      });

      return true;
    } catch (error) {
      console.error("Failed to start translation:", error);
      event.sender.send("translation-progress", {
        languageCode: langCode,
        phase: "error",
        progress: 0,
        error: error.message,
        timestamp: Date.now(),
      });
      return false;
    }
  });

  ipcMain.handle("cancel-translation", async () => {
    if (currentTranslationProcess) {
      currentTranslationProcess.kill();
      currentTranslationProcess = null;
      return true;
    }
    return false;
  });

  ipcMain.handle("get-language-file", async (_, languageCode) => {
    try {
      const filePath = path.join(LANG_DIR, `${languageCode}.json`);
      if (await fs.pathExists(filePath)) {
        return await fs.readJson(filePath);
      }
      return null;
    } catch (error) {
      console.error("Error reading language file:", error);
      throw error;
    }
  });

  ipcMain.handle("get-downloaded-languages", async () => {
    try {
      if (!(await fs.pathExists(LANG_DIR))) {
        await fs.ensureDir(LANG_DIR);
        return [];
      }

      const files = await fs.readdir(LANG_DIR);
      return files
        .filter(file => file.endsWith(".json"))
        .map(file => file.replace(".json", ""));
    } catch (error) {
      console.error("Error getting downloaded languages:", error);
      return [];
    }
  });

  ipcMain.handle("language-file-exists", async (_, filename) => {
    try {
      const filePath = path.join(LANG_DIR, filename);
      return await fs.pathExists(filePath);
    } catch (error) {
      console.error("Error checking language file:", error);
      return false;
    }
  });

  ipcMain.handle("start-translation-watcher", event => {
    startTranslationWatcher(BrowserWindow.fromWebContents(event.sender));
  });

  ipcMain.handle("stop-translation-watcher", () => {
    if (translationWatcher) {
      translationWatcher.close();
      translationWatcher = null;
    }
  });
}

module.exports = {
  registerTranslationHandlers,
  startTranslationWatcher,
};
