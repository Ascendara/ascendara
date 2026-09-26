import { AlertTriangle, ChevronLeft, FolderOpen, Gamepad2, Play, RefreshCw, Settings2, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SurfaceButton } from "./Surface";

const fileName = path => path?.split(/[\\/]/).pop() || "";

export function RetroGameDetail({
  game,
  platform,
  profile,
  running,
  busy,
  scanning,
  focus,
  onBack,
  onFavorite,
  onSetup,
  onRescan,
  onReveal,
  onPlay,
}) {
  const { t } = useTranslation();
  const adapter = profile?.adapter || platform?.adapter;
  const configured = !!profile?.executable && (adapter !== "retroarch" || !!profile.core);
  const missing = game.missing || !!game.missingDependencies?.length;
  const discs = game.files || [];
  const playable = configured && !missing && !running && !busy && !scanning;
  return <>
    <div className="bp-retro-heading">
      <div>
        <p className="bp-section-label">{platform?.name || game.platform}</p>
        <h1>{game.title}</h1>
        <p className="bp-muted">{[game.year, game.genres, game.developer].filter(Boolean).join(" · ")}</p>
      </div>
      <SurfaceButton {...focus("detail-back")} onClick={onBack}><ChevronLeft /> Back to library</SurfaceButton>
    </div>
    <div className="bp-retro-detail">
      <div className="bp-retro-cover">
        {game.cover ? <img src={game.cover} alt="" /> : <Gamepad2 aria-hidden="true" />}
      </div>
      <div className="bp-retro-detail-body">
        <p className="bp-retro-description">{game.description || t("retro.gameDetails.noDescription")}</p>
        <div className="bp-retro-facts">
          <span>{Math.floor((game.playTime || 0) / 60)} min played</span>
          <span>{game.launchCount || 0} launches</span>
          {game.lastPlayed && <span>Last played {new Date(game.lastPlayed).toLocaleDateString()}</span>}
        </div>
        <div className="bp-retro-emulator">
          <Settings2 aria-hidden="true" />
          <div><strong>{configured ? adapter : "Emulator setup needed"}</strong><small>{profile?.executable || "Choose an emulator before playing"}</small></div>
        </div>
        {(missing || !configured || !discs.length) && <p className="bp-retro-warning" role="status"><AlertTriangle aria-hidden="true" />
          {missing ? "A ROM or referenced track is missing. Restore the file or update this console’s ROM folder, then rescan." : !discs.length ? "No game file was found. Rescan this console." : "Set up an emulator and ROM folder for this console before playing."}
        </p>}
        {running && <p className="bp-retro-running">This game is running</p>}
        <div className="bp-actions">
          <SurfaceButton {...focus("favorite")} disabled={busy} aria-pressed={!!game.favorite} onClick={onFavorite}>
            <Star /> {game.favorite ? "Favorited" : "Add favorite"}
          </SurfaceButton>
          <SurfaceButton {...focus("detail-setup")} onClick={onSetup}><Settings2 /> Console setup</SurfaceButton>
          <SurfaceButton {...focus("detail-rescan")} disabled={busy || scanning || !profile?.romFolders?.length} onClick={onRescan}><RefreshCw /> Rescan ROMs</SurfaceButton>
          <SurfaceButton {...focus("reveal")} disabled={busy || missing} onClick={onReveal}><FolderOpen /> Show file</SurfaceButton>
        </div>
        <div className="bp-retro-play">
          <h2>{discs.length > 1 ? "Choose a disc" : "Play game"}</h2>
          <div className="bp-actions">
            {discs.map((file, index) => <SurfaceButton key={file} variant="primary" {...(playable ? focus("disc-" + index) : {})} disabled={!playable} onClick={() => onPlay(index)}>
              <Play /> {discs.length > 1 ? "Play disc " + (index + 1) : "Play"}
              {discs.length > 1 && <small>{fileName(file)}</small>}
            </SurfaceButton>)}
          </div>
        </div>
      </div>
    </div>
  </>;
}
