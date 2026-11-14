import {
  Search,
  X,
  RefreshCw,
  ChevronDown,
  Database,
  Globe,
  HardDrive,
  Tag,
  Users,
} from "lucide-react";
import { useGridColumns } from "./useGridColumns";
import {
  BigPictureShell,
  BigPictureToolbar,
  BigPictureEmptyState,
  BigPictureHero,
  BigPictureSpotlight,
} from "./BigPictureShell";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SurfaceButton, useSurface } from "./Surface";
import { BrowseGameCard } from "./BrowseGameCard";
import { gameSource } from "@/lib/combinedSources";
import { gameName, gameEntries, readStoredList } from "./surfaceNavigation";
import { useHomeArtwork } from "./useHomeArtwork";
import gamePagePreparer from "@/services/games/gamePagePreparer";
import { useLanguage } from "@/context/LanguageContext";
import { useSettings } from "@/context/SettingsContext";
import { catalogSizeText } from "@/lib/installSpace";
import "./browse-controls.css";

// Catalogue entries keep their genres in `category`; other sources use genre(s).
const genresFor = (game) => {
  const value = game.category || game.genre || game.genres;
  return Array.isArray(value)
    ? value
        .map((item) => (typeof item === "string" ? item : item?.name))
        .filter(Boolean)
    : typeof value === "string"
      ? value.split(",").map((item) => item.trim()).filter(Boolean)
      : [];
};

