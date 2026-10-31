import AscendGameImage from "@/components/AscendGameImage";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import LevelingCard from "@/components/LevelingCard";
import { useLibraryBackupStore } from "@/services/library/libraryBackupStore";
import { StatStrip } from "./primitives";
import {
  Users,
  Loader2,
  CloudUpload,
  CloudDownload,
  MessageCircle,
  UserPlus,
  Clock,
  Gamepad2,
  Trophy,
  HardDrive,
  HardDriveDownload,
  Joystick,
  Smartphone,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

const formatRelativeTime = (date, locale) => {
  const seconds = Math.round((new Date(date).getTime() - Date.now()) / 1000);
  const units = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(0, "minute");
};

const formatBytes = bytes => {
  if (!bytes) return null;
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.max(bytes / 1024 ** 2, 0.1).toFixed(1)} MB`;
};

function ToolCard({ icon: Icon, title, description, meta, onClick, delay, large }) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      onClick={onClick}
      className={`group relative flex flex-col overflow-hidden rounded-2xl bg-card/60 text-left shadow outline-none transition-colors hover:bg-card focus-visible:ring-2 focus-visible:ring-primary ${
        large ? "p-5" : "p-4"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={`flex shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ${
            large ? "h-11 w-11" : "h-9 w-9"
          }`}
        >
          <Icon className={large ? "h-5 w-5" : "h-4 w-4"} />
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
      </div>
      <h3 className={`mt-3 font-semibold ${large ? "text-base" : "text-sm"}`}>{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
      {meta && (
        <div className="mt-auto pt-3 text-xs font-medium text-primary">{meta}</div>
      )}
    </motion.button>
  );
}

export default function HomeSection({
  user,
  t,
  setActiveSection,
  ascendAccess,
  friends,
  incomingRequests,
  conversations,
  localStats,
  loadingLocalStats,
  formatPlaytimeDetailed,
  cloudLibrary,
  loadingCloudLibrary,
  handleSyncLibrary,
  isSyncingLibrary,
  handleRestoreFromCloud,
  isRestoringFromCloud,
  backups,
  loadingBackups,
}) {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const openLibraryBackups = useLibraryBackupStore(state => state.setOpen);
  const hasCloudAccess = ascendAccess?.isSubscribed || ascendAccess?.isVerified;
  const lastSynced = cloudLibrary?.lastSynced;
  const busy = isSyncingLibrary || isRestoringFromCloud;

  const backupBytes = backups.reduce((sum, b) => sum + (b.size || 0), 0);
  const latestBackup = backups.reduce(
    (latest, b) =>
      !latest || new Date(b.createdAt) > new Date(latest.createdAt) ? b : latest,
    null
  );

  const recentGames = [...(cloudLibrary?.games || [])]
    .filter(g => g.lastPlayed)
    .sort((a, b) => new Date(b.lastPlayed) - new Date(a.lastPlayed))
    .slice(0, 6);

  const friendsOnline = friends.filter(
    f => f.status && f.status !== "offline" && f.status !== "invisible"
  ).length;
  const unreadMessages = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  const stats = [
    {
      icon: Gamepad2,
      value: cloudLibrary?.totalGames ?? 0,
      label: t("ascend.overview.stats.games"),
    },
    {
      icon: Clock,
      value: formatPlaytimeDetailed(cloudLibrary?.totalPlaytime || 0),
      label: t("ascend.overview.stats.playtime"),
    },
    {
      icon: Trophy,
      value: `${cloudLibrary?.unlockedAchievements ?? 0}`,
      suffix: cloudLibrary?.totalAchievements
        ? `/ ${cloudLibrary.totalAchievements}`
        : null,
      label: t("ascend.overview.stats.achievements"),
    },
    {
      icon: HardDrive,
      value: hasCloudAccess && loadingBackups ? "—" : backups.length,
      label: t("ascend.overview.stats.saves"),
    },
  ];

  return (
    <div className="mb-24 space-y-8">
      {/* Cloud status hero */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-card/60 p-6 shadow sm:p-8"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"
        />

        <div className="relative">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            {loadingCloudLibrary ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : lastSynced ? (
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                {t("ascend.overview.statusSynced", {
                  time: formatRelativeTime(lastSynced, i18n.language),
                })}
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                {t("ascend.overview.statusNever")}
              </span>
            )}
          </div>

          <div className="mt-3 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-xl">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {lastSynced
                  ? t("ascend.overview.headlineSynced")
                  : t("ascend.overview.headlineNever")}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
                {lastSynced
                  ? t("ascend.overview.descSynced")
                  : t("ascend.overview.descNever")}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                onClick={handleSyncLibrary}
                disabled={busy}
                size="lg"
                className="gap-2 text-secondary"
              >
                {isSyncingLibrary ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CloudUpload className="h-4 w-4" />
                )}
                {isSyncingLibrary
                  ? t("ascend.cloudLibrary.syncing")
                  : t("ascend.overview.syncNow")}
              </Button>
              {lastSynced && (
                <Button
                  onClick={handleRestoreFromCloud}
                  disabled={busy}
                  size="lg"
                  variant="outline"
                  className="gap-2"
                  title={t("ascend.cloudLibrary.restoreTooltip")}
                >
                  {isRestoringFromCloud ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CloudDownload className="h-4 w-4" />
                  )}
                  {isRestoringFromCloud
                    ? t("ascend.cloudLibrary.restoring")
                    : t("ascend.overview.restore")}
                </Button>
              )}
            </div>
          </div>

          <StatStrip stats={stats} className="mt-8" />
        </div>
      </motion.section>

      {/* Cloud tools */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {t("ascend.overview.toolsTitle")}
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <ToolCard
            large
            delay={0.05}
            icon={Gamepad2}
            title={t("ascend.overview.library.title")}
            description={t("ascend.overview.library.description")}
            meta={t("ascend.overview.library.count", {
              count: cloudLibrary?.totalGames ?? 0,
            })}
            onClick={() => setActiveSection("cloudlibrary")}
          />
          <ToolCard
            large
            delay={0.1}
            icon={HardDrive}
            title={t("ascend.overview.saves.title")}
            description={t("ascend.overview.saves.description")}
            meta={
              backups.length > 0
                ? [
                    t("ascend.overview.saves.count", { count: backups.length }),
                    formatBytes(backupBytes),
                    latestBackup &&
                      t("ascend.overview.saves.latest", { game: latestBackup.gameName }),
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : t("ascend.overview.saves.empty")
            }
            onClick={() => setActiveSection("cloudbackups")}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <ToolCard
            delay={0.15}
            icon={Joystick}
            title={t("ascend.overview.retro.title")}
            description={t("ascend.overview.retro.description")}
            onClick={() => navigate("/retro")}
          />
          <ToolCard
            delay={0.2}
            icon={HardDriveDownload}
            title={t("ascend.overview.libraryBackups.title")}
            description={t("ascend.overview.libraryBackups.description")}
            onClick={() => {
              openLibraryBackups(true);
              navigate("/library");
            }}
          />
          <ToolCard
            delay={0.25}
            icon={Smartphone}
            title={t("ascend.overview.companion.title")}
            description={t("ascend.overview.companion.description")}
            onClick={() => setActiveSection("companion")}
          />
        </div>
      </section>

      {/* Recently played from the cloud library */}
      {recentGames.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {t("ascend.overview.recentTitle")}
            </h2>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => setActiveSection("cloudlibrary")}
            >
              {t("ascend.overview.viewAll")}
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {recentGames.map((game, index) => (
              <motion.div
                key={game.name}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + index * 0.04 }}
                className="flex items-center gap-3 rounded-xl bg-card/60 p-2.5 shadow"
              >
                <div className="h-12 w-24 shrink-0 overflow-hidden rounded-lg bg-muted">
                  <AscendGameImage name={game.name || game.game} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{game.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatPlaytimeDetailed(game.playTime || 0)} ·{" "}
                    {formatRelativeTime(game.lastPlayed, i18n.language)}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Secondary: progress and community */}
      <section className="grid gap-3 lg:grid-cols-5">
        <div className="lg:col-span-3">
          {loadingLocalStats ? (
            <div className="flex h-full min-h-32 items-center justify-center rounded-xl bg-card/60 shadow">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <LevelingCard
              level={localStats.level}
              currentXP={localStats.currentXP}
              nextLevelXp={localStats.nextLevelXp}
              totalXP={localStats.xp}
            />
          )}
        </div>
        <div className="rounded-xl bg-card/60 p-4 shadow lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              {t("ascend.overview.communityTitle")}
            </h2>
            <span className="text-xs text-muted-foreground">{user.displayName}</span>
          </div>
          <div className="space-y-1">
            {[
              {
                id: "friends",
                icon: Users,
                label: t("ascend.nav.friends"),
                value: t("ascend.overview.friendsOnline", { count: friendsOnline }),
              },
              {
                id: "friendRequests",
                section: "friends",
                icon: UserPlus,
                label: t("ascend.nav.requests"),
                value: incomingRequests.length,
                highlight: incomingRequests.length > 0,
              },
              {
                id: "messages",
                icon: MessageCircle,
                label: t("ascend.overview.unread"),
                value: unreadMessages,
                highlight: unreadMessages > 0,
              },
            ].map(row => (
              <button
                key={row.id}
                onClick={() => setActiveSection(row.section ?? row.id)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-primary"
              >
                <row.icon className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1">{row.label}</span>
                <span
                  className={`text-xs font-medium tabular-nums ${
                    row.highlight ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {row.value}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
