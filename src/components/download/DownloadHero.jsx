import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLanguage } from "@/context/LanguageContext";
import { formatLatestUpdate } from "@/lib/utils";
import {
  Apple,
  CircleSlash,
  ExternalLink,
  FileQuestion,
  History,
  ShieldCheck,
  Star,
} from "lucide-react";

// Compressed downloads expand on extraction; estimate the space needed while
// installing from the listed game size.
const estimateInstallSize = size => {
  const match = size
    ?.trim()
    .toLowerCase()
    .match(/^([\d.]+)\s*(gb|mb)$/);
  if (!match) return null;
  const estimate = parseFloat(match[1]) * 2.1;
  return match[2] === "gb" ? `~${estimate.toFixed(1)} GB` : `~${Math.round(estimate)} MB`;
};

function Chip({ className, tooltip, children, ...props }) {
  const chip = (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${tooltip ? "cursor-help" : ""} ${className}`}
      {...props}
    >
      {children}
    </span>
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
  isVerified,
  onShowVerified,
  gameRating,
  steamRating,
  releaseDate,
  showTimemachine,
  onOpenTimemachine,
}) {
  const { t } = useLanguage();
  const installSize = estimateInstallSize(gameData.size);
  const isVr = gameData.category?.includes("Virtual Reality");

  return (
    <TooltipProvider>
      <section className="relative overflow-hidden rounded-xl border border-border/40 bg-card">
        {/* Banner */}
        <div className="relative h-52 w-full overflow-hidden">
          {bannerImage && (
            <img
              src={bannerImage}
              alt=""
              aria-hidden="true"
              className="h-full w-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/60 to-transparent" />
        </div>

        {/* Identity */}
        <div
          className={`relative flex items-end gap-5 px-6 pb-5 ${coverImage ? "-mt-24" : "-mt-10"}`}
        >
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
                    <p>{t("gameCard.verified.tooltip")}</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {gameData.version && (
                <Chip className="bg-primary/15 text-primary">
                  {gameData.version}
                  {showTimemachine && (
                    <History
                      onClick={onOpenTimemachine}
                      className="h-3.5 w-3.5 cursor-pointer hover:text-primary/80"
                    />
                  )}
                </Chip>
              )}
              {gameRating > 0 && (
                <Chip
                  className="bg-yellow-400/15 text-yellow-600 dark:text-yellow-400"
                  tooltip={t("download.ratingTooltip", { rating: gameRating })}
                >
                  <Star className="h-3 w-3 fill-current" />
                  {gameRating}
                </Chip>
              )}
              {steamRating && (
                <Chip
                  className="bg-red-400/15 text-red-500 dark:text-red-400"
                  tooltip={t("download.steamRating", { rating: steamRating })}
                >
                  <Apple className="h-3 w-3 fill-current" />
                  {steamRating}
                </Chip>
              )}
              {gameData.online && (
                <Chip
                  className="bg-green-500/15 text-green-500"
                  tooltip={t("download.onlineTooltip")}
                >
                  {t("download.online")}
                </Chip>
              )}
              {gameData.dlc && (
                <Chip
                  className="bg-blue-500/15 text-blue-500"
                  tooltip={t("download.allDlcTooltip")}
                >
                  {t("download.allDlc")}
                </Chip>
              )}
              {gameData.emulator && (
                <button
                  onClick={() =>
                    window.electron.openURL(
                      "https://ascendara.app/docs/troubleshooting/emulators"
                    )
                  }
                >
                  <Chip className="bg-yellow-500/15 text-yellow-500 transition-colors hover:bg-yellow-500/25">
                    <CircleSlash className="h-3 w-3" />
                    {t("download.gameNeedsEmulator")}
                    <span className="underline">{t("common.learnMore")}</span>
                    <ExternalLink className="h-3 w-3" />
                  </Chip>
                </button>
              )}
              {isVr && (
                <Chip className="bg-purple-500/15 text-purple-400">
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
                </Chip>
              )}
            </div>
          </div>
        </div>

        {/* Key facts */}
        <dl className="grid grid-cols-2 divide-x divide-border/40 border-t border-border/40 bg-background/30 md:grid-cols-4">
          {gameData.size && <Stat label={t("download.gameSize")}>{gameData.size}</Stat>}
          {installSize && (
            <Stat label={t("download.installSize")}>
              {installSize}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <FileQuestion className="h-3.5 w-3.5 shrink-0 cursor-pointer text-muted-foreground hover:text-foreground" />
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {t("download.installSizeInfo.title")}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("download.installSizeInfo.description")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <p className="text-sm text-muted-foreground">
                    {t("download.installSizeInfo.note")}
                  </p>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("common.close")}</AlertDialogCancel>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </Stat>
          )}
          <Stat label={t("download.latestUpdate")}>
            {formatLatestUpdate(gameData.latest_update)}
          </Stat>
          {releaseDate && (
            <Stat label={t("download.firstReleasedOn")}>{releaseDate}</Stat>
          )}
        </dl>
      </section>
    </TooltipProvider>
  );
}
