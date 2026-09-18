import { useState, useRef, useEffect } from "react";
import { Grid } from "lucide-react";

// Library card component
const GameCard = ({ game, index, isSelected, onClick, isGridMode, t }) => {
  const [imageSrc, setImageSrc] = useState(null);
  const cardRef = useRef(null);

  // Determine if it's the "Hero" card
  const isHero = !isGridMode && index === 0 && !game.isSeeMore;
  const gameName = game.game || game.name;

  useEffect(() => {
    if (!isGridMode && isSelected && cardRef.current) {
      const container = document.getElementById("big-picture-scroll-container");
      if (container) {
        if (index < 2) container.scrollTo({ left: 0, behavior: "smooth" });
        else {
          const cardCenter = cardRef.current.offsetLeft + cardRef.current.offsetWidth / 2;
          const targetX = cardCenter - window.innerWidth * 0.55;
          container.scrollTo({ left: targetX, behavior: "smooth" });
        }
      }
    }
    if (isGridMode && isSelected && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [isSelected, index, isGridMode]);

  useEffect(() => {
    if (game.isFake || game.isSeeMore) return;

    let isMounted = true;
    const loadCover = async () => {
      // For "Hero" --> header
      // Others --> grid
      const imageType = isHero ? "header" : "grid";

      try {
        const base64 = await window.electron.ipcRenderer.invoke(
          "get-game-image",
          gameName,
          imageType
        );

        if (isMounted) {
          if (base64) {
            setImageSrc(`data:image/jpeg;base64,${base64}`);
          } else {
            setImageSrc(game.cover || game.image || null);
          }
        }
      } catch (e) {
        // Fallback
        if (isMounted) setImageSrc(game.cover || game.image || null);
      }
    };
    loadCover();
    return () => {
      isMounted = false;
    };
  }, [game, isHero]);

  // Card to Library
  if (game.isSeeMore) {
    return (
      <div
        ref={cardRef}
        onClick={onClick}
        className={`relative flex flex-shrink-0 flex-col items-center justify-center rounded-xl border-4 bg-muted transition-all duration-150 ease-out ${isGridMode ? "aspect-[2/3] w-full" : "aspect-[2/3] h-full"} ${isSelected ? "z-20 scale-105 border-primary shadow-[0_0_30px_hsl(var(--primary)/0.5)]" : "z-10 scale-100 border-transparent opacity-80"}`}
      >
        <Grid
          className={`mb-4 h-12 w-12 ${isSelected ? "text-primary" : "text-muted-foreground"}`}
        />
        <h3 className="px-4 text-center text-xl font-bold">{t("bigPicture.seeMore")}</h3>
      </div>
    );
  }

  return (
    <div
      ref={cardRef}
      onClick={onClick}
      className={`relative flex flex-shrink-0 flex-col justify-end transition-all duration-150 ease-out ${isHero ? "aspect-video" : "aspect-[2/3]"} ${isGridMode ? "w-full" : "h-full"} ${isSelected ? "z-20 scale-105" : "z-10 scale-100 opacity-80"} ${!isGridMode && isSelected ? "mx-5" : !isGridMode ? "mx-2" : ""}`}
    >
      {isSelected && (imageSrc || game.isFake) && (
        <div
          className="absolute inset-0 -z-10 rounded-xl transition-opacity duration-200"
          style={{
            backgroundImage: imageSrc ? `url(${imageSrc})` : "none",
            backgroundColor: imageSrc ? "transparent" : "#334155",
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(25px) saturate(120%) brightness(1.0)",
            transform: "scale(1.02) translateY(5px)",
            opacity: 0.4,
          }}
        />
      )}
      <div
        className={`relative z-10 h-full w-full overflow-hidden rounded-xl border-[3px] bg-muted shadow-2xl transition-all duration-150 ${isSelected ? "border-white/90 shadow-lg ring-0 brightness-110" : "border-transparent brightness-75 hover:brightness-100"}`}
      >
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={gameName}
            className="h-full w-full object-cover"
            style={{ objectPosition: "center top" }}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-muted text-muted-foreground">
            <span className="px-4 text-center text-sm font-bold">{gameName}</span>
          </div>
        )}
      </div>
      {!isGridMode && (
        <div
          className={`pointer-events-none absolute left-1/2 z-30 w-full max-w-full -translate-x-1/2 text-center transition-all duration-150 ease-out ${isSelected ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"} ${isHero ? "-bottom-20" : "-bottom-14"}`}
        >
          <h3
            className={`truncate font-bold tracking-wide text-primary drop-shadow-md ${isHero ? "text-3xl" : "text-xl"} ${gameName.length > 25 ? "text-lg leading-tight" : ""}`}
          >
            {gameName}
          </h3>
          {isHero && (
            <div className="mt-2 flex items-center justify-center gap-2">
              <span className="rounded bg-primary px-2 py-0.5 text-[10px] font-bold tracking-wider text-secondary shadow-lg">
                {t("bigPicture.lastPlayed")}
              </span>
              <span className="text-sm font-medium text-primary drop-shadow-md">
                {game.playTime && game.playTime >= 60
                  ? game.playTime >= 3600
                    ? `${Math.floor(game.playTime / 3600)}h ${t("bigPicture.played")}`
                    : `${Math.floor(game.playTime / 60)}m ${t("bigPicture.played")}`
                  : game.playTime > 0
                    ? `< 1m ${t("bigPicture.played")}`
                    : `0h ${t("bigPicture.played")}`}
              </span>
            </div>
          )}
        </div>
      )}
      {isGridMode && isSelected && (
        <div className="absolute bottom-0 left-0 right-0 z-20 rounded-b-xl bg-gradient-to-t from-black via-black/95 to-transparent p-3 pt-8 text-center">
          <span
            className={`block font-bold leading-tight text-primary ${gameName.length > 30 ? "text-xs" : gameName.length > 20 ? "text-sm" : "text-sm"}`}
          >
            {gameName}
          </span>
        </div>
      )}
    </div>
  );
};

export { GameCard };
