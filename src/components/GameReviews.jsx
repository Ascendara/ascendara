import { useEffect, useState } from "react";
import { HelpCircle, MessageSquare, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLanguage } from "@/context/LanguageContext";

const guestNames = [
  "cosmicOtter",
  "pixelPioneer",
  "lunarFox",
  "turboPenguin",
  "starryBadger",
  "neonNoodle",
  "glitchGoblin",
  "rocketRaccoon",
  "cloudCaptain",
  "arcadeAstronaut",
  "questQuokka",
  "mysticMoth",
];

const isGuestReview = review => {
  const name = typeof review.username === "string" ? review.username.trim() : "";
  return (
    !name ||
    review.isAscendAccount === false ||
    (review.isAscendAccount !== true && /^Anonymous(?: \d+)?$/i.test(name))
  );
};

export default function GameReviews({ gameID, onRating, onReviewCount, sectionRef }) {
  const { t, language } = useLanguage();
  const [reviews, setReviews] = useState([]);
  const [status, setStatus] = useState("loading");
  const [attempt, setAttempt] = useState(0);
  const [activeGuestInfo, setActiveGuestInfo] = useState(null);

  useEffect(() => {
    if (!gameID) return;
    const controller = new AbortController();
    setStatus("loading");
    setReviews([]);
    onReviewCount({ gameID, count: 0 });
    async function load() {
      try {
        const response = await fetch(
          `https://api.ascendara.app/app/v2/gamerating/${encodeURIComponent(gameID)}`,
          { signal: controller.signal }
        );
        if (!response.ok) throw new Error("Failed to fetch reviews");
        const data = await response.json();
        if (controller.signal.aborted) return;
        const rating = Number(data.rating);
        if (Number.isFinite(rating) && rating >= 0 && rating <= 5) onRating(rating);
        const writtenReviews = (Array.isArray(data.reviews) ? data.reviews : [])
          .filter(
            review => review && typeof review.comments === "string" && review.comments.trim()
          )
          .sort((left, right) => Number(isGuestReview(left)) - Number(isGuestReview(right)));
        setReviews(writtenReviews);
        onReviewCount({ gameID, count: writtenReviews.length });
        setStatus("ready");
      } catch (error) {
        if (!controller.signal.aborted) setStatus("error");
      }
    }
    load();
    return () => controller.abort();
  }, [gameID, onRating, onReviewCount, attempt]);

  if (!gameID) return null;

  return (
    <section
      ref={sectionRef}
      className="mt-8 w-full rounded-xl border-none bg-card p-6"
      aria-labelledby="game-reviews-title"
    >
      <div className="mb-5">
        <div className="flex items-center gap-3">
          <MessageSquare className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <h2
            id="game-reviews-title"
            className="!m-0 text-xl font-semibold leading-tight text-foreground"
          >
            {t("download.reviews.title")}
          </h2>
          {status === "ready" && (
            <span className="inline-flex h-6 shrink-0 items-center justify-center rounded-full bg-muted px-2.5 text-xs leading-none text-muted-foreground">
              {reviews.length}
            </span>
          )}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("download.reviews.description")}
        </p>
      </div>
      {status === "loading" && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("download.reviews.loading")}
        </p>
      )}
      {status === "error" && (
        <div
          role="status"
          className="flex items-center gap-4 text-sm text-muted-foreground"
        >
          {t("download.reviews.error", { defaultValue: "Reviews could not be loaded." })}
          <Button variant="outline" onClick={() => setAttempt(value => value + 1)}>
            {t("download.reviews.retry", { defaultValue: "Try again" })}
          </Button>
        </div>
      )}
      {status === "ready" && reviews.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t("download.reviews.empty", {
            defaultValue: "No written reviews yet. Share your thoughts after playing!",
          })}
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {reviews.map((review, index) => {
          const name = typeof review.username === "string" ? review.username.trim() : "";
          const seed = String(review.id || review.createdAt || `${gameID}-${index}`);
          const hash = Array.from(seed).reduce(
            (value, character) => (Math.imul(value, 31) + character.charCodeAt(0)) >>> 0,
            0
          );
          const isGuest = isGuestReview(review);
          const username = isGuest
            ? t("download.reviews.guestName", {
                name: t(`download.reviews.guestNames.${guestNames[hash % guestNames.length]}`),
                number: 1000 + (hash % 9000),
              })
            : name;
          const photoURL = !isGuest && review.photoURL;
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
              key={review.id || index}
              className="min-w-0 rounded-lg border-none bg-background/50 p-5"
            >
              <div className="mb-3 flex items-center gap-3">
                <div
                  aria-hidden="true"
                  className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 font-semibold text-primary"
                >
                  {photoURL ? (
                    <>
                      <img
                        src={photoURL}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                        onError={event => {
                          event.currentTarget.style.display = "none";
                          event.currentTarget.nextElementSibling?.classList.remove("hidden");
                        }}
                      />
                      <span className="hidden">{username.slice(0, 1).toUpperCase()}</span>
                    </>
                  ) : (
                    username.slice(0, 1).toUpperCase()
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="break-words text-sm font-semibold text-foreground">
                      {username}
                    </p>
                    {isGuest && (
                      <TooltipProvider>
                        <Tooltip
                          open={activeGuestInfo === index}
                          onOpenChange={open => setActiveGuestInfo(open ? index : null)}
                        >
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => setActiveGuestInfo(index)}
                              className="shrink-0 cursor-help text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              aria-label={t("download.reviews.guestInfoLabel")}
                            >
                              <HelpCircle className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p className="text-secondary">
                              {t("download.reviews.guestInfo")}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                  {Number(review.rating) >= 1 && Number(review.rating) <= 5 && (
                    <div className="mt-1 flex items-center gap-2">
                      <div
                        className="flex gap-0.5"
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
                      <span className="text-xs text-muted-foreground">
                        {t("download.reviews.rating", { rating: review.rating })}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
                {review.comments}
              </p>
              {formattedDate && (
                <time
                  dateTime={date.toISOString()}
                  className="mt-3 block text-xs text-muted-foreground"
                >
                  {formattedDate}
                </time>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
