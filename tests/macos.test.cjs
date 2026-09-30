const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function config(platform, packaged = true) {
  const filename = path.resolve(__dirname, "../electron/modules/config.js");
  const context = {
    module: { exports: {} },
    __dirname: path.dirname(filename),
    process: {
      platform,
      resourcesPath: "/Applications/Ascendara.app/Contents/Resources",
      env: { USERPROFILE: "/home/test", LOCALAPPDATA: "/home/test/AppData" },
    },
    require(name) {
      if (name === "electron")
        return {
          app: {
            isPackaged: packaged,
            getPath: () => "/Applications/Ascendara.app/Contents/MacOS/Ascendara",
          },
        };
      if (name === "os") return { platform: () => platform, homedir: () => "/home/test" };
      if (name === "fs") return { existsSync: () => false };
      if (name === "./wine-setup")
        return { findCommand: () => "/opt/homebrew/bin/ludusavi" };
      return require(name);
    },
  };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), context, { filename });
  return context.module.exports;
}

test("Mac helper paths resolve inside bundle resources without Windows extensions", () => {
  const mac = config("darwin");
  assert.equal(
    mac.getHelperPath("AscendaraDownloader"),
    "/Applications/Ascendara.app/Contents/Resources/AscendaraDownloader"
  );
  assert.equal(mac.toolExecutables.translator, "AscendaraLanguageTranslation");
  assert.equal(mac.unixConfigDir, "/home/test/.ascendara");
  assert.equal(mac.linuxCompatDataDir, null);
  assert.equal(
    mac.LANG_DIR,
    "/home/test/Library/Application Support/ascendara/languages"
  );
  assert.equal(mac.getLudusaviPath(), "/opt/homebrew/bin/ludusavi");
});

test("development helper paths are independent of the working directory", () => {
  assert.equal(
    config("darwin", false).getHelperPath("AscendaraDownloader"),
    path.resolve(__dirname, "../binaries/AscendaraDownloader/dist/AscendaraDownloader")
  );
  assert.match(
    config("win32", false).getHelperPath("AscendaraDownloader"),
    /AscendaraDownloader\.exe$/
  );
});

test("platform packaging does not include foreign helper executables", async () => {
  const build = require("../package.json").build;
  await require("app-builder-lib/out/util/config/config").validateConfiguration(build);
  assert.ok(build.extraResources.every(entry => !entry.from.endsWith(".exe")));
  for (const platform of ["mac", "linux"]) {
    assert.ok(
      build[platform].extraResources.every(entry => !entry.from.endsWith(".exe"))
    );
  }
  assert.ok(
    build.win.extraResources.some(entry => entry.from.endsWith("AscendaraDownloader.exe"))
  );
});

test("Mac update installer refuses a Linux or Windows payload before spawning", async () => {
  let spawned = false;
  const context = {
    module: { exports: {} },
    process: { platform: "darwin" },
    require(name) {
      if (name === "child_process")
        return {
          spawn() {
            spawned = true;
          },
        };
      if (name === "electron") return { app: {} };
      return require(name);
    },
  };
  vm.runInNewContext(
    fs.readFileSync(
      path.resolve(__dirname, "../electron/modules/install-update.js"),
      "utf8"
    ),
    context
  );
  await assert.rejects(
    context.module.exports("/tmp/update.AppImage", false),
    /macOS update/
  );
  assert.equal(spawned, false);
});
