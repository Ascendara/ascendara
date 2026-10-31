import { useState } from "react";
import ProfileImage, { getInitial } from "@/components/ProfileImage";
import { Heart, HelpCircle, Star } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLanguage } from "@/context/LanguageContext";
import EarnedBadges from "@/components/EarnedBadges";

// "#rrggbb" -> "r g b", the format the theme's color variables use
const toThemeColor = hex =>
  typeof hex === "string" && /^#[0-9a-f]{6}$/i.test(hex)
    ? [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16)).join(" ")
    : null;

const isLight = themeColor => {
  const [red, green, blue] = themeColor.split(" ").map(Number);
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255 > 0.6;
};

// A custom text color is picked against the reviewer's theme, so the card's
// surface follows the text color instead of the viewer's theme. Otherwise dark
// text would land on a dark surface for viewers on dark themes, and vice versa
const surfaceColor = textColor => (isLight(textColor) ? "12 12 18" : "250 250 252");

// Outline color that keeps text and icons legible over a background image:
// the card's own background, or whichever of black/white contrasts with a
// custom text color
const haloColor = textColor => {
  if (!textColor) return "rgb(var(--color-background) / 0.85)";
  return isLight(textColor) ? "rgb(0 0 0 / 0.65)" : "rgb(255 255 255 / 0.8)";
};

// One review on the game page. Also rendered as the live preview in Ascend's
// review card settings, so both always look the same. The like button only
// shows when onLike is passed.
export default function ReviewCard({ review, username, isGuest, liked, onLike }) {
  const { t, language } = useLanguage();
  const [guestInfoOpen, setGuestInfoOpen] = useState(false);
  const photoURL = !isGuest && review.photoURL;
  const badges = (!isGuest && review.badges) || {};
  // The API only sends this for approved backgrounds of active subscribers
  const cardBackground =
    !isGuest &&
    typeof review.cardBackground === "string" &&
    review.cardBackground.startsWith("https://") &&
    review.cardBackground;
  // Aura recolors everything themed with primary (border, glow, gradient,
  // avatar ring); text recolors the name, review and meta text
  const auraColor = !isGuest && toThemeColor(review.cardStyle?.auraColor);
  const textColor = !isGuest && toThemeColor(review.cardStyle?.textColor);
  const imageOpacity = Number(review.cardStyle?.imageOpacity);
  const metaTextClass = textColor
    ? "text-muted-foreground opacity-75"
    : "text-muted-foreground";
  const halo = cardBackground && haloColor(textColor);
  const iconHaloStyle = halo
    ? { filter: `drop-shadow(0 0 1px ${halo}) drop-shadow(0 0 2px ${halo})` }
    : undefined;
  const date = review.createdAt ? new Date(review.createdAt) : null;
  const formattedDate =
    date && !Number.isNaN(date.getTime())
      ? new Intl.DateTimeFormat(language, {
          year: "numeric",
          month: "short",
          day: "numeric",
        }).format(date)
      : null;
  return (
    <article
      className={`relative min-w-0 overflow-hidden rounded-lg p-5 ${
        isGuest
          ? "border-none bg-background/50"
          : `border border-primary/30 bg-gradient-to-br from-primary/15 via-primary/5 to-background/50 shadow-[0_0_24px_-12px_rgb(var(--color-primary))] ${
              textColor && !cardBackground ? "bg-background/85" : ""
            }`
      }`}
      style={{
        ...(auraColor && { "--color-primary": auraColor }),
        ...(textColor && {
          "--color-foreground": textColor,
          "--color-muted-foreground": textColor,
          "--color-background": surfaceColor(textColor),
        }),
        // Inherited by every line of text in the card
        ...(halo && {
          textShadow: `0 0 2px ${halo}, 0 0 6px ${halo}, 0 1px 1px ${halo}`,
        }),
      }}
    >
      {cardBackground ? (
        <>
          <img
            src={cardBackground}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            style={
              imageOpacity >= 10 && imageOpacity <= 100
                ? { opacity: imageOpacity / 100 }
                : undefined
            }
            onError={event => {
              event.currentTarget.style.display = "none";
              event.currentTarget.nextElementSibling.style.display = "none";
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background/85 via-background/60 to-background/20"
          />
        </>
      ) : (
        !isGuest && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-primary/20 blur-2xl"
          />
        )
      )}
      <div className="relative mb-3 flex items-center gap-3">
        <div
          aria-hidden="true"
          className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 font-semibold text-primary ${
            isGuest ? "" : "ring-2 ring-primary/60 ring-offset-2 ring-offset-card"
          }`}
        >
          <ProfileImage
            src={photoURL}
            className="h-full w-full object-cover"
            fallback={getInitial(username)}
          />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="break-words text-sm font-semibold text-foreground">
              {username}
            </p>
            <EarnedBadges user={badges} className="h-4 w-4" style={iconHaloStyle} />
            {isGuest && (
              <TooltipProvider>
                <Tooltip open={guestInfoOpen} onOpenChange={setGuestInfoOpen}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setGuestInfoOpen(true)}
                      className="shrink-0 cursor-help text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={t("download.reviews.guestInfoLabel")}
                    >
                      <HelpCircle className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-secondary">{t("download.reviews.guestInfo")}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          {Number(review.rating) >= 1 && Number(review.rating) <= 5 && (
            <div className="mt-1 flex items-center gap-2">
              <div
                className="flex gap-0.5"
                style={iconHaloStyle}
                role="img"
                aria-label={t("download.reviews.stars", {
                  rating: review.rating,
                })}
              >
                {[1, 2, 3, 4, 5].map(star => (
                  <Star
                    key={star}
                    aria-hidden="true"
                    className={`h-3.5 w-3.5 ${star <= Number(review.rating) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40"}`}
                  />
                ))}
              </div>
              <span className={`text-xs ${metaTextClass}`}>
                {t("download.reviews.rating", { rating: review.rating })}
              </span>
            </div>
          )}
        </div>
      </div>
      <p className="relative whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
        {review.comments}
      </p>
      {(formattedDate || onLike) && (
        <div className="relative mt-3 flex items-center justify-between gap-3">
          {formattedDate ? (
            <time dateTime={date.toISOString()} className={`text-xs ${metaTextClass}`}>
              {formattedDate}
            </time>
          ) : (
            <span />
          )}
          {onLike && (
            <button
              type="button"
              onClick={onLike}
              aria-pressed={!!liked}
              aria-label={t(liked ? "download.reviews.unlike" : "download.reviews.like")}
              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                liked ? "text-red-500" : metaTextClass
              }`}
              style={iconHaloStyle}
            >
              <Heart
                aria-hidden="true"
                className={`h-3.5 w-3.5 transition-transform ${liked ? "scale-110 fill-red-500" : ""}`}
              />
              {Number(review.likeCount) > 0 && <span>{review.likeCount}</span>}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
