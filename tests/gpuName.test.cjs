const test = require("node:test");
const assert = require("node:assert/strict");

const { pickGpuName } = require("../electron/modules/system/gpu-name.js");

test("a dedicated GPU wins over the integrated one", () => {
  // Real output of (Get-CimInstance Win32_VideoController).Name on Windows 11 25H2.
  const output = "NVIDIA GeForce RTX 5070\r\nAMD Radeon(TM) Graphics\r\n";
  assert.equal(pickGpuName(output), "NVIDIA GeForce RTX 5070");
  assert.equal(
    pickGpuName("AMD Radeon(TM) Graphics\r\nNVIDIA GeForce RTX 5070"),
    "NVIDIA GeForce RTX 5070"
  );
  assert.equal(
    pickGpuName("Intel(R) UHD Graphics 770\nAMD Radeon RX 7800 XT"),
    "AMD Radeon RX 7800 XT"
  );
  assert.equal(
    pickGpuName("Intel(R) Iris(R) Xe Graphics\nIntel(R) Arc(TM) A770 Graphics"),
    "Intel(R) Arc(TM) A770 Graphics"
  );
});

test("an integrated GPU alone is still shown", () => {
  assert.equal(pickGpuName("AMD Radeon(TM) Graphics\r\n"), "AMD Radeon(TM) Graphics");
  assert.equal(pickGpuName("Intel(R) HD Graphics 620"), "Intel(R) HD Graphics 620");
});

test("virtual adapters are skipped", () => {
  assert.equal(
    pickGpuName("Microsoft Basic Display Adapter\r\nIntel(R) UHD Graphics 630"),
    "Intel(R) UHD Graphics 630"
  );
  assert.equal(
    pickGpuName("Microsoft Remote Display Adapter\r\nVirtual Display Device"),
    "Microsoft Remote Display Adapter"
  );
});

test("empty or missing output is Unknown", () => {
  assert.equal(pickGpuName(""), "Unknown");
  assert.equal(pickGpuName("\r\n\r\n"), "Unknown");
  assert.equal(pickGpuName(undefined), "Unknown");
});

test("the wmic style header and padding are ignored", () => {
  assert.equal(
    pickGpuName("Name  \r\r\nNVIDIA GeForce RTX 3060  \r\r\n\r\r\n"),
    "NVIDIA GeForce RTX 3060"
  );
});
