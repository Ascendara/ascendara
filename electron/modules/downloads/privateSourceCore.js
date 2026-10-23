// Transport and schema code intentionally independent of Electron for fixture testing.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const http = require("node:http");
const https = require("node:https");
const { pipeline } = require("node:stream/promises");
const { Transform } = require("node:stream");
const TYPES = new Set(["exe", "iso", "zip", "7z", "rar"]);
const MAX_INDEX = 8 * 1024 * 1024;
const MAX_FILE = 16 * 1024 ** 4;
// Messages are en.json keys under privateSources.errors so the app can translate them;
// parameters ride along as JSON after a "|".
function fail(code, params) {
  return new Error(`privateSources.errors.${code}${params ? `|${JSON.stringify(params)}` : ""}`);
}

function relativePath(value) {
  if (typeof value !== "string" || !value || value.length > 2048 ||
      /[\\:%?#<>"|*]/.test(value) || [...value].some(c => c.charCodeAt(0) < 32) || value.startsWith("/") ||
      value.split("/").some(p => !p || p === "." || p === ".." || /[. ]$/.test(p) ||
        /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p))) {
    throw fail("unsafePath");
  }
  return value;
}
function httpUrl(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash)
    throw fail("unsupportedUrl");
  return url;
}
function resolveReference(base, ref) {
  relativePath(ref);
  return new URL(ref.split("/").map(encodeURIComponent).join("/"), new URL(".", httpUrl(base))).href;
}
async function confined(root, ref) {
  relativePath(ref);
  const realRoot = await fs.promises.realpath(root);
  const target = await fs.promises.realpath(path.join(realRoot, ...ref.split("/")));
  const rel = path.relative(realRoot, target);
  if (!rel || rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel))
    throw fail("pathEscapesRoot");
  return target;
}
function cleanTitle(filename) {
  return path.basename(filename).replace(/\.(exe|iso|zip|7z|rar)$/i, "")
    .replace(/(?:[._ -]+)v\d+(?:[._-]\d+)*(?:[._ -].*)?$/i, "")
    .replace(/[._]+/g, " ").replace(/\b(setup|installer|repack)\b/gi, " ")
    .replace(/\s+/g, " ").trim().replace(/^[ -]+|[ -]+$/g, "");
}
function text(value, max = 500) {
  return typeof value === "string" ? value.slice(0, max) : "";
}
function validateIndex(raw) {
  if (!raw || raw.version !== 1 || !Array.isArray(raw.games) || raw.games.length > 10000)
    throw fail("invalidIndex");
  const ids = new Set(), paths = new Set();
  const sourceId = text(raw.sourceId, 100);
  if (!sourceId) throw fail("missingSourceId");
  const games = raw.games.map(g => {
    if (!g || typeof g !== "object") throw fail("invalidGameEntry");
    const id = text(g.id, 100);
    const ref = relativePath(g.path);
    const type = path.posix.extname(ref).slice(1).toLowerCase();
    if (!/^[a-z0-9][a-z0-9 _.-]{0,99}$/i.test(id) || ids.has(id) || paths.has(ref.toLowerCase())) throw fail("duplicateGame");
    ids.add(id); paths.add(ref.toLowerCase());
    if (!TYPES.has(type) || (g.type && g.type !== type)) throw fail("unsupportedPackage");
    if (!Number.isSafeInteger(g.size) || g.size < 0 || g.size > MAX_FILE) throw fail("invalidFileSize");
    if (g.sha256 && !/^[a-f0-9]{64}$/i.test(g.sha256)) throw fail("invalidChecksum");
    const artwork = {};
    for (const key of ["cover", "hero"]) if (g.artwork?.[key]) artwork[key] = relativePath(g.artwork[key]);
    return { id, sourceId, path: ref, type, size: g.size, sha256: g.sha256?.toLowerCase(),
      title: text(g.title) || cleanTitle(ref), artwork,
      identifiers: { steam: /^\d+$/.test(String(g.identifiers?.steam)) ? String(g.identifiers.steam) : undefined },
      metadata: { description: text(g.metadata?.description, 20000), releaseDate: text(g.metadata?.releaseDate),
        developer: text(g.metadata?.developer), publisher: text(g.metadata?.publisher),
        genres: Array.isArray(g.metadata?.genres) ? g.metadata.genres.slice(0, 30).map(v => text(v, 100)) : [] } };
  });
  return { version: 1, sourceId, name: text(raw.name), games };
}
async function scan(root, sourceId, { exclude = [], ignore = [] } = {}) {
  if (!Array.isArray(exclude) || !Array.isArray(ignore) || exclude.length + ignore.length > 1000)
    throw fail("invalidExclusions");
  [...exclude, ...ignore].forEach(relativePath);
  const games = [];
  let visited = 0;
  async function walk(dir, prefix = "", depth = 0) {
    if (depth > 32) throw fail("tooDeep");
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (++visited > 100000) throw fail("tooManyEntries");
      const ref = prefix + entry.name;
      if (entry.isSymbolicLink() || exclude.some(e => ref === e || ref.startsWith(e + "/")) || ignore.includes(ref)) continue;
      if (entry.isDirectory()) await walk(await confined(root, ref), ref + "/", depth + 1);
      else if (entry.isFile() && TYPES.has(path.extname(entry.name).slice(1).toLowerCase())) {
        const stat = await fs.promises.stat(await confined(root, ref));
        games.push({ id: crypto.createHash("sha256").update(ref).digest("hex").slice(0, 24),
          title: cleanTitle(entry.name), path: ref, size: stat.size });
        if (games.length > 10000) throw fail("tooManyPackages");
      }
    }
  }
  await walk(await fs.promises.realpath(root));
  return validateIndex({ version: 1, sourceId, games });
}
function request(url, { token, headers = {}, signal } = {}) {
  const parsed = httpUrl(url);
  return new Promise((resolve, reject) => {
    const req = (parsed.protocol === "https:" ? https : http).get(parsed, {
      headers: { ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, signal,
    }, res => {
      // No redirects: credentials and private paths never move to another origin.
      if (res.statusCode >= 300 && res.statusCode < 400) {
        res.resume(); reject(fail("redirectsNotAllowed"));
      } else if (![200, 206].includes(res.statusCode)) {
        res.resume(); reject(fail("httpStatus", { status: res.statusCode }));
      } else resolve(res);
    });
    req.setTimeout(30000, () => req.destroy(fail("requestTimedOut")));
    req.on("error", reject);
  });
}
async function fetchBuffer(url, options = {}, limit = MAX_INDEX) {
  const res = await request(url, options);
  const parts = []; let size = 0;
  const deadline = setTimeout(() => res.destroy(fail("requestTimedOut")), 60000);
  try {
    for await (const chunk of res) {
      size += chunk.length;
      if (size > limit) { res.destroy(); throw fail("responseTooLarge"); }
      parts.push(chunk);
    }
    return Buffer.concat(parts);
  } finally { clearTimeout(deadline); }
}
async function fetchIndex(url, options) {
  return validateIndex(JSON.parse((await fetchBuffer(url, options)).toString("utf8")));
}
async function checksum(file) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
// Dedicated .part file and exclusive final publication never replace an existing package.
// HTTP resume is permitted only with a checksum, which authenticates the combined result.
async function transfer({ source, game, destination, token, signal, onProgress = () => {} }) {
  const part = destination + ".part";
  for (const file of [destination, part]) {
    const st = await fs.promises.lstat(file).catch(e => { if (e.code !== "ENOENT") throw e; });
    if (st && (file === destination || !st.isFile() || st.nlink !== 1)) throw fail("destinationExists");
  }
  let offset = source.type === "http" && game.sha256
    ? (await fs.promises.stat(part).catch(() => ({ size: 0 }))).size : 0;
  if (offset >= game.size) offset = 0;
  let input;
  if (source.type === "http") {
    input = await request(resolveReference(source.location, game.path), {
      token, signal, headers: offset ? { Range: `bytes=${offset}-` } : {},
    });
    if (input.statusCode === 206) {
      const expected = `bytes ${offset}-${game.size - 1}/${game.size}`;
      if (input.headers["content-range"] !== expected) { input.destroy(); throw fail("invalidContentRange"); }
    } else offset = 0; // Range unsupported: restart safely, never append a full response.
    if (input.headers["content-encoding"] && input.headers["content-encoding"] !== "identity") {
      input.destroy(); throw fail("encodedResponse");
    }
  } else {
    const file = await confined(source.location, game.path);
    if ((await fs.promises.stat(file)).size !== game.size) throw fail("sourceFileChanged");
    input = fs.createReadStream(file);
  }
  let done = offset;
  const meter = new Transform({ transform(chunk, encoding, cb) {
    done += chunk.length;
    if (done > game.size) return cb(fail("sizeMismatch"));
    onProgress(done, game.size); cb(null, chunk);
  } });
  await pipeline(input, meter, fs.createWriteStream(part, { flags: offset ? "a" : "w", mode: 0o600 }), { signal });
  if (done !== game.size) throw fail("sizeMismatch");
  if (game.sha256 && await checksum(part) !== game.sha256) {
    await fs.promises.unlink(part); throw fail("checksumMismatch");
  }
  signal?.throwIfAborted();
  await fs.promises.link(part, destination);
  await fs.promises.unlink(part);
  onProgress(done, game.size);
}
const normalized = value => value.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
function rankCandidates(title, candidates) {
  const key = normalized(title);
  return candidates.map(c => {
    const other = normalized(c.name);
    const a = new Set(key.split(" ")), b = new Set(other.split(" "));
    const overlap = [...a].filter(t => b.has(t)).length;
    return { ...c, confidence: key === other ? 1 : 2 * overlap / (a.size + b.size) };
  }).sort((a, b) => b.confidence - a.confidence);
}
module.exports = { TYPES, fail, relativePath, httpUrl, resolveReference, confined, cleanTitle, validateIndex,
  scan, request, fetchBuffer, fetchIndex, checksum, transfer, rankCandidates };
