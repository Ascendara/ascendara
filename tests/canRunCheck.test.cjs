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

const ryzen = {
  cpu: "AMD Ryzen 7 7800X3D 8-Core Processor",
  cpuCores: 16,
  cpuSpeedMhz: 4201,
};

test("real requirement texts read Meets it on a current PC", async () => {
  const { checkCpu, checkGpu } = await load();
  assert.equal(checkCpu("3GHz 4-Core or similar", ryzen).status, "pass");
  assert.equal(checkCpu("INTEL CORE I5-8400 or AMD RYZEN 3 3300X", ryzen).status, "pass");
  assert.equal(
    checkGpu("GeForce GTX 1060 or Radeon RX 580", { gpu: "NVIDIA GeForce RTX 5070" })
      .status,
    "pass"
  );
  // The name says 8 cores even without the raw counts
  assert.equal(checkCpu("3GHz 4-Core", { cpu: ryzen.cpu }).status, "pass");
});

test("hardware names map onto the tier table", async () => {
  const { gpuKey, cpuScore, gpuScore } = await load();
  assert.equal(gpuKey("NVIDIA GeForce RTX 4070 Ti SUPER"), "rtx 4070 ti super");
  assert.equal(gpuKey("AMD Radeon RX 7900 XTX"), "rx 7900 xtx");
  assert.equal(gpuKey("Radeon R9 290X"), "r9 290x");
  assert.equal(gpuKey("AMD Radeon HD 7850"), "hd 7850");
  assert.equal(gpuKey("Intel(R) HD Graphics 4000"), "intel hd 4000");
  assert.equal(gpuKey("Intel(R) UHD Graphics 630"), "intel uhd 630");
  assert.equal(gpuKey("Intel(R) Arc(TM) A770 Graphics"), "arc a770");
  assert.equal(gpuKey("AMD Radeon(TM) Graphics"), null);
  assert.ok(gpuScore("NVIDIA GeForce RTX 4060 Laptop GPU") < gpuScore("RTX 4060"));
  assert.ok(cpuScore("Intel(R) Core(TM) i7-9700K CPU @ 3.60GHz") > cpuScore("i5-8400"));
  assert.ok(cpuScore("12th Gen Intel(R) Core(TM) i5-12400F") > cpuScore("i7-8700"));
  assert.ok(cpuScore("Intel Core i7-1165G7") < cpuScore("Intel Core i7-11700"));
  assert.ok(cpuScore("Intel(R) Core(TM) Ultra 7 265K") > cpuScore("Ryzen 5 3600"));
  assert.ok(cpuScore("AMD FX-8350 Eight-Core Processor") < cpuScore("Ryzen 5 1600"));
  assert.equal(cpuScore("Intel Core i7-920"), null);
  assert.equal(cpuScore("Intel Pentium G4560"), null);
});

test("alternatives pass on the weakest one, close and below are told apart", async () => {
  const { checkCpu, checkGpu } = await load();
  const gtx1060 = { gpu: "NVIDIA GeForce GTX 1060 6GB" };
  assert.equal(checkGpu("GTX 1080 / RX 470", gtx1060).status, "pass");
  assert.equal(checkGpu("GTX 1070 or RX Vega 56", gtx1060).status, "fail");
  assert.equal(checkGpu("GeForce GTX 1660 (or AMD equivalent)", gtx1060).status, "close");
  assert.equal(checkGpu("RX 580 8GB or better", gtx1060).status, "pass");
  const i5 = {
    cpu: "Intel(R) Core(TM) i5-4460 CPU @ 3.20GHz",
    cpuCores: 4,
    cpuSpeedMhz: 3200,
  };
  assert.equal(checkCpu("Intel Core i7-4770 or AMD FX-8350", i5).status, "pass");
  assert.equal(checkCpu("Intel Core i7-4770", i5).status, "fail");
  assert.equal(checkCpu("Intel Core i7-8700K | AMD Ryzen 5 3600", i5).status, "fail");
  assert.equal(checkCpu("Intel Core 2 Duo 2.4 GHz", i5).status, "pass");
  assert.equal(checkCpu("3.4 GHz Quad-Core", { ...i5, cpuCores: 8 }).status, "close");
  assert.equal(checkCpu("3 GHz 8-Core", i5).status, "fail");
});