export function BrowseSurface({
  navigation,
  active,
  games,
  loading,
  query,
  search,
  clearSearch,
  sort,
  setSort,
  openGame,
  onBack,
  retry,
  openIndexes,
}) {
  const { t } = useLanguage();
  const { settings } = useSettings();
  const columns = useGridColumns();
  const [page, setPage] = useState(0);
  const [savedOnly, setSavedOnly] = useState(false);
  const [selectedGenre, setGenre] = useState("");
  const [genreOpen, setGenreOpen] = useState(false);
  const [lastQuery, setLastQuery] = useState(query);
  if (query !== lastQuery) {
    setLastQuery(query);
    setPage(0);
  }
  const genres = useMemo(() => [...new Set(games.flatMap(genresFor))]
    .filter(item => settings.seeInappropriateContent || item !== "Nudity")
    .sort(), [games, settings.seeInappropriateContent]);
  // A genre picked from another index (or a hidden mature one) no longer applies.
  const genre = genres.includes(selectedGenre) ? selectedGenre : "";
  const genreOptions = ["", ...genres];
  const pickGenre = (value) => {
    setGenre(value);
    setGenreOpen(false);
    setPage(0);
    selectFocus("genre");
  };
  const [savedRevision, setSavedRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setSavedRevision(value => value + 1);
    window.addEventListener("play-later-updated", refresh);
    return () => window.removeEventListener("play-later-updated", refresh);
  }, []);
  const saved = useMemo(() => new Set(readStoredList("play-later-games").map(gameName)), [savedRevision]);
  const filtered = useMemo(() => games.filter(
    (game) =>
      (!savedOnly || saved.has(gameName(game))) &&
      (!genre || genresFor(game).includes(genre)),
  ), [games, savedOnly, saved, genre]);
  // Always load complete rows (25 cards in the five-column layout).
  const batchSize = Math.ceil(24 / columns) * columns;
  const pages = Math.max(1, Math.ceil(filtered.length / batchSize));
  const currentPage = Math.min(page, pages - 1);
  const entries = useMemo(() => gameEntries(filtered), [filtered]);
  const displayed = useMemo(() => entries.slice(
    0,
    (currentPage + 1) * batchSize,
  ), [entries, currentPage, batchSize]);
  const hasMore = displayed.length < filtered.length;
  const loadMoreRef = useRef(null);
  const filters = ["sort", "saved", ...(genres.length ? ["genre"] : [])];
  const rows = [
    ["search", ...(query ? ["clear"] : [])],
    ...(columns === 3
      ? [filters, ["retry", "indexes"]]
      : [[...filters, "retry", "indexes"]]),
    ...(genreOpen
      ? Array.from({ length: Math.ceil(genreOptions.length / columns) }, (_, i) =>
          genreOptions
            .slice(i * columns, i * columns + columns)
            .map((_, j) => `genre-option-${i * columns + j}`),
        )
      : []),
    ...Array.from({ length: Math.ceil(displayed.length / columns) }, (_, i) =>
      displayed
        .slice(i * columns, i * columns + columns)
        .map(({ key }) => `store-${key}`),
    ),
    ...(hasMore ? [["next"]] : []),
  ];
  // Back closes the genre picker before leaving the page.
  const back = () => {
    if (!genreOpen) return onBack?.();
    setGenreOpen(false);
    selectFocus("genre");
  };
  const { root, focus, current, selectFocus } = useSurface(navigation, rows, back, active);
  const focusedIndex = displayed.findIndex(({ key }) => `store-${key}` === current);
  const lastRowStart = Math.floor((displayed.length - 1) / columns) * columns;
  const nextFocus = entries[displayed.length]?.key;
  const loadMore = useCallback((moveSelection = false) => {
    if (loading || !hasMore) return;
    // The footer moves with every appended batch. Never leave focus following it.
    if ((moveSelection || current === "next") && nextFocus) {
      selectFocus(`store-${nextFocus}`);
    }
    setPage(currentPage + 1);
  }, [loading, hasMore, current, nextFocus, selectFocus, currentPage]);

  // Preload on the last row so the next Down press moves into the new results.
  useEffect(() => {
    if (active && (current === "next" || focusedIndex >= lastRowStart)) {
      loadMore();
    }
  }, [active, current, focusedIndex, lastRowStart, loadMore]);

  // Mouse/trackpad scrolling follows the same incremental loading behavior.
  useEffect(() => {
    if (!active || loading || !hasMore || !loadMoreRef.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) loadMore();
    }, { root: root.current, rootMargin: "0px 0px 300px 0px" });
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [active, loading, hasMore, loadMore, root]);
  // Keep the spotlight on the last focused game while the toolbar has focus.
  const focusedKey = focusedIndex >= 0 ? displayed[focusedIndex].key : null;
  const [spotlightKey, setSpotlightKey] = useState(null);
  useEffect(() => {
    if (!focusedKey) return;
    setSpotlightKey(focusedKey);
    // Warm the game page like hovering a card does on desktop, so it opens ready
    const timer = setTimeout(() => {
      const game = displayed.find(({ key }) => key === focusedKey)?.game;
      if (game) gamePagePreparer.prefetch(game);
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedKey]);
  const spotlight =
    displayed.find(({ key }) => key === spotlightKey)?.game || displayed[0]?.game;
  const artwork = useHomeArtwork(spotlight);
  const spotlightSource = gameSource(spotlight, settings);
  const sorts = {
    weight: ["Popular", "latest_update-desc"],
    "latest_update-desc": ["Recently updated", "name"],
    name: ["Title A–Z", "weight"],
  };
  return (
    <BigPictureShell
      ref={root}
      className="bp-browse"
      title="Browse"
      focus={focus}
    >
      <BigPictureHero
        backdrop={artwork}
        eyebrow="Browse"
        title={
          query
            ? `“${query}”`
            : genre || (savedOnly ? "Saved for later" : "Discover games")
        }
        meta={
          <span role="status">
            {loading
              ? "Loading catalogue…"
              : `${filtered.length.toLocaleString()} ${filtered.length === 1 ? "game" : "games"} · ${sorts[sort]?.[0] || "Popular"}`}
          </span>
        }
        aside={
          spotlight && (
            <BigPictureSpotlight
              title={gameName(spotlight)}
              chips={[
                spotlightSource && {
                  icon: spotlightSource.official ? Database : Globe,
                  label: spotlightSource.official
                    ? t("gameCard.official")
                    : spotlightSource.name,
                },
                genresFor(spotlight)[0] && { icon: Tag, label: genresFor(spotlight)[0] },
                spotlight.size && { icon: HardDrive, label: catalogSizeText(spotlight, t) },
                spotlight.online && { icon: Users, label: "Online" },
              ]}
            />
          )
        }
      />
      <div className="bp-browse-controls">
        <BigPictureToolbar label="Search catalogue">
          <SurfaceButton
            className="bp-search-button"
            {...focus("search")}
            onClick={search}
          >
            <Search />
            <span>{query || "Search games"}</span>
          </SurfaceButton>
          {query && (
            <SurfaceButton
              variant="icon"
              {...focus("clear")}
              aria-label="Clear search"
              onClick={clearSearch}
            >
              <X />
            </SurfaceButton>
          )}
        </BigPictureToolbar>
        <BigPictureToolbar label="Browse filters and catalogue actions">
          <div
            className="bp-browse-filters"
            role="group"
            aria-label="Catalogue filters"
          >
            <SurfaceButton
              {...focus("sort")}
              onClick={() => {
                setSort(sorts[sort]?.[1] || "weight");
                setPage(0);
              }}
            >
              <span>{sorts[sort]?.[0]}</span>
              <ChevronDown />
            </SurfaceButton>
            <SurfaceButton
              {...focus("saved")}
              aria-pressed={savedOnly}
              onClick={() => {
                setSavedOnly(!savedOnly);
                setPage(0);
              }}
            >
              <span>{savedOnly ? "Saved for later" : "All games"}</span>
              <ChevronDown />
            </SurfaceButton>
            <SurfaceButton
              {...focus("genre")}
              disabled={!genres.length}
              aria-expanded={genreOpen}
              onClick={() => {
                setGenreOpen(!genreOpen);
                if (!genreOpen) selectFocus(`genre-option-${genreOptions.indexOf(genre)}`);
              }}
            >
              <span>{genre || "All genres"}</span>
              <ChevronDown />
            </SurfaceButton>
          </div>
          <div
            className="bp-browse-catalogue-actions"
            role="group"
            aria-label="Catalogue actions"
          >
            <SurfaceButton
              {...focus("retry")}
              aria-label="Refresh catalogue"
              onClick={retry}
            >
              <RefreshCw /> Reload
            </SurfaceButton>
            <SurfaceButton {...focus("indexes")} onClick={openIndexes}>
              <Database /> Manage indexes
            </SurfaceButton>
          </div>
        </BigPictureToolbar>
      </div>
      {genreOpen && (
        <div
          className="bp-browse-genres"
          role="group"
          aria-label="Genres"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {genreOptions.map((option, index) => (
            <SurfaceButton
              key={option || "all"}
              {...focus(`genre-option-${index}`)}
              aria-pressed={option === genre}
              onClick={() => pickGenre(option)}
            >
              <span>{option || "All genres"}</span>
            </SurfaceButton>
          ))}
        </div>
      )}
      {!loading && !displayed.length && (
        <BigPictureEmptyState title="No games found">
          <p>Clear your search or filters, or retry loading the catalogue.</p>
        </BigPictureEmptyState>
      )}
      <div
        className="bp-grid"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {displayed.map(({ game, key }) => (
          <BrowseGameCard
            key={key}
            game={game}
            focus={focus(`store-${key}`)}
            onOpen={openGame}
          />
        ))}
      </div>
      <div className="bp-pagination bp-browse-more" ref={loadMoreRef}>
        <span role="status">
          {displayed.length.toLocaleString()} of {filtered.length.toLocaleString()} games
        </span>
        {hasMore && (
          <SurfaceButton
            {...focus("next")}
            onClick={() => loadMore(true)}
          >
            Load more
          </SurfaceButton>
        )}
      </div>
    </BigPictureShell>
  );
}
