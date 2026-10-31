/**
 * Differential Update Module
 * Rebuilds the next release file from a local copy of the installed one
 * (the installer NSIS cached on Windows, the cached update zip on macOS),
 * downloading only the blocks that changed between GitHub releases
 */

const fs = require("fs-extra");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const axios = require("axios");
const { pipeline } = require("stream/promises");

const RELEASES = "https://github.com/Ascendara/ascendara/releases/download";
const RELEASE_API = "https://api.github.com/repos/Ascendara/ascendara/releases/tags";
// Unchanged runs this small are downloaded with their neighbours instead of
// splitting the request (an update needs ~10 requests instead of ~600).
const MERGE_GAP = 64 * 1024;

const installerName = version => `Ascendara.Setup.${version}.exe`;

async function fetchBlockmap(url) {
  const response = await axios.get(url, { responseType: "arraybuffer", timeout: 30000 });
  return parseBlockmap(response.data);
}

/**
 * Plan the new installer as runs copied from the cached installer or fetched
 * from the release, in file order
 */
function planSegments(previous, next) {
  const cached = new Map();
  let offset = 0;
  previous.checksums.forEach((checksum, i) => {
    if (!cached.has(checksum)) cached.set(checksum, offset);
    offset += previous.sizes[i];
  });

  const segments = [];
  offset = 0;
  next.checksums.forEach((checksum, i) => {
    const size = next.sizes[i];
    const from = cached.get(checksum);
    const last = segments[segments.length - 1];
    if (from === undefined) {
      if (last?.remote) last.end += size;
      else segments.push({ remote: true, start: offset, end: offset + size });
    } else if (last && !last.remote && last.from + last.end - last.start === from) {
      last.end += size;
    } else {
      segments.push({ remote: false, start: offset, end: offset + size, from });
    }
    offset += size;
  });

  for (let i = 0; i < segments.length; i++) {
    if (segments[i].remote) continue;
    let j = i;
    while (j < segments.length && !segments[j].remote) j++;
    if (
      i > 0 &&
      j < segments.length &&
      segments[j - 1].end - segments[i].start <= MERGE_GAP
    )
      for (let k = i; k < j; k++) segments[k].remote = true;
    i = j;
  }
  return segments.reduce((merged, segment) => {
    const last = merged[merged.length - 1];
    if (last?.remote && segment.remote) last.end = segment.end;
    else merged.push(segment);
    return merged;
  }, []);
}

function parseBlockmap(buffer) {
  const { files } = JSON.parse(zlib.gunzipSync(Buffer.from(buffer)));
  if (files?.length !== 1 || files[0].offset !== 0)
    throw new Error("Unexpected blockmap layout");
  return files[0];
}

/**
 * Write the file described by next to outputPath, copying blocks it shares
 * with basePath (described by previous) and fetching the rest from url with
 * range requests. The result must match the sha256 digest or nothing is kept.
 */
async function rebuildFromBase({
  basePath,
  previous,
  next,
  url,
  digest,
  outputPath,
  onProgress,
}) {
  if (!digest) throw new Error("No sha256 digest to verify the rebuilt file");
  if (!fs.existsSync(basePath)) throw new Error("No cached base file");
  const previousSize = previous.sizes.reduce((sum, size) => sum + size, 0);
  if (fs.statSync(basePath).size !== previousSize)
    throw new Error("Cached base file does not match its blockmap");

  const segments = planSegments(previous, next);
  const remoteTotal = segments
    .filter(segment => segment.remote)
    .reduce((sum, segment) => sum + segment.end - segment.start, 0);
  const nextSize = next.sizes.reduce((sum, size) => sum + size, 0);
  console.log(
    `Differential download: ${remoteTotal} of ${nextSize} bytes in ${segments.filter(s => s.remote).length} requests`
  );

  const hash = crypto.createHash("sha256");
  let downloaded = 0;
  async function* assemble() {
    for (const segment of segments) {
      let source;
      if (segment.remote) {
        const response = await axios.get(url, {
          responseType: "stream",
          headers: { Range: `bytes=${segment.start}-${segment.end - 1}` },
          // A full 200 response means ranges are unsupported; fall back.
          validateStatus: status => status === 206,
          maxRedirects: 5,
          timeout: 30000,
        });
        source = response.data;
      } else {
        source = fs.createReadStream(basePath, {
          start: segment.from,
          end: segment.from + segment.end - segment.start - 1,
        });
      }
      let received = 0;
      for await (const chunk of source) {
        received += chunk.length;
        hash.update(chunk);
        if (segment.remote) {
          downloaded += chunk.length;
          onProgress?.(Math.round((downloaded * 100) / remoteTotal));
        }
        yield chunk;
      }
      if (received !== segment.end - segment.start)
        throw new Error("Incomplete differential update segment");
    }
  }

  const partialPath = `${outputPath}.partial`;
  try {
    await pipeline(assemble, fs.createWriteStream(partialPath));
    if (hash.digest("hex") !== digest)
      throw new Error("Rebuilt file failed sha256 verification");
    await fs.move(partialPath, outputPath, { overwrite: true });
  } catch (error) {
    await fs.remove(partialPath);
    throw error;
  }
}

/**
 * Build the installer for toVersion at outputPath. Throws when a delta is not
 * possible so the caller can fall back to the full download.
 */
async function downloadDifferentialUpdate(
  fromVersion,
  toVersion,
  outputPath,
  onProgress
) {
  const cachedInstaller = path.join(
    process.env.LOCALAPPDATA || "",
    "ascendara-updater",
    "installer.exe"
  );
  if (!fs.existsSync(cachedInstaller)) throw new Error("No cached installer");

  const release = await axios.get(`${RELEASE_API}/${encodeURIComponent(toVersion)}`, {
    timeout: 30000,
  });
  const asset = release.data.assets?.find(a => a.name === installerName(toVersion));
  const digest = asset?.digest?.match(/^sha256:([0-9a-f]{64})$/)?.[1];
  if (!digest) throw new Error("Release installer has no sha256 digest");

  const installerUrl = `${RELEASES}/${encodeURIComponent(toVersion)}/${installerName(toVersion)}`;
  const [previous, next] = await Promise.all([
    fetchBlockmap(
      `${RELEASES}/${encodeURIComponent(fromVersion)}/${installerName(fromVersion)}.blockmap`
    ),
    fetchBlockmap(`${installerUrl}.blockmap`),
  ]);
  await rebuildFromBase({
    basePath: cachedInstaller,
    previous,
    next,
    url: installerUrl,
    digest,
    outputPath,
    onProgress,
  });
}

module.exports = {
  downloadDifferentialUpdate,
  rebuildFromBase,
  parseBlockmap,
  fetchBlockmap,
  planSegments,
  RELEASES,
  RELEASE_API,
};
