import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import { retroBackupPlatform } from "@/services/retroService";
import SectionHeader from "./SectionHeader";
import { EmptyState, Panel, StatStrip } from "./primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  Cloud,
  Gamepad2,
  RefreshCw,
  Trash2,
  Crown,
  CloudOff,
  Search,
  RotateCcw,
  Download,
  ChevronDown,
  HardDrive,
  Clock,
  Joystick,
  MonitorCheck,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const formatSize = bytes => {
  if (!bytes) return null;
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.max(bytes / 1024 ** 2, 0.1).toFixed(1)} MB`;
};

function BackupActions({
  t,
  backup,
  restoringBackup,
  deletingBackup,
  handleRestoreBackup,
  handleDownloadBackup,
  handleDeleteBackup,
  primary,
}) {
  const busy = restoringBackup === backup.backupId || deletingBackup === backup.backupId;
  const isRetro = !!retroBackupPlatform(backup.gameName);
  const date = new Date(backup.createdAt).toLocaleString();

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            size="sm"
            variant={primary ? "default" : "outline"}
            disabled={busy || !!restoringBackup}
            className={`gap-1.5 ${primary ? "text-secondary" : ""}`}
          >
            {restoringBackup === backup.backupId ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            {t("ascend.cloudBackups.restore")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("ascend.cloudBackups.restoreTitle", { game: backup.gameName })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("ascend.cloudBackups.restoreDesc", { date })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="text-secondary"
              onClick={() => handleRestoreBackup(backup)}
            >
              {t("ascend.cloudBackups.restoreConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {!isRetro && (
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          title={t("ascend.cloudBackups.download")}
          aria-label={t("ascend.cloudBackups.download")}
          disabled={busy}
          onClick={() => handleDownloadBackup(backup.backupId, backup.backupName)}
        >
          <Download className="h-4 w-4" />
        </Button>
      )}

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-muted-foreground hover:text-red-500"
            title={t("common.delete")}
            aria-label={t("common.delete")}
            disabled={busy}
          >
            {deletingBackup === backup.backupId ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("ascend.cloudBackups.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("ascend.cloudBackups.deleteDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <Button variant="destructive" onClick={() => handleDeleteBackup(backup.backupId)}>
              {t("common.delete")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BackupMeta({ backup, t }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
      <span>{new Date(backup.createdAt).toLocaleString()}</span>
      {formatSize(backup.size) && (
        <>
          <span aria-hidden="true">·</span>
          <span>{formatSize(backup.size)}</span>
        </>
      )}
      {backup.existsLocally && (
        <>
          <span aria-hidden="true">·</span>
          <span className="flex items-center gap-1 text-primary">
            <MonitorCheck className="h-3 w-3" />
            {t("ascend.cloudBackups.onThisPC")}
          </span>
        </>
      )}
    </span>
  );
}

function GameBackupCard({ gameName, gameBackups, image, index, ...actionProps }) {
  const { t } = actionProps;
  const [showOlder, setShowOlder] = useState(false);
  const [latest, ...older] = gameBackups;
  const isRetro = !!retroBackupPlatform(gameName);
  const FallbackIcon = isRetro ? Joystick : Gamepad2;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.03 }}
    >
      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-4 p-4">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-muted">
            {image ? (
              <img src={image} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <FallbackIcon className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate font-semibold">{gameName}</h3>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {t("ascend.cloudBackups.versions", { count: gameBackups.length })}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs font-medium text-foreground/80">
                {t("ascend.cloudBackups.latest")}
              </span>
              <BackupMeta backup={latest} t={t} />
            </div>
          </div>
          <BackupActions backup={latest} primary {...actionProps} />
        </div>

        {older.length > 0 && (
          <div className="border-t border-border/50">
            <button
              onClick={() => setShowOlder(open => !open)}
              aria-expanded={showOlder}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:bg-muted/40"
            >
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${showOlder ? "rotate-180" : ""}`}
              />
              {showOlder
                ? t("ascend.cloudBackups.hideOlder")
                : t("ascend.cloudBackups.showOlder", { count: older.length })}
            </button>
            <AnimatePresence initial={false}>
              {showOlder && (
                <motion.ul
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  {older.map(backup => (
                    <li
                      key={backup.backupId}
                      className="flex flex-wrap items-center gap-3 border-t border-border/30 py-2.5 pl-[5.5rem] pr-4"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{backup.backupName}</p>
                        <BackupMeta backup={backup} t={t} />
                      </div>
                      <BackupActions backup={backup} {...actionProps} />
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        )}
      </Panel>
    </motion.div>
  );
}

export default function CloudBackupsSection({
  t,
  ascendAccess,
  setActiveSection,
  loadBackups,
  backupFilterGame,
  loadingBackups,
  setBackupFilterGame,
  backups,
  deletingBackup,
  handleDeleteBackup,
  restoringBackup,
  handleRestoreBackup,
  handleDownloadBackup,
  cloudLibraryImages,
}) {
  const { i18n } = useTranslation();
  const hasAccess = ascendAccess.isSubscribed || ascendAccess.isVerified;

  // Newest backup first within each game, games ordered by their newest backup
  const groups = useMemo(() => {
    const byGame = {};
    for (const backup of backups) (byGame[backup.gameName] ||= []).push(backup);
    return Object.entries(byGame)
      .map(([gameName, list]) => [
        gameName,
        [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
      ])
      .sort((a, b) => new Date(b[1][0].createdAt) - new Date(a[1][0].createdAt));
  }, [backups]);

  const query = backupFilterGame.trim().toLowerCase();
  const visibleGroups = query
    ? groups.filter(([gameName]) => gameName.toLowerCase().includes(query))
    : groups;

  const totalBytes = backups.reduce((sum, b) => sum + (b.size || 0), 0);
  const lastBackup = groups[0]?.[1][0];

  const actionProps = {
    t,
    restoringBackup,
    deletingBackup,
    handleRestoreBackup,
    handleDownloadBackup,
    handleDeleteBackup,
  };

  return (
    <div className="mb-24 space-y-6">
      <SectionHeader
        icon={Cloud}
        title={t("ascend.cloudBackups.title")}
        description={t("ascend.cloudBackups.subtitle")}
        actions={
          hasAccess && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => loadBackups()}
              disabled={loadingBackups}
              aria-label={t("ascend.upcoming.refresh")}
              title={t("ascend.upcoming.refresh")}
            >
              {loadingBackups ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          )
        }
      />

      {!hasAccess ? (
        <EmptyState
          icon={Crown}
          title={t("ascend.cloudBackups.subscriptionRequired")}
          description={t("ascend.cloudBackups.subscriptionRequiredDesc")}
          action={
            <Button onClick={() => setActiveSection("premium")} className="gap-2 text-secondary">
              <Crown className="h-4 w-4" />
              {t("ascend.cloudBackups.viewPlans")}
            </Button>
          }
        />
      ) : loadingBackups && backups.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : backups.length === 0 ? (
        <EmptyState
          icon={CloudOff}
          title={t("ascend.cloudBackups.noBackups")}
          description={t("ascend.cloudBackups.subtitle")}
        />
      ) : (
        <>
          <StatStrip
            stats={[
              { icon: Gamepad2, label: t("ascend.cloudBackups.stats.games"), value: groups.length },
              { icon: Cloud, label: t("ascend.cloudBackups.stats.backups"), value: backups.length },
              {
                icon: HardDrive,
                label: t("ascend.cloudBackups.stats.storage"),
                value: formatSize(totalBytes) || "—",
              },
              {
                icon: Clock,
                label: t("ascend.cloudBackups.stats.lastBackup"),
                value: lastBackup
                  ? new Date(lastBackup.createdAt).toLocaleDateString(i18n.language, {
                      month: "short",
                      day: "numeric",
                    })
                  : "—",
              },
            ]}
          />

          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("ascend.cloudBackups.filterByGame")}
              value={backupFilterGame}
              onChange={e => setBackupFilterGame(e.target.value)}
              className="h-11 rounded-xl border-border/50 bg-card/60 pl-10"
            />
          </div>

          {visibleGroups.length === 0 ? (
            <EmptyState icon={Search} title={t("ascend.cloudBackups.noBackups")} />
          ) : (
            <div className="space-y-3">
              {visibleGroups.map(([gameName, gameBackups], index) => (
                <GameBackupCard
                  key={gameName}
                  gameName={gameName}
                  gameBackups={gameBackups}
                  image={cloudLibraryImages?.[gameName]}
                  index={index}
                  {...actionProps}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
