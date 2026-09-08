const nodeFs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const LAUNCHERS = Object.freeze(["steam", "epic", "gog", "ubisoft", "battlenet"]);
const BATTLE_PRODUCTS = Object.freeze({
  wow: "WoW",
  d3: "D3",
  fen: "Fen",
  osi: "OSI",
  s1: "S1",
  s2: "S2",
  pro: "Pro",
  wtcg: "WTCG",
  hero: "Hero",
});
const BATTLE_NAMES = Object.freeze({
  "world of warcraft": "wow",
  "diablo iii": "d3",
  "diablo iv": "fen",
  "diablo ii resurrected": "osi",
  "starcraft remastered": "s1",
  "starcraft ii": "s2",
  overwatch: "pro",
  "overwatch 2": "pro",
  hearthstone: "wtcg",
  "heroes of the storm": "hero",
});
const BATTLE_EXECUTABLES = Object.freeze({
  WoW: ["Wow.exe"],
  D3: ["Diablo III.exe", "Diablo III64.exe"],
  Fen: ["Diablo IV.exe"],
  OSI: ["D2R.exe"],
  S1: ["StarCraft.exe"],
  S2: ["SC2.exe", "SC2_x64.exe"],
  Pro: ["Overwatch.exe"],
  WTCG: ["Hearthstone.exe"],
  Hero: ["HeroesOfTheStorm.exe", "HeroesOfTheStorm_x64.exe"],
});
const UNINSTALL = "\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall";
const NON_GAME_EXECUTABLE =
  /unins|setup|redist|vcredist|directx|crash(?:report|pad|handler|sender)|reporter|updater|installer|prereq|battle\.net|ubisoftconnect|goggalaxy/i;
const HELPER =
  /unins|setup|redist|vcredist|directx|crash(?:report|pad|handler|sender)|reporter|helper|launcher|updater|installer|support|prereq|anticheat|battle\.net|ubisoftconnect|goggalaxy/i;
const SUPPORT_TITLE =
  /(?:\bdlc\b|redistributable|steamworks shared|steam linux runtime|^proton(?:\s|$)|dedicated server|soundtrack|artbook)/i;

function battleProduct(id) {
  if (typeof id !== "string") return null;
  const entry = Object.entries(BATTLE_PRODUCTS).find(([key, value]) =>
    [key.toLowerCase(), value.toLowerCase()].includes(id.toLowerCase())
  );
  return entry ? entry[1] : null;
}

function buildLauncherUri(launcher, id) {
  if (typeof id !== "string" && typeof id !== "number") return null;
  id = String(id);
  if (launcher === "steam" && /^[1-9]\d{0,11}$/.test(id)) {
    return `steam://rungameid/${id}`;
  }
  if (launcher === "ubisoft" && /^[1-9]\d{0,11}$/.test(id)) {
    return `uplay://launch/${id}/0`;
  }
  if (launcher === "epic") {
    const parts = id.split(":");
    if (
      (parts.length === 1 || parts.length === 3) &&
      parts.every(part => /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]{0,199}$/.test(part))
    ) {
      return `com.epicgames.launcher://apps/${encodeURIComponent(id)}?action=launch&silent=true`;
    }
  }
  if (launcher === "battlenet") {
    const product = battleProduct(id);
    return product ? `battlenet://${product}` : null;
  }
  return null;
}

