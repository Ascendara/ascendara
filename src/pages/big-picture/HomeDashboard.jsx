import { BigPictureShell } from "./BigPictureShell";
import { pageFocusIds } from "./PageHeader";
import { useMemo } from "react";
import { Play, ChevronRight, Download, Pause, Gamepad2 } from "lucide-react";
import recentGamesService from "@/services/recentGamesService";
import { loadFolders } from "@/lib/folderManager";
import { SurfaceButton, SurfaceGame, useSurface } from "./Surface";
import {
  gameName,
  gameEntries,
  libraryGames,
  readStoredList,
} from "./surfaceNavigation";
import { useHomeArtwork } from "./useHomeArtwork";

export function HomeDashboard({
  navigation,
  active,
  games,
  downloads,
  queue,
  discover,
  openGame,
  playGame,
  openStore,
  changeView,
  search,
  openMenu,
  pause,
  resume,
  stopping,
  resuming,
}) {
  const visible = useMemo(
    () =>
      libraryGames(games, {
        hiddenFolders: loadFolders().filter((folder) => folder.hidden),
      }).filter(
        (game) =>
          !game.downloadingData?.downloading &&
          !game.downloadingData?.extracting &&
          !game.downloadingData?.verifying,
      ),
    [games],
  );
  const history = recentGamesService.getRecentGames();
  const recent = history
    .map((item) => visible.find((game) => gameName(game) === item.game))
    .filter(Boolean);
  const saved = readStoredList("play-later-games").slice(0, 12);
  const hero = recent[0] || visible[0] || discover[0];
  const installed = hero && visible.includes(hero);
  const image = useHomeArtwork(hero);
  const sections = [
    {
      id: "library",
      title: "Your Library",
      games: [
        ...recent,
        ...visible.filter((game) => !recent.includes(game)),
      ].slice(0, 12),
      open: openGame,
      destination: "library",
    },
    {
      id: "discover",
      title: "Discover",
      games: discover.slice(0, 12),
      open: openStore,
      destination: "store",
    },
    {
      id: "saved",
      title: "Saved for Later",
      games: saved,
      open: openStore,
      destination: "store",
    },
  ]
    .filter((section) => section.games.length)
    .map((section) => ({ ...section, entries: gameEntries(section.games) }));
  const download = downloads[0];
  const data = download?.downloadingData || {};
  const canPause =
    !data.error &&
    !data.extracting &&
    !data.verifying &&
    (data.downloading || data.stopped);
  const rows = [
    pageFocusIds,
    ["hero", ...(hero ? ["details"] : [])],
    ...(download || queue.length
      ? [["downloads", ...(canPause ? ["pause"] : [])]]
      : []),
    ...sections.flatMap((section) => [
      [`all-${section.id}`],
      section.entries.map(({ key }) => `${section.id}-${key}`),
    ]),
  ];
  const { root, focus } = useSurface(
    navigation,
    rows,
    openMenu,
    active,
    "hero",
  );
  const lastPlayed = history.find(
    (item) => item.game === (hero && gameName(hero)),
  )?.lastPlayed;
  const hours = Number(hero?.playTime) / 3600;
  const lastDate =
    lastPlayed && !Number.isNaN(Date.parse(lastPlayed))
      ? new Date(lastPlayed).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        })
      : null;
  const progress = Math.min(
    100,
    Math.max(0, parseFloat(data.progressCompleted) || 0),
  );
  const status = data.error
    ? "Needs attention"
    : data.stopped
      ? "Paused"
      : data.extracting
        ? "Extracting"
        : data.verifying
          ? "Verifying"
          : "Downloading";
  const busy =
    download && (stopping.has(download.game) || resuming.has(download.game));
  return (
    <BigPictureShell
      ref={root}
      title="Home"
      cinematic
      focus={focus}
      navigation={{
        view: "carousel",
        changeView,
        search,
        downloadCount: downloads.length + queue.length,
      }}
    >
      <div className="bp-home-hero">
        {image ? (
          <img
            key={image}
            className="bp-home-art"
            src={image}
            alt=""
            onError={(event) => {
              event.currentTarget.style.visibility = "hidden";
            }}
          />
        ) : (
          <Gamepad2 className="bp-home-placeholder" aria-hidden="true" />
        )}
        <div className="bp-home-shade" />
        <div className="bp-home-hero-content">
          <p className="bp-home-eyebrow">
            {recent.length
              ? "Continue playing"
              : installed
                ? "From your library"
                : hero
                  ? "Discover"
                  : "Make room for your next favorite"}
          </p>
          <h1>{hero ? gameName(hero) : "Build your library"}</h1>
          {(hours > 0 || lastDate) && (
            <p className="bp-home-meta">
              {[
                hours > 0 ? `${hours.toFixed(1)}h played` : null,
                lastDate ? `Last played ${lastDate}` : null,
              ]
                .filter(Boolean)
                .join(" ? ")}
            </p>
          )}
          <div className="bp-home-hero-actions">
            <SurfaceButton
              className="bp-home-play"
              {...focus("hero")}
              onClick={() =>
                installed
                  ? playGame(hero)
                  : hero
                    ? openStore(hero)
                    : changeView("store")
              }
            >
              <Play size={20} fill="currentColor" />
              {installed ? "Play" : hero ? "View game" : "Browse games"}
            </SurfaceButton>
            {hero && (
              <SurfaceButton
                className="bp-home-secondary"
                {...focus("details")}
                onClick={() =>
                  installed ? openGame(hero) : changeView("store")
                }
              >
                {installed ? "View game" : "Browse"}
                <ChevronRight size={18} />
              </SurfaceButton>
            )}
          </div>
        </div>
      </div>
      {(download || queue.length > 0) && (
        <div className="bp-home-download">
          <SurfaceButton
            {...focus("downloads")}
            className="bp-home-download-info"
            onClick={() => changeView("downloads")}
          >
            <Download />
            <span>
              <strong>
                {download
                  ? `${status} ? ${download.game}`
                  : `${queue.length} games queued`}
              </strong>
              {download && (
                <span className="bp-home-meta">
                  {progress.toFixed(0)}%
                  {data.progressDownloadSpeeds
                    ? ` ? ${data.progressDownloadSpeeds}`
                    : ""}
                  {queue.length ? ` ? ${queue.length} queued` : ""}
                </span>
              )}
            </span>
            <ChevronRight />
          </SurfaceButton>
          {download && (
            <div
              className="bp-home-progress"
              role="progressbar"
              aria-label="Download progress"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: `${progress}%` }} />
            </div>
          )}
          {canPause && (
            <SurfaceButton
              {...focus("pause")}
              onClick={() => {
                if (!busy) (data.stopped ? resume : pause)(download);
              }}
              aria-disabled={busy}
            >
              {data.stopped ? <Play size={18} /> : <Pause size={18} />}
              {busy ? "Please wait" : data.stopped ? "Resume" : "Pause"}
            </SurfaceButton>
          )}
        </div>
      )}
      {sections.map((section) => (
        <section key={section.id} className="bp-home-section">
          <header>
            <h2>{section.title}</h2>
            <SurfaceButton
              {...focus(`all-${section.id}`)}
              onClick={() => changeView(section.destination)}
            >
              View all
              <ChevronRight size={18} />
            </SurfaceButton>
          </header>
          <div className="bp-row">
            {section.entries.map(({ game, key }) => (
              <SurfaceGame
                key={key}
                game={game}
                artworkOnly={section.id === "library"}
                focus={focus(`${section.id}-${key}`)}
                onClick={() => section.open(game)}
              />
            ))}
          </div>
        </section>
      ))}
    </BigPictureShell>
  );
}
