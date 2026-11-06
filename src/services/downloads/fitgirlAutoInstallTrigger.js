import { FITGIRL_SETTING_KEYS, resolveFitgirlOptions } from "./fitgirlInstallOptions";

const ACTIVE_STAGES = new Set([
  "checking",
  "verifying",
  "installing",
  "verifyingInstall",
  "cleaning",
]);
export const isFitgirlInstallActive = state => ACTIVE_STAGES.has(state?.stage);

// Finished FitGirl packs that still wait for setup. Each game is returned once per
// session (it goes into `handled`) and never when the main process already has an
// install state for it, so a pack is never asked about or started twice.
// A per-download choice beats the Settings defaults. `log` gets one line per
// decision so a test run shows why a pack was asked about, installed or skipped.
export function takeFitgirlActions(
  downloads,
  { settings, readChoice = () => null, handled, states = {}, log = () => {} }
) {
  const actions = [];
  for (const download of downloads || []) {
    const data = download?.downloadingData;
    const game = download?.name;
    if (!game || !data?.pendingManualInstall || !data.fitgirlPack) continue;
    if (handled.has(game)) continue;
    handled.add(game);
    if (states[game]) {
      log(`${game}: skip, main process already has stage ${states[game].stage}`);
      continue;
    }
    const choice = readChoice(game);
    const options = resolveFitgirlOptions(settings, choice);
    const askFrom =
      typeof choice?.ask === "boolean"
        ? "download choice"
        : typeof settings?.[FITGIRL_SETTING_KEYS.ask] === "boolean"
          ? "Settings"
          : "default";
    const action = options.ask ? "ask" : "install";
    log(`${game}: ask=${options.ask} (from ${askFrom}), action=${action}`);
    actions.push({
      game,
      installerPath: data.manualInstallerPath || "",
      options,
      action,
    });
  }
  return actions;
}

// The i18n key and values for a Downloads card line, from a progress state.
export function describeFitgirlState(state) {
  switch (state?.stage) {
    case "checking":
    case "installing":
    case "cleaning":
    case "done":
      return { key: `fitgirlInstall.${state.stage}`, values: {} };
    case "verifying":
    case "verifyingInstall":
      return {
        key: `fitgirlInstall.${state.stage}`,
        values: { percent: Math.max(0, Math.min(100, Number(state.percent) || 0)) },
      };
    case "failed":
      return {
        key: "fitgirlInstall.failed",
        values: {
          error: state.failedStage
            ? `${state.failedStage}: ${state.error || "unknown error"}`
            : state.error || "unknown error",
        },
      };
    default:
      return null;
  }
}
