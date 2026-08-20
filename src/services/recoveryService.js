const SAFE_MODE_KEY = "ascendara:safe-ui-mode";
const SAFE_MODE_STYLE_ID = "ascendara-safe-ui-mode-style";

function ensureSafeModeStyle() {
  if (typeof document === "undefined" || document.getElementById(SAFE_MODE_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = SAFE_MODE_STYLE_ID;
  style.textContent = `
    html.ascendara-safe-ui *,
    html.ascendara-safe-ui *::before,
    html.ascendara-safe-ui *::after {
      animation-duration: 0.001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.001ms !important;
      scroll-behavior: auto !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }
  `;
  document.head.appendChild(style);
}

function getAppVersion() {
  return typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : null;
}

function invokeRecovery(channel, ...args) {
  const invoke = window.electron?.ipcRenderer?.invoke;
  if (typeof invoke !== "function") {
    throw new Error("Ascendara recovery IPC is unavailable in this build");
  }
  return invoke(channel, ...args);
}

export function isSafeUiModeEnabled() {
  try {
    return localStorage.getItem(SAFE_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

export function applySafeUiMode(enabled = isSafeUiModeEnabled()) {
  if (typeof document === "undefined") return false;

  ensureSafeModeStyle();
  document.documentElement.classList.toggle("ascendara-safe-ui", Boolean(enabled));
  return Boolean(enabled);
}

export function setSafeUiMode(enabled) {
  try {
    if (enabled) localStorage.setItem(SAFE_MODE_KEY, "1");
    else localStorage.removeItem(SAFE_MODE_KEY);
  } catch (error) {
    console.warn("[Recovery] Could not persist Safe UI Mode:", error);
  }

  return applySafeUiMode(enabled);
}

export function clearTransientUiState() {
  // Only clear temporary UI flags; library data and settings stay untouched.
  const transientKeys = [
    "forceLoading",
    "forceInstalling",
    "finishingUp",
    "ascendara:startTour",
  ];

  for (const key of transientKeys) {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch {}
  }
}

export async function createSettingsRecoveryPoint(reason = "manual") {
  return invokeRecovery("create-settings-recovery-point", reason, getAppVersion());
}

export async function listSettingsRecoveryPoints() {
  const points = await invokeRecovery("list-settings-recovery-points");
  return Array.isArray(points) ? points : [];
}

export async function restoreSettingsRecoveryPoint(id) {
  if (!id) throw new Error("A recovery point is required");
  return invokeRecovery("restore-settings-recovery-point", id);
}

export async function restoreLatestSettingsRecoveryPoint() {
  const points = await listSettingsRecoveryPoints();
  if (points.length === 0) {
    throw new Error("No settings recovery point is available");
  }
  return restoreSettingsRecoveryPoint(points[0].id);
}

export async function listOfficialRollbackVersions() {
  const releases = await invokeRecovery("list-official-rollback-versions");
  return Array.isArray(releases) ? releases : [];
}

export async function rollbackAscendaraVersion(version) {
  if (!version) throw new Error("A rollback version is required");
  return invokeRecovery("rollback-ascendara-version", version);
}

export function initializeRecoveryMode() {
  applySafeUiMode();
}
