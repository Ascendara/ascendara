import { AnimatePresence, motion } from "framer-motion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";
import gameService from "@/services/games/gameService";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  BookOpen,
  Cloud,
  CloudOff,
  Download,
  Globe,
  Loader,
  Puzzle,
  ShieldCheck,
  Tag,
} from "lucide-react";

const CHIP_TONES = {
  primary: "bg-primary/10 text-primary ring-primary/20",
  green: "bg-green-500/10 text-green-500 ring-green-500/25",
  amber: "bg-amber-500/10 text-amber-500 ring-amber-500/25",
  blue: "bg-blue-500/10 text-blue-500 ring-blue-500/25",
  purple: "bg-purple-500/10 text-purple-400 ring-purple-500/25",
};

function WithTooltip({ tooltip, children }) {
  if (!tooltip) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="max-w-[300px] text-secondary">{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function Chip({ tone = "primary", tooltip, icon: Icon, children }) {
  return (
    <WithTooltip tooltip={tooltip}>
      <span
        className={cn(
          "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset",
          CHIP_TONES[tone],
          tooltip && "cursor-help"
        )}
      >
        {Icon && <Icon className="h-3 w-3 shrink-0" />}
        {children}
      </span>
    </WithTooltip>
  );
}

function VersionChip({ version, updateInfo, onShowUpdate, t }) {
  const hasUpdate = updateInfo?.updateAvailable;
  return (
    <span className="inline-flex h-6 items-center overflow-hidden rounded-full text-[11px] font-medium ring-1 ring-inset ring-primary/20">
      <span className="flex h-full items-center gap-1 bg-primary/10 px-2.5 tabular-nums text-primary">
        <Tag className="h-3 w-3 shrink-0" />
        {version}
      </span>
      {hasUpdate && (
        <button
          type="button"
          onClick={onShowUpdate}
          className="flex h-full items-center gap-1 bg-primary px-2.5 text-secondary transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <Download className="h-3 w-3 shrink-0" />
          {t("gameScreen.updateBadge")}
          {updateInfo.latestVersion && (
            <span className="tabular-nums opacity-80">{updateInfo.latestVersion}</span>
          )}
        </button>
      )}
    </span>
  );
}

function StatusItem({ tooltip, icon: Icon, className, children }) {
  return (
    <WithTooltip tooltip={tooltip}>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground",
          tooltip && "cursor-help",
          className
        )}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        {children}
      </span>
    </WithTooltip>
  );
}

function VrIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M2 10C2 8.89543 2.89543 8 4 8H20C21.1046 8 22 8.89543 22 10V17C22 18.1046 21.1046 19 20 19H16.1324C15.4299 19 14.7788 18.6314 14.4174 18.029L12.8575 15.4292C12.4691 14.7818 11.5309 14.7818 11.1425 15.4292L9.58261 18.029C9.22116 18.6314 8.57014 19 7.86762 19H4C2.89543 19 2 18.1046 2 17V10Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Stat({ label, className, children }) {
  return (
    <div className={cn("min-w-0 px-4 py-3", className)}>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 flex min-w-0 items-center gap-1.5 text-sm font-semibold text-foreground">
        {children}
      </dd>
    </div>
  );
}

