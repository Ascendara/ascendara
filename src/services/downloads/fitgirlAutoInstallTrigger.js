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
