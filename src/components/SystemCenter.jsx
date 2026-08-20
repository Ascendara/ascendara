import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Database,
  HardDrive,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Terminal,
  Wrench,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FeatureCenterDialog,
  FeatureSection,
  FeatureState,
  FeatureStat,
  FeatureTabs,
} from "@/components/feature-centers/FeatureCenterPrimitives";
import { useLanguage } from "@/context/LanguageContext";
import { useFeatureCenterDialog } from "@/hooks/useFeatureCenterDialog";
import { FEATURE_CENTER_EVENTS } from "@/lib/featureCenterEvents";
import {
  clearTransientUiState,
  createSettingsRecoveryPoint,
  initializeRecoveryMode,
  isSafeUiModeEnabled,
  listOfficialRollbackVersions,
  listSettingsRecoveryPoints,
  restoreSettingsRecoveryPoint,
  rollbackAscendaraVersion,
  setSafeUiMode,
} from "@/services/recoveryService";
import {
  formatBytes,
  inspectSystemHealth,
  loadStorageSnapshot,
} from "@/services/systemHealthService";

const STATUS_META = {
  healthy: {
    icon: CheckCircle2,
    className: "text-green-500",
    badge: "border-green-500/30 bg-green-500/10 text-green-500",
  },
  warning: {
    icon: AlertTriangle,
    className: "text-yellow-500",
    badge: "border-yellow-500/30 bg-yellow-500/10 text-yellow-500",
  },
  error: {
    icon: XCircle,
    className: "text-red-500",
    badge: "border-red-500/30 bg-red-500/10 text-red-500",
  },
  info: {
    icon: CircleHelp,
    className: "text-blue-500",
    badge: "border-blue-500/30 bg-blue-500/10 text-blue-500",
  },
};

function getRecoveryReasonKey(reason) {
  if (reason === "before-update") return "beforeUpdate";
  if (String(reason || "").startsWith("before-rollback")) return "beforeRollback";
  return "manual";
}

function HealthRow({ item, onAction, t }) {
  const meta = STATUS_META[item.status] || STATUS_META.info;
  const Icon = meta.icon;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/60 p-4 sm:flex-row sm:items-start">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${meta.className}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-foreground">{item.title}</p>
            <Badge variant="outline" className={meta.badge}>
              {t(`featureCenters.system.status.${item.status || "info"}`)}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
          {item.detail && (
            <p className="mt-2 break-all rounded-md bg-muted/40 px-2 py-1 font-mono text-xs text-muted-foreground">
              {item.detail}
            </p>
          )}
        </div>
      </div>
      {item.action && (
        <Button
          size="sm"
          variant="outline"
          className="self-start sm:ml-auto"
          onClick={() => onAction(item.action)}
        >
          {item.action.label}
        </Button>
      )}
    </div>
  );
}

