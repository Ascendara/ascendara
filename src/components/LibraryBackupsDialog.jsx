import { useLibraryBackupStore } from "@/services/libraryBackupStore";
import LocalLibraryBackupsDialog from "@/components/LocalLibraryBackupsDialog";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import {
  CloudDownload,
  CloudUpload,
  Loader,
  RotateCcw,
  ChevronDown,
  Gamepad2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import {
  getBackupDownloadUrl,
  listBackups,
  verifyAscendAccess,
} from "@/services/firebaseService";
import { uploadBackupToCloud } from "@/services/cloudBackupService";
import {
  MAX_CLOUD_BACKUP_BYTES,
  validateBackupFolderName,
  validateCloudBackupEntries,
} from "@/lib/cloudBackupValidation";

export default function LibraryBackupsDialog({
  open,
  onOpenChange,
  gameNames,
  canManage = false,
}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { settings } = useSettings();
  const {
    screen,
    setScreen,
    busy,
    progress,
    setProgress,
    results,
    setResults,
    begin,
    finish,
  } = useLibraryBackupStore();
  const [uploadToCloud, setUploadToCloud] = useState(false);
  const [cloudBackups, setCloudBackups] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loadingCloud, setLoadingCloud] = useState(false);
  const [cloudError, setCloudError] = useState("");
  const [restoreConfirmed, setRestoreConfirmed] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelected([]);
      setCloudBackups([]);
      setCloudError("");
      setRestoreConfirmed(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || screen !== "import" || !user || !canManage) return;
    let active = true;
    setLoadingCloud(true);
    setCloudError("");
    setSelected([]);
    setCloudBackups([]);
    listBackups()
      .then(result => {
        if (!active) return;
        if (result.error) setCloudError(result.error);
        else setCloudBackups(result.backups || []);
      })
      .catch(error => {
        if (active) setCloudError(error.message);
      })
      .finally(() => {
        if (active) setLoadingCloud(false);
      });
    return () => {
      active = false;
    };
  }, [open, screen, user, canManage]);

  const checkAccess = async () => {
    const access = await verifyAscendAccess();
    if (!user || !access.hasAccess || (!access.isSubscribed && !access.isVerified)) {
      throw new Error(t("library.libraryBackups.membershipRequired"));
    }
    if (!settings.ludusavi?.backupLocation) {
      throw new Error(t("library.libraryBackups.locationRequired"));
    }
  };

  const backupLibrary = async () => {
    if (!begin("backup", gameNames.length)) return;
    const next = [];
    try {
      await checkAccess();
      for (const [index, gameName] of gameNames.entries()) {
        setProgress({ current: index + 1, total: gameNames.length, game: gameName });
        try {
          const result = await window.electron.ludusavi("backup", gameName);
          if (!result?.success)
            throw new Error(result?.error || t("library.libraryBackups.backupFailed"));
          if (!Object.keys(result.data?.games || {}).length) {
            next.push({ name: gameName, status: t("library.libraryBackups.noSaves") });
          } else if (uploadToCloud) {
            const uploaded = await uploadBackupToCloud(gameName, settings, user);
            if (!uploaded.success)
              throw new Error(
                t("library.libraryBackups.uploadFailed", { error: uploaded.error })
              );
            next.push({
              name: gameName,
              status: uploaded.skipped
                ? t("library.libraryBackups.alreadyCloud")
                : t("library.libraryBackups.uploaded"),
            });
          } else {
            next.push({ name: gameName, status: t("library.libraryBackups.backedUp") });
          }
        } catch (error) {
          next.push({
            name: gameName,
            status: error.message || t("library.libraryBackups.backupFailed"),
            failed: true,
          });
        }
        setResults([...next]);
      }
      toast.info(
        t("library.libraryBackups.backupFinished", {
          processed: next.filter(item => !item.failed).length,
          total: gameNames.length,
        })
      );
    } catch (error) {
      toast.error(error.message);
    } finally {
      finish();
    }
  };

  const restoreLibrary = async () => {
    if (!restoreConfirmed || !begin("restore", gameNames.length)) return;
    const next = [];
    try {
      await checkAccess();
      for (const [index, gameName] of gameNames.entries()) {
        setProgress({ current: index + 1, total: gameNames.length, game: gameName });
        try {
          const listed = await window.electron.ludusavi("list-backups", gameName);
          if (!listed?.success)
            throw new Error(listed?.error || t("library.libraryBackups.listFailed"));
          const [resolvedName, info] = Object.entries(listed.data?.games || {})[0] || [];
          const latest = [...(info?.backups || [])].sort(
            (a, b) => new Date(b.when).getTime() - new Date(a.when).getTime()
          )[0];
          if (!latest?.name) {
            next.push({
              name: gameName,
              status: t("library.libraryBackups.noLocal"),
              skipped: true,
            });
          } else {
            const restored = await window.electron.ludusavi(
              "restore",
              resolvedName,
              latest.name
            );
            if (!restored?.success || !Object.keys(restored.data?.games || {}).length) {
              throw new Error(restored?.error || t("library.libraryBackups.noRestored"));
            }
            next.push({
              name: gameName,
              status: t("library.libraryBackups.restored"),
              restored: true,
            });
          }
        } catch (error) {
          next.push({
            name: gameName,
            status: error.message || t("library.libraryBackups.restoreFailed"),
            failed: true,
          });
        }
        setResults([...next]);
      }
      const failed = next.filter(item => item.failed).length;
      toast.info(
        t("library.libraryBackups.restoreFinished", {
          restored: next.filter(item => item.restored).length,
          failed,
          skipped: next.filter(item => item.skipped).length,
        })
      );
    } catch (error) {
      toast.error(error.message);
    } finally {
      setRestoreConfirmed(false);
      finish();
    }
  };

  const importBackup = async backup => {
    const gameName = validateBackupFolderName(backup.gameName);
    const location = settings.ludusavi.backupLocation;
    const local = await window.electron.ludusavi("list-backups", gameName);
    if (!local?.success)
      throw new Error(local?.error || t("library.libraryBackups.checkFailed"));
    const info = Object.values(local.data?.games || {})[0];
    const folder = info?.backupPath || `${location}/${gameName}`;
    const link = await getBackupDownloadUrl(backup.backupId);
    if (!link.downloadUrl)
      throw new Error(link.error || t("library.libraryBackups.downloadFailed"));
    const response = await fetch(link.downloadUrl);
    if (!response.ok) throw new Error(t("library.libraryBackups.downloadFailed"));
    const blob = await response.blob();
    if (blob.size > MAX_CLOUD_BACKUP_BYTES)
      throw new Error(t("library.libraryBackups.tooLarge"));
    const JSZip = (await import("jszip")).default;
    const archive = await JSZip.loadAsync(await blob.arrayBuffer());
    const entries = validateCloudBackupEntries(archive);
    if (!entries.some(entry => entry.name === "mapping.yaml")) {
      throw new Error(t("library.libraryBackups.missingMetadata"));
    }
    if (!entries.some(entry => entry.name.toLowerCase().endsWith(".zip"))) {
      throw new Error(t("library.libraryBackups.missingArchive"));
    }
    const existing = new Set(
      (await window.electron.listBackupFiles(folder)).map(name => name.toLowerCase())
    );
    const archives = entries.filter(entry => entry.name.toLowerCase().endsWith(".zip"));
    if (
      archives.every(
        entry =>
          info?.backups?.some(item => item.name === entry.name) &&
          existing.has(entry.name.toLowerCase())
      )
    ) {
      return t("library.libraryBackups.alreadyLocal");
    }
    if (existing.has("mapping.yaml")) {
      throw new Error(t("library.libraryBackups.historyConflict"));
    }
    let imported = false;
    // Publish the mapping last, after every archive has been written successfully.
    for (const entry of [
      ...archives,
      ...entries.filter(entry => entry.name === "mapping.yaml"),
    ]) {
      if (existing.has(entry.name.toLowerCase())) continue;
      const content = await entry.async("uint8array");
      await window.electron.writeFile(`${folder}/${entry.name}`, content);
      imported = true;
    }
    return imported
      ? t("library.libraryBackups.imported")
      : t("library.libraryBackups.alreadyLocal");
  };

  const importSelected = async () => {
    if (!begin("import", selected.length)) return;
    const next = [];
    try {
      await checkAccess();
      const backups = cloudBackups.filter(backup => selected.includes(backup.backupId));
      for (const [index, backup] of backups.entries()) {
        setProgress({ current: index + 1, total: backups.length, game: backup.gameName });
        try {
          next.push({ name: backup.gameName, status: await importBackup(backup) });
        } catch (error) {
          next.push({
            name: backup.gameName,
            status: error.message || t("library.libraryBackups.importFailed"),
            failed: true,
          });
        }
        setResults([...next]);
      }
      toast.info(
        t("library.libraryBackups.importFinished", {
          processed: next.filter(item => !item.failed).length,
          total: backups.length,
        })
      );
    } catch (error) {
      toast.error(error.message);
    } finally {
      finish();
    }
  };

  const selectable = cloudBackups.filter(backup => backup.backupId && backup.gameName);

  const groupedBackups = Object.values(
    selectable.reduce((groups, backup) => {
      const group = groups[backup.gameName] || { name: backup.gameName, backups: [] };
      group.backups.push(backup);
      groups[backup.gameName] = group;
      return groups;
    }, Object.create(null))
  ).sort((a, b) => a.name.localeCompare(b.name));
  for (const group of groupedBackups) {
    group.backups.sort(
      (a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)
    );
  }
  const latestBackupIds = groupedBackups.map(group => group.backups[0].backupId);
  const onlyLatestSelected =
    latestBackupIds.length > 0 &&
    selected.length === latestBackupIds.length &&
    latestBackupIds.every(id => selected.includes(id));

  if (!canManage) {
    return (
      <LocalLibraryBackupsDialog
        open={open}
        onOpenChange={onOpenChange}
        gameNames={gameNames}
        backupLocation={settings.ludusavi?.backupLocation}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[85vh] w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden border-border bg-background p-0 text-foreground sm:max-w-2xl"
        showCloseButton
      >
        <DialogHeader className="shrink-0 border-b border-border px-6 py-5 text-left">
          <DialogTitle className="pr-6 text-lg font-semibold text-foreground">
            {t("library.libraryBackups.title")}
          </DialogTitle>
          <DialogDescription className="pr-6 text-sm leading-relaxed text-muted-foreground">
            {t("library.libraryBackups.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Button
              variant={screen === "backup" ? "default" : "outline"}
              className={`h-auto min-h-10 gap-2 px-3 py-2 ${screen === "backup" ? "text-secondary" : "text-foreground"}`}
              aria-pressed={screen === "backup"}
              disabled={busy}
              onClick={() => {
                setScreen("backup");
                setResults([]);
              }}
            >
              <CloudUpload className="h-4 w-4 shrink-0" aria-hidden="true" />
              {t("library.libraryBackups.backupTab")}
            </Button>
            <Button
              variant={screen === "import" ? "default" : "outline"}
              className={`h-auto min-h-10 gap-2 px-3 py-2 ${screen === "import" ? "text-secondary" : "text-foreground"}`}
              aria-pressed={screen === "import"}
              disabled={busy}
              onClick={() => {
                setScreen("import");
                setResults([]);
              }}
            >
              <CloudDownload className="h-4 w-4 shrink-0" aria-hidden="true" />
              {t("library.libraryBackups.importTab")}
            </Button>
            <Button
              variant={screen === "restore" ? "default" : "outline"}
              className={`h-auto min-h-10 gap-2 px-3 py-2 ${screen === "restore" ? "text-secondary" : "text-foreground"}`}
              aria-pressed={screen === "restore"}
              disabled={busy}
              onClick={() => {
                setScreen("restore");
                setResults([]);
                setRestoreConfirmed(false);
              }}
            >
              <RotateCcw className="h-4 w-4 shrink-0" aria-hidden="true" />
              {t("library.libraryBackups.restoreTab")}
            </Button>
          </div>
          {screen === "backup" ? (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t("library.libraryBackups.backupDescription", {
                  count: gameNames.length,
                })}
              </p>
              <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 p-4 text-sm">
                <span>
                  <span className="block font-medium text-foreground">
                    {t("library.libraryBackups.uploadLabel")}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    {t("library.libraryBackups.uploadDescription")}
                  </span>
                </span>
                <Switch
                  checked={uploadToCloud}
                  onCheckedChange={setUploadToCloud}
                  disabled={busy}
                />
              </label>
            </div>
          ) : screen === "restore" ? (
            <div className="space-y-4 text-sm">
              <p className="text-muted-foreground">
                {t("library.libraryBackups.restoreDescription", {
                  count: gameNames.length,
                })}
              </p>
              <label className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 leading-relaxed text-foreground">
                <Checkbox
                  checked={restoreConfirmed}
                  onCheckedChange={value => setRestoreConfirmed(value === true)}
                  disabled={busy}
                />
                <span>{t("library.libraryBackups.restoreConfirmation")}</span>
              </label>
            </div>
          ) : (
            <div className="min-h-0 space-y-3">
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t("library.libraryBackups.importDescription")}
              </p>
              {loadingCloud ? (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  <Loader className="mr-2 inline h-4 w-4 animate-spin" />
                  {t("library.libraryBackups.loading")}
                </p>
              ) : cloudError ? (
                <p role="alert" className="text-sm text-destructive">
                  {cloudError}
                </p>
              ) : selectable.length === 0 ? (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t("library.libraryBackups.empty")}
                </p>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-foreground"
                    disabled={busy}
                    onClick={() => setSelected(onlyLatestSelected ? [] : latestBackupIds)}
                  >
                    {onlyLatestSelected
                      ? t("library.libraryBackups.clearSelection")
                      : t("library.libraryBackups.selectLatest")}
                  </Button>
                  <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
                    {groupedBackups.map(group => (
                      <details
                        key={group.name}
                        className="group rounded-xl border border-border bg-muted/10"
                        open={groupedBackups.length === 1 ? true : undefined}
                      >
                        <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl p-4 text-foreground transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Gamepad2 className="h-5 w-5" aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">
                              {group.name}
                            </span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {t("library.libraryBackups.groupCount", {
                                count: group.backups.length,
                                selected: group.backups.filter(backup =>
                                  selected.includes(backup.backupId)
                                ).length,
                              })}
                            </span>
                          </span>
                          <ChevronDown
                            className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                            aria-hidden="true"
                          />
                        </summary>
                        <div className="space-y-1 border-t border-border p-2">
                          {group.backups.map((backup, index) => (
                            <label
                              key={backup.backupId}
                              className={`flex cursor-pointer items-center gap-3 rounded-lg p-3 transition-colors ${selected.includes(backup.backupId) ? "bg-primary/10" : "hover:bg-accent/50"} ${busy ? "cursor-not-allowed opacity-60" : ""}`}
                            >
                              <Checkbox
                                checked={selected.includes(backup.backupId)}
                                disabled={busy}
                                onCheckedChange={checked =>
                                  setSelected(current =>
                                    checked
                                      ? [...new Set([...current, backup.backupId])]
                                      : current.filter(id => id !== backup.backupId)
                                  )
                                }
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-foreground">
                                  {backup.backupName}
                                </span>
                                <span className="mt-1 block text-xs text-muted-foreground">
                                  {backup.createdAt
                                    ? new Date(backup.createdAt).toLocaleString(
                                        i18n.resolvedLanguage || i18n.language
                                      )
                                    : ""}
                                </span>
                              </span>
                              {index === 0 && group.backups.length > 1 && (
                                <span className="shrink-0 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                                  {t("library.libraryBackups.latest")}
                                </span>
                              )}
                            </label>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {(progress || results.length > 0) && (
            <div
              className="min-h-0 space-y-2 rounded-xl border border-border bg-muted/20 p-4 text-sm text-foreground"
              aria-live="polite"
            >
              {progress && (
                <p>
                  <Loader className="mr-2 inline h-4 w-4 animate-spin" />
                  {t("library.libraryBackups.progress", progress)}
                </p>
              )}
              <div className="max-h-32 space-y-1 overflow-y-auto">
                {results.map((item, index) => (
                  <p
                    key={index}
                    className={item.failed ? "text-destructive" : "text-muted-foreground"}
                  >
                    {t("library.libraryBackups.result", item)}
                  </p>
                ))}
              </div>
            </div>
          )}
          {!settings.ludusavi?.backupLocation && (
            <p className="text-xs text-destructive">
              {t("library.libraryBackups.locationRequired")}
            </p>
          )}
        </div>
        <DialogFooter className="shrink-0 gap-2 border-t border-border bg-muted/10 px-6 py-4 sm:space-x-0">
          <Button
            variant="outline"
            className="text-foreground"
            onClick={() => onOpenChange(false)}
          >
            {t(`library.libraryBackups.${busy ? "runInBackground" : "close"}`)}
          </Button>
          {screen === "backup" ? (
            <Button
              disabled={busy || !gameNames.length || !settings.ludusavi?.backupLocation}
              className="h-auto min-h-10 text-secondary"
              onClick={backupLibrary}
            >
              {t("library.libraryBackups.backupAction", { count: gameNames.length })}
            </Button>
          ) : screen === "restore" ? (
            <Button
              variant="destructive"
              className="h-auto min-h-10 text-destructive-foreground"
              disabled={
                busy ||
                !restoreConfirmed ||
                !gameNames.length ||
                !settings.ludusavi?.backupLocation
              }
              onClick={restoreLibrary}
            >
              {t("library.libraryBackups.restoreAction")}
            </Button>
          ) : (
            <Button
              disabled={
                busy ||
                loadingCloud ||
                !!cloudError ||
                !selected.length ||
                !settings.ludusavi?.backupLocation
              }
              className="h-auto min-h-10 text-secondary"
              onClick={importSelected}
            >
              {t("library.libraryBackups.importAction", { count: selected.length })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
