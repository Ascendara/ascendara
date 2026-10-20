import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ChevronDown,
  ChevronLeft,
  Download,
  ExternalLink,
  FolderOpen,
  Heart,
  Info,
  Loader,
  Play,
  Settings2,
  StopCircle,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { useStoreGame } from "@/hooks/useStoreGame";
import { useStoreLibrary } from "@/hooks/useStoreLibrary";
import { useGameRunning } from "@/hooks/useGameRunning";
import { storeGameKey, storeNames } from "@/lib/storeLibrary";
import { cn } from "@/lib/utils";
import steamService from "@/services/gameInfoService";
import GameHero from "./GameHero";
import GameOverviewTab from "./GameOverviewTab";

// Store details by game, kept for the session so reopening is instant
const storeDetailsCache = new Map();

// Steam games can be matched exactly by App ID; other stores fall back to a
// name search, the same way installed games without an App ID are matched
async function loadStoreDetails(game) {
  const key = `${game.store}:${game.id}`;
  if (storeDetailsCache.has(key)) return storeDetailsCache.get(key);
  let data = null;
  if (game.store === "steam" && game.id) {
    const details = await steamService.getGameDetailByIdSteam(game.id);
    if (details) data = steamService.formatSteamData(details);
  }
  if (!data) data = await steamService.getGameDetails(game.game);
  if (data?.screenshots?.length) {
    data.formatted_screenshots = data.screenshots.map(screenshot => ({
      ...screenshot,
      formatted_url: steamService.formatImageUrl(screenshot.url, "screenshot_huge"),
    }));
  }
  storeDetailsCache.set(key, data || null);
  return data || null;
}

const readFavorites = () => {
  try {
    return JSON.parse(localStorage.getItem("game-favorites") || "[]");
  } catch {
    return [];
  }
};

