import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLanguage } from "@/context/LanguageContext";
import { formatLatestUpdate, formatCompactNumber } from "@/lib/utils";
import { steamBuildStatus } from "@/lib/steamBuild";
import hltbService from "@/services/integrations/hltbService";
import { formatBytes } from "@/services/app/systemHealthService";
import { isImageReady, markImageReady } from "@/services/games/gamePagePreparer";
import { useState } from "react";
import {
  Apple,
  BookOpen,
  CircleCheck,
  CircleSlash,
  Clock,
  Database,
  ExternalLink,
  Eye,
  Globe,
  History,
  Package,
  ShieldCheck,
  Star,
  Wifi,
} from "lucide-react";

// Shown at once when the image is already loaded (usually preloaded before the
// page opened); otherwise it fades in a single time. Remounts never replay it.
function BannerImage({ src }) {
  const [shown, setShown] = useState(() => isImageReady(src));
  const [fades] = useState(() => !isImageReady(src));
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      onLoad={() => {
        markImageReady(src);
        setShown(true);
      }}
      className={`h-full w-full object-cover ${fades ? "transition-opacity duration-300" : ""} ${shown ? "opacity-100" : "opacity-0"}`}
    />
  );
}

function Chip({ className, tooltip, children, onClick, ...props }) {
  const Element = onClick ? "button" : "span";
  const chip = (
    <Element
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${onClick ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" : tooltip ? "cursor-help" : ""} ${className}`}
      {...props}
    >
      {children}
    </Element>
  );
  if (!tooltip) return chip;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{chip}</TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="max-w-[300px] text-secondary">{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

// Plain inline stat (rating, views, source) without a pill around it
function Meta({ className = "", tooltip, children, onClick }) {
  const Element = onClick ? "button" : "span";
  const item = (
    <Element
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`group inline-flex items-center gap-1.5 ${onClick ? "cursor-pointer rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" : tooltip ? "cursor-help" : ""} ${className}`}
    >
      {children}
    </Element>
  );
  if (!tooltip) return item;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{item}</TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="max-w-[300px] text-secondary">{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

// Small outlined label for what a release includes or requires
function Tag({ className = "", ...props }) {
  return (
    <Chip
      className={`gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/80 [&_svg]:text-primary ${className}`}
      {...props}
    />
  );
}

// Puts a faint dot between each item
function interleave(items) {
  return items.flatMap((item, i) =>
    i === 0
      ? [item]
      : [
          <span key={`sep-${i}`} aria-hidden="true" className="text-muted-foreground/40">
            •
          </span>,
          item,
        ]
  );
}

function Stat({ label, children }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 flex items-center gap-1.5 truncate text-sm font-semibold text-foreground">
        {children}
      </dd>
    </div>
  );
}

export default function DownloadHero({
  gameData,
  bannerImage,
  coverImage,
  coverFallback,
  artworkLoading,
  isVerified,
  onShowVerified,
  gameRating,
  viewCount,
  hasWrittenReviews,
  onReadReviews,
  steamRating,
  releaseDate,
  hltbData,
  showTimemachine,
  onOpenTimemachine,
  source,
}) {
  const { t } = useLanguage();
  const isVr = gameData.category?.includes("Virtual Reality");
  const buildStatus = steamBuildStatus(gameData);
  const hasTags =
    gameData.online || gameData.storyOnly || gameData.dlc || gameData.emulator || isVr;
  const buildNote =
    buildStatus === "latest"
      ? t("download.steamBuild.latestTooltip", { build: gameData.sourceBuildId })
      : buildStatus === "behind"
        ? t("download.steamBuild.behindTooltip", {
            build: gameData.sourceBuildId,
            latest: gameData.latestBuildId,
          })
        : null;
  const timemachineNote = showTimemachine ? t("download.timemachine.openTooltip") : null;
  const buildTooltip =
    buildNote && timemachineNote ? (
      <>
        {buildNote}
        <br />
        {timemachineNote}
      </>
    ) : (
      buildNote || timemachineNote
    );

  return (
    <TooltipProvider>
      <section className="relative overflow-hidden rounded-xl bg-card shadow">
        {/* Banner */}
        <div className="relative h-52 w-full overflow-hidden">
          {bannerImage && <BannerImage key={bannerImage} src={bannerImage} />}
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/60 to-transparent" />
        </div>

        {/* Identity */}
        <div
          className={`relative flex items-end gap-5 px-6 pb-5 ${coverImage || artworkLoading ? "-mt-24" : "-mt-10"}`}
        >
          {artworkLoading && !coverImage && (
            <div className="h-44 w-[7.5rem] shrink-0 animate-pulse rounded-lg bg-muted shadow-lg ring-1 ring-white/10" />
          )}
          {coverImage && (
            <img
              src={coverImage}
              alt={gameData.game}
              className="h-44 w-[7.5rem] shrink-0 rounded-lg object-cover shadow-lg ring-1 ring-white/10"
              onError={e => {
                if (coverFallback && e.currentTarget.src !== coverFallback) {
                  e.currentTarget.src = coverFallback;
                }
              }}
            />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2.5 text-3xl font-bold leading-tight text-foreground">
              <span className="truncate">{gameData.game}</span>
              {isVerified && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={onShowVerified}
                      className="flex shrink-0 items-center justify-center rounded-full bg-primary/20 p-1 transition-colors hover:bg-primary/30"
                    >
                      <ShieldCheck className="h-4 w-4 text-primary" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-secondary">
                      {t("gameCard.verified.dialogDescription")}
                    </p>
                  </TooltipContent>
                </Tooltip>
              )}
            </h1>

            {/* Version, community stats and source */}
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
              {gameData.version && (
                <Chip
                  className={`bg-primary/15 text-primary ${showTimemachine ? "transition-colors hover:bg-primary/25" : ""}`}
                  tooltip={buildTooltip}
                  onClick={showTimemachine ? onOpenTimemachine : undefined}
                >
                  <span className="tabular-nums">{gameData.version}</span>
                  {showTimemachine && <History className="h-3.5 w-3.5" />}
                  {buildStatus === "latest" && (
                    <span className="ml-1 flex items-center gap-1 border-l border-primary/30 pl-2 font-semibold">
                      <CircleCheck className="h-3 w-3" />
                      {t("download.steamBuild.latest")}
                    </span>
                  )}
                  {buildStatus === "behind" && (
                    <span className="ml-1 border-l border-primary/30 pl-2 text-primary/70">
                      {t("download.steamBuild.behind")}
                    </span>
                  )}
                </Chip>
              )}
              {interleave(
                [
                  gameRating > 0 && (
                    <Meta
                      key="rating"
                      tooltip={t("download.ratingTooltip", { rating: gameRating })}
                      onClick={hasWrittenReviews ? onReadReviews : undefined}
                    >
                      <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                      <span className="font-semibold text-foreground">{gameRating}</span>
                      {hasWrittenReviews && (
                        <span className="underline-offset-2 group-hover:underline">
                          {t("download.readReviews")}
                        </span>
                      )}
                    </Meta>
                  ),
                  steamRating && (
                    <Meta
                      key="steam"
                      tooltip={t("download.steamRating", { rating: steamRating })}
                    >
                      <Apple className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-semibold text-foreground">{steamRating}</span>
                    </Meta>
                  ),
                  viewCount > 0 && (
                    <Meta key="views" tooltip={t("gameCard.viewsTooltip")}>
                      <Eye className="h-3.5 w-3.5" />
                      <span className="tabular-nums">
                        {t("gameCard.views", { views: formatCompactNumber(viewCount) })}
                      </span>
                    </Meta>
                  ),
                  source && (
                    <Meta
                      key="source"
                      className="max-w-[16rem]"
                      tooltip={
                        source.official
                          ? t("gameCard.officialTooltip")
                          : t("gameCard.sourceTooltip", { source: source.name })
                      }
                    >
                      {source.official ? (
                        <Database className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <Globe className="h-3.5 w-3.5 shrink-0" />
                      )}
                      <span className="truncate">
                        {source.official ? t("gameCard.official") : source.name}
                      </span>
                    </Meta>
                  ),
                ].filter(Boolean)
              )}
            </div>

            {/* What the release includes or needs */}
            {hasTags && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {gameData.online && (
                  <Tag tooltip={t("download.onlineTooltip")}>
                    <Wifi className="h-3 w-3" />
                    {t("download.online")}
                  </Tag>
                )}
                {gameData.storyOnly && (
                  <Tag tooltip={t("download.storyOnlyTooltip")}>
                    <BookOpen className="h-3 w-3" />
                    {t("download.storyOnly")}
                  </Tag>
                )}
                {gameData.dlc && (
                  <Tag tooltip={t("download.allDlcTooltip")}>
                    <Package className="h-3 w-3" />
                    {t("download.allDlc")}
                  </Tag>
                )}
                {isVr && (
                  <Tag>
                    <svg
                      className="h-3 w-3"
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
                    {t("download.gameNeedsVR")}
                  </Tag>
                )}
                {gameData.emulator && (
                  <Tag
                    className="transition-colors hover:bg-muted hover:text-foreground"
                    onClick={() =>
                      window.electron.openURL(
                        "https://ascendara.app/docs/troubleshooting/emulators"
                      )
                    }
                  >
                    <CircleSlash className="h-3 w-3" />
                    {t("download.gameNeedsEmulator")}
                    <span className="text-primary underline underline-offset-2">
                      {t("common.learnMore")}
                    </span>
                    <ExternalLink className="h-3 w-3" />
                  </Tag>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Key facts */}
        <dl className="grid grid-cols-2 divide-x divide-border/40 border-t border-border/40 bg-background/30 md:grid-cols-4">
          {gameData.size && <Stat label={t("download.gameSize")}>{gameData.size}</Stat>}
          {gameData.installSize > 0 && (
            <Stat label={t("download.installSize")}>
              {formatBytes(gameData.installSize)}
            </Stat>
          )}
          <Stat label={t("download.latestUpdate")}>
            {formatLatestUpdate(gameData.latest_update)}
          </Stat>
          {releaseDate && (
            <Stat label={t("download.firstReleasedOn")}>{releaseDate}</Stat>
          )}
        </dl>

        {/* HowLongToBeat completion times */}
        {hltbData && (
          <dl className="grid grid-cols-2 divide-x divide-border/40 border-t border-border/40 bg-background/30 md:grid-cols-4">
            <Stat label={t("download.timeToBeat")}>
              <button
                type="button"
                onClick={() => window.electron.openURL(hltbData.url)}
                className="flex items-center gap-1.5 truncate hover:text-primary"
              >
                <Clock className="h-3.5 w-3.5 shrink-0" />
                HowLongToBeat
                <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
              </button>
            </Stat>
            {[
              ["download.mainStory", hltbData.main],
              ["download.mainPlusExtras", hltbData.plus],
              ["download.completionist", hltbData.full],
            ].map(([label, seconds]) => {
              const hours = hltbService.formatHours(seconds);
              return (
                <Stat key={label} label={t(label)}>
                  {hours ? `${hours} ${t("download.hours")}` : "--"}
                </Stat>
              );
            })}
          </dl>
        )}
      </section>
    </TooltipProvider>
  );
}
