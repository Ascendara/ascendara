import {
  Search,
  RefreshCw,
  ChevronDown,
  Folder,
  Eye,
  Heart,
  Clock,
  CalendarDays,
} from "lucide-react";
import { useGridColumns } from "./useGridColumns";
import {
  BigPictureShell,
  BigPictureToolbar,
  BigPictureEmptyState,
  BigPictureHero,
  BigPictureSpotlight,
  BigPicturePager,
} from "./BigPictureShell";
import { useEffect, useMemo, useState } from "react";
import { loadFolders } from "@/lib/folderManager";
import recentGamesService from "@/services/library/recentGamesService";
import { SurfaceButton, SurfaceGame, useSurface } from "./Surface";
import { VirtualKeyboard } from "./VirtualKeyboard";
import {
  gameName,
  gameEntries,
  libraryGames,
  readStoredList,
  formatPlaytime,
  formatShortDate,
} from "./surfaceNavigation";
import { useHomeArtwork } from "./useHomeArtwork";

// Portrait box art needs more columns than the landscape grids elsewhere.
const libraryColumns = width =>
  width < 1000 ? 4 : width < 1500 ? 6 : width < 2200 ? 7 : 8;
const ROWS_PER_PAGE = 4;

export function LibrarySurface({
  navigation,
  active,
  games,
  openGame,
  refresh,
  reviewDuplicates,
  pendingCount = 0,
  onBack,
  t,
  controllerType,
  keyboardLayout,
}) {
  const columns = useGridColumns(libraryColumns);
  const pageSize = columns * ROWS_PER_PAGE;
  const [query, setQuery] = useState("");
  const [keyboard, setKeyboard] = useState(false);
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(0);
  const [folder, setFolder] = useState(null);
  const [hidden, setHidden] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const syncLibrary = () => setRevision(value => value + 1);
    window.addEventListener("favorites-updated", syncLibrary);
    window.addEventListener("ascendara:folders-updated", syncLibrary);
    return () => {
      window.removeEventListener("favorites-updated", syncLibrary);
      window.removeEventListener("ascendara:folders-updated", syncLibrary);
    };
  }, []);
  const folders = useMemo(() => loadFolders(), [revision]);
  const favorites = useMemo(() => readStoredList("game-favorites"), [revision]);
  const selectedFolder = folder && folders.find(item => item.game === folder.game);
  const recent = useMemo(() => recentGamesService.getRecentGames(), [games]);
  const filtered = useMemo(
    () =>
      libraryGames(
        games.map(game => ({
          ...game,
          lastPlayed:
            recent.find(item => item.game === gameName(game))?.lastPlayed ||
            game.lastPlayed,
        })),
        {
          query,
          sort,
          folder: selectedFolder,
          favorites: filter === "favorites" ? favorites : undefined,
          hiddenFolders:
            hidden || selectedFolder?.hidden ? [] : folders.filter(item => item.hidden),
        }
      ),
    [games, recent, query, sort, selectedFolder, filter, favorites, hidden, folders]
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const entries = useMemo(() => gameEntries(filtered), [filtered]);
  const displayed = entries.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const visibleFolders = folders.filter(item => hidden || !item.hidden);
  const toolbar = [
    "search",
    "sort",
    "filter",
    "hidden",
    "refresh",
    ...(pendingCount > 0 ? ["duplicates"] : []),
  ];
  const rows = [
    toolbar,
    ["root", ...visibleFolders.map(item => `folder-${item.game}`)],
    ...Array.from({ length: Math.ceil(displayed.length / columns) }, (_, i) =>
      displayed.slice(i * columns, i * columns + columns).map(({ key }) => `game-${key}`)
    ),
    ...(pageCount > 1 ? [["previous", "next"]] : []),
  ];
  const back = () => (folder ? setFolder(null) : onBack());
  const { root, focus, current } = useSurface(navigation, rows, back, active && !keyboard);
  // The spotlight follows the focused game and stays on it while the toolbar is focused.
  const focusedKey = displayed.find(({ key }) => `game-${key}` === current)?.key;
  const [spotlightKey, setSpotlightKey] = useState(null);
  useEffect(() => {
    if (focusedKey) setSpotlightKey(focusedKey);
  }, [focusedKey]);
  const spotlight =
    displayed.find(({ key }) => key === spotlightKey)?.game || displayed[0]?.game;
  const artwork = useHomeArtwork(spotlight);
  const spotlightPlaytime = spotlight && formatPlaytime(spotlight.playTime);
  const spotlightDate = spotlight && formatShortDate(spotlight.lastPlayed);
  // The existing virtual keyboard owns input while visible.
  if (keyboard) navigation.current = () => {};
  const reset = setter => value => {
    setter(value);
    setPage(0);
  };
  return (
    <BigPictureShell ref={root} className="bp-library" title="Library" focus={focus}>
      <BigPictureHero
        backdrop={artwork}
        eyebrow="Library"
        title={folder?.game || (filter === "favorites" ? "Favorites" : "All your games")}
        meta={`${filtered.length} ${filtered.length === 1 ? "game" : "games"}${
          sort !== "name"
            ? ` · ${sort === "recent" ? "Recently played" : "Most played"} first`
            : ""
        }`}
        aside={
          spotlight && (
            <BigPictureSpotlight
              title={gameName(spotlight)}
              chips={[
                { icon: Clock, label: spotlightPlaytime || "Not played yet" },
                spotlightDate && { icon: CalendarDays, label: `Last played ${spotlightDate}` },
              ]}
            />
          )
        }
      />
      <BigPictureToolbar label="Library filters">
        <SurfaceButton
          className="bp-search-button"
          {...focus("search")}
          onClick={() => setKeyboard(true)}
        >
          <Search />
          {query || "Search library"}
        </SurfaceButton>
        <SurfaceButton
          {...focus("sort")}
          onClick={() =>
            reset(setSort)({ name: "recent", recent: "playtime", playtime: "name" }[sort])
          }
        >
          {
            {
              name: "Title A-Z",
              recent: "Recently played",
              playtime: "Most played",
            }[sort]
          }
          <ChevronDown />
        </SurfaceButton>
        <SurfaceButton
          {...focus("filter")}
          aria-pressed={filter === "favorites"}
          onClick={() => reset(setFilter)(filter === "all" ? "favorites" : "all")}
        >
          <Heart />
          {filter === "all" ? "All games" : "Favorites"}
        </SurfaceButton>
        <SurfaceButton
          {...focus("hidden")}
          aria-pressed={hidden}
          onClick={() => reset(setHidden)(!hidden)}
        >
          <Eye />
          Hidden
        </SurfaceButton>
        <SurfaceButton
          variant="icon"
          {...focus("refresh")}
          aria-label="Refresh library"
          onClick={() => {
            refresh();
            setRevision(value => value + 1);
          }}
        >
          <RefreshCw />
        </SurfaceButton>
      </BigPictureToolbar>
      {pendingCount > 0 && (
        <SurfaceButton {...focus("duplicates")} onClick={reviewDuplicates}>
          {`Review unresolved duplicates (${pendingCount})`}
        </SurfaceButton>
      )}
      {visibleFolders.length > 0 && <p className="bp-section-label">Folders</p>}
      <div className="bp-chip-row">
        <SurfaceButton
          {...focus("root")}
          aria-pressed={!folder}
          onClick={() => reset(setFolder)(null)}
        >
          <Folder />
          All games
        </SurfaceButton>
        {visibleFolders.map(item => (
          <SurfaceButton
            key={item.game}
            {...focus(`folder-${item.game}`)}
            aria-pressed={folder?.game === item.game}
            onClick={() => reset(setFolder)(item)}
          >
            <Folder />
            {item.game}
            {item.hidden ? " (hidden)" : ""}
          </SurfaceButton>
        ))}
      </div>
      {!displayed.length && (
        <BigPictureEmptyState title="No games match">
          <p>Change your filters, search again, or refresh your library.</p>
        </BigPictureEmptyState>
      )}
      <div
        className="bp-grid bp-library-grid"
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        }}
      >
        {displayed.map(({ game, key }) => (
          <SurfaceGame
            key={key}
            game={game}
            focus={focus(`game-${key}`)}
            onOpen={openGame}
            subtitle={
              game._hasMultipleInstalls
                ? `${game.isCustom ? "Custom / imported" : "Installed"} · ${game.executable || game._sourceDir || "Unknown location"}`
                : formatPlaytime(game.playTime) || "Ready to play"
            }
          />
        ))}
      </div>
      <BigPicturePager
        page={currentPage}
        count={pageCount}
        setPage={setPage}
        focus={focus}
        label="Library pages"
      />
      {keyboard && (
        <VirtualKeyboard
          value={query}
          onChange={reset(setQuery)}
          onClose={() => setKeyboard(false)}
          onConfirm={() => setKeyboard(false)}
          suggestions={[]}
          layout={keyboardLayout}
          t={t}
          controllerType={controllerType}
        />
      )}
    </BigPictureShell>
  );
}
