import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ExternalLink,
  Play,
  Loader2,
  HardDrive,
  Download,
  Gamepad2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { useStoreGame } from "@/hooks/useStoreGame";
import { storeNames } from "@/lib/storeLibrary";
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

export default function StoreGameScreen({ game }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { artwork, details, error } = useStoreGame(game);
  const [busy, setBusy] = useState(false);
  const [steamData, setSteamData] = useState(
    () => storeDetailsCache.get(`${game.store}:${game.id}`) || null
  );
  const [steamLoading, setSteamLoading] = useState(!steamData);
  const store = storeNames[game.store];
  const installed = details?.installed;
  const screenshots = steamData?.formatted_screenshots || [];

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
      toast.success(
        result.data.action === "launch"
          ? t("storeAccounts.launching", "Starting game in its launcher…")
          : t("storeAccounts.opening", "Opening store…")
      );
    } catch (failure) {
      toast.error(failure.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl pb-24 pt-4 fade-in">
      <div className="mb-4 flex items-center">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-muted-foreground hover:text-foreground"
          onClick={() => navigate("/library")}
        >
          <ChevronLeft className="h-4 w-4" />
          {t("common.back", "Back")}
        </Button>
      </div>

      <div className="space-y-4">
        <GameHero
          game={{ ...game, isCustom: true, version: "-1" }}
          bannerImage={artwork.hero || screenshots[0]?.formatted_url || artwork.grid}
          bannerIsCover={!artwork.hero && !screenshots[0]}
          coverImage={artwork.grid}
          logoImage={artwork.logo}
          showLogo={false}
          executableExists={Boolean(installed)}
          playtime="—"
        >
          <div className="flex flex-wrap items-center gap-3">
            <Button
              className="gap-2 text-secondary"
              disabled={busy || !details || Boolean(error)}
              onClick={() => action("auto")}
            >
              {busy || !details ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : installed ? (
                <Play className="h-4 w-4" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {installed
                ? t("common.play", "Play")
                : t("storeAccounts.installNamed", {
                    defaultValue: "Install with {{store}}",
                    store,
                  })}
            </Button>
            <Button
              variant="outline"
              className="gap-2 text-foreground"
              disabled={busy || Boolean(error)}
              onClick={() => action("store")}
            >
              <ExternalLink className="h-4 w-4" />
              {t("storeAccounts.openNamed", {
                defaultValue: "Open in {{store}}",
                store,
              })}
            </Button>
            <span className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
              {installed ? (
                <HardDrive className="h-4 w-4 text-primary" />
              ) : (
                <Gamepad2 className="h-4 w-4" />
              )}
              {installed
                ? t("storeAccounts.installed", "Installed")
                : details
                  ? t("storeAccounts.notInstalled", "Not installed")
                  : t("storeAccounts.checking", "Checking installation…")}{" "}
              · {store}
            </span>
          </div>
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
  );
}
