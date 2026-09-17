/** Keep the Linux downloader independent of a temporary AppImage mount. */
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const prepared = new Map();

async function prepareDownloaderRuntime(source, cacheRoot) {
  const key = JSON.stringify([source, cacheRoot]);
  if (!prepared.has(key)) {
    const preparation = (async () => {
      // The packaged Linux downloader is a self-contained PyInstaller onefile
      // executable. Start it here so sys.executable and future extraction workers
      // never refer back to /tmp/.mount_.../resources.
      const binary = await fs.readFile(source);
      const digest = crypto.createHash("sha256").update(binary).digest("hex");
      const directory = path.join(cacheRoot, digest);
      const executable = path.join(directory, "AscendaraDownloader");
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      try {
        const cached = await fs.readFile(executable);
        if (crypto.createHash("sha256").update(cached).digest("hex") === digest) {
          await fs.chmod(executable, 0o700);
          return executable;
        }
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      const temporary = path.join(directory, `.${crypto.randomUUID()}.tmp`);
      try {
        await fs.writeFile(temporary, binary, { flag: "wx", mode: 0o700 });
        await fs.rename(temporary, executable);
      } finally {
        await fs.rm(temporary, { force: true });
      }
      return executable;
    })();
    prepared.set(key, preparation);
    preparation.catch(() => prepared.delete(key));
  }
  return prepared.get(key);
}

module.exports = { prepareDownloaderRuntime };
