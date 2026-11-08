/**
 * Sound packs: a zip with an achievement and a notification sound, plus an
 * optional pack.json naming it. Users share them with each other, so nothing
 * here downloads packs. Installed packs live in userData and are selected by
 * setting notificationSoundProfile to "pack:<id>". The notification helper
 * reads the same folder, so keep the layout in sync with resolve_sound in
 * AscendaraNotificationHelper.py.
 */
const fs = require("fs-extra");
const path = require("path");
const JSZip = require("jszip");
const { app } = require("electron");

const SOUND_KINDS = ["achievement", "notification"];
const SOUND_EXTENSIONS = ["wav", "mp3", "ogg", "flac", "m4a"];
const MAX_SOUND_BYTES = 10 * 1024 * 1024;
const MAX_PACK_BYTES = 25 * 1024 * 1024;
const MAX_JSON_BYTES = 64 * 1024;
const MAX_NAME_LENGTH = 40;
const PACK_PREFIX = "pack:";
const PACK_ID = /^[a-z0-9-]{1,40}$/;

const soundsDir = () => path.join(app.getPath("userData"), "notification_sounds");
const packsDir = () => path.join(soundsDir(), "packs");

const packIdFromProfile = profile =>
  typeof profile === "string" &&
  profile.startsWith(PACK_PREFIX) &&
  PACK_ID.test(profile.slice(PACK_PREFIX.length))
    ? profile.slice(PACK_PREFIX.length)
    : null;

const cleanText = (value, max) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

const slugify = name =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");

/** The pack's sound file for this kind, or null if the pack or file is gone. */
async function findPackSound(id, kind) {
  if (!PACK_ID.test(id) || !SOUND_KINDS.includes(kind)) return null;
  for (const ext of SOUND_EXTENSIONS) {
    const file = path.join(packsDir(), id, `${kind}.${ext}`);
    if (await fs.pathExists(file)) return file;
  }
  return null;
}

async function readPackInfo(id) {
  const dir = path.join(packsDir(), id);
  let info = {};
  try {
    info = await fs.readJson(path.join(dir, "pack.json"));
  } catch {
    // A pack without readable info still works, it just shows its id
  }
  return {
    id,
    name: cleanText(info?.name, MAX_NAME_LENGTH) || id,
    author: cleanText(info?.author, MAX_NAME_LENGTH),
  };
}

async function listSoundPacks() {
  if (!(await fs.pathExists(packsDir()))) return [];
  const packs = [];
  for (const entry of await fs.readdir(packsDir(), { withFileTypes: true })) {
    if (!entry.isDirectory() || !PACK_ID.test(entry.name)) continue;
    // Skip half-installed or damaged packs rather than offering a broken choice
    const sounds = await Promise.all(
      SOUND_KINDS.map(kind => findPackSound(entry.name, kind))
    );
    if (sounds.every(Boolean)) packs.push(await readPackInfo(entry.name));
  }
  return packs.sort((a, b) => a.name.localeCompare(b.name));
}

async function readEntry(entry, type, limit) {
  if (entry._data?.uncompressedSize > limit) throw new Error("tooLarge");
  const data = await entry.async(type);
  if ((type === "string" ? Buffer.byteLength(data) : data.length) > limit) {
    throw new Error("tooLarge");
  }
  return data;
}

/**
 * Install a pack from a zip on disk. Sounds can sit at the root or inside one
 * folder, since zipping a folder is the easiest way to make a pack. Importing
 * a pack with the same name again replaces it, so updated packs just work.
 */
async function importSoundPack(zipPath) {
  const { size } = await fs.stat(zipPath);
  if (size > MAX_PACK_BYTES) throw new Error("tooLarge");
  let zip;
  try {
    zip = await JSZip.loadAsync(await fs.readFile(zipPath));
  } catch {
    throw new Error("invalidPack");
  }

  // Only look at the files a pack is made of, never extract anything else
  const files = Object.values(zip.files).filter(
    entry =>
      !entry.dir &&
      !entry.name.split("/").some(part => part.startsWith(".") || part === "__MACOSX")
  );
  const tops = new Set(files.map(entry => entry.name.split("/")[0]));
  const base =
    tops.size === 1 && !files.some(entry => !entry.name.includes("/"))
      ? `${[...tops][0]}/`
      : "";
  const pick = name =>
    files.find(entry => entry.name.toLowerCase() === `${base}${name}`.toLowerCase()) ||
    null;

  const sounds = {};
  for (const kind of SOUND_KINDS) {
    for (const ext of SOUND_EXTENSIONS) {
      const entry = pick(`${kind}.${ext}`);
      if (entry) {
        sounds[kind] = { entry, ext };
        break;
      }
    }
  }
  if (!SOUND_KINDS.every(kind => sounds[kind])) throw new Error("missingSounds");

  let info = {};
  const infoEntry = pick("pack.json");
  if (infoEntry) {
    try {
      const parsed = JSON.parse(await readEntry(infoEntry, "string", MAX_JSON_BYTES));
      if (parsed && typeof parsed === "object") info = parsed;
    } catch {
      // A broken pack.json shouldn't block the sounds, fall back to the file name
    }
  }
  const name =
    cleanText(info.name, MAX_NAME_LENGTH) ||
    cleanText(path.basename(zipPath, path.extname(zipPath)), MAX_NAME_LENGTH) ||
    "Sound pack";
  const author = cleanText(info.author, MAX_NAME_LENGTH);
  const id = slugify(name) || `pack-${Date.now().toString(36)}`;

  // Build the pack beside the real one and swap it in, so a failed import
  // never leaves a selected pack half-written
  const target = path.join(packsDir(), id);
  const staging = path.join(packsDir(), `.${id}-${Date.now().toString(36)}`);
  await fs.ensureDir(staging);
  try {
    for (const kind of SOUND_KINDS) {
      const { entry, ext } = sounds[kind];
      const data = await readEntry(entry, "nodebuffer", MAX_SOUND_BYTES);
      await fs.writeFile(path.join(staging, `${kind}.${ext}`), data);
    }
    await fs.writeJson(path.join(staging, "pack.json"), { name, author });
    await fs.remove(target);
    await fs.move(staging, target);
  } catch (error) {
    await fs.remove(staging);
    throw error;
  }
  return { id, name, author };
}

async function deleteSoundPack(id) {
  if (!PACK_ID.test(id)) throw new Error("Invalid sound pack");
  await fs.remove(path.join(packsDir(), id));
}

/** Zip two sound files into a pack others can import. */
async function exportSoundPack(sources, zipPath) {
  const zip = new JSZip();
  for (const kind of SOUND_KINDS) {
    const source = sources[kind];
    const ext = path
      .extname(source || "")
      .slice(1)
      .toLowerCase();
    if (!source || !SOUND_EXTENSIONS.includes(ext) || !(await fs.pathExists(source))) {
      throw new Error("missingSounds");
    }
    zip.file(`${kind}.${ext}`, await fs.readFile(source));
  }
  const name =
    cleanText(path.basename(zipPath, path.extname(zipPath)), MAX_NAME_LENGTH) ||
    "Sound pack";
  zip.file("pack.json", JSON.stringify({ name, author: "" }, null, 2) + "\n");
  await fs.writeFile(
    zipPath,
    await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })
  );
  return { name };
}

module.exports = {
  SOUND_KINDS,
  SOUND_EXTENSIONS,
  MAX_SOUND_BYTES,
  soundsDir,
  packIdFromProfile,
  findPackSound,
  listSoundPacks,
  importSoundPack,
  deleteSoundPack,
  exportSoundPack,
};
