import { Gamepad2, RefreshCw } from "lucide-react";
import { useGridColumns } from "./useGridColumns";
import {
  BigPictureShell,
  BigPictureToolbar,
  BigPictureEmptyState,
} from "./BigPictureShell";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { retroCall } from "@/services/retroService";
import useRetroAccess from "@/hooks/useRetroAccess";
import { SurfaceButton, SurfaceGame, useSurface } from "./Surface";

export function RetroSurface({ navigation, active, onBack }) {
  const columns = useGridColumns();
  const access = useRetroAccess();
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [platform, setPlatform] = useState(null);
  const [favorites, setFavorites] = useState(false);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(null);
  const refresh = async () => {
    setError("");
    try {
      setSnapshot(await retroCall("getState"));
    } catch (failure) {
      setError(failure.message);
    }
  };
  useEffect(() => {
    refresh();
  }, []);
  const perform = async (callback) => {
    if (busy) return;
    setBusy(true);
    try {
      await callback();
      await refresh();
    } catch (failure) {
      toast.error(failure.message);
    } finally {
      setBusy(false);
    }
  };
  const games = (snapshot?.games || [])
    .filter(
      (game) =>
        (!platform || game.platform === platform) &&
        (!favorites || game.favorite),
    )
    .sort(
      (a, b) =>
        (Date.parse(b.lastPlayed) || 0) - (Date.parse(a.lastPlayed) || 0) ||
        a.title.localeCompare(b.title),
    );
  const pages = Math.max(1, Math.ceil(games.length / 24));
  const currentPage = Math.min(page, pages - 1);
  const displayed = games.slice(currentPage * 24, (currentPage + 1) * 24);
  const platforms = snapshot?.platforms || [];
  const discs = selected?.discs?.length ? selected.discs : [null];
  const rows = selected
    ? [["back", "favorite"], discs.map((_, i) => `disc-${i}`)]
    : [
        ["refresh", "favorites", "all"],
        platforms.map((item) => `platform-${item.id}`),
        ...Array.from(
          { length: Math.ceil(displayed.length / columns) },
          (_, i) =>
            displayed
              .slice(i * columns, i * columns + columns)
              .map((game) => game.id),
        ),
        ["previous", "next"],
      ];
  const { root, focus } = useSurface(
    navigation,
    rows,
    () => (selected ? setSelected(null) : onBack()),
    active,
  );
  return (
    <BigPictureShell
      ref={root}
      className="bp-retro"
      title="Retro"
      focus={focus}
    >
      {selected && <h2>{selected.title}</h2>}
      {selected ? (
        <>
          <p className="bp-muted">
            {platforms.find((item) => item.id === selected.platform)?.name} ·{" "}
            {selected.year || ""} {selected.missing ? "· ROM file missing" : ""}
          </p>
          <div className="bp-actions">
            <SurfaceButton {...focus("back")} onClick={() => setSelected(null)}>
              Back to Retro
            </SurfaceButton>
            <SurfaceButton
              {...focus("favorite")}
              onClick={() =>
                perform(async () => {
                  await retroCall("updateGame", selected.id, {
                    favorite: !selected.favorite,
                  });
                  setSelected({ ...selected, favorite: !selected.favorite });
                })
              }
            >
              {selected.favorite ? "Remove favorite" : "Add favorite"}
            </SurfaceButton>
          </div>
          <div className="bp-actions">
            {discs.map((_, i) => (
              <SurfaceButton
                key={i}
                {...focus(`disc-${i}`)}
                onClick={() => {
                  if (selected.missing) {
                    toast.error(
                      "ROM file missing. Rescan this platform after restoring the file.",
                    );
                    return;
                  }
                  if (snapshot?.running?.includes(selected.id)) {
                    toast.info("This game is already running.");
                    return;
                  }
                  perform(() => retroCall("launch", selected.id, i));
                }}
              >
                {busy
                  ? "Please wait…"
                  : discs.length > 1
                    ? `Play disc ${i + 1}`
                    : "Play"}
              </SurfaceButton>
            ))}
          </div>
        </>
      ) : (
        <>
          <BigPictureToolbar label="Retro filters">
            <SurfaceButton
              variant="icon"
              {...focus("refresh")}
              aria-label="Refresh Retro"
              onClick={refresh}
            >
              <RefreshCw />
            </SurfaceButton>
            <SurfaceButton
              {...focus("favorites")}
              aria-pressed={favorites}
              onClick={() => {
                setFavorites(!favorites);
                setPage(0);
              }}
            >
              {favorites ? "Favorites" : "All games"}
            </SurfaceButton>
            <SurfaceButton
              {...focus("all")}
              onClick={() => {
                setPlatform(null);
                setPage(0);
              }}
            >
              All platforms
            </SurfaceButton>
          </BigPictureToolbar>
          {error && <p role="alert">{error}</p>}
          {!snapshot && !error && <p>Loading Retro library…</p>}
          {access.error && (
            <p role="status">
              Ascend access could not be checked. {access.error}
            </p>
          )}
          {!access.loading && !access.allowed && (
            <p className="bp-muted">
              Expanded platforms require Ascend. Your standard platforms remain
              available.
            </p>
          )}
          <p className="bp-section-label">Platforms</p>
          <div className="bp-platforms">
            {platforms.map((item) => (
              <SurfaceButton
                key={item.id}
                {...focus(`platform-${item.id}`)}
                aria-pressed={platform === item.id}
                onClick={() => {
                  setPlatform(item.id);
                  setPage(0);
                }}
              >
                <Gamepad2 />
                <strong>{item.name}</strong>
                <small>
                  {
                    snapshot.games.filter((game) => game.platform === item.id)
                      .length
                  }{" "}
                  games
                </small>
              </SurfaceButton>
            ))}
          </div>
          <h2>
            {platforms.find((item) => item.id === platform)?.name ||
              "Recently played & library"}
          </h2>
          {!displayed.length && snapshot && (
            <BigPictureEmptyState title="No Retro games here">
              <p>
                Configure an emulator and ROM folders in desktop Retro to import
                your collection.
              </p>
            </BigPictureEmptyState>
          )}
          <div
            className="bp-grid"
            style={{
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            }}
          >
            {displayed.map((game) => (
              <SurfaceGame
                key={game.id}
                game={game}
                focus={focus(game.id)}
                onClick={() => setSelected(game)}
                subtitle={game.favorite ? "Favorite" : game.platform}
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
        </>
      )}
    </BigPictureShell>
  );
}
