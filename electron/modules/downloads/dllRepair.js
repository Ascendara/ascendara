/** Restores approved, release-specific DLLs. No renderer-provided paths or URLs. */
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const axios = require("axios");

const API = "https://api.ascendara.app";
const CDN = "https://repair.ascendara.app";
const MAX_DLL = 32 * 1024 * 1024;
const MAX_TOTAL = 128 * 1024 * 1024;
const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
function relativeName(value) {
  if (typeof value !== "string" || value.length > 500)
    throw new Error("Invalid repair path.");
  const name = value.replace(/\\/g, "/");
  if (
    name
      .split("/")
      .some(
        part =>
          !part ||
          part === "." ||
          part === ".." ||
          /[<>:"|?*]/.test(part) ||
          [...part].some(character => character.charCodeAt(0) < 32) ||
          /[. ]$/.test(part) ||
          /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part)
      )
  ) {
    throw new Error("Unsafe repair path.");
  }
  return name;
}

async function safePath(root, relative) {
  const target = path.resolve(root, relativeName(relative));
  const absoluteRoot = path.resolve(root);
  if (!target.startsWith(absoluteRoot + path.sep))
    throw new Error("Path escapes game folder.");
  // Check the library ancestors too: junctions must not redirect writes elsewhere.
  const parsed = path.parse(target);
  let current = parsed.root;
  const parts = target.slice(parsed.root.length).split(path.sep);
  for (let index = 0; index < parts.length; index++) {
    current = path.join(current, parts[index]);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink() || (index < parts.length - 1 && !stat.isDirectory())) {
        throw new Error("Repair does not follow links or junctions.");
      }
    } catch (error) {
      if (error.code === "ENOENT" && index === parts.length - 1) return target;
      throw error;
    }
  }
  return target;
}

async function readBounded(root, name, limit) {
  const filename = await safePath(root, name);
  const handle = await fs.open(filename, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > limit)
      throw new Error("Unsafe or oversized repair input.");
    const buffer = Buffer.alloc(stat.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const result = await handle.read(buffer, length, buffer.length - length, null);
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    if (length !== stat.size) throw new Error("Repair input changed while reading.");
    return buffer.subarray(0, length);
  } finally {
    await handle.close();
  }
}

function releaseIdentity(info, filemap) {
  if (
    info.privateSource ||
    !info.gameID ||
    !info.version ||
    String(info.version) === "-1"
  ) {
    throw new Error("This game has no supported release identity.");
  }
  const seen = new Set();
  const inventory = Object.entries(filemap)
    .map(([name, entry]) => {
      name = relativeName(name);
      if (
        seen.has(name.toLowerCase()) ||
        !Number.isSafeInteger(entry.size) ||
        entry.size < 0
      ) {
        throw new Error("Invalid game inventory.");
      }
      seen.add(name.toLowerCase());
      return [name, entry.size];
    })
    .sort((a, b) => Buffer.compare(Buffer.from(a[0]), Buffer.from(b[0])));
  const identity = [
    String(info.gameID),
    String(info.version),
    info.online === true || String(info.online).toLowerCase() === "true",
    inventory,
  ];
  return sha256(JSON.stringify(identity));
}

function listedDlls(text, filemap) {
  const list = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean)
    // Online-fix lists also name managed assemblies and config files; only DLLs are shared.
    .filter(name => /\.dll$/i.test(name));
  if (!list.length || list.length > 128) throw new Error("Invalid DLL list.");
  const names = list.map(relativeName);
  return Object.keys(filemap)
    .map(relativeName)
    .filter(
      name =>
        /\.dll$/i.test(name) &&
        names.some(
          item =>
            item.toLowerCase() === name.toLowerCase() ||
            (!item.includes("/") &&
              item.toLowerCase() === path.posix.basename(name).toLowerCase())
        )
    );
}

function validateManifest(manifest, release, allowed, filemap) {
  if (
    manifest?.schema !== 1 ||
    manifest.release !== release ||
    !Array.isArray(manifest.files) ||
    !manifest.files.length ||
    manifest.files.length > 128
  )
    throw new Error("Invalid approved repair manifest.");
  const inventory = new Map(
    Object.entries(filemap).map(([name, value]) => [relativeName(name), value.size])
  );
  const seen = new Set();
  let total = 0;
  for (const file of manifest.files) {
    const name = relativeName(file.path);
    if (
      name !== file.path ||
      !allowed.includes(name) ||
      seen.has(name.toLowerCase()) ||
      !/^[a-f0-9]{64}$/.test(file.sha256) ||
      !Number.isSafeInteger(file.size) ||
      file.size <= 0 ||
      file.size > MAX_DLL ||
      inventory.get(name) !== file.size
    ) {
      throw new Error("Repair manifest does not match this installation.");
    }
    seen.add(name.toLowerCase());
    total += file.size;
  }
  if (total > MAX_TOTAL) throw new Error("Repair manifest is too large.");
  return manifest.files;
}

