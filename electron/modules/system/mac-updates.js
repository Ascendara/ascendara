/**
 * macOS Updates Module
 * Resolves the macOS update zip for a branch and keeps a copy of the installed
 * build's zip and blockmap, so the next update or branch switch only downloads
 * the blocks that changed.
 */

const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const axios = require("axios");
const { appVersion, testingVersion } = require("../core/config");
const {
  rebuildFromBase,
  parseBlockmap,
  fetchBlockmap,
  RELEASES,
  RELEASE_API,
} = require("./differential-update");

const CACHE_DIR = path.join(os.homedir(), "Library", "Caches", "ascendara-updater");
const VERSION_PATTERN = /^\d+(?:\.\d+)*(?:-\d+)?$/;

const githubHeaders = {
  Accept: "application/vnd.github+json",
  "User-Agent": `Ascendara/${appVersion}`,
};

function macUpdateName(version) {
  const arch = process.arch === "arm64" ? "arm64" : process.arch === "x64" ? "x64" : null;
  if (!arch) throw new Error(`Unsupported macOS architecture: ${process.arch}`);
  return `Ascendara-${version}-mac-${arch}.zip`;
}

// Testing builds identify as "<version>-<run>", live builds as "<version>"
const installedBuild = () => testingVersion || appVersion;

const cachedZip = build => path.join(CACHE_DIR, `${build}.zip`);
const cachedBlockmap = build => path.join(CACHE_DIR, `${build}.blockmap`);

const assetDigest = asset => asset?.digest?.match(/^sha256:([0-9a-f]{64})$/)?.[1] || null;

async function fetchBuffer(url) {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 30000,
    maxRedirects: 5,
  });
  return Buffer.from(response.data);
}

/**
 * Describe the macOS zip to install for branch: its build id, download URL,
 * sha256 digest and blockmap. For live, version is the release tag; for
 * public-testing, minVersion refuses a testing build older than announced.
 */
async function resolveMacUpdate(branch, version) {
  let build;
  let release = null;
  if (branch === "live") {
    if (!VERSION_PATTERN.test(version || ""))
      throw new Error("No valid macOS update version is available.");
    build = version;
    try {
      ({ data: release } = await axios.get(
        `${RELEASE_API}/${encodeURIComponent(version)}`,
        { headers: githubHeaders, timeout: 15000 }
      ));
    } catch (error) {
      // The download URL is fixed, so a failed lookup only costs the delta
      console.warn("Could not read the macOS release:", error.message);
    }
  } else if (branch === "public-testing") {
    ({ data: release } = await axios.get(`${RELEASE_API}/testing`, {
      headers: githubHeaders,
      timeout: 15000,
    }));
    // CI names the release "Testing build <version>"
    build = String(release.name || "")
      .split(" ")
      .pop();
    if (!VERSION_PATTERN.test(build))
      throw new Error("The testing build has no valid version.");
    if (version && isOlder(build, version))
      throw new Error(`Testing build ${version} has not been published yet.`);
  } else {
    throw new Error("This branch has no macOS builds.");
  }

  const name = macUpdateName(build.replace(/-\d+$/, ""));
  const asset = release?.assets?.find(item => item.name === name);
  if (branch !== "live" && !asset)
    throw new Error("The testing build has no app for this Mac.");
  const url =
    asset?.browser_download_url || `${RELEASES}/${encodeURIComponent(build)}/${name}`;
  const blockmapAsset = release?.assets?.find(item => item.name === `${name}.blockmap`);
  const blockmapUrl =
    blockmapAsset?.browser_download_url || (branch === "live" ? `${url}.blockmap` : null);

  let blockmap = null;
  if (blockmapUrl) {
    try {
      blockmap = await fetchBuffer(blockmapUrl);
      parseBlockmap(blockmap);
    } catch (error) {
      console.warn("macOS update blockmap unavailable:", error.message);
      blockmap = null;
    }
  }
  return { build, url, digest: assetDigest(asset), size: asset?.size || 0, blockmap };
}

function isOlder(v1, v2) {
  const a = v1.split(/[.-]/).map(p => parseInt(p) || 0);
  const b = v2.split(/[.-]/).map(p => parseInt(p) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) < (b[i] || 0);
  }
  return false;
}

/**
 * Rebuild target at outputPath from the cached zip of the installed build.
 * Throws when that is not possible so the caller downloads the whole zip.
 */
async function downloadMacDelta(target, outputPath, onProgress) {
  if (!target.blockmap || !target.digest)
    throw new Error("The update has no blockmap or digest");
  const build = installedBuild();
  const basePath = cachedZip(build);
  if (!fs.existsSync(basePath)) throw new Error("No cached copy of the installed build");
  let previous;
  if (fs.existsSync(cachedBlockmap(build))) {
    previous = parseBlockmap(await fs.readFile(cachedBlockmap(build)));
  } else if (!testingVersion) {
    previous = await fetchBlockmap(
      `${RELEASES}/${encodeURIComponent(build)}/${macUpdateName(build)}.blockmap`
    );
  } else {
    throw new Error("No blockmap for the installed testing build");
  }
  await rebuildFromBase({
    basePath,
    previous,
    next: parseBlockmap(target.blockmap),
    url: target.url,
    digest: target.digest,
    outputPath,
    onProgress,
  });
}

async function sha256File(file) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

/**
 * Keep the downloaded zip as the base for the next update. Only the installed
 * build and this one are kept; each is a few hundred MB.
 */
async function cacheMacBuild(target, zipPath) {
  if (!target.blockmap || !VERSION_PATTERN.test(target.build)) return;
  try {
    await fs.ensureDir(CACHE_DIR);
    await pruneMacCache([installedBuild(), target.build]);
    const destination = cachedZip(target.build);
    await fs.remove(destination);
    // The download and the cache usually share a volume, where a hard link is free
    try {
      await fs.link(zipPath, destination);
    } catch {
      await fs.copy(zipPath, destination);
    }
    await fs.writeFile(cachedBlockmap(target.build), target.blockmap);
  } catch (error) {
    console.warn("Could not cache the macOS update:", error.message);
  }
}

/**
 * Remove cached builds other than keep (by default, only the installed one).
 */
async function pruneMacCache(keep = [installedBuild()]) {
  if (process.platform !== "darwin") return;
  const entries = await fs.readdir(CACHE_DIR).catch(() => []);
  for (const name of entries) {
    const build = name.replace(/\.(zip|blockmap)$/, "");
    if (!keep.includes(build)) await fs.remove(path.join(CACHE_DIR, name));
  }
}

module.exports = {
  macUpdateName,
  resolveMacUpdate,
  downloadMacDelta,
  cacheMacBuild,
  pruneMacCache,
  sha256File,
};
