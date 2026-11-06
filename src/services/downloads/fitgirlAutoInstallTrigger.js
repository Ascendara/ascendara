import { resolveFitgirlOptions } from "./fitgirlInstallOptions";

const ACTIVE_STAGES = new Set(["checking", "verifying", "installing", "cleaning"]);
export const isFitgirlInstallActive = state => ACTIVE_STAGES.has(state?.stage);

// Finished FitGirl packs that still wait for setup. Each game is returned once per
// session (it goes into `handled`) and never when the main process already has an
// install state for it, so a pack is never asked about or started twice.
// A per-download choice beats the Settings defaults.
export function takeFitgirlActions(
  downloads,
  { settings, readChoice = () => null, handled, states = {} }
) {
  const actions = [];
  for (const download of downloads || []) {
    const data = download?.downloadingData;
    const game = download?.name;
    if (!game || !data?.pendingManualInstall || !data.fitgirlPack) continue;
    if (handled.has(game)) continue;
    handled.add(game);
    if (states[game]) continue;
    const options = resolveFitgirlOptions(settings, readChoice(game));
    actions.push({
      game,
      installerPath: data.manualInstallerPath || "",
      options,
      action: options.ask ? "ask" : "install",
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
      return {
        key: "fitgirlInstall.verifying",
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
