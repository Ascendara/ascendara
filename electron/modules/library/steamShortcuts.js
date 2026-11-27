/**
 * Steam Shortcuts
 * Adds installed games to Steam as non-Steam games, with their artwork, so
 * Steam Deck users don't have to go through Desktop Mode. Each shortcut
 * starts the game through an ascendara://play link, so runners, playtime
 * and achievements keep working.
 *
 * Steam only reads shortcuts.vdf when it starts and may write it back while
 * running, so new shortcuts go in while Steam is closed. With Steam running,
 * Steam is shut down first. On Linux a helper outside Steam's process tree
 * swaps the file in, because in Game Mode Steam takes Ascendara down with it.
 */

const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const zlib = require("zlib");
const { execFileSync, spawn } = require("child_process");
const { ipcMain } = require("electron");
const { isLinux, isWindows, isDev, STEAM_INSTALL_PATHS } = require("../core/config");
const { getSettingsManager } = require("../core/settings");

const STEAM_ID64_BASE = 76561197960265728n;
const SHORTCUT_TAG = "Ascendara";
const STAGED_SUFFIX = ".ascendara-staged";
const ORIGINAL_SUFFIX = ".ascendara-original";

// Binary VDF

const TYPE_MAP = 0x00;
const TYPE_STRING = 0x01;
const TYPE_INT32 = 0x02;
const TYPE_FLOAT = 0x03;
const TYPE_UINT64 = 0x07;
const TYPE_END = 0x08;

// Values other than maps, strings and int32 are kept as raw bytes so
// rewriting the file never changes entries Ascendara didn't add
class RawValue {
  constructor(type, bytes) {
    this.type = type;
    this.bytes = bytes;
  }
}

function parseBinaryVdf(buffer) {
  let offset = 0;
  const readString = () => {
    const end = buffer.indexOf(0, offset);
    if (end < 0) throw new Error("Unterminated VDF string");
    const value = buffer.toString("utf8", offset, end);
    offset = end + 1;
    return value;
  };
  const readMap = depth => {
    if (depth > 16) throw new Error("VDF nesting limit exceeded");
    const map = {};
    while (offset < buffer.length) {
      const type = buffer[offset++];
      if (type === TYPE_END) return map;
      const key = readString();
      if (type === TYPE_MAP) map[key] = readMap(depth + 1);
      else if (type === TYPE_STRING) map[key] = readString();
      else if (type === TYPE_INT32) {
        map[key] = buffer.readInt32LE(offset);
        offset += 4;
      } else if (type === TYPE_FLOAT) {
        map[key] = new RawValue(type, buffer.subarray(offset, offset + 4));
        offset += 4;
      } else if (type === TYPE_UINT64) {
        map[key] = new RawValue(type, buffer.subarray(offset, offset + 8));
        offset += 8;
      } else {
        throw new Error(`Unknown VDF value type ${type}`);
      }
    }
    if (depth > 0) throw new Error("Unclosed VDF map");
    return map;
  };
  return readMap(0);
}

function writeBinaryVdf(map) {
  const parts = [];
  const writeString = value => parts.push(Buffer.from(`${value}\0`, "utf8"));
  const writeMap = object => {
    for (const [key, value] of Object.entries(object)) {
      if (value instanceof RawValue) {
        parts.push(Buffer.from([value.type]));
        writeString(key);
        parts.push(value.bytes);
      } else if (typeof value === "number") {
        parts.push(Buffer.from([TYPE_INT32]));
        writeString(key);
        const int = Buffer.alloc(4);
        int.writeInt32LE(value | 0);
        parts.push(int);
      } else if (value && typeof value === "object") {
        parts.push(Buffer.from([TYPE_MAP]));
        writeString(key);
        writeMap(value);
      } else {
        parts.push(Buffer.from([TYPE_STRING]));
        writeString(key);
        writeString(value ?? "");
      }
    }
    parts.push(Buffer.from([TYPE_END]));
  };
  writeMap(map);
  return Buffer.concat(parts);
}

