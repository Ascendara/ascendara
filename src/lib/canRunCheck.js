// Compares a game's minimum requirements with this PC, locally. RAM, free
// disk and Windows version are measured; CPU and GPU models are placed on the
// rough tiers in hardwareTiers.json, and a model missing there stays unknown.
// Each check returns { status: "pass" | "close" | "fail" | "unknown", ...numbers }.

import TIERS from "../data/hardwareTiers.json";

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

// Within this share of the requirement reads "Close" instead of "Below it"
const CLOSE_RATIO = 0.85;
// Known CPUs at this tier or above aren't held back by a low base clock: the
// clock Windows reports is the base, and newer chips do more per clock
const MODERN_CPU_SCORE = 120;

function normalizeHardware(text) {
  return String(text || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\((?:r|tm)\)|[®™]/g, " ")
    .replace(/[()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const joinKey = (...parts) =>
  parts
    .filter(Boolean)
    .map(part => part.replace(/\s+/g, " "))
    .join(" ");

/** GPU text to its hardwareTiers key, or null when no known family is named */
export function gpuKey(text) {
  const value = normalizeHardware(text);
  // GeForce 8 and 9 series name the model first: "GeForce 8800", "9800 GT"
  let m = value.match(
    /\b(?:geforce\s*([89][1-9]00)|([89][1-9]00)\s*(?:gtx|gts|gt|gs|ultra))\b/
  );
  if (m) return `geforce ${m[1] || m[2]}`;
  // "(?!\s*mb)" keeps "GT 512 MB" from reading as a model
  m = value.match(
    /\b(gtx|rtx|gts|gt)\s*(\d{3,4})(?!\s*mb)\s*(ti\s*super|ti\s*boost|ti|super)?\b/
  );
  if (m) return joinKey(m[1], m[2], m[3]);
  m = value.match(/\brx\s*(\d{3,4})\s*(xtx|xt|gre)?\b/);
  if (m) return joinKey("rx", m[1], m[2]);
  m = value.match(/\bvega\s*(56|64)\b/);
  if (m) return `vega ${m[1]}`;
  if (/\bradeon\s*vii\b/.test(value)) return "radeon vii";
  m = value.match(/\br9\s*(fury\s*x|fury|nano)\b/);
  if (m) return joinKey("r9", m[1]);
  m = value.match(/\br([79])\s*(\d{3})(x)?\b/);
  if (m) return `r${m[1]} ${m[2]}${m[3] || ""}`;
  m = value.match(/\barc\s*([ab]\d{3})\b/);
  if (m) return `arc ${m[1]}`;
  // Intel and AMD both used "HD" with four digits, so Intel is told by name
  if (/\bintel\b|\bhd graphics\b|\buhd\b|\biris\b|\bgma\b/.test(value)) {
    m = value.match(/\bgma\s*(x?\d{3,4})\b/);
    if (m) return `intel gma ${m[1]}`;
    m = value.match(/\b(u?hd)\s*(?:graphics\s*)?(\d{3,4})\b/);
    if (m) return `intel ${m[1]} ${m[2]}`;
    m = value.match(/\biris\s*(xe|plus|pro)\b/);
    return m ? `intel iris ${m[1]}` : null;
  }
  m = value.match(/\bhd\s*([2-7]\d{3})\b/);
  return m ? `hd ${m[1]}` : null;
}

export function gpuScore(text) {
  const score = TIERS.gpu[gpuKey(text)];
  if (!score) return null;
  const mobile = /\blaptop\b|\bmobile\b|max-q/.test(normalizeHardware(text));
  return mobile ? score * TIERS.gpuMobile : score;
}

const tierScore = (base, multiplier) =>
  base && multiplier ? Math.round(base * multiplier) : null;

/** CPU text to a relative score, or null when the model isn't on the tiers */
export function cpuScore(text) {
  const value = normalizeHardware(text);
  let m = value.match(/\bcore\s*ultra\s*([579])\s*(\d)\d{2}([a-z]{0,2})\b/);
  if (m) return tierScore(TIERS.coreUltra[m[2]]?.[m[1]], TIERS.intelSuffix[m[3]]);
  m = value.match(/\bi([3579])\s*-?\s*(\d{4,5})([a-z]{0,2}\d?)\b/);
  if (m) {
    // 10th gen and later start with "1": i7-10700K, but also i7-1165G7
    const digits = m[2];
    const gen = digits.length === 5 || digits[0] === "1" ? digits.slice(0, 2) : digits[0];
    return tierScore(TIERS.intelCore[gen]?.[`i${m[1]}`], TIERS.intelSuffix[m[3]]);
  }
  m = value.match(/\bryzen\s*([3579])\s*(?:pro\s*)?(\d)\d{3}([a-z0-9]{0,3})\b/);
  if (m) return tierScore(TIERS.ryzen[m[2]]?.[m[1]], TIERS.ryzenSuffix[m[3]]);
  m = value.match(/\bfx\s*-?\s*(\d)\d{3}[a-z]?\b/);
  return m ? TIERS.fx[m[1]] || null : null;
}

const CORE_WORDS = { single: 1, dual: 2, two: 2, duo: 2, triple: 3, three: 3 };
Object.assign(CORE_WORDS, { quad: 4, four: 4, hexa: 6, six: 6, octa: 8, eight: 8 });

function parseCores(value) {
  const digits = value.match(/(\d+)\s*-?\s*cores?\b/);
  if (digits) return Number(digits[1]);
  const words = value.match(
    /\b(single|dual|two|triple|three|quad|four|hexa|six|octa|eight)[\s-]*cores?\b|\b(duo|quad)\b/
  );
  return words ? CORE_WORDS[words[1] || words[2]] : null;
}

/** "3GHz 4-Core or similar": core count and clock, or null when neither is named */
export function parseGenericCpu(text) {
  const value = normalizeHardware(text);
  const clock = value.match(/(\d+(?:[.,]\d+)?)\s*ghz/);
  const cores = parseCores(value);
  const ghz = clock ? parseFloat(clock[1].replace(",", ".")) : null;
  return cores || ghz ? { cores, ghz } : null;
}

// A family named with no model ("Intel Core i3", "Ryzen 5", "AMD FX") is read
// as its oldest part, and only a PC this far above that reads Meets it
const FAMILY_CLEAR_MARGIN = 1.5;

/**
 * Floor score for a CPU family named without a model, or null. A named model,
 * a generation ("4th gen") or a placeholder ("i5-4xxx") isn't the oldest part,
 * so those lines get no floor and stay with the model lookup.
 */
export function cpuFamilyFloor(text) {
  const value = normalizeHardware(text).replace(/\d+(?:[.,]\d+)?\s*ghz/g, " ");
  if (/\bgen(?:eration)?\b|\d(?:st|nd|rd|th)\b|\dx{2,}\b/.test(value)) return null;
  const floors = TIERS.cpuFamilyFloor;
  let m = value.match(/\bi([3579])\b(?![\s-]*\d)/);
  if (m) return floors[`core i${m[1]}`];
  m = value.match(/\bryzen(?:\s*([3579]))?\b(?![\s-]*(?:pro\s*)?\d)/);
  if (m) return floors[joinKey("ryzen", m[1])];
  if (/\bfx\b(?![\s-]*\d)/.test(value)) return floors.fx;
  if (/\bpentium\b(?!\s*(?:gold|silver|[a-z]{1,2}\s*-?\d{3,}|\d{3,}))/.test(value)) {
    return floors.pentium;
  }
  if (/\bathlon\b(?!\s*(?:gold|silver|ii|x\d|[a-z]?\d{3,}))/.test(value)) {
    return floors.athlon;
  }
  return null;
}

function checkGenericCpu(required, specs, pcScore) {
  if (required.cores) {
    // os.cpus() counts threads: with two per core at most, half is a floor
    const threads = specs.cpuCores > 0 ? specs.cpuCores : 0;
    const named = parseCores(normalizeHardware(specs.cpu)) || 0;
    const low = Math.max(named, Math.ceil(threads / 2));
    const high = Math.max(named, threads);
    if (high && high < required.cores) return "fail";
    if (low < required.cores) return "unknown";
  }
  if (!required.ghz) return "pass";
  const ghz = specs.cpuSpeedMhz / 1000;
  if (ghz >= required.ghz || pcScore >= MODERN_CPU_SCORE) return "pass";
  // A base clock under the bar doesn't prove the chip is slower
  return ghz >= required.ghz * CLOSE_RATIO ? "close" : "unknown";
}

// "GTX 1060 or RX 580", "i5-8400 / Ryzen 3 3300X", "(or AMD equivalent)"
function splitAlternatives(text) {
  return normalizeHardware(text)
    .split(
      /\s+or\s+|\s*[/|]\s*|,\s*(?=(?:intel|amd|nvidia|geforce|radeon|core|ryzen|gtx|rtx|rx|arc)\b)/
    )
    .map(part => part.trim())
    .filter(Boolean);
}

const FILLER =
  /\b(?:amd|intel|nvidia|geforce|radeon|ati|equivalent|similar|better|higher|above|newer|comparable|compatible|any|processor|cpu|gpu|graphics|card|video|dedicated|with|a|an|the|of|series|or|and|\d+\s*gb|vram)\b/g;
const isFiller = part => !/[a-z0-9]/.test(part.replace(FILLER, ""));

function compareScores(have, need) {
  if (have >= need) return "pass";
  return have >= need * CLOSE_RATIO ? "close" : "fail";
}

/**
 * The PC meets a list of alternatives when it beats the weakest one, so any
 * pass wins. Below every known one with another left unknown can't be told.
 */
function judgeAlternatives(requirement, pcScore, scoreOf, generic) {
  const results = splitAlternatives(requirement)
    .map(part => {
      const need = scoreOf(part);
      if (need) return pcScore ? compareScores(pcScore, need) : "unknown";
      const fallback = generic?.(part);
      if (fallback) return fallback;
      return isFiller(part) ? null : "unknown";
    })
    .filter(Boolean);
  if (results.includes("pass")) return "pass";
  if (!results.length || results.includes("unknown")) return "unknown";
  return results.includes("close") ? "close" : "fail";
}

function detectedName(name) {
  const have = String(name || "").trim();
  return have && have.toLowerCase() !== "unknown" ? have : null;
}

const withHave = (status, have) => (have ? { status, have } : { status });

export function checkCpu(requirement, specs = {}) {
  const have = detectedName(specs.cpu);
  const pcScore = have ? cpuScore(have) : null;
  const generic = part => {
    const required = parseGenericCpu(part);
    const clock = required ? checkGenericCpu(required, specs, pcScore) : null;
    const floor = cpuFamilyFloor(part);
    if (!floor) return clock;
    // Below the margin is never a fail: the line may mean a newer part
    const family = pcScore >= floor * FAMILY_CLEAR_MARGIN ? "pass" : "unknown";
    if (!clock) return family;
    return family === "pass" && clock === "unknown" ? "pass" : clock;
  };
  return withHave(judgeAlternatives(requirement, pcScore, cpuScore, generic), have);
}

export function checkGpu(requirement, specs = {}) {
  const have = detectedName(specs.gpu);
  const pcScore = have ? gpuScore(have) : null;
  return withHave(judgeAlternatives(requirement, pcScore, gpuScore), have);
}

/** A verdict for every requirement line the card shows, keyed like minReqs */
export function checkCanRun(minReqs, specs, { freeSpace, downloadSize } = {}) {
  if (!minReqs || !specs) return {};
  const verdicts = {};
  if (minReqs.os) verdicts.os = checkOs(minReqs.os, specs);
  if (minReqs.cpu) verdicts.cpu = checkCpu(minReqs.cpu, specs);
  if (minReqs.ram) verdicts.ram = checkRam(minReqs.ram, specs.totalMemory);
  if (minReqs.gpu) verdicts.gpu = checkGpu(minReqs.gpu, specs);
  if (minReqs.storage) {
    verdicts.storage = checkStorage(minReqs.storage, freeSpace, downloadSize);
  }
  return verdicts;
}
