import { Gamepad2, RefreshCw, Settings2 } from "lucide-react";
import { useGridColumns } from "./useGridColumns";
import {
  BigPictureShell,
  BigPictureToolbar,
  BigPictureEmptyState,
} from "./BigPictureShell";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { retroCall } from "@/services/retroService";
import useRetroAccess from "@/hooks/useRetroAccess";
import { SurfaceButton, SurfaceGame, useSurface } from "./Surface";
import { RetroConsoleSetup, getRetroAdapterChoices } from "./RetroConsoleSetup";
import { RetroGameDetail } from "./RetroGameDetail";
import expanded from "../../../electron/modules/retro/expanded-catalogue.json";

const premiumPlatforms = new Set(expanded.platforms.map(item => item.id));

export function RetroSurface({ navigation, active, onBack }) {
  const columns = useGridColumns();
  const access = useRetroAccess();
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [platform, setPlatform] = useState(null);
  const [favorites, setFavorites] = useState(false);
  const [showAllConsoles, setShowAllConsoles] = useState(false);
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [setupId, setSetupId] = useState(null);
  const [draft, setDraft] = useState(null);
  const refresh = useCallback(async () => {
    try {
      setSnapshot(await retroCall("getState"));
      setError("");
    } catch (failure) {
      setError(failure.message);
    }
  }, []);
  useEffect(() => {
    refresh();
    return window.electron?.retro?.onChanged(event => {
      if (event.job) setSnapshot(previous => previous ? { ...previous, job: event.job } : previous);
      else refresh();
      if (event.error) toast.error(event.error);
      if (event.message) toast.success(event.message);
      if (event.warnings?.length) toast.warning(event.warnings.join("\n"));
    });
  }, [refresh]);
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
  const platforms = snapshot?.platforms || [];
  const profiles = snapshot?.profiles || {};
  const selected = snapshot?.games?.find(game => game.id === selectedId);
  const selectedPlatform = platforms.find(item => item.id === selected?.platform);
  const setupPlatform = platforms.find(item => item.id === setupId);
  const selectedProfile = selected ? profiles[selected.platform] : null;
  const adapter = selectedProfile?.adapter || selectedPlatform?.adapter;
  const configured = !!selectedProfile?.executable && (adapter !== "retroarch" || !!selectedProfile.core);
  const missing = selected?.missing || !!selected?.missingDependencies?.length;
  const running = !!snapshot?.running?.includes(selectedId);
  const discs = selected?.files || [];
  const playable = selected && configured && !missing && !running && !busy && !snapshot?.job;
  const visiblePlatforms = showAllConsoles ? platforms : platforms.slice(0, 12);
  const setupChoices = setupPlatform ? getRetroAdapterChoices(setupPlatform, profiles[setupId], access.allowed) : [];

  const openSetup = id => {
    const item = platforms.find(candidate => candidate.id === id);
    if (!item) return;
    if (premiumPlatforms.has(id) && !access.allowed) {
      toast.info("This console requires Ascend access.");
      return;
    }
    setDraft({ adapter: item.adapter, executable: "", core: "", arguments: "", romFolders: [], saveFolder: "", fullscreen: true, ...profiles[id] });
    setSetupId(id);
  };
  const pick = async (kind, update) => {
    try {
      const path = await retroCall("pick", kind);
      if (path) update(path);
    } catch (failure) {
      toast.error(failure.message);
    }
  };
  const saveSetup = scan => perform(async () => {
    await retroCall("saveProfile", setupId, draft);
    if (scan) await retroCall("scan", setupId);
    setSetupId(null);
    toast.success(scan ? "Setup saved. Scanning ROM folders…" : "Console setup saved");
  });
  const back = () => {
    if (setupId) setSetupId(null);
    else if (selectedId) setSelectedId(null);
    else onBack();
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
  const rows = setupPlatform ? [
    ["setup-back"],
    setupChoices.map(item => `adapter-${item.id}`),
    ["pick-emulator", "emulator-website", ...(draft?.adapter === "retroarch" ? ["pick-core"] : [])],
    ...(draft?.adapter === "custom" ? [["custom-args"]] : []),
    ["add-folder", ...(draft?.romFolders || []).map((_, index) => `remove-folder-${index}`)],
    ["pick-save-folder", "fullscreen"],
    ["save-setup", "save-scan"],
  ] : selected
    ? [["detail-back", "favorite", "detail-setup", "detail-rescan", "reveal"], ...(playable ? [discs.map((_, i) => `disc-${i}`)] : [])]
    : [
        ["refresh", "favorites", "all"],
        ...Array.from({ length: Math.ceil(visiblePlatforms.length / 4) }, (_, index) =>
          visiblePlatforms.slice(index * 4, index * 4 + 4).flatMap(item => [`platform-${item.id}`, `configure-${item.id}`])
        ),
        ...(platforms.length > 12 ? [["more-consoles"]] : []),
        ...Array.from(
          { length: Math.ceil(displayed.length / columns) },
          (_, i) =>
            displayed
              .slice(i * columns, i * columns + columns)
              .map((game) => game.id),
        ),
        ...(pages > 1 ? [["previous", "next"]] : []),
      ];
  const { root, focus } = useSurface(
    navigation,
    rows,
    back,
    active,
  );
  return (
    <BigPictureShell
      ref={root}
      className="bp-retro"
      title="Retro"
      focus={focus}
    >
      {setupPlatform && draft ? (
        <RetroConsoleSetup
          platform={setupPlatform}
          draft={draft}
          choices={setupChoices}
          focus={focus}
          busy={busy}
          taskBusy={!!snapshot?.job}
          onChange={setDraft}
          onPick={pick}
          onWebsite={() => perform(() => retroCall("website", setupId))}
          onSave={saveSetup}
          onBack={back}
        />
      ) : selected ? (
        <RetroGameDetail
          game={selected}
          platform={selectedPlatform}
          profile={selectedProfile}
          running={running}
          busy={busy}
          scanning={!!snapshot?.job}
          focus={focus}
          onBack={back}
          onFavorite={() => perform(() => retroCall("updateGame", selected.id, { favorite: !selected.favorite }))}
          onSetup={() => openSetup(selected.platform)}
          onRescan={() => perform(() => retroCall("scan", selected.platform))}
          onReveal={() => perform(() => retroCall("reveal", selected.id))}
          onPlay={index => perform(() => retroCall("launch", selected.id, index))}
        />
      ) : (
        <>
          <div className="bp-retro-heading">
            <div>
              <p className="bp-section-label">YOUR COLLECTION</p>
              <h1>Retro</h1>
              <p className="bp-muted">Choose a console, set up its emulator, and play your games.</p>
            </div>
          </div>
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
            {snapshot?.job && <span className="bp-retro-job">Scanning {snapshot.job.platform || "Retro"}… {snapshot.job.inspected || 0} files checked</span>}
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
          <div className="bp-retro-section-title"><h2>Consoles</h2><span>{platforms.length} available</span></div>
          <div className="bp-retro-consoles">
            {visiblePlatforms.map(item => {
              const count = snapshot.games.filter(game => game.platform === item.id).length;
              const itemProfile = profiles[item.id];
              const itemAdapter = itemProfile?.adapter || item.adapter;
              const ready = !!itemProfile?.executable && !!itemProfile?.romFolders?.length && (itemAdapter !== "retroarch" || !!itemProfile.core);
              const locked = premiumPlatforms.has(item.id) && !access.allowed;
              return <div key={item.id} className="bp-retro-console-card" data-active={platform === item.id}>
                <SurfaceButton {...focus("platform-" + item.id)} aria-pressed={platform === item.id}
                  onClick={() => { setPlatform(item.id); setPage(0); }}>
                  <Gamepad2 aria-hidden="true" />
                  <strong>{item.name}</strong>
                  <small>{count} {count === 1 ? "game" : "games"}</small>
                </SurfaceButton>
                <SurfaceButton variant="ghost" {...focus("configure-" + item.id)} onClick={() => openSetup(item.id)}>
                  <Settings2 aria-hidden="true" /> {locked ? "Ascend" : ready ? "Configured" : "Set up"}
                </SurfaceButton>
              </div>;
            })}
          </div>
          {platforms.length > 12 && <SurfaceButton {...focus("more-consoles")} onClick={() => setShowAllConsoles(!showAllConsoles)}>
            {showAllConsoles ? "Show fewer consoles" : "Show all " + platforms.length + " consoles"}
          </SurfaceButton>}
          <div className="bp-retro-section-title">
            <h2>{platforms.find(item => item.id === platform)?.name || "Recently played & library"}</h2>
            <span>{games.length} {games.length === 1 ? "game" : "games"}</span>
          </div>
          {!displayed.length && snapshot && (
            <BigPictureEmptyState title="No Retro games here">
              <p>Select Set up on a console to choose an emulator and add ROM folders.</p>
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
                onClick={() => setSelectedId(game.id)}
                subtitle={game.missing ? "File missing" : game.favorite ? "Favorite" : platforms.find(item => item.id === game.platform)?.name}
              />
            ))}
          </div>
          {pages > 1 && <div className="bp-pagination">
            <SurfaceButton
              {...focus("previous")}
              disabled={currentPage === 0}
              onClick={() => setPage(Math.max(0, currentPage - 1))}
            >
              Previous
            </SurfaceButton>
            <span>
              {currentPage + 1} / {pages}
            </span>
            <SurfaceButton
              {...focus("next")}
              disabled={currentPage === pages - 1}
              onClick={() => setPage(Math.min(pages - 1, currentPage + 1))}
            >
              Next
            </SurfaceButton>
          </div>}
        </>
      )}
    </BigPictureShell>
  );
}
