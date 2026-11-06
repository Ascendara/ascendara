// Compares a game's minimum requirements with this PC, locally. Only RAM,
// free disk and Windows version are judged: CPU and GPU model names can't be
// ranked fairly without a benchmark table, so they are never given a verdict.
// Each check returns { status: "pass" | "fail" | "unknown", ...numbers }.

const GIB = 1024 ** 3;
const UNITS = { MB: 1024 ** 2, GB: GIB, TB: 1024 ** 4 };

// Reported memory sits below the installed amount (firmware and integrated
// graphics take a share), so a little under the requirement still passes and
// only a clear shortfall fails. The gap between the two is "unknown".
const RAM_PASS_RATIO = 0.9;
const RAM_FAIL_RATIO = 0.75;

/**
 * "8 GB RAM", "512 MB", "10+ GB available space" to bytes. Anything that
 * doesn't start with a number and a unit is null, so stray text never counts.
 */
export function parseRequirementSize(text) {
  const match = String(text || "")
    .normalize("NFKC")
    .trim()
    .match(/^(\d+(?:[.,]\d+)?)\s*\+?\s*(MB|GB|TB)\b/i);
  if (!match) return null;
  const bytes = parseFloat(match[1].replace(",", ".")) * UNITS[match[2].toUpperCase()];
  return bytes > 0 ? bytes : null;
}

export function checkRam(requirement, totalMemory) {
  const required = parseRequirementSize(requirement);
  // Above 1 TB is a parsing accident, not a real requirement
  if (!required || required > 1024 * GIB || !(totalMemory > 0)) {
    return { status: "unknown" };
  }
  let status = "unknown";
  if (totalMemory >= required * RAM_PASS_RATIO) status = "pass";
  else if (totalMemory < required * RAM_FAIL_RATIO) status = "fail";
  return { status, have: totalMemory, required };
}

/**
 * The listed storage is the installed size. While the archive is extracted
 * both sit on the disk, so the download size counts on top when it is known.
 */
export function checkStorage(requirement, freeSpace, downloadSize) {
  const installed = parseRequirementSize(requirement);
  if (!installed || !Number.isFinite(freeSpace) || freeSpace <= 0) {
    return { status: "unknown" };
  }
  const needed = installed + (downloadSize > 0 ? downloadSize : 0);
  return { status: freeSpace >= needed ? "pass" : "fail", have: freeSpace, needed };
}

const WINDOWS_RANK = { xp: 1, vista: 2, 7: 3, 8: 4, 8.1: 5, 10: 6, 11: 7 };
const WINDOWS_NAME = Object.fromEntries(
  Object.entries(WINDOWS_RANK).map(([name, rank]) => [
    rank,
    name === "xp" ? "XP" : name === "vista" ? "Vista" : name,
  ])
);

/** os.release() on Windows ("10.0.22631") to a version rank */
export function windowsRankFromRelease(release) {
  const [major, minor, build] = String(release || "")
    .split(".")
    .map(Number);
  if (major === 10) return build >= 22000 ? WINDOWS_RANK[11] : WINDOWS_RANK[10];
  if (major === 6) return [WINDOWS_RANK.vista, 3, 4, 5][minor] || null;
  if (major === 5) return WINDOWS_RANK.xp;
  return null;
}

/**
 * Oldest Windows version the text names: "Windows 7/8/10 64-bit" is 7.
 * null when it names no version or isn't about Windows at all.
 */
export function parseWindowsRequirement(text) {
  const value = String(text || "")
    .normalize("NFKC")
    .toLowerCase();
  if (!/\bwin/.test(value)) return null;
  // Numbers may touch the word ("Windows10/11") but not other digits
  const versions = [
    ...value.matchAll(/\b(xp|vista)\b|(?<![\d.])(8\.1|7|8|10|11)(?!\d)/g),
  ].map(match => WINDOWS_RANK[match[1] || match[2]]);
  return {
    minRank: versions.length ? Math.min(...versions) : null,
    needs64Bit: /64/.test(value),
    // Service packs, builds and feature updates aren't compared, so they
    // leave a same-version PC undecided
    finerVersion:
      /\bsp\s*\d|service pack|build|version|update|\b\d{2}h\d\b|\b\d{4}\b/.test(value),
  };
}

export function checkOs(requirement, { platform, osRelease, arch } = {}) {
  const required = parseWindowsRequirement(requirement);
  // Linux and macOS run Windows games through a compatibility layer, which
  // these requirements don't describe
  if (!required || platform !== "win32") return { status: "unknown" };
  const rank = windowsRankFromRelease(osRelease);
  const have = rank ? `Windows ${WINDOWS_NAME[rank]}` : null;
  if (required.needs64Bit && !["x64", "arm64"].includes(arch)) {
    return { status: "unknown", have };
  }
  if (!required.minRank) return { status: "pass", have };
  if (!rank) return { status: "unknown" };
  if (rank < required.minRank) return { status: "fail", have };
  if (rank === required.minRank && required.finerVersion) {
    return { status: "unknown", have };
  }
  return { status: "pass", have };
}

/** Verdicts for the requirement lines this can judge, keyed like minReqs */
export function checkCanRun(minReqs, specs, { freeSpace, downloadSize } = {}) {
  if (!minReqs || !specs) return {};
  const verdicts = {};
  if (minReqs.os) verdicts.os = checkOs(minReqs.os, specs);
  if (minReqs.ram) verdicts.ram = checkRam(minReqs.ram, specs.totalMemory);
  if (minReqs.storage) {
    verdicts.storage = checkStorage(minReqs.storage, freeSpace, downloadSize);
  }
  return verdicts;
}
