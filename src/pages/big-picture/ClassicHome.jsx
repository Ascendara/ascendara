import { useState } from "react";
import { Menu, Library, Power } from "lucide-react";
import { BigPictureShell } from "./BigPictureShell";
import { SurfaceButton, SurfaceGame, useSurface } from "./Surface";
import { gameEntries, gameName, libraryGames } from "./surfaceNavigation";
import { useHomeArtwork } from "./useHomeArtwork";
import { loadFolders } from "@/lib/folderManager";
import recentGamesService from "@/services/recentGamesService";

export function ClassicHome({ navigation, active, games, openGame, openMenu, changeView, downloads }) {
  const visible = libraryGames(games, { hiddenFolders: loadFolders().filter(folder => folder.hidden) })
    .filter(game => !game.downloadingData?.downloading && !game.downloadingData?.extracting && !game.downloadingData?.verifying);
  const recent = recentGamesService.getRecentGames().map(item => visible.find(game => gameName(game) === item.game)).filter(Boolean);
  const entries = gameEntries([...new Set([...recent, ...visible])]);
  const [selectedKey, setSelectedKey] = useState(null);
  const selected = entries.find(entry => entry.key === selectedKey) || entries[0];
  const artwork = useHomeArtwork(selected?.game);
  const { root, focus } = useSurface(navigation, [entries.map(({ key }) => `classic-${key}`), ["classic-menu", "classic-library", "classic-power"]], openMenu, active);
  return <BigPictureShell ref={root} title="Home" cinematic className="bp-classic" focus={focus}>
    <div className="bp-classic-art" style={artwork ? { backgroundImage: `url("${artwork}")` } : undefined} aria-hidden="true" />
    <section className="bp-classic-content" aria-label="Your games">
      <div className="bp-classic-heading"><span>HOME</span><h1>{selected ? gameName(selected.game) : "Your next adventure starts here"}</h1>
        {selected && <p>{(Number(selected.game.playTime || 0) / 3600).toFixed(1)} hours played</p>}
      </div>
      {entries.length ? <div className="bp-classic-row">{entries.map(({ game, key }) => {
        const props = focus(`classic-${key}`);
        return <div key={key} className="bp-classic-tile" data-expanded={selected?.key === key}>
          <SurfaceGame game={game} artworkOnly landscapeArtwork={selected?.key === key ? artwork : null} focus={{ ...props, onFocus: () => { props.onFocus(); setSelectedKey(key); } }} onOpen={openGame} />
        </div>;
      })}</div> : <p className="bp-muted">Install a game or add one to your library to see it here.</p>}
      <div className="bp-classic-controls">
        <SurfaceButton {...focus("classic-menu")} onClick={openMenu}><Menu />Menu</SurfaceButton>
        <SurfaceButton {...focus("classic-library")} onClick={() => changeView("library")}><Library />Full library</SurfaceButton>
        <SurfaceButton {...focus("classic-power")} onClick={() => changeView("power")}><Power />Power</SurfaceButton>
        {downloads.length > 0 && <span className="bp-muted">{downloads.length} active download{downloads.length === 1 ? "" : "s"}</span>}
      </div>
    </section>
  </BigPictureShell>;
}