const SystemCenter = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("health");
  const handleOpenEvent = useCallback(detail => {
    if (["health", "storage", "recovery"].includes(detail?.tab)) {
      setActiveTab(detail.tab);
    }
  }, []);
  const [open, setOpen] = useFeatureCenterDialog(
    FEATURE_CENTER_EVENTS.system,
    handleOpenEvent
  );

  const [checking, setChecking] = useState(false);
  const [healthItems, setHealthItems] = useState([]);
  const [storage, setStorage] = useState(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [safeUiMode, setSafeUiModeState] = useState(false);
  const [recoveryPoints, setRecoveryPoints] = useState([]);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [rollbackVersions, setRollbackVersions] = useState([]);
  const [rollbackLoading, setRollbackLoading] = useState(false);

  useEffect(() => {
    initializeRecoveryMode();
    setSafeUiModeState(isSafeUiModeEnabled());
  }, []);

  const closeAndNavigate = useCallback(
    path => {
      setOpen(false);
      navigate(path);
    },
    [navigate, setOpen]
  );

  const runHealthCheck = useCallback(async () => {
    setChecking(true);
    try {
      setHealthItems(await inspectSystemHealth(t));
    } finally {
      setChecking(false);
    }
  }, [t]);

  const refreshStorage = useCallback(async () => {
    setStorageLoading(true);
    setStorageError("");
    try {
      setStorage(await loadStorageSnapshot());
    } catch (error) {
      console.error("[SystemCenter] Storage check failed:", error);
      setStorageError(error.message || t("featureCenters.system.storage.error"));
    } finally {
      setStorageLoading(false);
    }
  }, [t]);

  const refreshRecovery = useCallback(async () => {
    setRecoveryLoading(true);
    setRollbackLoading(true);

    const [pointsResult, rollbackResult] = await Promise.allSettled([
      listSettingsRecoveryPoints(),
      listOfficialRollbackVersions(),
    ]);

    setRecoveryPoints(
      pointsResult.status === "fulfilled" && Array.isArray(pointsResult.value)
        ? pointsResult.value
        : []
    );
    setRollbackVersions(
      rollbackResult.status === "fulfilled" && Array.isArray(rollbackResult.value)
        ? rollbackResult.value
        : []
    );
    setRecoveryLoading(false);
    setRollbackLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (activeTab === "health") runHealthCheck();
    if (activeTab === "storage") refreshStorage();
    if (activeTab === "recovery") refreshRecovery();
  }, [open, activeTab, refreshRecovery, refreshStorage, runHealthCheck]);

  const handleHealthAction = useCallback(
    async action => {
      if (action.type === "settings") return closeAndNavigate("/settings");
      if (action.type === "local-refresh") return closeAndNavigate("/localrefresh");
      if (action.type !== "install-dependencies") return;

      try {
        toast.info(t("featureCenters.system.toasts.dependenciesInstalling"));
        const result = await window.electron.installDependencies();
        if (!result?.success) {
          throw new Error(result?.message || "Dependency installation failed");
        }
        toast.success(t("featureCenters.system.toasts.dependenciesDone"));
        await runHealthCheck();
      } catch (error) {
        toast.error(t("featureCenters.system.toasts.dependenciesFailed"), {
          description: error.message,
        });
      }
    },
    [closeAndNavigate, runHealthCheck, t]
  );

  const overallHealth = useMemo(() => {
    if (healthItems.some(item => item.status === "error")) return "error";
    if (healthItems.some(item => item.status === "warning")) return "warning";
    return healthItems.length > 0 ? "healthy" : "info";
  }, [healthItems]);

  const healthMeta = STATUS_META[overallHealth];
  const HealthIcon = healthMeta.icon;
  const driveDirectories = storage?.driveSpace?.directories || [];
  const gameDirectories = storage?.gamesSize?.directorySizes || [];
  const previousVersion = rollbackVersions[0] || null;

  const createRecoveryPoint = async () => {
    setRecoveryLoading(true);
    try {
      await createSettingsRecoveryPoint("manual");
      toast.success(t("featureCenters.system.toasts.pointCreated"));
      await refreshRecovery();
    } catch (error) {
      toast.error(t("featureCenters.system.toasts.pointCreateFailed"), {
        description: error.message,
      });
      setRecoveryLoading(false);
    }
  };

  const restoreRecoveryPoint = async point => {
    const date = point.createdAt ? new Date(point.createdAt).toLocaleString() : point.id;
    if (!window.confirm(t("featureCenters.system.recovery.restoreConfirm", { date }))) return;

    try {
      await restoreSettingsRecoveryPoint(point.id);
      window.location.reload();
    } catch (error) {
      toast.error(t("featureCenters.system.toasts.pointRestoreFailed"), {
        description: error.message,
      });
    }
  };

  const clearBrowserData = async () => {
    if (!window.confirm(t("featureCenters.system.recovery.clearBrowserDataConfirm"))) return;
    try {
      const cleared = await window.electron.clearCache();
      if (cleared !== true) {
        throw new Error("Ascendara could not clear Chromium browser data");
      }
      clearTransientUiState();
      window.location.reload();
    } catch (error) {
      toast.error(t("featureCenters.system.toasts.browserDataFailed"), {
        description: error.message,
      });
    }
  };

  const toggleSafeMode = enabled => {
    setSafeUiMode(enabled);
    setSafeUiModeState(enabled);
    toast.success(
      t(
        enabled
          ? "featureCenters.system.recovery.safeEnabled"
          : "featureCenters.system.recovery.safeDisabled"
      ),
      {
        description: t(
          enabled
            ? "featureCenters.system.recovery.safeEnabledDescription"
            : "featureCenters.system.recovery.safeDisabledDescription"
        ),
      }
    );
  };

  const startRollback = async () => {
    if (!previousVersion) return;
    if (
      !window.confirm(
        t("featureCenters.system.recovery.rollbackConfirm", {
          version: previousVersion.version,
        })
      )
    ) {
      return;
    }

    toast.loading(
      t("featureCenters.system.toasts.rollbackDownloading", {
        version: previousVersion.version,
      }),
      { id: "ascendara-rollback" }
    );

    try {
      await rollbackAscendaraVersion(previousVersion.version);
    } catch (error) {
      toast.error(t("featureCenters.system.toasts.rollbackFailed"), {
        id: "ascendara-rollback",
        description: error.message,
      });
    }
  };

  const tabs = [
    { id: "health", label: t("featureCenters.system.tabs.health"), icon: Activity },
    { id: "storage", label: t("featureCenters.system.tabs.storage"), icon: HardDrive },
    { id: "recovery", label: t("featureCenters.system.tabs.recovery"), icon: Wrench },
  ];

  return (
    <FeatureCenterDialog
      open={open}
      onOpenChange={setOpen}
      title={t("featureCenters.system.title")}
      description={t("featureCenters.system.description")}
      icon={ShieldCheck}
    >
      <FeatureTabs items={tabs} activeId={activeTab} onChange={setActiveTab}>
        {activeTab === "health" && (
          <div className="space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <HealthIcon className={`h-6 w-6 ${healthMeta.className}`} />
                  <h2 className="text-xl font-semibold text-foreground">
                    {t("featureCenters.system.health.title")}
                  </h2>
                  {healthItems.length > 0 && (
                    <Badge variant="outline" className={healthMeta.badge}>
                      {t(`featureCenters.system.status.${overallHealth}`)}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("featureCenters.system.health.description")}
                </p>
              </div>
              <Button variant="outline" onClick={runHealthCheck} disabled={checking}>
                <RefreshCw className={`mr-2 h-4 w-4 ${checking ? "animate-spin" : ""}`} />
                {t(
                  checking
                    ? "featureCenters.system.health.checking"
                    : "featureCenters.system.health.runAgain"
                )}
              </Button>
            </div>

            {checking && healthItems.length === 0 ? (
              <FeatureState
                icon={RefreshCw}
                title={t("featureCenters.system.health.checkingApp")}
              />
            ) : (
              <div className="space-y-3">
                {healthItems.map(item => (
                  <HealthRow key={item.id} item={item} onAction={handleHealthAction} t={t} />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "storage" && (
          <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  {t("featureCenters.system.storage.title")}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("featureCenters.system.storage.description")}
                </p>
              </div>
              <Button variant="outline" onClick={refreshStorage} disabled={storageLoading}>
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${storageLoading ? "animate-spin" : ""}`}
                />
                {t("featureCenters.common.refresh")}
              </Button>
            </div>

            {storageError ? (
              <FeatureState
                icon={AlertTriangle}
                title={t("featureCenters.system.storage.error")}
                description={storageError}
                action={{
                  label: t("featureCenters.common.retry"),
                  onClick: refreshStorage,
                }}
              />
            ) : storageLoading && !storage ? (
              <FeatureState icon={RefreshCw} title={t("featureCenters.common.loading")} />
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <FeatureStat
                    label={t("featureCenters.system.storage.games")}
                    value={formatBytes(storage?.gamesSize?.totalSize)}
                  />
                  <FeatureStat
                    label={t("featureCenters.system.storage.freeSpace")}
                    value={formatBytes(storage?.driveSpace?.freeSpace)}
                  />
                  <FeatureStat
                    label={t("featureCenters.system.storage.totalCapacity")}
                    value={formatBytes(storage?.driveSpace?.totalSpace)}
                  />
                </div>

                <FeatureSection
                  title={t("featureCenters.system.storage.configuredLocations")}
                  actions={
                    <Button size="sm" variant="outline" onClick={() => closeAndNavigate("/settings")}>
                      {t("featureCenters.system.storage.manageFolders")}
                    </Button>
                  }
                >
                  <div className="space-y-3">
                    {driveDirectories.map(directory => {
                      const gameSize =
                        gameDirectories.find(item => item.path === directory.path)?.size || 0;
                      const usedPercent =
                        directory.totalSpace > 0
                          ? Math.max(
                              0,
                              Math.min(
                                100,
                                ((directory.totalSpace - directory.freeSpace) /
                                  directory.totalSpace) *
                                  100
                              )
                            )
                          : 0;

                      return (
                        <div key={directory.path} className="rounded-lg border border-border p-4">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <p className="min-w-0 break-all font-mono text-xs text-foreground">
                              {directory.path}
                            </p>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {t("featureCenters.system.storage.used", {
                                percent: usedPercent.toFixed(0),
                              })}
                            </span>
                          </div>
                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${usedPercent}%` }}
                            />
                          </div>
                          <div className="mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-3">
                            <span>
                              {t("featureCenters.system.storage.locationGames", {
                                size: formatBytes(gameSize),
                              })}
                            </span>
                            <span>
                              {t("featureCenters.system.storage.locationFree", {
                                size: formatBytes(directory.freeSpace),
                              })}
                            </span>
                            <span>
                              {t("featureCenters.system.storage.locationTotal", {
                                size: formatBytes(directory.totalSpace),
                              })}
                            </span>
                          </div>
                        </div>
                      );
                    })}

                    {!storageLoading && driveDirectories.length === 0 && (
                      <FeatureState
                        compact
                        icon={HardDrive}
                        title={t("featureCenters.system.storage.noLocations")}
                      />
                    )}
                  </div>
                </FeatureSection>
              </>
            )}
          </div>
        )}

        {activeTab === "recovery" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                {t("featureCenters.system.recovery.title")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("featureCenters.system.recovery.description")}
              </p>
            </div>

            <FeatureSection
              title={t("featureCenters.system.recovery.safeMode")}
              description={t("featureCenters.system.recovery.safeModeDescription")}
              actions={
                <Button
                  variant={safeUiMode ? "secondary" : "outline"}
                  onClick={() => toggleSafeMode(!safeUiMode)}
                >
                  {t(
                    safeUiMode
                      ? "featureCenters.system.recovery.disable"
                      : "featureCenters.system.recovery.enable"
                  )}
                </Button>
              }
            />

            <div className="grid gap-4 lg:grid-cols-2">
              <FeatureSection
                title={t("featureCenters.system.recovery.reload")}
                description={t("featureCenters.system.recovery.reloadDescription")}
              >
                <Button variant="outline" onClick={() => window.location.reload()}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {t("featureCenters.system.recovery.reload")}
                </Button>
              </FeatureSection>

              <FeatureSection
                title={t("featureCenters.system.recovery.clearBrowserData")}
                description={t("featureCenters.system.recovery.clearBrowserDataDescription")}
              >
                <Button variant="outline" onClick={clearBrowserData}>
                  <Database className="mr-2 h-4 w-4" />
                  {t("featureCenters.system.recovery.clearAndReload")}
                </Button>
              </FeatureSection>
            </div>

            <FeatureSection
              title={t("featureCenters.system.recovery.recoveryPoints")}
              description={t("featureCenters.system.recovery.recoveryPointsDescription")}
              actions={
                <Button variant="outline" onClick={createRecoveryPoint} disabled={recoveryLoading}>
                  {t("featureCenters.system.recovery.createPoint")}
                </Button>
              }
            >
              <div className="space-y-2">
                {recoveryPoints.map(point => {
                  const reasonKey = getRecoveryReasonKey(point.reason);
                  return (
                    <div
                      key={point.id}
                      className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-foreground">
                            {point.createdAt
                              ? new Date(point.createdAt).toLocaleString()
                              : point.id}
                          </p>
                          <Badge variant="outline">
                            {t(`featureCenters.system.recovery.${reasonKey}`)}
                          </Badge>
                          {point.appVersion && (
                            <Badge variant="secondary">v{point.appVersion}</Badge>
                          )}
                        </div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => restoreRecoveryPoint(point)}>
                        {t("featureCenters.system.recovery.restore")}
                      </Button>
                    </div>
                  );
                })}

                {!recoveryLoading && recoveryPoints.length === 0 && (
                  <FeatureState
                    compact
                    icon={RotateCcw}
                    title={t("featureCenters.system.recovery.noPoints")}
                  />
                )}
              </div>
            </FeatureSection>

            <FeatureSection
              title={t("featureCenters.system.recovery.rollback")}
              description={t("featureCenters.system.recovery.rollbackDescription")}
            >
              {rollbackLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  {t("featureCenters.system.recovery.rollbackChecking")}
                </div>
              ) : previousVersion ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    {t("featureCenters.system.recovery.rollbackAvailable", {
                      version: previousVersion.version,
                    })}
                  </p>
                  <Button variant="outline" onClick={startRollback}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    {t("featureCenters.system.recovery.rollbackButton", {
                      version: previousVersion.version,
                    })}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("featureCenters.system.recovery.rollbackUnavailable")}
                </p>
              )}
            </FeatureSection>

            <FeatureSection
              title={t("featureCenters.system.recovery.developerDiagnostics")}
              description={t("featureCenters.system.recovery.developerDiagnosticsDescription")}
            >
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await window.electron.openDevTools();
                  } catch {
                    toast.info(t("featureCenters.system.recovery.devToolsUnavailable"));
                  }
                }}
              >
                <Terminal className="mr-2 h-4 w-4" />
                {t("featureCenters.system.recovery.openDevTools")}
              </Button>
            </FeatureSection>
          </div>
        )}
      </FeatureTabs>
    </FeatureCenterDialog>
  );
};

export default SystemCenter;
