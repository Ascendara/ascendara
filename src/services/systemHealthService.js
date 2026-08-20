import { checkServerStatus } from "@/services/serverStatus";

const LOW_SPACE_BYTES = 5 * 1024 * 1024 * 1024;

export function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index >= 3 ? 1 : 0)} ${units[index]}`;
}

function toolIsInstalled(value) {
  if (value === true) return true;
  return Boolean(
    value &&
      typeof value === "object" &&
      (value.installed === true || value.success === true || value.status === "installed")
  );
}

function getWindowsVolumeKey(directory) {
  const value = String(directory || "")
    .trim()
    .replace(/\//g, "\\");

  const drive = value.match(/^([a-zA-Z]:)(?:\\|$)/);
  if (drive) return drive[1].toUpperCase();

  const unc = value.match(/^\\\\([^\\]+)\\([^\\]+)/);
  if (unc) return `\\\\${unc[1].toLocaleLowerCase()}\\${unc[2].toLocaleLowerCase()}`;

  return null;
}

function normalizeDriveTotals(driveSpace, isWindows) {
  const directories = Array.isArray(driveSpace?.directories) ? driveSpace.directories : [];
  if (!isWindows || directories.length < 2) return driveSpace;

  const volumes = new Map();
  for (const directory of directories) {
    const key = getWindowsVolumeKey(directory.path);
    if (!key) {
      // If a path cannot be mapped to a Windows volume, keep the upstream totals
      // rather than guessing whether two unrelated locations share a device.
      return driveSpace;
    }
    if (!volumes.has(key)) volumes.set(key, directory);
  }

  let freeSpace = 0;
  let totalSpace = 0;
  for (const directory of volumes.values()) {
    freeSpace += Number(directory.freeSpace) || 0;
    totalSpace += Number(directory.totalSpace) || 0;
  }

  return {
    ...driveSpace,
    freeSpace,
    totalSpace,
  };
}

export async function loadStorageSnapshot() {
  const downloadDirectory = await window.electron.getDownloadDirectory();
  const [driveSpace, gamesSize, isWindows] = await Promise.all([
    window.electron.getDriveSpace(downloadDirectory),
    window.electron.getInstalledGamesSize(),
    window.electron.isOnWindows(),
  ]);

  return {
    downloadDirectory,
    driveSpace: normalizeDriveTotals(driveSpace, Boolean(isWindows)),
    gamesSize,
  };
}

export async function inspectSystemHealth(t) {
  const items = [];

  try {
    const [settings, isWindows, isLinux, serverStatus] = await Promise.all([
      window.electron.getSettings(),
      window.electron.isOnWindows(),
      window.electron.isOnLinux(),
      checkServerStatus(true),
    ]);

    items.push({
      id: "settings",
      status: settings ? "healthy" : "error",
      title: t("featureCenters.system.health.settings"),
      description: settings
        ? t("featureCenters.system.health.settingsOk")
        : t("featureCenters.system.health.settingsError"),
      action: settings
        ? null
        : {
            type: "settings",
            label: t("featureCenters.system.health.actions.openSettings"),
          },
    });

    const downloadDirectory =
      settings?.downloadDirectory || (await window.electron.getDownloadDirectory());

    if (!downloadDirectory) {
      items.push({
        id: "download-directory",
        status: "error",
        title: t("featureCenters.system.health.gameDirectory"),
        description: t("featureCenters.system.health.noGameDirectory"),
        action: {
          type: "settings",
          label: t("featureCenters.system.health.actions.configure"),
        },
      });
    } else {
      const [writable, driveSpace] = await Promise.all([
        window.electron.canCreateFiles(downloadDirectory),
        window.electron.getDriveSpace(downloadDirectory),
      ]);
      const primaryDriveSpace = driveSpace?.directories?.find(
        directory => directory.path === downloadDirectory
      );
      const fallbackDriveSpace = normalizeDriveTotals(driveSpace, Boolean(isWindows));
      const freeSpace =
        Number(primaryDriveSpace?.freeSpace ?? fallbackDriveSpace?.freeSpace) || 0;

      items.push({
        id: "download-directory",
        status: !writable
          ? "error"
          : freeSpace > 0 && freeSpace < LOW_SPACE_BYTES
            ? "warning"
            : "healthy",
        title: t("featureCenters.system.health.gameDirectory"),
        description: !writable
          ? t("featureCenters.system.health.gameDirectoryBlocked")
          : freeSpace > 0 && freeSpace < LOW_SPACE_BYTES
            ? t("featureCenters.system.health.gameDirectoryLowSpace", {
                freeSpace: formatBytes(freeSpace),
              })
            : t("featureCenters.system.health.gameDirectoryOk", {
                freeSpaceText: freeSpace > 0 ? ` · ${formatBytes(freeSpace)}` : "",
              }),
        detail: downloadDirectory,
        action: !writable
          ? {
              type: "settings",
              label: t("featureCenters.system.health.actions.review"),
            }
          : null,
      });
    }

    if (settings?.customSourcesMode) {
      items.push({
        id: "index",
        status: settings?.customSource?.url ? "healthy" : "warning",
        title: t("featureCenters.system.health.externalSource"),
        description: settings?.customSource?.url
          ? t("featureCenters.system.health.externalSourceOk")
          : t("featureCenters.system.health.externalSourceMissing"),
        detail: settings?.customSource?.url || null,
        action: settings?.customSource?.url
          ? null
          : {
              type: "settings",
              label: t("featureCenters.system.health.actions.configure"),
            },
      });
    } else if (settings?.localIndex) {
      const localIndexExists = await window.electron.checkFileExists(settings.localIndex);
      items.push({
        id: "index",
        status: localIndexExists ? "healthy" : "warning",
        title: t("featureCenters.system.health.localIndex"),
        description: localIndexExists
          ? t("featureCenters.system.health.localIndexOk")
          : t("featureCenters.system.health.localIndexMissing"),
        detail: settings.localIndex,
        action: localIndexExists
          ? null
          : {
              type: "local-refresh",
              label: t("featureCenters.system.health.actions.repair"),
            },
      });
    } else {
      items.push({
        id: "index",
        status: "warning",
        title: t("featureCenters.system.health.gameIndex"),
        description: t("featureCenters.system.health.gameIndexMissing"),
        action: {
          type: "local-refresh",
          label: t("featureCenters.system.health.actions.setUp"),
        },
      });
    }

    const serviceNames = ["monitor", "api", "storage", "lfs", "r2"];
    const failedServices = serviceNames.filter(name => !serverStatus?.[name]?.ok);
    items.push({
      id: "services",
      status: serverStatus?.noInternet || failedServices.length > 0 ? "warning" : "healthy",
      title: t("featureCenters.system.health.services"),
      description: serverStatus?.noInternet
        ? t("featureCenters.system.health.servicesOffline")
        : failedServices.length > 0
          ? t("featureCenters.system.health.servicesPartial", {
              services: failedServices.join(", "),
            })
          : t("featureCenters.system.health.servicesOk"),
    });

    try {
      const tools = await window.electron.getInstalledTools();
      items.push({
        id: "tools",
        status: "info",
        title: t("featureCenters.system.health.tools"),
        description: t("featureCenters.system.health.toolsCount", {
          count: Array.isArray(tools) ? tools.length : 0,
        }),
      });
    } catch {
      items.push({
        id: "tools",
        status: "warning",
        title: t("featureCenters.system.health.tools"),
        description: t("featureCenters.system.health.toolsError"),
      });
    }

    if (isWindows) {
      try {
        const dependencies = await window.electron.checkGameDependencies();
        const missing = Array.isArray(dependencies)
          ? dependencies.filter(dependency => dependency.installed === false)
          : [];
        items.push({
          id: "dependencies",
          status: missing.length > 0 ? "warning" : "healthy",
          title: t("featureCenters.system.health.dependencies"),
          description:
            missing.length > 0
              ? t("featureCenters.system.health.dependenciesMissing", {
                  count: missing.length,
                  dependencies: missing.map(item => item.name || item.file).join(", "),
                })
              : t("featureCenters.system.health.dependenciesOk"),
          action:
            missing.length > 0
              ? {
                  type: "install-dependencies",
                  label: t("featureCenters.system.health.actions.install"),
                }
              : null,
        });
      } catch (error) {
        items.push({
          id: "dependencies",
          status: "warning",
          title: t("featureCenters.system.health.dependencies"),
          description: t("featureCenters.system.health.dependenciesError", {
            error: error.message,
          }),
        });
      }
    }

    if (isLinux) {
      try {
        const umu = await window.electron.isUmuInstalled();
        items.push({
          id: "umu",
          status: toolIsInstalled(umu) ? "healthy" : "info",
          title: t("featureCenters.system.health.umu"),
          description: toolIsInstalled(umu)
            ? t("featureCenters.system.health.umuOk")
            : t("featureCenters.system.health.umuMissing"),
          action: toolIsInstalled(umu)
            ? null
            : {
                type: "settings",
                label: t("featureCenters.system.health.actions.configure"),
              },
        });
      } catch {}
    }

    try {
      const steamCmd = await window.electron.isSteamCMDInstalled();
      items.push({
        id: "steamcmd",
        status: toolIsInstalled(steamCmd) ? "healthy" : "info",
        title: t("featureCenters.system.health.steamcmd"),
        description: toolIsInstalled(steamCmd)
          ? t("featureCenters.system.health.steamcmdOk")
          : t("featureCenters.system.health.steamcmdMissing"),
      });
    } catch {}
  } catch (error) {
    console.error("[SystemHealth] Health check failed:", error);
    items.push({
      id: "health-error",
      status: "error",
      title: t("featureCenters.system.health.interrupted"),
      description:
        error.message || t("featureCenters.system.health.interruptedDescription"),
    });
  }

  return items;
}