test("unknown models and requirements stay Can't tell and never fail", async () => {
  const { checkCpu, checkGpu } = await load();
  const odd = { cpu: "Mystery Chip 9000", gpu: "Mystery Graphics", cpuCores: 8 };
  assert.deepEqual(checkGpu("GTX 1060", odd), {
    status: "unknown",
    have: "Mystery Graphics",
  });
  assert.equal(checkCpu("Intel Core i5-8400", odd).status, "unknown");
  // A low base clock on an unranked chip isn't proof it is slower
  assert.equal(checkCpu("3GHz 4-Core", { ...odd, cpuSpeedMhz: 2000 }).status, "unknown");
  assert.equal(
    checkGpu("DirectX 11 card with 2 GB VRAM", { gpu: "RTX 5070" }).status,
    "unknown"
  );
  assert.equal(checkGpu("GTX 9999 or Voodoo 5", { gpu: "RTX 5070" }).status, "unknown");
  assert.deepEqual(checkGpu("GTX 1060", { gpu: "Unknown" }), { status: "unknown" });
  assert.deepEqual(checkCpu("Intel Core i5-8400", {}), { status: "unknown" });
});

test("CPU families named without a model are read as their oldest part", async () => {
  const { checkCpu } = await load();
  const i5Old = { cpu: "Intel(R) Core(TM) i5-2400 CPU @ 3.10GHz", cpuCores: 4 };
  const i3Old = { cpu: "Intel Core i3-2100", cpuCores: 4, cpuSpeedMhz: 3100 };
  const odd = { cpu: "Mystery Chip 9000", cpuCores: 8 };
  const cases = [
    // A current PC clearly above the oldest part of each family
    ["Intel Core i3 or equivalent", ryzen, "pass"],
    ["Core i5", ryzen, "pass"],
    ["i7", ryzen, "pass"],
    ["Intel Core i9 or AMD equivalent", ryzen, "pass"],
    ["Ryzen 3", ryzen, "pass"],
    ["AMD Ryzen 9", ryzen, "pass"],
    ["AMD FX", ryzen, "pass"],
    ["Pentium", ryzen, "pass"],
    ["Athlon", ryzen, "pass"],
    ["Pentium 4 3.0 GHz", ryzen, "pass"],
    ["dual core 2.0 GHz", ryzen, "pass"],
    ["quad core", ryzen, "pass"],
    ["2.0 GHz", ryzen, "pass"],
    ["Intel Core i3 2.0 GHz", ryzen, "pass"],
    ["Intel Core i5 / AMD Ryzen 5", ryzen, "pass"],
    // Two families: judged against the weaker one
    ["Intel Core i5 / AMD Athlon", i3Old, "pass"],
    // Not clearly above, a generation or model the family floor can't stand
    // for, or no score for this PC: Can't tell, never Doesn't meet
    ["Intel Core i5", i5Old, "unknown"],
    ["Intel Core i7 or equivalent", i3Old, "unknown"],
    ["Core i7 / Ryzen 7", i3Old, "unknown"],
    ["Intel Core i5 4th gen", ryzen, "unknown"],
    ["Intel Core i5-4xxx", ryzen, "unknown"],
    ["Intel Pentium G4560", ryzen, "unknown"],
    ["Athlon 200GE", ryzen, "unknown"],
    ["Intel Core i3", odd, "unknown"],
    ["Intel Core i3", {}, "unknown"],
    ["2.0 GHz", { ...odd, cpuSpeedMhz: 1500 }, "unknown"],
  ];
  for (const [requirement, specs, expected] of cases) {
    assert.equal(checkCpu(requirement, specs).status, expected, requirement);
  }
});

test("checkCanRun gives a verdict for every line it can judge", async () => {
  const { checkCanRun } = await load();
  const minReqs = {
    os: "Windows 10",
    cpu: "Intel Core i5-2500K",
    ram: "8 GB RAM",
    gpu: "GeForce GTX 660",
    directx: "Version 11",
    storage: "2 GB available space",
  };
  const verdicts = checkCanRun(
    minReqs,
    {
      ...win11,
      totalMemory: 16 * GIB,
      cpu: "AMD Ryzen 7 9700X 8-Core Processor",
      cpuCores: 16,
      cpuSpeedMhz: 3800,
      gpu: "NVIDIA GeForce RTX 5070",
    },
    { freeSpace: 100 * GIB, downloadSize: 1 * GIB }
  );
  assert.deepEqual(Object.keys(verdicts).sort(), ["cpu", "gpu", "os", "ram", "storage"]);
  assert.equal(verdicts.os.status, "pass");
  assert.equal(verdicts.ram.status, "pass");
  assert.equal(verdicts.storage.status, "pass");
  assert.deepEqual(verdicts.gpu, { status: "pass", have: "NVIDIA GeForce RTX 5070" });
  assert.equal(verdicts.cpu.status, "pass");
  // Detection that found nothing is "can't tell", never a fail
  const undetected = checkCanRun(minReqs, { ...win11, gpu: "Unknown" });
  assert.deepEqual(undetected.gpu, { status: "unknown" });
  assert.deepEqual(checkCanRun(minReqs, { ...win11 }).cpu, { status: "unknown" });
  assert.deepEqual(checkCanRun({ ram: "8 GB RAM" }, null), {});
  assert.deepEqual(checkCanRun(null, win11), {});
});
