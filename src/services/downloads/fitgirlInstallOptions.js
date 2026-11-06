// Toggles for installing a finished FitGirl pack. Settings hold the defaults,
// a download can carry its own choice in gameInfo.fitgirlInstall.
export const FITGIRL_INSTALL_DEFAULTS = Object.freeze({
  ask: true,
  verify: true,
  silent: true,
  limitRam: false,
  verifyInstalled: true,
  redists: false,
  hostsRedirect: false,
  openSite: false,
  deletePack: true,
});

export const FITGIRL_SETTING_KEYS = Object.freeze({
  ask: "fitgirlAskInstall",
  verify: "fitgirlVerifyMd5",
  silent: "fitgirlSilentSetup",
  limitRam: "fitgirlLimitRam",
  verifyInstalled: "fitgirlVerifyInstalled",
  redists: "fitgirlRedists",
  hostsRedirect: "fitgirlHostsRedirect",
  openSite: "fitgirlOpenSite",
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

// Per-download choices, keyed by game name, so they survive a restart while the
// pack downloads. Game info JSON is rewritten by the downloader, so they live here.
const CHOICES_KEY = "fitgirlInstallChoices";
const readChoices = storage => {
  try {
    return JSON.parse(storage?.getItem(CHOICES_KEY) || "{}") || {};
  } catch {
    return {};
  }
};

export function readDownloadChoice(game, storage = globalThis.localStorage) {
  return readChoices(storage)[String(game)] || null;
}

export function saveDownloadChoice(game, options, storage = globalThis.localStorage) {
  const choices = readChoices(storage);
  if (options) choices[String(game)] = { ...options };
  else delete choices[String(game)];
  try {
    storage?.setItem(CHOICES_KEY, JSON.stringify(choices));
  } catch {}
}
