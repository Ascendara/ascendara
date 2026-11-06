const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("./helpers/loadModule.cjs");

const load = () => loadModule("src/lib/canRunCheck.js");
const GIB = 1024 ** 3;
const win11 = { platform: "win32", osRelease: "10.0.22631", arch: "x64" };
const win10 = { platform: "win32", osRelease: "10.0.19045", arch: "x64" };

test("requirement sizes parse only from a leading number and unit", async () => {
  const { parseRequirementSize } = await load();
  assert.equal(parseRequirementSize("8 GB RAM"), 8 * GIB);
  assert.equal(parseRequirementSize("512 MB RAM"), 512 * 1024 ** 2);
  assert.equal(parseRequirementSize("1,5 GB RAM"), 1.5 * GIB);
  assert.equal(parseRequirementSize("10+ GB available space"), 10 * GIB);
  // Full-width digits appear in a few listings
  assert.equal(parseRequirementSize("８ GB RAM"), 8 * GIB);
  assert.equal(parseRequirementSize("16(Dual-channel) GB RAM"), null);
  assert.equal(parseRequirementSize("1+ gigs of RAM GB RAM"), null);
  assert.equal(parseRequirementSize("and find out what this place is"), null);
  assert.equal(parseRequirementSize(""), null);
  assert.equal(parseRequirementSize(undefined), null);
});

test("RAM passes with a little under the listed amount and fails a clear shortfall", async () => {
  const { checkRam } = await load();
  // 16 GB installed usually reports about 15.8 GiB
  assert.equal(checkRam("16 GB RAM", 15.8 * GIB).status, "pass");
  assert.equal(checkRam("8 GB RAM", 32 * GIB).status, "pass");
  assert.equal(checkRam("16 GB RAM", 7.9 * GIB).status, "fail");
  // In between could be 16 GB with a large graphics reservation
  assert.equal(checkRam("16 GB RAM", 13 * GIB).status, "unknown");
  assert.equal(checkRam("lots of RAM", 32 * GIB).status, "unknown");
  assert.equal(checkRam("8 GB RAM", undefined).status, "unknown");
  assert.equal(checkRam("4096 GB RAM", 32 * GIB).status, "unknown");
  assert.deepEqual(checkRam("8 GB RAM", 16 * GIB), {
    status: "pass",
    have: 16 * GIB,
    required: 8 * GIB,
  });
});

test("storage counts the download on top of the installed size", async () => {
  const { checkStorage } = await load();
  assert.equal(checkStorage("50 GB available space", 100 * GIB).status, "pass");
  assert.equal(checkStorage("50 GB available space", 40 * GIB).status, "fail");
  const tight = checkStorage("50 GB available space", 60 * GIB, 20 * GIB);
  assert.equal(tight.status, "fail");
  assert.equal(tight.needed, 70 * GIB);
  assert.equal(checkStorage("50 GB available space", undefined).status, "unknown");
  assert.equal(checkStorage("50 GB available space", 0).status, "unknown");
  assert.equal(checkStorage("SSD required", 100 * GIB).status, "unknown");
});

test("Windows release strings map to versions", async () => {
  const { windowsRankFromRelease, parseWindowsRequirement } = await load();
  const ten = parseWindowsRequirement("Windows 10").minRank;
  const eleven = parseWindowsRequirement("Windows 11").minRank;
  assert.equal(windowsRankFromRelease("10.0.19045"), ten);
  assert.equal(windowsRankFromRelease("10.0.22000"), eleven);
  assert.equal(
    windowsRankFromRelease("6.1.7601"),
    parseWindowsRequirement("Win 7").minRank
  );
  assert.equal(
    windowsRankFromRelease("6.3.9600"),
    parseWindowsRequirement("Win 8.1").minRank
  );
  assert.equal(windowsRankFromRelease("6.1.7601") < ten, true);
  assert.equal(windowsRankFromRelease("garbage"), null);
});

test("the oldest named Windows version is the minimum", async () => {
  const { checkOs } = await load();
  assert.equal(checkOs("Windows 7/8/10 64-bit", win10).status, "pass");
  assert.equal(checkOs("*: Windows 7 or later", win10).status, "pass");
  assert.equal(checkOs("Windows® 10 (64-bit)", win11).status, "pass");
  assert.equal(checkOs("Windows 10/11", win10).status, "pass");
  assert.equal(checkOs("Windows XP", win11).status, "pass");
  assert.equal(checkOs("Windows 11", win10).status, "fail");
  assert.equal(checkOs("OS Win10/11", win10).status, "pass");
  assert.equal(checkOs("Windows10 / 11", win10).status, "pass");
  assert.equal(checkOs("WIn 11 64 Bit", win10).status, "fail");
  assert.equal(checkOs("Windows", win10).status, "pass");
  assert.deepEqual(checkOs("Windows 10", win11), { status: "pass", have: "Windows 11" });
});

test("OS stays undecided when the text or the PC doesn't allow a fair call", async () => {
  const { checkOs } = await load();
  // A bare number could be anything
  assert.equal(checkOs("10", win10).status, "unknown");
  // Same version, but a build or service pack the check doesn't compare
  assert.equal(checkOs("Windows 10 version 1909 or later", win10).status, "unknown");
  assert.equal(checkOs("Windows 10 (20H2)", win10).status, "unknown");
  assert.equal(
    checkOs("Windows 7 SP1", { ...win10, osRelease: "6.1.7601" }).status,
    "unknown"
  );
  // A newer version is past any of those
  assert.equal(checkOs("Windows 10 version 1909 or later", win11).status, "pass");
  assert.equal(checkOs("Windows 7 Service Pack 1", win10).status, "pass");
  // Linux and macOS go through a compatibility layer
  assert.equal(
    checkOs("Windows 10", { platform: "linux", osRelease: "6.8.0" }).status,
    "unknown"
  );
  // A 32-bit process can't tell whether Windows is 64-bit
  assert.equal(
    checkOs("Windows 10 64-bit", { ...win10, arch: "ia32" }).status,
    "unknown"
  );
  assert.equal(checkOs("macOS 12", win10).status, "unknown");
});

test("checkCanRun judges only OS, RAM and storage", async () => {
  const { checkCanRun } = await load();
  const verdicts = checkCanRun(
    {
      os: "Windows 10",
      cpu: "Intel Core i5-760",
      ram: "8 GB RAM",
      gpu: "GeForce GTX 550 Ti",
      directx: "Version 11",
      storage: "2 GB available space",
    },
    { ...win11, totalMemory: 16 * GIB },
    { freeSpace: 100 * GIB, downloadSize: 1 * GIB }
  );
  assert.deepEqual(Object.keys(verdicts).sort(), ["os", "ram", "storage"]);
  assert.equal(verdicts.os.status, "pass");
  assert.equal(verdicts.ram.status, "pass");
  assert.equal(verdicts.storage.status, "pass");
  assert.deepEqual(checkCanRun({ ram: "8 GB RAM" }, null), {});
  assert.deepEqual(checkCanRun(null, win11), {});
});