// Same layout as an installed game's page; launching, installing and the store
// page go through the game's store instead of Ascendara's own install.
export default function StoreGameScreen({ game }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const storeLibrary = useStoreLibrary();
  const { artwork, details, error } = useStoreGame(game);
  const [busy, setBusy] = useState(false);
  const [showLogo, setShowLogo] = useState(true);
  const [favorites, setFavorites] = useState(readFavorites);
  const [steamData, setSteamData] = useState(
    () => storeDetailsCache.get(`${game.store}:${game.id}`) || null
  );
  const [steamLoading, setSteamLoading] = useState(!steamData);
  const store = storeNames[game.store];
  const installed = details?.installed;
  const screenshots = steamData?.formatted_screenshots || [];
  const isFavorite = favorites.includes(game.game);
  const isRunning = useGameRunning(game.game) || Boolean(details?.running);
  // The game passed in navigation state goes stale once it's played, so read
  // playtime from the live account state
  const playTime =
    storeLibrary.accounts
      .find(account => account.store === game.store)
      ?.games.find(item => item.id === game.id)?.playTime ?? game.playTime;

  const formatPlaytime = seconds => {
    if (seconds === undefined) return t("library.neverPlayed2");
    if (seconds < 60) return t("library.lessThanMinute2");
    if (seconds < 120) return `1 ${t("library.minute")}`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} ${t("library.minutes")}`;
    if (seconds < 7200) return `1 ${t("library.hour")}`;
    return `${Math.floor(seconds / 3600)} ${t("library.hours")}`;
  };

  useEffect(() => {
    let active = true;
    setSteamLoading(true);
    loadStoreDetails(game)
      .then(data => {
        if (active) setSteamData(data);
      })
      .catch(failure => console.warn("[StoreGameScreen] Details unavailable:", failure))
      .finally(() => {
        if (active) setSteamLoading(false);
      });
    return () => {
      active = false;
    };
  }, [game.store, game.id, game.game]);

  useEffect(() => {
    const update = () => setFavorites(readFavorites());
    window.addEventListener("favorites-updated", update);
    return () => window.removeEventListener("favorites-updated", update);
  }, []);

  const backToLibrary = () => {
    const { returnToFolder, libraryPage } = location.state || {};
    if (typeof returnToFolder === "string" && returnToFolder.startsWith("/folderview/")) {
      navigate(returnToFolder, { replace: true });
      return;
    }
    const page = Number(libraryPage);
    if (Number.isInteger(page) && page >= 1) {
      navigate("/library", { replace: true, state: { libraryPage: page } });
      return;
    }
    navigate("/library");
  };

  const action = async intent => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await window.electron.storeAccounts.openGame(
        game.store,
        game.id,
        intent
      );
      if (!result.success) throw new Error(result.error);
      if (result.data.action !== "launch") {
        toast.success(t("storeAccounts.opening", "Opening store…"));
      }
    } catch (failure) {
      toast.error(failure.message);
    } finally {
      setBusy(false);
    }
  };
  const openDirectory = async () => {
    try {
      const result = await window.electron.storeAccounts.openDirectory(game.store, game.id);
      if (!result.success) throw new Error(result.error);
    } catch (failure) {
      toast.error(failure.message);
    }
  };
  const toggleFavorite = () => {
    const updated = isFavorite
      ? favorites.filter(name => name !== game.game)
      : [...favorites, game.game];
    localStorage.setItem("game-favorites", JSON.stringify(updated));
    setFavorites(updated);
    window.dispatchEvent(new CustomEvent("favorites-updated"));
  };
  const removeFromLibrary = () => {
    const { preferences, updatePreferences } = storeLibrary;
    const hiddenGames = [
      ...new Set([...(preferences.hiddenGames || []), storeGameKey(game.store, game.id)]),
    ];
    if (!updatePreferences({ ...preferences, hiddenGames })) {
      toast.error(
        t("storeAccounts.display.saveError", "Could not save this preference. Please try again.")
      );
      return;
    }
    backToLibrary();
  };

  return (
    <div className="mx-auto w-full max-w-7xl pb-24 pt-4 fade-in">
      {/* Toolbar */}
      <div className="mb-4 flex items-center">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-muted-foreground hover:text-foreground"
          onClick={backToLibrary}
        >
          <ChevronLeft className="h-4 w-4" />
          {t("common.back")}
        </Button>
      </div>

      <div className="space-y-4">
        <GameHero
          game={{ ...game, isCustom: true, version: "-1" }}
          bannerImage={artwork.hero || screenshots[0]?.formatted_url || artwork.grid}
          bannerIsCover={!artwork.hero && !screenshots[0]}
          coverImage={artwork.grid}
          logoImage={artwork.logo}
          showLogo={showLogo}
          onToggleLogo={() => setShowLogo(value => !value)}
          executableExists={Boolean(installed)}
          playtime={formatPlaytime(playTime)}
        >
          <TooltipProvider>
            <Button
              size="lg"
              className="h-12 min-w-[11rem] gap-2 px-8 text-base text-secondary"
              disabled={busy || !details || Boolean(error) || isRunning}
              onClick={() => action("auto")}
            >
              {busy || !details ? (
                <Loader className="h-5 w-5 animate-spin" />
              ) : isRunning ? (
                <StopCircle className="h-5 w-5" />
              ) : installed ? (
                <Play className="h-5 w-5 fill-current" />
              ) : (
                <Download className="h-5 w-5" />
              )}
              {isRunning
                ? t("library.running")
                : installed || !details
                ? t("library.play")
                : t("storeAccounts.installNamed", {
                    defaultValue: "Install with {{store}}",
                    store,
                  })}
            </Button>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-12 w-12 p-0 text-muted-foreground hover:text-primary"
                    onClick={toggleFavorite}
                    aria-pressed={isFavorite}
                  >
                    <Heart
                      className={cn(
                        "h-5 w-5",
                        isFavorite ? "fill-primary text-primary" : "fill-none"
                      )}
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-secondary">
                    {isFavorite
                      ? t("library.removeFromFavorites")
                      : t("library.addToFavorites")}
                  </p>
                </TooltipContent>
              </Tooltip>

              {installed && (
                <Button variant="outline" className="h-12 gap-2" onClick={openDirectory}>
                  <FolderOpen className="h-4 w-4" />
                  {t("library.openGameDirectory")}
                </Button>
              )}

              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-12 gap-2">
                    <Settings2 className="h-4 w-4" />
                    {t("library.manage")}
                    <ChevronDown className="h-4 w-4 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuItem
                    className="gap-2"
                    disabled={busy || Boolean(error)}
                    onSelect={() => action("store")}
                  >
                    <ExternalLink className="h-4 w-4" />
                    {t("storeAccounts.openNamed", {
                      defaultValue: "Open in {{store}}",
                      store,
                    })}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="gap-2 text-red-500 focus:text-red-500"
                    onSelect={removeFromLibrary}
                  >
                    <Trash2 className="h-4 w-4" />
                    {t("library.removeGameFromLibrary")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </TooltipProvider>
        </GameHero>

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        {details && !details.installationSupported && (
          <p className="rounded-xl border border-border/40 bg-card px-5 py-3 text-xs text-muted-foreground">
            {t(
              "storeAccounts.unsupportedDetection",
              "Automatic installation detection for this store is currently available on Windows. You can still open the store to install or play."
            )}
          </p>
        )}

        {/* Section navigation */}
        <div
          role="tablist"
          className="flex flex-wrap items-center gap-1 border-b border-border/40"
        >
          <button
            type="button"
            role="tab"
            aria-selected
            className="-mb-px inline-flex shrink-0 items-center gap-2 rounded-t-md border-b-2 border-primary bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary transition-colors"
          >
            <Info className="h-4 w-4" />
            {t("gameScreen.overview")}
          </button>
        </div>

        <div className="animate-section-in">
          <GameOverviewTab
            game={game}
            steamData={steamData}
            steamLoading={steamLoading}
            screenshots={screenshots}
            isAuthenticated={isAuthenticated}
            onGetAscend={() => navigate("/ascend")}
            isOnLinux={false}
          />
        </div>
      </div>
    </div>
  );
}
