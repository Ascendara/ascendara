/**
 * Turns a WebGL renderer string into a GPU name, or null when there is none.
 * "ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11)"
 * becomes "NVIDIA GeForce RTX 5070". Non ANGLE strings are returned as they are.
 */
export const formatGpuRenderer = renderer => {
  const text = String(renderer || "").trim();

  if (!/^ANGLE \(/i.test(text)) {
    return text || null;
  }

  const match = text.match(
    /^ANGLE \((?:[^,]+,\s*)?(.+?)(?:,\s*(?:OpenGL|Vulkan|Metal|Direct3D|D3D)[^,]*)?\)$/i
  );
  const name = (match?.[1] || "")
    .replace(/\s*\(0x[0-9a-f]+\).*$/i, "")
    .replace(/\s+Direct3D.*$/i, "")
    .trim();

  return name || null;
};