function validateLauncherUri(uri, launcher) {
  if (typeof uri !== "string" || uri.length > 2048) return false;
  for (const source of launcher ? [launcher] : LAUNCHERS) {
    let id;
    if (source === "steam") id = /^steam:\/\/rungameid\/(\d+)$/.exec(uri)?.[1];
    if (source === "ubisoft") id = /^uplay:\/\/launch\/(\d+)\/0$/.exec(uri)?.[1];
    if (source === "battlenet") id = /^battlenet:\/\/([a-zA-Z0-9]+)$/.exec(uri)?.[1];
    if (source === "epic") {
      const match =
        /^com\.epicgames\.launcher:\/\/apps\/([^/?#]+)\?action=launch&silent=true$/.exec(
          uri
        );
      if (match) {
        try {
          id = decodeURIComponent(match[1]);
        } catch {
          return false;
        }
      }
    }
    if (id && buildLauncherUri(source, id) === uri) return true;
  }
  return false;
}

function parseVdf(text) {
  const tokens = [];
  const pattern = /\s+|\/\/[^\r\n]*|"((?:\\.|[^"\\])*)"|([{}])|([^\s"{}]+)/gy;
  let index = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (index < text.length) {
    pattern.lastIndex = index;
    const match = pattern.exec(text);
    if (!match) throw new Error("Malformed VDF token");
    index = pattern.lastIndex;
    if (match[1] !== undefined) {
      tokens.push({ value: match[1].replace(/\\([\\"])/g, "$1") });
    } else if (match[2]) {
      tokens.push(match[2]);
    } else if (match[3]) {
      tokens.push({ value: match[3] });
    }
  }
  let cursor = 0;
  function object(nested, depth) {
    if (depth > 32) throw new Error("VDF nesting limit exceeded");
    const result = Object.create(null);
    while (cursor < tokens.length) {
      const key = tokens[cursor++];
      if (key === "}" && nested) return result;
      if (typeof key !== "object") throw new Error("Malformed VDF key");
      const value = tokens[cursor++];
      if (value === "{") result[key.value.toLowerCase()] = object(true, depth + 1);
      else if (value && typeof value === "object")
        result[key.value.toLowerCase()] = value.value;
      else throw new Error("Malformed VDF value");
    }
    if (nested) throw new Error("Unclosed VDF object");
    return result;
  }
  return object(false, 0);
}

function createRegistryAdapter() {
  async function query(method, options) {
    const Registry = require("winreg");
    return new Promise((resolve, reject) => {
      new Registry(options)[method]((error, result) =>
        error ? reject(error) : resolve(result)
      );
    });
  }
  return {
    values: options => query("values", options),
    keys: async options => (await query("keys", options)).map(item => item.key),
  };
}

function missing(error) {
  return (
    ["ENOENT", "ENOTDIR", "ERROR_FILE_NOT_FOUND", "FILE_NOT_FOUND"].includes(
      error?.code
    ) ||
    /unable to find the specified registry key|cannot find the (?:file|path|registry key)|registry key.*not found/i.test(
      error?.message || ""
    )
  );
}

function createLauncherDiscovery(options = {}) {
  const fs = options.fs?.promises || options.fs || nodeFs.promises;
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const registry = options.registry || createRegistryAdapter();
  const home = options.homedir || env.HOME || env.USERPROFILE || os.homedir();

  async function discoverLauncherGames(launcher) {
    if (!LAUNCHERS.includes(launcher)) throw new Error("Unsupported launcher");
    const games = [];
    const warnings = [];
    const seenIds = new Set();
    const seenPaths = new Set();
    const seenNames = new Set();
    const warn = (source, error) =>
      warnings.push(`${source}: ${error?.message || error}`);
    const identity = value => (platform === "win32" ? value.toLowerCase() : value);
    const text = value => (typeof value === "string" ? value.trim() : "");
    const validName = value =>
      typeof value === "string" &&
      value.trim().length > 0 &&
      value.length <= 300 &&
      !/[\x00-\x1f\x7f]/.test(value);

    function localPath(value) {
      value = text(value).replace(/^"(.*)"$/, "$1");
      value = value.replace(
        /%([^%]+)%/g,
        (match, key) =>
          Object.entries(env).find(
            ([name]) => name.toLowerCase() === key.toLowerCase()
          )?.[1] || match
      );
      if (
        !value ||
        /[\x00-\x1f\x7f]/.test(value) ||
        /^[\\/]{2}/.test(value) ||
        !path.isAbsolute(value)
      )
        return null;
      value = path.resolve(value);
      return value === path.parse(value).root ? null : value;
    }

    function inside(root, target) {
      const relative = path.relative(identity(root), identity(target));
      return (
        relative !== ".." &&
        !relative.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relative)
      );
    }

    async function stat(file) {
      try {
        return await fs.stat(file);
      } catch (error) {
        if (!missing(error)) warn(file, error);
        return null;
      }
    }

    async function directory(value) {
      const location = localPath(value);
      if (!location || !(await stat(location))?.isDirectory()) return null;
      try {
        return localPath(await fs.realpath(location));
      } catch (error) {
        if (!missing(error)) warn(location, error);
        return null;
      }
    }

    async function entries(location) {
      try {
        const found = await fs.readdir(location, { withFileTypes: true });
        if (found.length > 5000)
          warn(location, "Entry limit reached; some installations may be omitted");
        return found.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 5000);
      } catch (error) {
        if (!missing(error)) warn(location, error);
        return [];
      }
    }

    async function metadata(file) {
      const info = await fs.stat(file);
      if (!info.isFile() || info.size > 2 * 1024 * 1024)
        throw new Error("Invalid or oversized metadata file");
      return (await fs.readFile(file, "utf8")).replace(/^\uFEFF/, "");
    }

    async function isolate(source, callback) {
      try {
        await callback();
      } catch (error) {
        warn(source, error);
      }
    }

    async function registryQuery(method, hive, key, arch) {
      try {
        return await registry[method]({ hive, key, arch });
      } catch (error) {
        if (!missing(error)) warn(`${hive}${key} (${arch})`, error);
        return method === "keys" ? [] : {};
      }
    }

    async function values(hive, key, arch) {
      const result = await registryQuery("values", hive, key, arch);
      const pairs = Array.isArray(result)
        ? result.map(item => [item.name, item.value])
        : Object.entries(result || {});
      return Object.fromEntries(
        pairs.map(([name, value]) => [name.toLowerCase(), value])
      );
    }

    async function registryEntries(key, hives = ["HKLM"]) {
      const result = [];
      for (const hive of hives) {
        for (const arch of ["x64", "x86"]) {
          const children = await registryQuery("keys", hive, key, arch);
          if (children.length > 5000)
            warn(`${hive}${key}`, "Registry entry limit reached");
          const bounded = children.slice(0, 5000);
          for (let index = 0; index < bounded.length; index += 8) {
            const batch = await Promise.all(
              bounded.slice(index, index + 8).map(async child => {
                const childKey = typeof child === "string" ? child : child?.key;
                if (
                  typeof childKey !== "string" ||
                  !childKey.toLowerCase().startsWith(`${key.toLowerCase()}\\`)
                )
                  return null;
                let record = null;
                await isolate(`${hive}${childKey}`, async () => {
                  record = { key: childKey, values: await values(hive, childKey, arch) };
                });
                return record;
              })
            );
            result.push(...batch.filter(Boolean));
          }
        }
      }
      return result;
    }

    async function executable(root, value) {
      if (typeof value !== "string" || !value.trim() || /[\x00-\x1f\x7f]/.test(value))
        return null;
      value = value.trim().replace(/^"(.*)"$/, "$1");
      if (/^[\\/]{2}/.test(value) || (!path.isAbsolute(value) && /^[a-z]:/i.test(value)))
        return null;
      const file = path.resolve(root, value);
      if (!inside(root, file) || NON_GAME_EXECUTABLE.test(path.basename(file)) ||
        path.relative(root, path.dirname(file)).split(path.sep).some(part => HELPER.test(part)))
        return null;
      if (platform === "win32" && !/\.exe$/i.test(file)) return null;
      if (!(await stat(file))?.isFile()) return null;
      const real = await fs.realpath(file);
      if (!inside(root, real) || NON_GAME_EXECUTABLE.test(path.basename(real)))
        return null;
      if (platform === "win32" && !/\.exe$/i.test(real)) return null;
      if (
        platform !== "win32" &&
        !/\.exe$/i.test(real) &&
        !((await stat(real))?.mode & 0o111)
      )
        return null;
      return real;
    }

    const executableCandidates = new Map();
    const normalizedExecutableName = value =>
      value.replace(/\.exe$/i, "").toLowerCase().replace(/[^a-z0-9]/g, "");

    async function metadataExecutable(root, ...records) {
      for (const data of records.filter(Boolean)) {
        const icon =
          /^\s*(?:"([^"]+\.exe)"|([^"\r\n]+\.exe))(?:\s*,\s*-?\d+)?\s*$/i.exec(
            text(data.displayicon)
          );
        for (const value of [data.executable, data.launchexecutable, data.exe, icon?.[1], icon?.[2]]) {
          const found = await executable(root, value);
          if (found) return found;
        }
      }
      return null;
    }

    async function fallbackExecutable(root, name, known = []) {
      const queue = [{ location: root, depth: 0 }];
      const candidates = [];
      let visited = 0;
      while (queue.length && visited < 512) {
        const { location, depth } = queue.shift();
        for (const entry of await entries(location)) {
          if (++visited > 512) break;
          if (HELPER.test(entry.name) || entry.isSymbolicLink()) continue;
          const file = path.join(location, entry.name);
          if (entry.isDirectory() && depth < 3)
            queue.push({ location: file, depth: depth + 1 });
          if (entry.isFile() && /\.exe$/i.test(entry.name)) {
            const candidate = await executable(root, file);
            if (candidate) candidates.push(candidate);
          }
        }
      }
      if (visited >= 512) warn(name, "Executable search limit reached");
      executableCandidates.set(identity(root), candidates);
      const exact = candidates.filter(file =>
        normalizedExecutableName(path.basename(file)) === normalizedExecutableName(name) ||
        known.some(value => value.toLowerCase() === path.basename(file).toLowerCase())
      );
      if (candidates.length === 1 || exact.length === 1) {
        warn(
          name,
          "Executable inferred from a bounded installation-folder search; verify before launching"
        );
        return exact.length === 1 ? exact[0] : candidates[0];
      }
      warn(
        name,
        candidates.length
          ? "Multiple game executables found; no safe automatic choice"
          : "No launchable executable found"
      );
      return null;
    }

    function add(game, id, installPath, exe, launchUri) {
      if (
        !validName(game) ||
        SUPPORT_TITLE.test(game)
      )
        return;
      const idKey = id ? String(id).toLowerCase() : "";
      const pathKey = identity(installPath);
      const nameKey = game.trim().replace(/\s+/g, " ").toLowerCase();
      if (
        (idKey && seenIds.has(idKey)) ||
        seenPaths.has(pathKey) ||
        seenNames.has(nameKey)
      )
        return;
      if (idKey) seenIds.add(idKey);
      seenPaths.add(pathKey);
      seenNames.add(nameKey);
      if (!exe) warn(game, "Executable not resolved; select it with Executable Manager before launching");
      games.push({
        game: game.trim(),
        launcher,
        launcherId: id ? String(id) : "",
        installPath,
        executable: exe || "",
        ...(!exe && executableCandidates.get(pathKey)?.length
          ? { executables: executableCandidates.get(pathKey) }
          : {}),
        ...(launchUri ? { launchUri } : {}),
      });
    }

    async function steam() {
      const roots = [];
      if (platform === "win32") {
        for (const hive of ["HKCU", "HKLM"]) {
          for (const arch of ["x64", "x86"]) {
            const data = await values(hive, "\\SOFTWARE\\Valve\\Steam", arch);
            roots.push(data.steampath, data.installpath);
          }
        }
        roots.push(
          path.join(env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Steam"),
          path.join(env.ProgramFiles || "C:\\Program Files", "Steam")
        );
      } else if (platform === "darwin") {
        roots.push(path.join(home, "Library", "Application Support", "Steam"));
      } else if (platform === "linux") {
        roots.push(
          path.join(home, ".steam", "steam"),
          path.join(home, ".steam", "root"),
          path.join(env.XDG_DATA_HOME || path.join(home, ".local", "share"), "Steam"),
          path.join(
            home,
            ".var",
            "app",
            "com.valvesoftware.Steam",
            ".local",
            "share",
            "Steam"
          )
        );
      } else {
        warn("Steam", `Discovery is not supported on ${platform}`);
        return;
      }
      const libraries = new Set();
      const rootIds = new Set();
      for (const candidate of roots.filter(Boolean)) {
        const root = await directory(candidate);
        if (!root || rootIds.has(identity(root))) continue;
        rootIds.add(identity(root));
        libraries.add(root);
        for (const file of [
          path.join(root, "steamapps", "libraryfolders.vdf"),
          path.join(root, "config", "libraryfolders.vdf"),
        ]) {
          if (!(await stat(file))) continue;
          await isolate(file, async () => {
            const data = parseVdf(await metadata(file)).libraryfolders;
            if (!data || typeof data !== "object")
              throw new Error("Missing LibraryFolders metadata");
            for (const [id, entry] of Object.entries(data)) {
              if (!/^\d+$/.test(id)) continue;
              const library = await directory(
                typeof entry === "string" ? entry : entry.path
              );
              if (library) libraries.add(library);
            }
          });
        }
      }
      for (const library of libraries) {
        const apps = path.join(library, "steamapps");
        for (const entry of await entries(apps)) {
          const match = /^appmanifest_(\d+)\.acf$/i.exec(entry.name);
          if (!entry.isFile() || !match) continue;
          await isolate(entry.name, async () => {
            const data = parseVdf(await metadata(path.join(apps, entry.name))).appstate;
            if (
              !data ||
              !validName(data.name) ||
              !data.installdir ||
              data.appid !== match[1]
            )
              throw new Error("Invalid Steam app manifest");
            if (
              data.appid === "228980" ||
              SUPPORT_TITLE.test(data.name) ||
              /^(dlc|tool|music|config)$/i.test(data.type || "")
            )
              return;
            if (
              data.stateflags !== undefined &&
              (!/^\d+$/.test(data.stateflags) || !(Number(data.stateflags) & 4))
            )
              return;
            const common = await directory(path.join(apps, "common"));
            if (
              !common ||
              typeof data.installdir !== "string" ||
              path.isAbsolute(data.installdir) ||
              /^[a-z]:/i.test(data.installdir)
            )
              return;
            const target = path.resolve(common, data.installdir);
            if (!inside(common, target) || target === common)
              throw new Error("Steam install directory escapes its library");
            const install = await directory(target);
            if (!install) return;
            if (!inside(common, install))
              throw new Error("Steam install directory resolves outside its library");
            add(
              data.name,
              data.appid,
              install,
              (await metadataExecutable(install, data)) ||
                (await fallbackExecutable(install, data.name)),
              buildLauncherUri("steam", data.appid)
            );
          });
        }
      }
    }

    async function epic() {
      const manifestRoot = path.join(
        env.ProgramData || "C:\\ProgramData",
        "Epic",
        "EpicGamesLauncher",
        "Data",
        "Manifests"
      );
      for (const entry of await entries(manifestRoot)) {
        if (!entry.isFile() || !/\.item$/i.test(entry.name)) continue;
        await isolate(entry.name, async () => {
          const data = JSON.parse(await metadata(path.join(manifestRoot, entry.name)));
          if (!data || !validName(data.DisplayName) || !text(data.AppName))
            throw new Error("Invalid Epic manifest");
          if (
            data.bIsIncompleteInstall === true ||
            data.bIsApplication === false ||
            SUPPORT_TITLE.test(data.DisplayName)
          )
            return;
          if (
            Array.isArray(data.AppCategories) &&
            data.AppCategories.some(category =>
              /^(dlc|addons?|mods?|plugins?|assets?|engine)$/i.test(category)
            )
          )
            return;
          if (data.MainGameAppName && data.MainGameAppName !== data.AppName) return;
          const install = await directory(data.InstallLocation);
          if (!install) return;
          const exe = await executable(install, data.LaunchExecutable);
          if (!exe) {
            warn(
              data.DisplayName,
              "Missing or unsafe Epic launch executable; select an executable before launching"
            );
          }
          const id =
            data.CatalogNamespace && data.CatalogItemId
              ? `${data.CatalogNamespace}:${data.CatalogItemId}:${data.AppName}`
              : data.AppName;
          const uri = buildLauncherUri("epic", id);
          if (!uri) throw new Error("Invalid Epic app identity");
          add(data.DisplayName, id, install, exe, uri);
        });
      }
    }

    async function gog() {
      for (const entry of await registryEntries("\\SOFTWARE\\GOG.com\\Games")) {
        await isolate(entry.key, async () => {
          const data = entry.values;
          const name = data.gamename || data.name;
          if (!validName(name) || SUPPORT_TITLE.test(name)) return;
          const install = await directory(data.path);
          if (!install) return;
          const exe =
            (await executable(install, data.exe)) ||
            (await fallbackExecutable(install, name));
          const id = String(data.gameid || entry.key.split("\\").pop());
          if (!/^\d+$/.test(id))
            warn(name, "GOG game ID is missing or unrecognized; using executable only");
          add(name, /^\d+$/.test(id) ? id : "", install, exe);
        });
      }
    }

    async function ubisoft() {
      const installs = await registryEntries("\\SOFTWARE\\Ubisoft\\Launcher\\Installs");
      if (!installs.length) return;
      const uninstall = await registryEntries(UNINSTALL, ["HKLM", "HKCU"]);
      for (const entry of installs) {
        await isolate(entry.key, async () => {
          const id = entry.key.split("\\").pop();
          const uri = buildLauncherUri("ubisoft", id);
          if (!uri) return;
          const install = await directory(
            entry.values.installdir || entry.values.installlocation || entry.values.path
          );
          if (!install) return;
          const record = uninstall.find(item => {
            const keyId = /(?:Uplay Install |Ubisoft Game )([0-9]+)$/i.exec(
              item.key
            )?.[1];
            const location = localPath(item.values.installlocation);
            return (
              keyId === id ||
              (/ubisoft/i.test(item.values.publisher || "") &&
                location &&
                identity(location) === identity(install))
            );
          });
          let name =
            record?.values.displayname || entry.values.displayname || entry.values.name;
          if (!validName(name)) {
            name = path.basename(install);
            warn(
              name,
              "Ubisoft display name unavailable; using installation directory name"
            );
          }
          const exe =
            (await metadataExecutable(install, entry.values, record?.values)) ||
            (await fallbackExecutable(install, name));
          add(name, id, install, exe, uri);
        });
      }
    }

    async function battlenet() {
      for (const entry of await registryEntries(UNINSTALL, ["HKLM", "HKCU"])) {
        await isolate(entry.key, async () => {
          const data = entry.values;
          const name = data.displayname;
          if (
            !validName(name) ||
            SUPPORT_TITLE.test(name) ||
            /^(battle\.net|blizzard (?:app|battle\.net))$/i.test(name.trim())
          )
            return;
          const install = await directory(data.installlocation);
          if (!install) return;
          const publisher =
            /^(blizzard entertainment|activision blizzard)(?:[,.\s]|$)/i.test(
              text(data.publisher)
            );
          const uninstaller =
            /(?:^|[\\/])(?:Battle\.net|BlizzardUninstaller)\.exe(?:"|\s|$)/i.test(
              text(data.uninstallstring)
            );
          const marker =
            publisher && (await stat(path.join(install, ".build.info")))?.isFile();
          if (!uninstaller && !marker) return;
          const explicit =
            data.productid ||
            /(?:--product(?:=|\s+)|\/game(?:=|\s+)|\/product(?:=|\s+))"?([a-zA-Z0-9_]+)/i.exec(
              text(data.uninstallstring)
            )?.[1];
          const normalizedName = name
            .toLowerCase()
            .replace(/[®™:]/g, "")
            .replace(/\s+/g, " ")
            .trim();
          const product =
            battleProduct(explicit) || battleProduct(BATTLE_NAMES[normalizedName]);
          const uri = product ? buildLauncherUri("battlenet", product) : null;
          const exe =
            (await metadataExecutable(install, data)) ||
            (await fallbackExecutable(install, name, BATTLE_EXECUTABLES[product] || []));
          if (!product)
            warn(
              name,
              "Battle.net product ID could not be reliably identified; executable-only launch is used when available"
            );
          add(name, product || "", install, exe, uri);
        });
      }
    }

    if (launcher !== "steam" && platform !== "win32") {
      warn(
        launcher,
        `Local discovery is not supported on ${platform}; Windows installation metadata is required`
      );
    } else {
      await isolate(launcher, () =>
        ({ steam, epic, gog, ubisoft, battlenet })[launcher]()
      );
    }
    games.sort((a, b) => a.game.localeCompare(b.game));
    return { games, warnings: [...new Set(warnings)] };
  }

  return { discoverLauncherGames };
}

const { discoverLauncherGames } = createLauncherDiscovery();
module.exports = {
  LAUNCHERS,
  discoverLauncherGames,
  createLauncherDiscovery,
  buildLauncherUri,
  validateLauncherUri,
};
