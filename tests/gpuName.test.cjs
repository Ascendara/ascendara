const test = require("node:test");
const assert = require("node:assert/strict");

const { pickGpuName } = require("../electron/modules/system/gpu-name.js");
const { loadModule } = require("./helpers/loadModule.cjs");

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

test("a dedicated GPU wins over an APU named RX Vega or Radeon 780M", () => {
  assert.equal(
    pickGpuName("AMD Radeon(TM) RX Vega 11 Graphics\r\nNVIDIA GeForce GTX 1660"),
    "NVIDIA GeForce GTX 1660"
  );
  assert.equal(
    pickGpuName("AMD Radeon(TM) RX Vega 10 Graphics\nAMD Radeon RX 6600"),
    "AMD Radeon RX 6600"
  );
  assert.equal(
    pickGpuName("AMD Radeon 780M Graphics\nNVIDIA GeForce RTX 4060 Laptop GPU"),
    "NVIDIA GeForce RTX 4060 Laptop GPU"
  );
  assert.equal(
    pickGpuName("AMD Radeon(TM) Vega 8 Graphics\nIntel(R) Arc(TM) A750 Graphics"),
    "Intel(R) Arc(TM) A750 Graphics"
  );
  assert.equal(
    pickGpuName("AMD Radeon(TM) RX Vega 11 Graphics"),
    "AMD Radeon(TM) RX Vega 11 Graphics"
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

test("the WebGL fallback turns ANGLE strings into a GPU name", async () => {
  const { formatGpuRenderer } = await loadModule("src/lib/gpuRenderer.js");
  // Windows Chromium, as seen on an RTX 5070 and from the review.
  assert.equal(
    formatGpuRenderer(
      "ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Direct3D11 vs_5_0 ps_5_0, D3D11)"
    ),
    "NVIDIA GeForce RTX 5070"
  );
  assert.equal(
    formatGpuRenderer(
      "ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 (0x00002206) Direct3D11 vs_5_0 ps_5_0, D3D11)"
    ),
    "NVIDIA GeForce RTX 3080"
  );
  assert.equal(
    formatGpuRenderer(
      "ANGLE (AMD, AMD Radeon RX 6600 (0x000073FF) Direct3D11 vs_5_0 ps_5_0, D3D11)"
    ),
    "AMD Radeon RX 6600"
  );
  assert.equal(
    formatGpuRenderer("ANGLE (NVIDIA GeForce GTX 1060 Direct3D9Ex vs_3_0 ps_3_0)"),
    "NVIDIA GeForce GTX 1060"
  );
  // Linux keeps its readable name.
  assert.equal(
    formatGpuRenderer(
      "ANGLE (Intel, Mesa Intel(R) UHD Graphics 620 (KBL GT2), OpenGL 4.6)"
    ),
    "Mesa Intel(R) UHD Graphics 620 (KBL GT2)"
  );
  assert.equal(
    formatGpuRenderer("Mesa Intel(R) UHD Graphics 620"),
    "Mesa Intel(R) UHD Graphics 620"
  );
  assert.equal(formatGpuRenderer("ANGLE ()"), null);
  assert.equal(formatGpuRenderer(""), null);
  assert.equal(formatGpuRenderer(undefined), null);
});
