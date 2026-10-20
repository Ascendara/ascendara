import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";
import {
  BadgeCheck,
  Check,
  ChevronDown,
  ChevronLeft,
  Clock,
  Flag,
  Heart,
  ImageUp,
  Link2,
  TriangleAlert,
} from "lucide-react";

const toolbarButton =
  "h-9 gap-1.5 border-border/60 bg-card/60 text-muted-foreground hover:text-foreground";

function ToggleButton({ active, icon: Icon, activeIcon: ActiveIcon, onClick, children }) {
  const Shown = active && ActiveIcon ? ActiveIcon : Icon;
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "h-8 gap-1.5 rounded-md px-2.5",
        active
          ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      <Shown className={cn("h-4 w-4", active && Shown === Heart && "fill-primary")} />
      {children}
    </Button>
  );
}

function IssueItem({ icon: Icon, title, description, done, disabled, onSelect }) {
  return (
    <DropdownMenuItem
      disabled={disabled}
      onSelect={onSelect}
      className="cursor-pointer items-start gap-3 rounded-md px-2 py-2 data-[disabled]:opacity-100"
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
          done ? "bg-green-500/15 text-green-500" : "bg-accent/40 text-foreground"
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "text-sm font-medium",
            disabled ? "text-muted-foreground" : "text-foreground"
          )}
        >
          {title}
        </div>
        <div className="text-xs leading-snug text-muted-foreground">{description}</div>
      </div>
    </DropdownMenuItem>
  );
}

/** Back navigation plus the save, share and report actions for a game page. */
export default function DownloadToolbar({
  onBack,
  isFavorite,
  onToggleFavorite,
  isPlayLater,
  onTogglePlayLater,
  canShare,
  shareCopied,
  onShare,
  canReport,
  artwork,
  onFixArtwork,
  reported,
  onReport,
}) {
  const { t } = useLanguage();

  const artworkTitle = artwork?.verified
    ? t("download.artworkCorrection.verified")
    : artwork?.submitted
      ? t("download.artworkCorrection.submittedButton")
      : t("download.toolbar.wrongArtwork");
  const artworkDescription = artwork?.approved
    ? t("download.artworkCorrection.verifiedApprovedTooltip")
    : artwork?.gameVerified
      ? t("download.artworkCorrection.verifiedGameTooltip")
      : t("download.artworkCorrection.tooltip");

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <Button
        variant="ghost"
        size="sm"
        className="gap-2 text-muted-foreground hover:text-foreground"
        onClick={onBack}
      >
        <ChevronLeft className="h-4 w-4" />
        {t("common.back")}
        <kbd className="rounded border border-border/60 bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium leading-none">
          Esc
        </kbd>
      </Button>

      <TooltipProvider>
        <div className="flex flex-wrap items-center gap-2">
          {/* Both of these save the game to the user's library */}
          <div className="flex items-center rounded-lg bg-card/60 p-0.5">
            <ToggleButton active={isFavorite} icon={Heart} onClick={onToggleFavorite}>
              {isFavorite ? t("download.toolbar.favorited") : t("download.toolbar.favorite")}
            </ToggleButton>
            <div className="mx-0.5 h-5 w-px bg-border/60" />
            <ToggleButton
              active={isPlayLater}
              icon={Clock}
              activeIcon={Check}
              onClick={onTogglePlayLater}
            >
              {isPlayLater ? t("download.toolbar.inPlayLater") : t("gameCard.playLater")}
            </ToggleButton>
          </div>

          {canShare && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className={toolbarButton} onClick={onShare}>
                  {shareCopied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Link2 className="h-4 w-4" />
                  )}
                  {shareCopied ? t("download.toolbar.copied") : t("download.toolbar.share")}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-secondary">{t("download.shareGame")}</p>
              </TooltipContent>
            </Tooltip>
          )}

          {canReport && (
            // Non-modal so the dialogs opened from it get focus cleanly
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(toolbarButton, "data-[state=open]:text-foreground")}
                >
                  <Flag className="h-4 w-4" />
                  {t("download.toolbar.reportIssue")}
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 p-1.5">
                <DropdownMenuLabel className="px-2 pb-1.5 pt-1 text-xs font-normal text-muted-foreground">
                  {t("download.toolbar.reportIssueHint")}
                </DropdownMenuLabel>
                {artwork && (
                  <IssueItem
                    icon={artwork.verified ? BadgeCheck : artwork.submitted ? Check : ImageUp}
                    title={artworkTitle}
                    description={artworkDescription}
                    done={artwork.verified || artwork.submitted}
                    disabled={artwork.verified || artwork.submitted}
                    onSelect={onFixArtwork}
                  />
                )}
                <IssueItem
                  icon={reported ? Check : TriangleAlert}
                  title={reported ? t("download.reported") : t("gameCard.reportGame")}
                  description={t("gameCard.reportGameDescription")}
                  done={reported}
                  disabled={reported}
                  onSelect={onReport}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </TooltipProvider>
    </div>
  );
}
