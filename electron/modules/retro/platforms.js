const expanded = require("./expanded-catalogue.json");
const platforms = {
  ps1: { name: "PlayStation 1", emulator: "DuckStation", adapter: "duckstation", catalogue: "Sony Playstation", extensions: ["cue", "chd", "iso", "img", "pbp", "m3u"], website: "https://www.duckstation.org/" },
  ps2: { name: "PlayStation 2", emulator: "PCSX2", adapter: "pcsx2", catalogue: "Sony Playstation 2", extensions: ["iso", "chd", "cso", "gz", "bin"], website: "https://pcsx2.net/" },
  ps3: { name: "PlayStation 3", emulator: "RPCS3", adapter: "rpcs3", catalogue: "Sony Playstation 3", extensions: [], website: "https://rpcs3.net/" },
  psp: { name: "PlayStation Portable", emulator: "PPSSPP", adapter: "ppsspp", catalogue: "Sony PSP", extensions: ["iso", "cso", "chd", "pbp"], website: "https://www.ppsspp.org/" },
  gamecube: { name: "Nintendo GameCube", emulator: "Dolphin", adapter: "dolphin", catalogue: "Nintendo GameCube", extensions: ["iso", "gcm", "rvz", "wia", "gcz", "ciso", "m3u"], website: "https://dolphin-emu.org/" },
  wii: { name: "Nintendo Wii", emulator: "Dolphin", adapter: "dolphin", catalogue: "Nintendo Wii", extensions: ["iso", "wbfs", "rvz", "wia", "gcz", "ciso"], website: "https://dolphin-emu.org/" },
  nes: { name: "Nintendo NES", emulator: "RetroArch", adapter: "retroarch", catalogue: "Nintendo Entertainment System", extensions: ["nes", "fds", "unf", "unif", "zip", "7z"], coreHint: "Nestopia UE or FCEUmm" },
  snes: { name: "Super Nintendo", emulator: "RetroArch", adapter: "retroarch", catalogue: "Super Nintendo Entertainment System", extensions: ["sfc", "smc", "zip", "7z"], coreHint: "Snes9x" },
  n64: { name: "Nintendo 64", emulator: "RetroArch", adapter: "retroarch", catalogue: "Nintendo 64", extensions: ["z64", "n64", "v64", "zip", "7z"], coreHint: "Mupen64Plus-Next" },
  gb: { name: "Game Boy", emulator: "RetroArch", adapter: "retroarch", catalogue: "Nintendo Game Boy", extensions: ["gb", "zip", "7z"], coreHint: "Gambatte" },
  gbc: { name: "Game Boy Color", emulator: "RetroArch", adapter: "retroarch", catalogue: "Nintendo Game Boy Color", extensions: ["gbc", "zip", "7z"], coreHint: "Gambatte" },
  gba: { name: "Game Boy Advance", emulator: "RetroArch", adapter: "retroarch", catalogue: "Nintendo Game Boy Advance", extensions: ["gba", "zip", "7z"], coreHint: "mGBA" },
};
for (const platform of expanded.platforms) {
  const emulator = expanded.emulators.find(entry => entry.id === platform.adapter);
  platforms[platform.id] = { ...platform, emulator: emulator.name, website: emulator.website };
}
for (const [id, platform] of Object.entries(platforms)) {
  platform.id = id;
  platform.website ||= "https://www.retroarch.com/";
}

const adapters = ["duckstation", "pcsx2", "rpcs3", "ppsspp", "dolphin", "retroarch", "custom"];
function resolveAdapter(platformId, profile) {
  const adapter = profile.adapter || platforms[platformId]?.adapter;
  const preset = expanded.emulators.find(entry => entry.id === adapter && entry.args);
  if (!adapters.includes(adapter) && !preset) throw new Error("Unknown emulator launch preset");
  if (preset && !preset.platforms.includes(platformId)) throw new Error("This emulator preset does not support this console");
  return adapter;
}

function customArguments(value = "") {
  if (typeof value !== "string" || value.length > 8192 || value.includes("\0")) throw new Error("Invalid custom emulator arguments");
  const args = value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (args.length > 64) throw new Error("Use at most 64 emulator arguments");
  return args;
}

function launchArguments(platformId, profile, file) {
  const platform = platforms[platformId];
  if (!platform) throw new Error("Unknown Retro console");
  const adapter = resolveAdapter(platformId, profile);
  const preset = expanded.emulators.find(entry => entry.id === adapter && entry.args);
  if (preset) return [
    ...(profile.fullscreen ? preset.fullscreen || [] : []),
    ...preset.args.map(arg => arg.split("{rom}").join(file)),
  ];
  switch (adapter) {
    case "custom": {
      const args = customArguments(profile.arguments);
      const hasRom = args.some(arg => arg.includes("{rom}"));
      return [...args.map(arg => arg.split("{rom}").join(file)), ...(hasRom ? [] : [file])];
    }
    case "duckstation":
    case "pcsx2":
      return ["-batch", ...(profile.fullscreen ? ["-fullscreen"] : []), "--", file];
    case "rpcs3": return ["--no-gui", file];
    case "ppsspp": return [...(profile.fullscreen ? ["--fullscreen"] : []), file];
    case "dolphin": return ["--batch", ...(profile.fullscreen ? ["--config", "Dolphin.Display.Fullscreen=True"] : []), "--exec", file];
    case "retroarch":
      if (!profile.core) throw new Error("Select a RetroArch core for this console first");
      return [...(profile.fullscreen ? ["--fullscreen"] : []), "-L", profile.core, file];
    default: throw new Error("Unsupported emulator");
  }
}

module.exports = { platforms, launchArguments, resolveAdapter, customArguments };