async function context(directory, metadataName) {
  const info = JSON.parse(await readBounded(directory, metadataName, 4 * 1024 * 1024));
  const filemap = JSON.parse(
    await readBounded(directory, "filemap.ascendara.json", 16 * 1024 * 1024)
  );
  const list = (await readBounded(directory, "dlllist.txt", 64 * 1024)).toString("utf8");
  return {
    info,
    filemap,
    release: releaseIdentity(info, filemap),
    allowed: listedDlls(list, filemap),
  };
}

function idle(info) {
  const data = info.downloadingData;
  return (
    !info.isRunning &&
    (!data ||
      (data.verifyError?.length &&
        !data.downloading &&
        !data.extracting &&
        !data.verifying &&
        !data.updating &&
        !data.awaitingRecoveryAction &&
        !data.pendingManualInstall))
  );
}

async function token(signal) {
  const auth = require("../core/auth-helper");
  const response = await auth.authenticatedFetch(`${API}/auth/token`, {
    redirect: "error",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Repair authentication failed.");
  return (await response.json()).token;
}

async function approved(release, bearer, signal) {
  try {
    const response = await axios.get(`${API}/repair/v1/manifests/${release}`, {
      headers: { Authorization: `Bearer ${bearer}` },
      timeout: 15000,
      maxRedirects: 0,
      maxContentLength: 128 * 1024,
      signal,
    });
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      const missing = new Error(
        "No approved repair files are available for this exact release yet."
      );
      missing.code = "NO_MANIFEST";
      throw missing;
    }
    throw new Error("The repair service is unavailable. Try again later.");
  }
}

async function run(directory, metadataName) {
  const ctx = await context(directory, metadataName);
  if (!idle(ctx.info))
    throw new Error("Wait for this game to finish downloading or running.");
  const bearer = await token();
  const manifest = await approved(ctx.release, bearer);
  const files = validateManifest(manifest, ctx.release, ctx.allowed, ctx.filemap);
  let restored = 0;
  for (const file of files) {
    const latest = await context(directory, metadataName);
    if (latest.release !== ctx.release || !idle(latest.info))
      throw new Error("Installation changed during repair.");
    const target = await safePath(directory, file.path);
    try {
      await fs.lstat(target);
      continue;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    let bytes;
    try {
      const response = await axios.get(`${CDN}/v1/${ctx.release}/${file.sha256}`, {
        responseType: "arraybuffer",
        timeout: 60000,
        maxRedirects: 0,
        maxContentLength: file.size,
      });
      bytes = Buffer.from(response.data);
    } catch {
      throw new Error(
        "An approved DLL is not available yet, or the repair service is unavailable."
      );
    }
    if (bytes.length !== file.size || sha256(bytes) !== file.sha256)
      throw new Error("Repair integrity check failed. No file was installed.");
    const fresh = await context(directory, metadataName);
    if (fresh.release !== ctx.release || !idle(fresh.info))
      throw new Error("Installation changed during repair.");
    await safePath(directory, file.path);
    const temporary = await fs.mkdtemp(
      path.join(path.dirname(target), ".ascendara-repair-")
    );
    const staged = path.join(temporary, "verified.dll");
    try {
      await fs.writeFile(staged, bytes, { flag: "wx" });
      await safePath(directory, file.path);
      // Atomic create-without-overwrite, including on Windows. Never replace an existing DLL.
      await fs.link(staged, target);
      await fs.unlink(staged);
      const installed = await readBounded(directory, file.path, MAX_DLL);
      if (installed.length !== file.size || sha256(installed) !== file.sha256) {
        throw new Error("The restored DLL was removed or changed during installation.");
      }
      restored++;
    } finally {
      await fs.rm(staged, { force: true });
      await fs.rmdir(temporary);
    }
  }
  return { success: true, restored };
}

async function resolveTarget(settings, game, libraryDirectory) {
  if (typeof game !== "string" || game.includes("/") || game.includes("\\")) {
    throw new Error("Invalid game name.");
  }
  relativeName(game);
  const libraries = [
    ...new Set(
      [settings.downloadDirectory, ...(settings.additionalDirectories || [])].filter(
        Boolean
      )
    ),
  ];
  const matches = [];
  for (const library of libraries) {
    if (libraryDirectory && path.resolve(libraryDirectory) !== path.resolve(library))
      continue;
    const directory = path.join(library, game);
    const metadataName = `${game}.ascendara.json`;
    try {
      const filename = await safePath(directory, metadataName);
      if ((await fs.lstat(filename)).isFile()) matches.push({ directory, metadataName });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  if (matches.length !== 1)
    throw new Error("Select an unambiguous installed game in a configured library.");
  return matches[0];
}

module.exports = {
  run,
  resolveTarget,
  relativeName,
  safePath,
  readBounded,
  releaseIdentity,
  listedDlls,
  validateManifest,
  context,
  sha256,
  MAX_DLL,
};
