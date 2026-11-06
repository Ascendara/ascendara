// Toggles for installing a finished FitGirl pack. Settings hold the defaults,
// a download can carry its own choice in gameInfo.fitgirlInstall.
export const FITGIRL_INSTALL_DEFAULTS = Object.freeze({
  ask: true,
  verify: true,
  silent: true,
  limitRam: false,
  deletePack: true,
});

export const FITGIRL_SETTING_KEYS = Object.freeze({
  ask: "fitgirlAskInstall",
  verify: "fitgirlVerifyMd5",
  silent: "fitgirlSilentSetup",
  limitRam: "fitgirlLimitRam",
  deletePack: "fitgirlDeletePack",
});

export function resolveFitgirlOptions(settings, override) {
  const options = {};
  for (const [option, key] of Object.entries(FITGIRL_SETTING_KEYS)) {
    const fromDownload = override?.[option];
    const fromSettings = settings?.[key];
    options[option] =
      typeof fromDownload === "boolean"
        ? fromDownload
        : typeof fromSettings === "boolean"
          ? fromSettings
          : FITGIRL_INSTALL_DEFAULTS[option];
  }
  return options;
}

export const looksLikeFitgirl = name => /fit\s*girl/i.test(String(name || ""));
