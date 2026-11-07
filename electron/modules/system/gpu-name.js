/**
 * Picks the GPU to show from a list of video controller names, one per line.
 * Virtual adapters are skipped, and a dedicated GPU wins over the integrated one
 * when a machine has both.
 */
const VIRTUAL_KEYWORDS = ["virtual", "basic", "microsoft", "remote", "vnc", "rdp"];

const isVirtual = name =>
  VIRTUAL_KEYWORDS.some(keyword => name.toLowerCase().includes(keyword));

// "AMD Radeon(TM) Graphics", "AMD Radeon 780M Graphics", "Intel(R) UHD Graphics 770",
// "Intel(R) Arc(TM) Graphics". Dedicated cards carry a model: "Radeon RX ...", "Arc A770".
// Ryzen APUs also say RX: "AMD Radeon(TM) RX Vega 11 Graphics" is integrated.
const isIntegrated = name =>
  (/\bradeon\b.*\bgraphics\b/i.test(name) &&
    (!/\brx\b/i.test(name) || /\bvega\s*\d+\b/i.test(name))) ||
  (/\bintel\b.*\bgraphics\b/i.test(name) && !/\b[ab]\d{3}\b/i.test(name));

function pickGpuName(output) {
  const names = String(output || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && line !== "Name");
  const real = names.filter(name => !isVirtual(name));
  return real.find(name => !isIntegrated(name)) || real[0] || names[0] || "Unknown";
}

module.exports = { pickGpuName };
