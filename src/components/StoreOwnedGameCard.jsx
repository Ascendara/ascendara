import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  Download,
  ExternalLink,
  FolderOpen,
  Gamepad2,
  Heart,
  MessageSquareText,
  Play,
  Timer,
  Trash2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useStoreGame } from "@/hooks/useStoreGame";
import { useGameRunning } from "@/hooks/useGameRunning";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";
import { storeNames } from "@/lib/storeLibrary";
import FixStoreShortcutDialog from "@/components/FixStoreShortcutDialog";

const MENU_WIDTH = 260;
const MENU_HEIGHT = 310;

function MenuItem({ icon: Icon, iconClassName, destructive, title, description, onClick }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-all hover:translate-x-0.5",
        destructive ? "hover:bg-destructive/10" : "hover:bg-accent"
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-md",
          iconClassName || (destructive ? "bg-red-500/20" : "bg-accent/30")
        )}
      >
        <Icon className="h-4 w-4 text-foreground" />
      </div>
      <div className="flex-1">
        <div className="font-medium text-foreground">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
    </button>
  );
}

// Games owned on a connected store. They mirror the regular library card,
// including its right-click menu; launching or installing goes through the store.
export default function StoreOwnedGameCard({
  game,
  viewMode,
  favorite,
  onToggleFavorite,
  onRemove,
  onRename,
  selectionMode = false,
  isSelected = false,
  onSelect,
}) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const card = useRef(null);
  const [visible, setVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [fixOpen, setFixOpen] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    if (card.current) observer.observe(card.current);
    return () => observer.disconnect();
  }, []);

  const { artwork, details } = useStoreGame(game, visible);
  const store = storeNames[game.store];
  const installed = Boolean(details?.installed);
  const isRunning = useGameRunning(game.game) || Boolean(details?.running);
  const playTime = game.playTime;
  const showDetails = () => {
    if (selectionMode) onSelect?.();
    else navigate("/gamescreen", { state: { gameData: game, libraryPage: true } });
  };
  const selectionCheckbox = selectionMode && (
    <input type="checkbox" checked={isSelected} readOnly tabIndex={-1}
      aria-label={game.game}
      className={cn("pointer-events-none z-20 h-5 w-5 shrink-0 accent-primary", viewMode === "list" ? "ml-1" : "absolute left-2 top-2 rounded bg-background shadow")} />
  );
  const onKeyDown = event => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      showDetails();
    }
  };
  const favoriteLabel = favorite
    ? t("library.view.removeFavorite")
    : t("library.view.addFavorite");
  const toggleFavorite = event => {
    event.stopPropagation();
    if (selectionMode) return onSelect?.();
    onToggleFavorite();
  };
  const runStoreAction = async intent => {
    try {
      const result = await window.electron.storeAccounts.openGame(game.store, game.id, intent);
      if (!result.success) toast.error(result.error);
    } catch (error) {
      toast.error(error.message);
    }
  };
  const openDirectory = async () => {
    try {
      const result = await window.electron.storeAccounts.openDirectory(game.store, game.id);
      if (!result.success) toast.error(result.error);
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleContextMenu = event => {
    event.preventDefault();
    event.stopPropagation();
    if (selectionMode) return;

    const { clientX: x, clientY: y } = event;
    let adjustedX = x + MENU_WIDTH > window.innerWidth ? Math.max(0, window.innerWidth - MENU_WIDTH) : x;
    let adjustedY = y + MENU_HEIGHT > window.innerHeight ? y - MENU_HEIGHT : y;
    if (adjustedY < 0) {
      adjustedY = Math.max(0, Math.min(y, window.innerHeight - MENU_HEIGHT));
    }
    setContextMenuPosition({ x: adjustedX, y: adjustedY });
    setContextMenuOpen(true);
  };
  const fromMenu = action => event => {
    event.stopPropagation();
    setContextMenuOpen(false);
    action();
  };

  // The dialog portals out, but React still bubbles its events to the card
  const fixDialog = (
    <span
      className="contents"
      onClick={event => event.stopPropagation()}
      onContextMenu={event => event.stopPropagation()}
    >
      <FixStoreShortcutDialog
        open={fixOpen}
        onOpenChange={setFixOpen}
        game={game}
        artwork={artwork}
        onRename={onRename}
      />
    </span>
  );

  const contextMenuPortal =
    contextMenuOpen &&
    createPortal(
      <div
        className="fixed inset-0 z-[9999] flex items-start justify-start"
        onClick={event => {
          event.preventDefault();
          event.stopPropagation();
          setContextMenuOpen(false);
        }}
        onContextMenu={event => event.preventDefault()}
      >
        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />

        <div
          className="absolute transition-all duration-200 animate-in fade-in zoom-in-95"
          style={{ top: contextMenuPosition.y, left: contextMenuPosition.x }}
          onClick={event => event.stopPropagation()}
        >
          <div className="max-h-[80vh] min-w-[260px] overflow-hidden rounded-xl border border-border/50 bg-popover/95 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-center border-b border-border/50 bg-gradient-to-r from-primary/5 to-transparent px-3 py-3">
              {artwork.logo ? (
                <img src={artwork.logo} alt={game.game} className="h-8 max-w-[200px] object-contain" />
              ) : (
                <span className="text-sm font-semibold text-foreground">{game.game}</span>
              )}
            </div>

            <div className="max-h-[calc(80vh-60px)] overflow-y-auto p-1.5">
              <MenuItem
                icon={installed ? Play : Download}
                iconClassName="bg-primary/20"
                title={
                  installed
                    ? t("common.contextMenu.playGame")
                    : t("storeAccounts.installNamed", { defaultValue: "Install with {{store}}", store })
                }
                description={
                  installed
                    ? t("storeAccounts.playDescription", { defaultValue: "Launch it through {{store}}", store })
                    : t("storeAccounts.installDescription", { defaultValue: "Install it through {{store}}", store })
                }
                onClick={fromMenu(() => void runStoreAction("auto"))}
              />
              <MenuItem
                icon={ExternalLink}
                title={t("storeAccounts.openNamed", { defaultValue: "Open in {{store}}", store })}
                description={t("storeAccounts.openDescription", "View the game's store page")}
                onClick={fromMenu(() => void runStoreAction("store"))}
              />
              {installed && (
                <MenuItem
                  icon={FolderOpen}
                  title={t("common.contextMenu.openDirectory")}
                  description={t("common.contextMenu.openDirectoryDescription")}
                  onClick={fromMenu(() => void openDirectory())}
                />
              )}
              <MenuItem
                icon={Wrench}
                title={t("storeAccounts.fixShortcut.title")}
                description={t("storeAccounts.fixShortcut.menuDescription")}
                onClick={fromMenu(() => setFixOpen(true))}
              />
              <MenuItem
                icon={Trash2}
                destructive
                title={t("common.contextMenu.removeGame")}
                description={t("storeAccounts.removeDescription", "Hide it from your library")}
                onClick={fromMenu(onRemove)}
              />

              <div className="my-1.5 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

              <MenuItem
                icon={MessageSquareText}
                title={t("common.giveFeedback")}
                description={t("common.contextMenu.shareFeedbackDescription")}
                onClick={fromMenu(() => window.electron.openURL("https://ascendara.app/feedback"))}
              />
            </div>
          </div>
        </div>
      </div>,
      document.body
    );

  if (viewMode === "list") {
    const banner = artwork.hero || artwork.grid;
    return (
      <div
        ref={card}
        role={selectionMode ? "checkbox" : "button"}
        aria-checked={selectionMode ? Boolean(isSelected) : undefined}
        aria-label={game.game}
        style={selectionMode && isSelected ? { outline: "2px solid hsl(var(--primary))", outlineOffset: 2, backgroundColor: "hsl(var(--primary) / 0.1)" } : undefined}
        tabIndex={0}
        onClick={showDetails}
        onKeyDown={onKeyDown}
        onContextMenu={handleContextMenu}
        className="group relative flex cursor-pointer items-center gap-4 rounded-xl border border-border/60 bg-card p-2 pr-4 shadow-sm transition-all duration-200 hover:border-primary/30 hover:bg-accent/30 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {contextMenuPortal}
        {fixDialog}
        {selectionCheckbox}

        <div className="relative h-[72px] w-56 shrink-0 overflow-hidden rounded-lg bg-zinc-900 shadow-sm md:w-64">
          {banner ? (
            <img
              src={banner}
              alt=""
              aria-hidden
              className={cn(
                "absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105",
                !artwork.hero && "scale-110 blur-md"
              )}
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-primary/40 via-zinc-900 to-zinc-950" />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-black/10" />
          <div className="absolute inset-0 flex items-center px-4">
            {artwork.logo ? (
              <img
                src={artwork.logo}
                alt={game.game}
                className="max-h-12 max-w-full object-contain object-left drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
              />
            ) : (
              <span className="line-clamp-2 text-sm font-bold leading-tight text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
                {game.game}
              </span>
            )}
          </div>
          {isRunning && (
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-green-500 to-emerald-400" />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
          <h3 className="truncate text-sm font-semibold leading-tight text-foreground">
            {game.game}
          </h3>
          {isRunning && (
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="flex items-center gap-1.5 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-semibold text-green-600 dark:text-green-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                {t("library.view.playing")}
              </span>
            </div>
          )}
        </div>

        <div className="hidden h-12 w-36 shrink-0 flex-col items-end justify-center gap-1 border-l border-border/50 pl-4 text-right lg:flex">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            {t("library.view.playtime")}
          </span>
          <span className="flex items-center gap-1.5 text-xs font-medium tabular-nums text-foreground">
            <Timer className="h-3.5 w-3.5 text-muted-foreground" />
            {(() => {
              if (!playTime || playTime < 60) return t("library.view.notPlayed");
              const h = Math.floor(playTime / 3600);
              const m = Math.floor((playTime % 3600) / 60);
              return h === 0
                ? t("library.view.playtimeMinutes", { minutes: m })
                : t("library.view.playtimeHours", { hours: h, minutes: m });
            })()}
          </span>
        </div>

        <div className={cn("flex shrink-0 items-center gap-1", selectionMode && "hidden")}>
          <Button
            variant="ghost"
            size="icon"
            aria-label={favoriteLabel}
            aria-pressed={favorite}
            className={cn(
              "h-8 w-8 transition-opacity hover:text-primary",
              favorite ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            )}
            onClick={toggleFavorite}
          >
            <Heart
              className={cn("h-4 w-4", favorite ? "fill-primary text-primary" : "fill-none")}
            />
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1.5 px-3 text-secondary"
            onClick={event => {
              event.stopPropagation();
              void runStoreAction("auto");
            }}
          >
            {installed ? (
              <Play className="h-3.5 w-3.5 fill-current" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {installed ? t("library.view.play") : t("storeAccounts.install", "Install")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card
      ref={card}
      role={selectionMode ? "checkbox" : "button"}
      aria-checked={selectionMode ? Boolean(isSelected) : undefined}
      aria-label={game.game}
      style={selectionMode && isSelected ? { outline: "2px solid hsl(var(--primary))", outlineOffset: 2, backgroundColor: "hsl(var(--primary) / 0.1)" } : undefined}
      tabIndex={0}
      onClick={showDetails}
      onKeyDown={onKeyDown}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="press group relative cursor-pointer overflow-hidden rounded-xl border border-border bg-card shadow-md transition-all duration-200 hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {contextMenuPortal}
      {fixDialog}
      {selectionCheckbox}

      <CardContent className="p-0">
        <div className="relative aspect-[2/3] overflow-hidden">
          {artwork.grid ? (
            <img
              src={artwork.grid}
              alt={game.game}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted">
              <Gamepad2 className="h-12 w-12 text-muted-foreground/30" />
            </div>
          )}
          {isRunning && (
            <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-green-500 to-emerald-400" />
          )}
          {/* Hover overlay with title + favorite, same as installed games */}
          <div
            className={cn(
              "absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/20 to-transparent p-3 transition-opacity duration-200",
              selectionMode && "hidden",
              isHovered && !selectionMode ? "opacity-100" : "pointer-events-none opacity-0"
            )}
          >
            <p className="mb-2 line-clamp-2 text-sm font-semibold leading-tight text-white">
              {game.game}
            </p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                {isRunning && (
                  <span className="text-xs font-medium text-green-400">Playing</span>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={favoriteLabel}
                aria-pressed={favorite}
                className="h-7 w-7 text-white hover:bg-white/20 hover:text-primary"
                onClick={toggleFavorite}
              >
                <Heart
                  className={cn(
                    "h-4 w-4",
                    favorite ? "fill-primary text-primary" : "fill-none text-white"
                  )}
                />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-1 px-3 py-2">
        <h3 className="w-full truncate text-sm font-semibold leading-tight text-foreground">
          {game.game}
        </h3>
        <p className="text-xs text-muted-foreground">
          {(() => {
            if (!playTime || playTime < 60) return t("library.neverPlayed");
            const h = Math.floor(playTime / 3600);
            const m = Math.floor((playTime % 3600) / 60);
            if (h === 0) return `${m} minutes`;
            if (m === 0) return `${h} hours`;
            return `${h} hours ${m} minutes`;
          })()}
        </p>
      </CardFooter>
    </Card>
  );
}
