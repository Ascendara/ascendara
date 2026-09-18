import React from "react";
import { useGameImage } from "@/hooks/useGameImage";
import { Loader, Gamepad2, Star, HardDrive, Gift, Download } from "lucide-react";

// Floating Context Menu - Shows near selected game after 1 second
const FloatingContextMenu = ({ game, position, t }) => {
  const [logoSrc, setLogoSrc] = React.useState(null);

  // Use the same image hook as the game cards for consistency
  const { imageData, loading } = useGameImage(game, {
    quality: "high",
    priority: "high",
  });
  const imageUrl = imageData || game.cover || game.image || null;

  React.useEffect(() => {
    if (!game) return;

    const gameName = game.game || game.name;
    let isMounted = true;

    const loadLogo = async () => {
      try {
        // Try to load logo
        const logoBase64 = await window.electron.ipcRenderer.invoke(
          "get-game-image",
          gameName,
          "logo"
        );
        if (isMounted && logoBase64) {
          setLogoSrc(`data:image/png;base64,${logoBase64}`);
        }
      } catch (err) {
        console.log("No logo available");
      }
    };

    loadLogo();
    return () => {
      isMounted = false;
    };
  }, [game]);

  if (!game || !position) return null;

  return (
    <div
      className="pointer-events-none absolute z-50 animate-in fade-in slide-in-from-bottom-4 duration-300"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      <div className="w-[420px] overflow-hidden rounded-2xl border-2 border-white/20 bg-gradient-to-br from-black via-black to-black/95 shadow-[0_20px_60px_rgba(0,0,0,0.9)] backdrop-blur-xl">
        {/* Header Image / Cover */}
        <div className="relative h-[180px] overflow-hidden bg-gradient-to-br from-primary/10 to-muted/20">
          {imageUrl ? (
            <>
              <img
                src={imageUrl}
                alt={game.game}
                className="h-full w-full object-cover opacity-60"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
            </>
          ) : loading ? (
            <div className="flex h-full w-full items-center justify-center">
              <Loader className="h-12 w-12 animate-spin text-primary" />
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Gamepad2 className="h-16 w-16 text-primary/30" />
            </div>
          )}

          {/* Logo Overlay */}
          {logoSrc && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <img
                src={logoSrc}
                alt={`${game.game} logo`}
                className="max-h-[120px] max-w-[90%] object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]"
              />
            </div>
          )}

          {/* Title if no logo */}
          {!logoSrc && (
            <div className="absolute inset-0 flex items-end p-6">
              <h2 className="text-2xl font-bold leading-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
                {game.game}
              </h2>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="space-y-4 p-6">
          {/* Title (if logo is shown) */}
          {logoSrc && <h3 className="text-lg font-bold text-white">{game.game}</h3>}

          {/* Stats Row */}
          <div className="flex items-center gap-4">
            {game.rating && game.rating > 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-500/20 to-amber-600/10 px-3 py-2">
                <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
                <div className="flex flex-col">
                  <span className="text-xs font-semibold uppercase tracking-wider text-amber-200/70">
                    {t("bigPicture.contextMenu.rating")}
                  </span>
                  <span className="text-lg font-bold text-white">
                    {Math.round(game.rating)}
                  </span>
                </div>
              </div>
            )}
            {game.size && (
              <div className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary/20 to-primary/10 px-3 py-2">
                <HardDrive className="h-5 w-5 text-primary" />
                <div className="flex flex-col">
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary/70">
                    {t("bigPicture.contextMenu.size")}
                  </span>
                  <span className="text-sm font-bold text-white">{game.size}</span>
                </div>
              </div>
            )}
          </div>

          {/* Category Tags */}
          {game.category && game.category.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {game.category.slice(0, 4).map((cat, idx) => (
                <div
                  key={idx}
                  className="rounded-md border border-white/20 bg-white/5 px-2.5 py-1 backdrop-blur-sm"
                >
                  <span className="text-xs font-semibold text-white">{cat}</span>
                </div>
              ))}
              {game.category.length > 4 && (
                <div className="rounded-md border border-white/20 bg-white/5 px-2.5 py-1 backdrop-blur-sm">
                  <span className="text-xs font-semibold text-white">
                    +{game.category.length - 4}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Features Tags */}
          {(game.dlc || game.online) && (
            <div className="flex flex-wrap gap-2">
              {game.dlc && (
                <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2">
                  <Gift className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-white">
                    {t("bigPicture.contextMenu.dlcIncluded")}
                  </span>
                </div>
              )}
              {game.online && (
                <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2">
                  <Gamepad2 className="h-4 w-4 text-green-400" />
                  <span className="text-sm font-semibold text-white">
                    {t("bigPicture.contextMenu.onlineMultiplayer")}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Action Button */}
          <div className="mt-4 flex items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-primary to-primary/80 py-3 shadow-lg shadow-primary/30">
            <Download className="h-5 w-5 text-white" />
            <span className="text-sm font-bold uppercase tracking-wide text-white">
              {t("bigPicture.contextMenu.pressToDownload")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export { FloatingContextMenu };
