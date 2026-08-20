import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Clock3,
  Gamepad2,
  Layers3,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FeatureCenterDialog,
  FeatureState,
} from "@/components/feature-centers/FeatureCenterPrimitives";
import { useLanguage } from "@/context/LanguageContext";
import { useFeatureCenterDialog } from "@/hooks/useFeatureCenterDialog";
import { FEATURE_CENTER_EVENTS } from "@/lib/featureCenterEvents";
import {
  buildSmartCollections,
  formatPlayTime,
  getLibraryGameName,
  loadSmartCollectionLibrary,
} from "@/services/smartCollectionsService";

const COLLECTION_ALIASES = {
  "never-played": "neverPlayed",
};

const SmartCollectionsCenter = () => {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [games, setGames] = useState([]);
  const [recentGames, setRecentGames] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState("continue");
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const handleOpenEvent = useCallback(detail => {
    if (!detail?.collection) return;
    setSelectedCollection(COLLECTION_ALIASES[detail.collection] || detail.collection);
  }, []);
  const [open, setOpen] = useFeatureCenterDialog(
    FEATURE_CENTER_EVENTS.collections,
    handleOpenEvent
  );

  const loadGames = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const library = await loadSmartCollectionLibrary();
      setGames(library.games);
      setRecentGames(library.recentGames);
    } catch (error) {
      console.error("[SmartCollections] Failed to load library:", error);
      setLoadError(error.message || t("featureCenters.collections.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (open) loadGames();
  }, [open, loadGames]);

  useEffect(() => {
    setFilter("");
  }, [selectedCollection]);

  const { collections, recentByName } = useMemo(
    () => buildSmartCollections(games, recentGames),
    [games, recentGames]
  );

  const activeCollection =
    collections.find(collection => collection.id === selectedCollection) || collections[0];

  const filteredGames = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase();
    if (!query) return activeCollection?.games || [];
    return (activeCollection?.games || []).filter(game =>
      getLibraryGameName(game).toLocaleLowerCase().includes(query)
    );
  }, [activeCollection, filter]);

  const openGame = game => {
    setOpen(false);
    // Use the same route state as Library search so GameScreen receives the official shape.
    navigate("/gamescreen", {
      state: { gameData: game },
    });
  };

  return (
    <FeatureCenterDialog
      open={open}
      onOpenChange={setOpen}
      title={t("featureCenters.collections.title")}
      description={t("featureCenters.collections.description")}
      icon={Sparkles}
    >
      <div className="flex h-full min-h-0 flex-col md:grid md:grid-cols-[230px_minmax(0,1fr)]">
        <aside className="flex shrink-0 gap-2 overflow-x-auto border-b border-border bg-muted/20 p-2 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r md:p-3">
          <Button
            variant="outline"
            className="shrink-0 justify-start md:mb-1 md:w-full"
            onClick={loadGames}
            disabled={loading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {t("featureCenters.collections.refresh")}
          </Button>

          {collections.map(collection => {
            const label = t(
              `featureCenters.collections.collections.${collection.id}.label`
            );
            const active = selectedCollection === collection.id;
            return (
              <button
                key={collection.id}
                type="button"
                aria-pressed={active}
                onClick={() => setSelectedCollection(collection.id)}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors md:w-full ${
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                }`}
              >
                <span className="whitespace-nowrap md:min-w-0 md:flex-1 md:truncate">
                  {label}
                </span>
                <Badge variant="secondary" className="text-[10px]">
                  {collection.games.length}
                </Badge>
              </button>
            );
          })}
        </aside>

        <section className="min-h-0 overflow-y-auto p-4 sm:p-6">
          {loadError ? (
            <FeatureState
              icon={AlertTriangle}
              title={t("featureCenters.collections.loadError")}
              description={loadError}
              action={{
                label: t("featureCenters.collections.retry"),
                onClick: loadGames,
              }}
            />
          ) : loading && games.length === 0 ? (
            <FeatureState icon={RefreshCw} title={t("featureCenters.common.loading")} />
          ) : (
            <div className="space-y-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <h2 className="flex items-center gap-2 text-xl font-semibold text-foreground">
                    <Layers3 className="h-5 w-5 shrink-0 text-primary" />
                    {t(
                      `featureCenters.collections.collections.${activeCollection?.id}.label`
                    )}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t(
                      `featureCenters.collections.collections.${activeCollection?.id}.description`
                    )}
                  </p>
                </div>
                <Badge variant="outline" className="self-start">
                  {t("featureCenters.collections.count", {
                    count: activeCollection?.games.length || 0,
                  })}
                </Badge>
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={filter}
                  onChange={event => setFilter(event.target.value)}
                  placeholder={t("featureCenters.collections.searchPlaceholder")}
                  className="pl-9"
                />
              </div>

              {filteredGames.length > 0 ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  {filteredGames.map(game => {
                    const gameName = getLibraryGameName(game);
                    const recent = recentByName.get(gameName);
                    const playTime = formatPlayTime(game.playTime);
                    return (
                      <button
                        key={`${game.isCustom ? "custom" : "installed"}:${gameName}`}
                        type="button"
                        onClick={() => openGame(game)}
                        className="rounded-xl border border-border bg-card/60 p-4 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="flex items-start gap-3">
                          <Gamepad2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-foreground">{gameName}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              {game.isCustom && (
                                <Badge variant="outline">
                                  {t("featureCenters.collections.customBadge")}
                                </Badge>
                              )}
                              {playTime && (
                                <span>
                                  {t("featureCenters.collections.playtime", {
                                    value: playTime,
                                  })}
                                </span>
                              )}
                              {recent?.lastPlayed && (
                                <span className="flex items-center gap-1">
                                  <Clock3 className="h-3 w-3" />
                                  {new Date(recent.lastPlayed).toLocaleDateString(language)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <FeatureState
                  compact
                  icon={Gamepad2}
                  title={t("featureCenters.collections.noMatches")}
                />
              )}
            </div>
          )}
        </section>
      </div>
    </FeatureCenterDialog>
  );
};

export default SmartCollectionsCenter;
