import { memo, useEffect, useId, useRef, useState } from "react";
import {
  ArrowUpRight,
  Gamepad2,
  Gift,
  HardDrive,
  Headset,
  Star,
  Users,
} from "lucide-react";
import { useImageLoader } from "@/hooks/useImageLoader";
import ratingQueueService from "@/services/ratingQueueService";
import { gameName } from "./surfaceNavigation";
import "./browse-game-card.css";

const validRating = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

export const BrowseGameCard = memo(function BrowseGameCard({
  game,
  focus,
  onClick,
}) {
  const ref = useRef(null);
  const id = useId();
  const name = gameName(game);
  const [visible, setVisible] = useState(false);
  const [failedImages, setFailedImages] = useState(() => new Set());
  const [queuedRating, setQueuedRating] = useState(null);
  const suppliedArtwork = [game.cover, game.image].find(
    (url) => typeof url === "string" && url.trim() && !failedImages.has(url),
  );
  const { cachedImage } = useImageLoader(game.imgID, {
    enabled: visible && !suppliedArtwork,
    quality: "high",
    priority: "normal",
    fallbackGameName: !game.imgID ? name : null,
    fallbackSlot: "card",
  });
  const artwork =
    suppliedArtwork ||
    (cachedImage && !failedImages.has(cachedImage) ? cachedImage : null);
  const suppliedRating = validRating(game.rating);
  const rating =
    suppliedRating ||
    (queuedRating?.id === game.gameID ? queuedRating.value : null) ||
    (game.gameID
      ? validRating(ratingQueueService.getCachedRating(game.gameID))
      : null);
  const rawGenres = game.category || game.genre || game.genres || [];
  const genres = [
    ...new Set(
      (Array.isArray(rawGenres)
        ? rawGenres
        : typeof rawGenres === "string"
          ? rawGenres.split(",")
          : []
      )
        .map((genre) =>
          typeof genre === "string" ? genre.trim() : genre?.name,
        )
        .filter((genre) => typeof genre === "string" && genre),
    ),
  ].slice(0, 2);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setVisible(true);
        observer.disconnect();
      },
      { rootMargin: "250px" },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || suppliedRating || !game.gameID) return;
    let active = true;
    const unsubscribe = ratingQueueService.subscribe(game.gameID, (value) => {
      const next = validRating(value);
      if (active && next) setQueuedRating({ id: game.gameID, value: next });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [visible, suppliedRating, game.gameID]);

  return (
    <button
      ref={ref}
      type="button"
      {...focus}
      onClick={onClick}
      className="bp-game bp-browse-game"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-details${rating !== null ? ` ${id}-rating` : ""}`}
    >
      <div className="bp-browse-artwork" data-missing-art={!artwork}>
        {artwork ? (
          <img
            src={artwork}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() =>
              setFailedImages((previous) => new Set([...previous, artwork]))
            }
          />
        ) : (
          <div className="bp-browse-artwork-placeholder">
            <Gamepad2 aria-hidden="true" />
            <span>{name}</span>
          </div>
        )}
        <div className="bp-browse-artwork-shade" />
        {rating !== null && (
          <span
            className="bp-browse-rating"
            id={`${id}-rating`}
            aria-label={`Community rating ${Math.round(rating)}`}
          >
            <Star aria-hidden="true" />
            <span>{Math.round(rating)}</span>
          </span>
        )}
        <span className="bp-browse-open" aria-hidden="true">
          <ArrowUpRight />
        </span>
      </div>
      <div className="bp-browse-game-info">
        <strong id={`${id}-title`} className="bp-browse-game-title">
          {name}
        </strong>
        <div id={`${id}-details`} className="bp-browse-game-details">
          <span className="bp-browse-game-genres">{genres.join(" · ")}</span>
          <div className="bp-browse-game-features">
            {!!game.online && (
              <span className="bp-browse-feature bp-browse-feature--online">
                <Users aria-hidden="true" />
                Online
              </span>
            )}
            {!!game.dlc && (
              <span className="bp-browse-feature bp-browse-feature--dlc">
                <Gift aria-hidden="true" />
                DLC
              </span>
            )}
            {!!(game.isVr || game.vr) && (
              <span className="bp-browse-feature bp-browse-feature--vr">
                <Headset aria-hidden="true" />
                VR
              </span>
            )}
          </div>
          <div className="bp-browse-game-footer">
            <span>
              {game.size && (
                <>
                  <HardDrive aria-hidden="true" />
                  {game.size}
                </>
              )}
            </span>
            <span className="bp-browse-game-link">
              View game
              <ArrowUpRight aria-hidden="true" />
            </span>
          </div>
        </div>
      </div>
    </button>
  );
});
