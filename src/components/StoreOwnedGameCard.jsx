import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ExternalLink, FolderOpen, Gamepad2, Heart, MoreHorizontal, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useStoreGame } from "@/hooks/useStoreGame";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";
import { storeNames } from "@/lib/storeLibrary";

// Games owned on a connected store. They mirror the regular library card;
// launching or installing happens from the game's details page.
export default function StoreOwnedGameCard({
  game,
  viewMode,
  favorite,
  onToggleFavorite,
  onRemove,
}) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const card = useRef(null);
  const [visible, setVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

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
  const showDetails = () =>
    navigate("/gamescreen", { state: { gameData: game, libraryPage: true } });
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
  const showContextMenu = event => {
    event.preventDefault();
    event.stopPropagation();
    setMenuOpen(true);
  };
  const menu = (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost" size="icon"
          aria-label={t("common.contextMenu.menu", "Game options")}
          className={cn("h-8 w-8 shrink-0", viewMode === "list" ? "text-foreground" : "text-white")}
          onClick={event => event.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={event => event.stopPropagation()}>
        <DropdownMenuItem onSelect={showDetails}>
          <Gamepad2 className="mr-2 h-4 w-4" />
          {t("storeAccounts.gameOptions.details", "View details")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void runStoreAction("auto")}>
          <Play className="mr-2 h-4 w-4" />
          {details?.installed
            ? t("common.play", "Play")
            : t("storeAccounts.installNamed", { defaultValue: "Install with {{store}}", store })}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void runStoreAction("store")}>
          <ExternalLink className="mr-2 h-4 w-4" />
          {t("storeAccounts.openNamed", { defaultValue: "Open in {{store}}", store })}
        </DropdownMenuItem>
        {details?.installed && (
          <DropdownMenuItem onSelect={() => void openDirectory()}>
            <FolderOpen className="mr-2 h-4 w-4" />
            {t("common.contextMenu.openDirectory", "Open file location")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={onRemove} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          {t("storeAccounts.gameOptions.remove", "Remove from Library")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (viewMode === "list") {
    const banner = artwork.hero || artwork.grid;
    return (
      <div
        ref={card}
        role="button"
        tabIndex={0}
        onClick={showDetails}
        onKeyDown={onKeyDown}
        onContextMenu={showContextMenu}
        className="group relative flex cursor-pointer items-center gap-4 rounded-xl border border-border/60 bg-card p-2 pr-4 shadow-sm transition-all duration-200 hover:border-primary/30 hover:bg-accent/30 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
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
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
          <h3 className="truncate text-sm font-semibold leading-tight text-foreground">
            {game.game}
          </h3>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {store}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {menu}
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
        </div>
      </div>
    );
  }

  return (
    <Card
      ref={card}
      role="button"
      tabIndex={0}
      onClick={showDetails}
      onKeyDown={onKeyDown}
      onContextMenu={showContextMenu}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="press group relative cursor-pointer overflow-hidden rounded-xl border border-border bg-card shadow-md transition-all duration-200 hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
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
          <div className="absolute left-2 top-2 z-20">
            <span className="rounded-full border border-white/10 bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm backdrop-blur-md">
              {store}
            </span>
          </div>
          <div className="absolute right-2 top-2 z-20 rounded-md bg-black/70 text-white">
            {menu}
          </div>
          {/* Hover overlay with title + favorite, same as installed games */}
          <div
            className={cn(
              "absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/20 to-transparent p-3 transition-opacity duration-200",
              isHovered ? "opacity-100" : "opacity-0"
            )}
          >
            <p className="mb-2 line-clamp-2 text-sm font-semibold leading-tight text-white">
              {game.game}
            </p>
            <div className="flex items-center justify-end">
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
          {t("storeAccounts.display.ownedOn", { defaultValue: "Owned on {{store}}", store })}
        </p>
      </CardFooter>
    </Card>
  );
}