/** Banner, identity, primary actions and key facts for an installed game. */
export default function GameHero({
  game,
  bannerImage,
  bannerIsCover,
  coverImage,
  logoImage,
  showLogo,
  onToggleLogo,
  updateInfo,
  onShowUpdate,
  playtime,
  playtimeJustUpdated,
  executableExists,
  isUninstalling,
  isAuthenticated,
  cloudLibraryLoading,
  isInCloudLibrary,
  canSwitchToManaged,
  onSwitchToManaged,
  children,
}) {
  const { t } = useLanguage();
  const hasVersion = game.version && game.version !== "-1";
  const executableName = game.executable?.split(/[\\/]/).pop();

  // Installed game files predate the storyOnly flag, so read it from the index
  const [indexStoryOnly, setIndexStoryOnly] = useState(false);
  useEffect(() => {
    setIndexStoryOnly(false);
    if (game.storyOnly !== undefined || !game.gameID || game.isCustom) return;
    let cancelled = false;
    gameService
      .findGameByGameID(game.gameID)
      .then(match => {
        if (!cancelled) setIndexStoryOnly(!!match?.storyOnly);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [game.gameID, game.storyOnly, game.isCustom]);
  const storyOnly = game.storyOnly ?? indexStoryOnly;

  return (
    <TooltipProvider>
      <section className="relative rounded-xl border border-border/40 bg-card">
        {/* Banner */}
        <div className="relative h-56 w-full overflow-hidden rounded-t-xl">
          {bannerImage && (
            <img
              src={bannerImage}
              alt=""
              aria-hidden="true"
              className={cn(
                "h-full w-full object-cover",
                bannerIsCover && "scale-125 blur-xl brightness-75"
              )}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/60 to-transparent" />
        </div>

        {/* Identity */}
        <div
          className={cn(
            "relative flex items-end gap-5 px-6",
            coverImage ? "-mt-28" : "-mt-12"
          )}
        >
          {coverImage && (
            <div className="relative h-48 w-32 shrink-0 overflow-hidden rounded-lg bg-muted/30 shadow-lg ring-1 ring-white/10">
              <img
                src={coverImage}
                alt={game.game}
                className="h-full w-full object-cover"
              />
              {isUninstalling && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 px-3">
                  <Progress value={undefined} className="bg-muted/30" />
                  <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
                    <Loader className="h-3.5 w-3.5 animate-spin" />
                    {t("library.deleting")}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="min-w-0 flex-1 pb-1">
            {showLogo && logoImage ? (
              <button
                onClick={onToggleLogo}
                className="block cursor-pointer transition-opacity hover:opacity-80"
                title={t("gameScreen.clickToToggleLogo")}
              >
                <img
                  src={logoImage}
                  alt={game.game}
                  className="max-h-20 max-w-md object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.65)]"
                />
              </button>
            ) : (
              <button
                onClick={logoImage ? onToggleLogo : undefined}
                className={cn(
                  "block max-w-full text-left",
                  logoImage
                    ? "cursor-pointer transition-opacity hover:opacity-80"
                    : "cursor-default"
                )}
                title={logoImage ? t("gameScreen.clickToToggleLogo") : undefined}
                disabled={!logoImage}
              >
                <h1 className="truncate text-3xl font-bold leading-tight text-foreground drop-shadow-md">
                  {game.game}
                </h1>
              </button>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {hasVersion && (
                  <VersionChip
                    version={game.version}
                    updateInfo={updateInfo}
                    onShowUpdate={onShowUpdate}
                    t={t}
                  />
                )}
                {game.online && (
                  <Chip tone="green" icon={Globe} tooltip={t("download.onlineTooltip")}>
                    {t("download.online")}
                  </Chip>
                )}
                {storyOnly && (
                  <Chip
                    tone="amber"
                    icon={BookOpen}
                    tooltip={t("download.storyOnlyTooltip")}
                  >
                    {t("download.storyOnly")}
                  </Chip>
                )}
                {game.dlc && (
                  <Chip tone="blue" icon={Puzzle} tooltip={t("download.allDlcTooltip")}>
                    {t("download.allDlc")}
                  </Chip>
                )}
                {game.isVr && (
                  <Chip tone="purple" icon={VrIcon} tooltip={t("download.gameNeedsVR")}>
                    VR
                  </Chip>
                )}
              </div>

              {(!game.isCustom || isAuthenticated) && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {(hasVersion || game.online || storyOnly || game.dlc || game.isVr) && (
                    <span aria-hidden="true" className="h-4 w-px bg-border" />
                  )}
                  {!game.isCustom && (
                    <StatusItem
                      icon={ShieldCheck}
                      tooltip={t("library.launcherImport.managedBadgeTooltip")}
                    >
                      {t("library.launcherImport.managedBadge")}
                    </StatusItem>
                  )}
                  {isAuthenticated && (
                    <StatusItem
                      icon={
                        cloudLibraryLoading ? Loader : isInCloudLibrary ? Cloud : CloudOff
                      }
                      className={cn(
                        isInCloudLibrary && "text-primary",
                        cloudLibraryLoading && "[&>svg]:animate-spin"
                      )}
                    >
                      {isInCloudLibrary
                        ? t("gameScreen.inCloudLibrary")
                        : t("gameScreen.notInCloudLibrary")}
                    </StatusItem>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 px-6 py-5">{children}</div>

        {/* Key facts */}
        <dl className="grid grid-cols-2 divide-x divide-border/40 overflow-hidden rounded-b-xl border-t border-border/40 bg-background/30 md:auto-cols-fr md:grid-flow-col md:grid-cols-none">
          <Stat label={t("library.playTime")}>
            <AnimatePresence mode="wait">
              <motion.span
                key={game.playTime}
                initial={{ opacity: 0, y: -6, scale: 0.9 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  color: playtimeJustUpdated ? "var(--primary)" : "currentColor",
                }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="truncate"
              >
                {playtime}
              </motion.span>
            </AnimatePresence>
          </Stat>
          {hasVersion && (
            <Stat label={t("library.version")}>
              <span className="truncate">{game.version}</span>
            </Stat>
          )}
          {game.size && (
            <Stat label={t("library.size")}>
              <span className="truncate">{game.size}</span>
            </Stat>
          )}
          {executableName && (
            <Stat label={t("library.executable")}>
              <span className="truncate" title={game.executable}>
                {executableName}
              </span>
              {!executableExists && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-secondary">{t("library.executableNotFound")}</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </Stat>
          )}
          {game.launcher && (
            <Stat label={t("library.launcherImport.notManagedBadge")}>
              <Tooltip>
                <TooltipTrigger asChild>
                  {canSwitchToManaged ? (
                    <button
                      type="button"
                      onClick={onSwitchToManaged}
                      className="flex min-w-0 items-center gap-1 text-primary hover:underline"
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        {t("library.launcherImport.switchAction")}
                      </span>
                    </button>
                  ) : (
                    <span className="cursor-help truncate text-yellow-500">
                      {t(`library.launcherImport.launchers.${game.launcher}`)}
                    </span>
                  )}
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs text-secondary">
                    {t("library.launcherImport.noUpdateTrackingHint")}
                  </p>
                </TooltipContent>
              </Tooltip>
            </Stat>
          )}
        </dl>
      </section>
    </TooltipProvider>
  );
}
