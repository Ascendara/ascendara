import { Search, X, RefreshCw, ChevronDown, Database } from "lucide-react";
import { useGridColumns } from "./useGridColumns";
import {
  BigPictureShell,
  BigPictureToolbar,
  BigPictureEmptyState,
} from "./BigPictureShell";
import { useState } from "react";
import { SurfaceButton, useSurface } from "./Surface";
import { BrowseGameCard } from "./BrowseGameCard";
import { gameName, gameEntries, readStoredList } from "./surfaceNavigation";
import "./browse-controls.css";

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
  const columns = useGridColumns();
  const [page, setPage] = useState(0);
  const [savedOnly, setSavedOnly] = useState(false);
  const [genre, setGenre] = useState("");
  const [lastQuery, setLastQuery] = useState(query);
  if (query !== lastQuery) {
    setLastQuery(query);
    setPage(0);
  }
  const genresFor = (game) =>
    Array.isArray(game.genre || game.genres)
      ? (game.genre || game.genres)
          .map((item) => (typeof item === "string" ? item : item.name))
          .filter(Boolean)
      : typeof (game.genre || game.genres) === "string"
        ? (game.genre || game.genres).split(",").map((item) => item.trim())
        : [];
  const genres = [...new Set(games.flatMap(genresFor))].sort();
  const saved = new Set(readStoredList("play-later-games").map(gameName));
  const filtered = games.filter(
    (game) =>
      (!savedOnly || saved.has(gameName(game))) &&
      (!genre || genresFor(game).includes(genre)),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 24));
  const currentPage = Math.min(page, pages - 1);
  const displayed = gameEntries(filtered).slice(
    currentPage * 24,
    (currentPage + 1) * 24,
  );
  const rows = [
    ["search", ...(query ? ["clear"] : [])],
    ...(columns === 3
      ? [
          ["sort", "saved", "genre"],
          ["retry", "indexes"],
        ]
      : [["sort", "saved", "genre", "retry", "indexes"]]),
    ...Array.from({ length: Math.ceil(displayed.length / columns) }, (_, i) =>
      displayed
        .slice(i * columns, i * columns + columns)
        .map(({ key }) => `store-${key}`),
    ),
    ["previous", "next"],
  ];
  const { root, focus } = useSurface(navigation, rows, onBack, active);
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
              onClick={() => {
                const index = genres.indexOf(genre);
                setGenre(genres[index + 1] || "");
                setPage(0);
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
      <p className="bp-muted" role="status">
        {loading
          ? "Loading catalogue…"
          : `${filtered.length.toLocaleString()} games`}
      </p>
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
            onClick={() => openGame(game, 0)}
          />
        ))}
      </div>
      <div className="bp-pagination">
        <SurfaceButton
          {...focus("previous")}
          onClick={() => setPage(Math.max(0, currentPage - 1))}
        >
          Previous
        </SurfaceButton>
        <span>
          {currentPage + 1} / {pages}
        </span>
        <SurfaceButton
          {...focus("next")}
          onClick={() => setPage(Math.min(pages - 1, currentPage + 1))}
        >
          Next
        </SurfaceButton>
      </div>
    </BigPictureShell>
  );
}
