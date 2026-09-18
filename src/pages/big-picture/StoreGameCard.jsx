import React, { useRef, useState, useEffect } from "react";
import { useGameImage } from "@/hooks/useGameImage";
import { Loader, Download, Star, Gift, Gamepad2 } from "lucide-react";

// Store card component
const StoreGameCard = React.memo(({ game, isSelected, onClick }) => {
  const cardRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const { imageData, loading } = useGameImage(game, {
    quality: isVisible ? "high" : "low",
    priority: isVisible ? "high" : "low",
  });
  const imageUrl = imageData || game.cover || game.image || null;

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );

    if (cardRef.current) observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (isSelected && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [isSelected]);

  useEffect(() => {
    if (isVisible && game.imgID) {
      setIsVisible(false);
      setTimeout(() => setIsVisible(true), 0);
    }
  }, [game.imgID]);

  return (
    <div
      ref={cardRef}
      onClick={onClick}
      className={`relative flex aspect-[2/3] w-full cursor-pointer flex-col justify-end transition-all duration-150 ease-out ${isSelected ? "z-20 scale-105" : "z-10 scale-100 opacity-70"}`}
    >
      <div
        className={`relative z-10 h-full w-full overflow-hidden rounded-xl border-[3px] bg-muted shadow-2xl transition-all duration-150 ${isSelected ? "border-white/90 shadow-lg shadow-primary/20 brightness-110" : "border-transparent brightness-75 hover:brightness-100"}`}
      >
        {isVisible && imageUrl ? (
          <img
            src={imageUrl}
            alt={game.game}
            className="h-full w-full object-cover transition-opacity duration-300"
            style={{ objectPosition: "center top" }}
            loading="lazy"
          />
        ) : loading ? (
          <div className="flex h-full w-full items-center justify-center bg-muted">
            <Loader className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-muted text-secondary">
            <Download className="mb-2 h-8 w-8 opacity-50" />
            <span className="px-4 text-center text-sm font-bold">{game.game}</span>
          </div>
        )}
      </div>
      {/* Top Status Bar */}
      <div className="absolute left-0 right-0 top-0 z-20 flex items-start justify-between p-2">
        {/* Rating badge */}
        {game.rating && game.rating > 0 && (
          <div className="flex items-center gap-1 rounded-full bg-black/70 px-2.5 py-1 backdrop-blur-sm">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
            <span className="text-xs font-bold text-primary">
              {Math.round(game.rating)}
            </span>
          </div>
        )}

        {/* DLC/Online badges */}
        <div className="flex items-center gap-1.5">
          {game.dlc && (
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-secondary/10 backdrop-blur-sm transition-all hover:bg-secondary/20">
              <Gift className="h-3.5 w-3.5 text-secondary" />
            </div>
          )}
          {game.online && (
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-secondary/10 backdrop-blur-sm transition-all hover:bg-secondary/20">
              <Gamepad2 className="h-3.5 w-3.5 text-secondary" />
            </div>
          )}
        </div>
      </div>

      {isSelected && (
        <div className="absolute bottom-0 left-0 right-0 z-20 rounded-b-xl bg-gradient-to-t from-black via-black/95 to-transparent p-4 pt-10 text-center">
          <span
            className={`block font-bold leading-tight text-secondary ${game.game.length > 35 ? "text-xs" : "text-sm"}`}
          >
            {game.game}
          </span>
          {game.size && (
            <span className="mt-1 block text-xs text-slate-400">{game.size}</span>
          )}
        </div>
      )}
    </div>
  );
});

export { StoreGameCard };