// Steam install and user

function getSteamRoot() {
  if (isWindows) {
    try {
      const output = execFileSync(
        "reg",
        ["query", "HKCU\\Software\\Valve\\Steam", "/v", "SteamPath"],
        { encoding: "utf8", windowsHide: true }
      );
      const match = output.match(/SteamPath\s+REG_SZ\s+(.+)/);
      if (match && fs.existsSync(match[1].trim())) return path.normalize(match[1].trim());
    } catch {}
    const fallback = path.join(
      process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
      "Steam"
    );
    return fs.existsSync(fallback) ? fallback : null;
  }
  if (isLinux) {
    for (const root of STEAM_INSTALL_PATHS) {
      if (fs.existsSync(path.join(root, "userdata"))) return root;
    }
  }
  return null;
}

function isFlatpakSteam(root) {
  return root.includes(`${path.sep}.var${path.sep}app${path.sep}com.valvesoftware.Steam`);
}

/**
 * The userdata folder of the account that signed in last
 */
function getSteamUserDir(root) {
  const userdata = path.join(root, "userdata");
  try {
    const login = fs.readFileSync(path.join(root, "config", "loginusers.vdf"), "utf8");
    const users = [...login.matchAll(/"(\d{17})"\s*\{([^}]*)\}/g)];
    const recent =
      users.find(([, , body]) => /"MostRecent"\s*"1"/i.test(body)) || users[0];
    if (recent) {
      const accountId = (BigInt(recent[1]) - STEAM_ID64_BASE).toString();
      const dir = path.join(userdata, accountId);
      if (fs.existsSync(dir)) return dir;
    }
  } catch {}
  // Otherwise the account whose settings changed last
  try {
    const dirs = fs
      .readdirSync(userdata)
      .filter(name => /^\d+$/.test(name) && name !== "0")
      .map(name => {
        const dir = path.join(userdata, name);
        const config = path.join(dir, "config", "localconfig.vdf");
        return { dir, time: fs.existsSync(config) ? fs.statSync(config).mtimeMs : 0 };
      })
      .sort((a, b) => b.time - a.time);
    return dirs[0]?.dir || null;
  } catch {
    return null;
  }
}

