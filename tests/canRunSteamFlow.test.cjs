const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("./helpers/loadModule.cjs");

const GIB = 1024 ** 3;
const RAW_NAME = "Game Name: Deluxe Edition - v1.2.3 + 5 DLCs + Bonus";
const STEAM_GAME = {
  name: "Game Name",
  system_requirements: {
    minimum:
      "Minimum:Requires a 64-bit processor and operating systemOS *: Windows 10Processor: Intel Core i5-4590 / AMD FX 8350Memory: 8 GB RAMGraphics: NVIDIA GeForce GTX 970 / AMD Radeon R9 290DirectX: Version 11Storage: 10 GB available space",
    recommended: "",
  },
};
const JUDGED_LINES = ["cpu", "gpu", "os", "ram", "storage"];

test("a FitGirl name with no index minimums gets Steam's and a verdict per line", async () => {
  const { findGameDetails, matchRequirements } = await loadModule(
    "src/lib/steamMatch.js",
    { fresh: true }
  );
  const { checkCanRun } = await loadModule("src/lib/canRunCheck.js", { fresh: true });

  // Steam only knows the clean name, like the real store search
  const asked = [];
  const lookup = async name => {
    asked.push(name);
    return name === "Game Name" ? STEAM_GAME : null;
  };

  // Download page: the index entry has no minReqs, so the card borrows Steam's
  const steamData = await findGameDetails(RAW_NAME, lookup);
  const match = await matchRequirements(RAW_NAME, { known: steamData, lookup });
  assert.deepEqual(asked, [RAW_NAME, "Game Name"]);
  assert.equal(match.name, "Game Name");
  assert.deepEqual(match.minReqs, {
    os: "Windows 10",
    cpu: "Intel Core i5-4590 / AMD FX 8350",
    ram: "8 GB RAM",
    gpu: "NVIDIA GeForce GTX 970 / AMD Radeon R9 290",
    directx: "Version 11",
    storage: "10 GB available space",
  });

  const win11 = { platform: "win32", osRelease: "10.0.22631", arch: "x64" };
  const strong = checkCanRun(
    match.minReqs,
    {
      ...win11,
      totalMemory: 16 * GIB,
      cpu: "AMD Ryzen 7 9700X 8-Core Processor",
      cpuCores: 16,
      cpuSpeedMhz: 3800,
      gpu: "NVIDIA GeForce RTX 5070",
    },
    { freeSpace: 100 * GIB, downloadSize: 5 * GIB }
  );
  assert.deepEqual(Object.keys(strong).sort(), JUDGED_LINES);
  for (const line of JUDGED_LINES) assert.equal(strong[line].status, "pass", line);

  const weak = checkCanRun(
    match.minReqs,
    {
      platform: "win32",
      osRelease: "6.1.7601",
      arch: "x64",
      totalMemory: 4 * GIB,
      cpu: "Intel(R) Core(TM) i3-2100 CPU @ 3.10GHz",
      cpuCores: 4,
      cpuSpeedMhz: 3100,
      gpu: "NVIDIA GeForce GT 1030",
    },
    { freeSpace: 2 * GIB, downloadSize: 5 * GIB }
  );
  assert.deepEqual(Object.keys(weak).sort(), JUDGED_LINES);
  for (const line of JUDGED_LINES) assert.equal(weak[line].status, "fail", line);
});
