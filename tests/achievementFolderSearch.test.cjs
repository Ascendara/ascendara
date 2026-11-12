const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  normalizeAppId,
  getWindowsRoots,
  searchAppIdFolders,
  searchAchievementFolders,
} = require("../electron/modules/library/achievementFolderSearch");

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "ascendara-appid-"));

test("app IDs must be short numeric strings", () => {
  assert.equal(normalizeAppId("730"), "730");
  assert.equal(normalizeAppId(" 0123 "), "0123");
  for (const value of ["", "abc", "73 0", "12/34", "-12", null, undefined, "12345678901"])
    assert.equal(normalizeAppId(value), null);
});

test("windows roots mirror the achievement watcher defaults", () => {
  const roots = getWindowsRoots({
    env: {
      SystemDrive: "D:",
      PUBLIC: "D:\\Public",
      APPDATA: "D:\\AppData",
      LOCALAPPDATA: "D:\\Local",
      PROGRAMDATA: "D:\\ProgramData",
    },
    homedir: "D:\\Home",
    documentsPath: "D:\\Documents",
  });
  for (const expected of [
    path.join("D:\\Public", "Documents", "Steam", "CODEX"),
    path.join("D:\\Public", "Documents", "Steam", "RUNE"),
    path.join("D:\\Public", "Documents", "OnlineFix"),
    path.join("D:\\AppData", "Goldberg SteamEmu Saves"),
    path.join("D:\\AppData", "GSE Saves"),
    path.join("D:\\AppData", "SmartSteamEmu"),
    path.join("D:\\Local", "SKIDROW"),
    path.join("D:\\ProgramData", "Steam"),
    path.join("D:\\Documents", "SKIDROW"),
  ]) {
    assert.ok(roots.includes(expected), `missing ${expected}`);
  }
});

test("search finds app ID folders in default and custom roots only", async () => {
  const root = tempDir();
  const env = {
    SystemDrive: root,
    PUBLIC: path.join(root, "Public"),
    APPDATA: path.join(root, "AppData"),
    LOCALAPPDATA: path.join(root, "Local"),
    PROGRAMDATA: path.join(root, "ProgramData"),
  };
  const appId = "123456";
  const defaultMatch = path.join(root, "Public", "Documents", "Steam", "CODEX", appId);
  const customRoot = path.join(root, "Custom");
  const customMatch = path.join(customRoot, "Some Game", "saves", appId);
  const unrelated = path.join(customRoot, "Some Game", `${appId}0`);
  fs.mkdirSync(defaultMatch, { recursive: true });
  fs.mkdirSync(customMatch, { recursive: true });
  fs.mkdirSync(unrelated, { recursive: true });

  const response = await searchAchievementFolders({
    appId,
    watchedFolders: [customRoot],
    platform: "win32",
    env,
    homedir: root,
    documentsPath: path.join(root, "Documents"),
  });

  assert.equal(response.success, true);
  assert.deepEqual(response.results.sort(), [customMatch, defaultMatch].sort());
});

test("search reports invalid app IDs without scanning", async () => {
  const response = await searchAchievementFolders({
    appId: "not-an-id",
    watchedFolders: [],
    platform: "win32",
  });
  assert.deepEqual(response, { success: false, error: "invalidAppId" });
});

test("scan stops at the entry limit and flags truncated results", async () => {
  const root = tempDir();
  fs.mkdirSync(path.join(root, "123", "nested"), { recursive: true });
  const found = await searchAppIdFolders([root], "123", {
    maxEntries: 1,
    maxDepth: 2,
    maxMs: 5000,
  });
  assert.deepEqual(found.results, [path.join(root, "123")]);
  assert.equal(found.truncated, true);
});