function isSteamRunning() {
  try {
    if (isWindows) {
      const output = execFileSync(
        "tasklist",
        ["/FI", "IMAGENAME eq steam.exe", "/NH", "/FO", "CSV"],
        { encoding: "utf8", windowsHide: true }
      );
      return /"steam\.exe"/i.test(output);
    }
    execFileSync("pgrep", ["-x", "steam"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// Game Mode on SteamOS (and other gamescope sessions) restarts Steam itself
function isGameMode() {
  return (
    isLinux &&
    (process.env.XDG_CURRENT_DESKTOP === "gamescope" ||
      Boolean(process.env.GAMESCOPE_WAYLAND_DISPLAY))
  );
}

function steamCommand(root, args) {
  if (isWindows) return [path.join(root, "steam.exe"), args];
  if (isFlatpakSteam(root))
    return ["flatpak", ["run", "com.valvesoftware.Steam", ...args]];
  return ["steam", args];
}

function runDetached(command, args) {
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.on("error", error =>
    console.warn(`[SteamShortcuts] Could not run ${command}:`, error.message)
  );
  child.unref();
}

// Shortcut entries

function launchTarget() {
  if (isLinux && process.env.APPIMAGE) {
    try {
      return { exe: fs.realpathSync(process.env.APPIMAGE), args: [] };
    } catch {}
  }
  // Developer runs start Electron with the app folder as its first argument
  return {
    exe: process.execPath,
    args: isDev && process.argv[1] ? [path.resolve(process.argv[1])] : [],
  };
}

function quote(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

/**
 * The play link for a shortcut. The name is base64url so the launch options
 * carry no spaces, quotes or % that Steam would rewrite.
 */
function playLink(game) {
  const { launchToken } = require("./macShortcuts");
  const encoded = Buffer.from(game, "utf8").toString("base64url");
  return `ascendara://play/${encoded}?t=${launchToken()}&b=1&s=1`;
}

function playLinkPrefix(game) {
  return `ascendara://play/${Buffer.from(game, "utf8").toString("base64url")}?`;
}

// The same id Steam would give the shortcut, so its artwork can be named
// before Steam ever sees it
function shortcutAppId(exe, name) {
  return (zlib.crc32(`${exe}${name}`) | 0x80000000) >>> 0;
}

function buildShortcut(game, iconPath) {
  const target = launchTarget();
  const exe = quote(target.exe);
  const appId = shortcutAppId(exe, game);
  return {
    appId,
    entry: {
      appid: appId | 0,
      AppName: game,
      Exe: exe,
      StartDir: quote(path.dirname(target.exe)),
      icon: iconPath || "",
      ShortcutPath: "",
      LaunchOptions: [...target.args.map(quote), quote(playLink(game))].join(" "),
      IsHidden: 0,
      AllowDesktopConfig: 1,
      AllowOverlay: 1,
      OpenVR: 0,
      Devkit: 0,
      DevkitGameID: "",
      DevkitOverrideAppID: 0,
      LastPlayTime: 0,
      FlatpakAppID: "",
      tags: { 0: SHORTCUT_TAG },
    },
  };
}

function readShortcuts(file) {
  if (!fs.existsSync(file)) return { shortcuts: {} };
  const parsed = parseBinaryVdf(fs.readFileSync(file));
  if (!parsed.shortcuts || typeof parsed.shortcuts !== "object") parsed.shortcuts = {};
  return parsed;
}

function hasShortcutFor(shortcuts, game) {
  const prefix = playLinkPrefix(game);
  return Object.values(shortcuts).some(
    entry =>
      entry &&
      typeof entry === "object" &&
      String(entry.LaunchOptions || entry.launchoptions || "").includes(prefix)
  );
}

/**
 * Add new entries to a parsed shortcuts.vdf, renumbering so the indexes stay
 * the 0..n-1 keys Steam expects
 */
function mergeShortcuts(parsed, entries) {
  const list = Object.values(parsed.shortcuts).filter(
    entry => entry && typeof entry === "object"
  );
  for (const { game, entry } of entries) {
    if (!hasShortcutFor(parsed.shortcuts, game)) list.push(entry);
  }
  parsed.shortcuts = Object.fromEntries(list.map((entry, index) => [index, entry]));
  return parsed;
}

// Artwork

function findAsset(dir, names) {
  if (!dir) return null;
  for (const name of names) {
    const file = path.join(dir, name);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

function findCentralCover(game, settings) {
  if (path.basename(game) !== game) return null;
  for (const ext of [".jpg", ".png", ".jpeg"]) {
    const file = path.join(
      settings.downloadDirectory,
      "games",
      `${game}.ascendara${ext}`
    );
    if (fs.existsSync(file)) return file;
  }
  return null;
}

/**
 * Copy a game's artwork into Steam's grid folder under the shortcut's id.
 * Safe while Steam runs; it picks the files up when the shortcut loads.
 * Returns the portrait cover path, which also serves as the shortcut icon.
 */
function writeArtwork(gridDir, appId, assetDir, game, settings) {
  const grid =
    findAsset(assetDir, ["grid.ascendara.jpg", "grid.ascendara.png"]) ||
    findCentralCover(game, settings);
  const hero = findAsset(assetDir, ["hero.ascendara.jpg", "hero.ascendara.png"]);
  const logo = findAsset(assetDir, ["logo.ascendara.png", "logo.ascendara.jpg"]);
  const header =
    findAsset(assetDir, [
      "header.ascendara.jpg",
      "header.ascendara.png",
      "header.jpg",
      "header.jpeg",
      "header.png",
    ]) || hero;

  fs.ensureDirSync(gridDir);
  let cover = null;
  for (const [source, name] of [
    [grid, `${appId}p`],
    [hero, `${appId}_hero`],
    [logo, `${appId}_logo`],
    [header, `${appId}`],
  ]) {
    if (!source) continue;
    const ext = path.extname(source).toLowerCase() === ".png" ? ".png" : ".jpg";
    for (const old of [".png", ".jpg"]) fs.removeSync(path.join(gridDir, name + old));
    const target = path.join(gridDir, name + ext);
    try {
      fs.copyFileSync(source, target);
      if (source === grid) cover = target;
    } catch (error) {
      console.warn(`[SteamShortcuts] Could not copy artwork for ${game}:`, error.message);
    }
  }
  return cover;
}

// Applying

function writeShortcutsFile(file, parsed) {
  fs.ensureDirSync(path.dirname(file));
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.ascendara.bak`);
  const temp = `${file}.ascendara-tmp`;
  fs.writeFileSync(temp, writeBinaryVdf(parsed));
  fs.renameSync(temp, file);
}

async function waitFor(check, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (check()) return true;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return check();
}

// Puts the staged file in place once Steam has exited, unless Steam changed
// shortcuts.vdf meanwhile (the entries are then added again next time)
const LINUX_HELPER = `#!/bin/sh
staged="$1"; target="$2"; original="$3"; relaunch="$4"
i=0
while pgrep -x steam >/dev/null 2>&1; do
  i=$((i + 1))
  [ "$i" -gt 240 ] && { rm -f "$staged" "$original"; exit 1; }
  sleep 0.5
done
if [ -f "$original" ]; then
  cmp -s "$original" "$target" || { rm -f "$staged" "$original"; exit 1; }
elif [ -f "$target" ]; then
  rm -f "$staged"; exit 1
fi
[ -f "$target" ] && cp -f "$target" "$target.ascendara.bak"
mv -f "$staged" "$target"
rm -f "$original"
if [ -n "$relaunch" ]; then
  sleep 1
  sh -c "$relaunch" >/dev/null 2>&1 &
fi
`;

function startLinuxHelper(file, parsed, root) {
  const staged = file + STAGED_SUFFIX;
  const original = file + ORIGINAL_SUFFIX;
  fs.writeFileSync(staged, writeBinaryVdf(parsed));
  if (fs.existsSync(file)) fs.copyFileSync(file, original);
  else fs.removeSync(original);

  const script = path.join(os.tmpdir(), "ascendara-steam-shortcuts.sh");
  fs.writeFileSync(script, LINUX_HELPER, { mode: 0o755 });
  const relaunch = isGameMode()
    ? ""
    : isFlatpakSteam(root)
      ? "flatpak run com.valvesoftware.Steam"
      : "steam";
  const args = ["/bin/sh", script, staged, file, original, relaunch];

  // A user service lives outside Steam's process tree, so shutting Steam
  // down (and Ascendara with it, in Game Mode) doesn't stop the helper
  try {
    execFileSync(
      "systemd-run",
      ["--user", "--collect", "--quiet", "-p", "KillMode=process", ...args],
      { stdio: "ignore", timeout: 10000 }
    );
    return;
  } catch (error) {
    console.warn("[SteamShortcuts] systemd-run unavailable:", error.message);
  }
  runDetached("setsid", args);
}

/**
 * Add games to Steam. Without `restartSteam`, a running Steam is left alone
 * and the result asks for a restart instead.
 */
async function addGamesToSteam(games, { restartSteam = false } = {}) {
  const root = getSteamRoot();
  if (!root) return { success: false, error: "steam-not-found" };
  const userDir = getSteamUserDir(root);
  if (!userDir) return { success: false, error: "steam-user-not-found" };

  const settings = getSettingsManager().getSettings();
  const { findGameAssetDirectory } = require("./games");
  const file = path.join(userDir, "config", "shortcuts.vdf");
  const gridDir = path.join(userDir, "config", "grid");

  let parsed;
  try {
    parsed = readShortcuts(file);
  } catch (error) {
    console.error("[SteamShortcuts] Could not read shortcuts.vdf:", error);
    return { success: false, error: "shortcuts-unreadable" };
  }

  const added = [];
  const skipped = [];
  const entries = [];
  for (const game of [...new Set(games)].filter(
    name => typeof name === "string" && name
  )) {
    if (hasShortcutFor(parsed.shortcuts, game)) {
      skipped.push(game);
      continue;
    }
    const { dir: assetDir } = settings.downloadDirectory
      ? findGameAssetDirectory(game, settings)
      : { dir: null };
    const { appId } = buildShortcut(game);
    const cover = writeArtwork(gridDir, appId, assetDir, game, settings);
    // Steam's icon field takes .png or .ico, so a .jpg cover leaves Ascendara's icon
    const icon = cover && cover.endsWith(".png") ? cover : "";
    entries.push({ game, entry: buildShortcut(game, icon).entry });
    added.push(game);
  }
  if (!entries.length) return { success: true, added, skipped, restarting: false };

  const running = isSteamRunning();
  if (running && !restartSteam) {
    return { success: true, added: [], skipped, pending: added, needsRestart: true };
  }

  try {
    if (!running) {
      writeShortcutsFile(file, mergeShortcuts(parsed, entries));
      return { success: true, added, skipped, restarting: false };
    }

    if (isLinux) {
      startLinuxHelper(file, mergeShortcuts(parsed, entries), root);
      const [command, args] = steamCommand(root, ["-shutdown"]);
      runDetached(command, args);
      return { success: true, added, skipped, restarting: true, gameMode: isGameMode() };
    }

    // Windows: Steam closing doesn't take Ascendara with it, so do it here
    const [command, args] = steamCommand(root, ["-shutdown"]);
    runDetached(command, args);
    if (!(await waitFor(() => !isSteamRunning(), 60000))) {
      return { success: false, error: "steam-did-not-close" };
    }
    // Read again in case Steam saved changes on the way out
    writeShortcutsFile(file, mergeShortcuts(readShortcuts(file), entries));
    const [start, startArgs] = steamCommand(root, []);
    runDetached(start, startArgs);
    return { success: true, added, skipped, restarting: true };
  } catch (error) {
    console.error("[SteamShortcuts] Could not add shortcuts:", error);
    return { success: false, error: "write-failed" };
  }
}

/**
 * Which of these games already have a Steam shortcut from Ascendara
 */
function getGamesInSteam(games) {
  try {
    const root = getSteamRoot();
    const userDir = root && getSteamUserDir(root);
    if (!userDir) return [];
    const file = path.join(userDir, "config", "shortcuts.vdf");
    const { shortcuts } = readShortcuts(file);
    // A change waiting for Steam to restart counts as added
    const staged = fs.existsSync(file + STAGED_SUFFIX)
      ? readShortcuts(file + STAGED_SUFFIX).shortcuts
      : {};
    return games.filter(
      game => hasShortcutFor(shortcuts, game) || hasShortcutFor(staged, game)
    );
  } catch (error) {
    console.warn("[SteamShortcuts] Could not read Steam shortcuts:", error.message);
    return [];
  }
}

function isSupported() {
  return (isLinux || isWindows) && Boolean(getSteamRoot());
}

function registerSteamShortcutHandlers() {
  ipcMain.handle("steam-shortcuts-supported", () => isSupported());
  ipcMain.handle("get-games-in-steam", (_, games) =>
    Array.isArray(games) ? getGamesInSteam(games) : []
  );
  ipcMain.handle("add-games-to-steam", (_, games, options) =>
    addGamesToSteam(Array.isArray(games) ? games : [games], options || {})
  );
}

module.exports = {
  registerSteamShortcutHandlers,
  addGamesToSteam,
  getGamesInSteam,
  parseBinaryVdf,
  writeBinaryVdf,
  shortcutAppId,
};
