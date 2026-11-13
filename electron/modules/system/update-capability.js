const SUPPORTED_PLATFORMS = new Set(["win32", "darwin", "linux"]);

function getAutomaticUpdateCapability({
  platform,
  isPortable = false,
  isDev = false,
  isAppImage = false,
  execPath = "",
}) {
  if (isDev) {
    return { supported: false, reason: "development" };
  }

  if (!SUPPORTED_PLATFORMS.has(platform)) {
    return { supported: false, reason: "unsupported-platform" };
  }

  if (isPortable) {
    return { supported: false, reason: "portable" };
  }

  if (platform === "linux" && !isAppImage) {
    return { supported: false, reason: "linux-not-appimage" };
  }

  if (
    platform === "darwin" &&
    !/\.app[\\/]Contents[\\/]MacOS(?:[\\/]|$)/.test(String(execPath))
  ) {
    return { supported: false, reason: "mac-not-installed-app" };
  }

  return { supported: true, reason: null };
}

module.exports = { getAutomaticUpdateCapability };
