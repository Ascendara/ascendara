import {
  Search,
  RefreshCw,
  ChevronDown,
  Folder,
  Eye,
  Heart,
} from "lucide-react";
import { useGridColumns } from "./useGridColumns";
import {
  BigPictureShell,
  BigPictureToolbar,
  BigPictureEmptyState,
} from "./BigPictureShell";
import { useMemo, useState } from "react";
import {
  loadFolders,
  addGameToFolder,
  removeGameFromFolder,
} from "@/lib/folderManager";
import recentGamesService from "@/services/recentGamesService";
import { SurfaceButton, SurfaceGame, useSurface } from "./Surface";
import { VirtualKeyboard } from "./VirtualKeyboard";
import {
  gameName,
  gameEntries,
  libraryGames,
  readStoredList,
} from "./surfaceNavigation";

export function LibrarySurface({
  navigation,
  active,
  games,
  openGame,
  refresh,
  onBack,
  t,
  controllerType,
  keyboardLayout,
}) {
  const columns = useGridColumns();
  const [query, setQuery] = useState("");
  const [keyboard, setKeyboard] = useState(false);
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(0);
  const [folder, setFolder] = useState(null);
  const [hidden, setHidden] = useState(false);
  const [manage, setManage] = useState(null);
  const [revision, setRevision] = useState(0);
  const folders = useMemo(() => loadFolders(), [revision]);
  const favorites = readStoredList("game-favorites");
  const recent = recentGamesService.getRecentGames();
  const filtered = libraryGames(
    games.map((game) => ({
      ...game,
      lastPlayed:
        recent.find((item) => item.game === gameName(game))?.lastPlayed ||
        game.lastPlayed,
    })),
    {
      query,
      sort,
      folder,
      favorites: filter === "favorites" ? favorites : undefined,
      hiddenFolders:
        hidden || folder?.hidden ? [] : folders.filter((item) => item.hidden),
    },
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 24));
  const currentPage = Math.min(page, pageCount - 1);
  const displayed = gameEntries(filtered).slice(
    currentPage * 24,
    (currentPage + 1) * 24,
  );
  const visibleFolders = folders.filter((item) => hidden || !item.hidden);
  const toolbar = ["search", "sort", "filter", "hidden", "refresh"];
  const rows = manage
    ? [
        ["details", "favorite", "done"],
        ...visibleFolders.map((item) => [`folder-${item.game}`]),
      ]
    : [
        toolbar,
        ["root", ...visibleFolders.map((item) => `folder-${item.game}`)],
        ...Array.from(
          { length: Math.ceil(displayed.length / columns) },
          (_, i) =>
            displayed
              .slice(i * columns, i * columns + columns)
              .map(({ key }) => `game-${key}`),
        ),
        ["previous", "next"],
      ];
  const back = () =>
    manage ? setManage(null) : folder ? setFolder(null) : onBack();
  const { root, focus } = useSurface(
    navigation,
    rows,
    back,
    active && !keyboard,
  );
  // The existing virtual keyboard owns input while visible.
  if (keyboard) navigation.current = () => {};
  const reset = (setter) => (value) => {
    setter(value);
    setPage(0);
  };
  const toggleFavorite = () => {
    const name = gameName(manage);
    localStorage.setItem(
      "game-favorites",
      JSON.stringify(
        favorites.includes(name)
          ? favorites.filter((item) => item !== name)
          : [...favorites, name],
      ),
    );
    window.dispatchEvent(new CustomEvent("favorites-updated"));
    setRevision((value) => value + 1);
  };
  return (
    <BigPictureShell
      ref={root}
      className="bp-library"
      title="Library"
      focus={focus}
    >
      {manage ? (
        <>
          <h2>{gameName(manage)}</h2>
          <div className="bp-actions">
            <SurfaceButton
              {...focus("details")}
              onClick={() => openGame(manage)}
            >
              Play / Game details
            </SurfaceButton>
            <SurfaceButton {...focus("favorite")} onClick={toggleFavorite}>
              {favorites.includes(gameName(manage))
                ? "Remove favorite"
                : "Add favorite"}
            </SurfaceButton>
            <SurfaceButton {...focus("done")} onClick={() => setManage(null)}>
              Back to library
            </SurfaceButton>
          </div>
          <h2>Organize in folders</h2>
          {visibleFolders.map((item) => {
            const contains = item.items?.some(
              (game) => gameName(game) === gameName(manage),
            );
            return (
              <div className="bp-actions" key={item.game}>
                <SurfaceButton
                  {...focus(`folder-${item.game}`)}
                  onClick={() => {
                    if (contains)
                      removeGameFromFolder(gameName(manage), item.game);
                    else addGameToFolder(manage, item.game);
                    setRevision((value) => value + 1);
                  }}
                >
                  {contains ? "Remove from" : "Add to"} {item.game}
                </SurfaceButton>
              </div>
            );
          })}
        </>
      ) : (
        <>
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
                reset(setSort)(
                  { name: "recent", recent: "playtime", playtime: "name" }[
                    sort
                  ],
                )
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
              onClick={() =>
                reset(setFilter)(filter === "all" ? "favorites" : "all")
              }
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
                setRevision((value) => value + 1);
              }}
            >
              <RefreshCw />
            </SurfaceButton>
          </BigPictureToolbar>
          <p className="bp-section-label">Folders</p>
          <div className="bp-chip-row">
            <SurfaceButton
              {...focus("root")}
              aria-pressed={!folder}
              onClick={() => reset(setFolder)(null)}
            >
              <Folder />
              All games
            </SurfaceButton>
            {visibleFolders.map((item) => (
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
          <h2>
            {folder?.game || "Your games"} · {filtered.length}
          </h2>
          {!displayed.length && (
            <BigPictureEmptyState title="No games match">
              <p>Change your filters, search again, or refresh your library.</p>
            </BigPictureEmptyState>
          )}
          <div
            className="bp-grid"
            style={{
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            }}
          >
            {displayed.map(({ game, key }) => (
              <SurfaceGame
                key={key}
                game={game}
                focus={focus(`game-${key}`)}
                onClick={() => setManage(game)}
                subtitle={
                  game.playTime
                    ? `${(Number(game.playTime) / 3600).toFixed(1)}h played`
                    : "Installed"
                }
              />
            ))}
          </div>
          <div className="bp-pagination">
            <SurfaceButton
              {...focus("previous")}
              onClick={() => setPage(Math.max(0, currentPage - 1))}
            >
              Previous page
            </SurfaceButton>
            <span className="self-center">
              {currentPage + 1} / {pageCount}
            </span>
            <SurfaceButton
              {...focus("next")}
              onClick={() => setPage(Math.min(pageCount - 1, currentPage + 1))}
            >
              Next page
            </SurfaceButton>
          </div>
        </>
      )}
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
