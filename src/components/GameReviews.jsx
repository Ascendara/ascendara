import { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReviewCard from "@/components/ReviewCard";
import { useLanguage } from "@/context/LanguageContext";
import { API_URL } from "@/config/api";

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
  const { t } = useLanguage();
  const [reviews, setReviews] = useState([]);
  const [status, setStatus] = useState("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!gameID) return;
    const controller = new AbortController();
    setStatus("loading");
    setReviews([]);
    onReviewCount({ gameID, count: 0 });
    async function load() {
      try {
        const response = await fetch(
          `${API_URL}/app/v2/gamerating/${encodeURIComponent(gameID)}`,
          { signal: controller.signal }
        );
        if (!response.ok) throw new Error("Failed to fetch reviews");
        const data = await response.json();
        if (controller.signal.aborted) return;
        const rating = Number(data.rating);
        if (Number.isFinite(rating) && rating >= 0 && rating <= 5) onRating(rating);
        const writtenReviews = (Array.isArray(data.reviews) ? data.reviews : [])
          .filter(
            review =>
              review && typeof review.comments === "string" && review.comments.trim()
          )
          .sort(
            (left, right) => Number(isGuestReview(left)) - Number(isGuestReview(right))
          );
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
                name: t(
                  `download.reviews.guestNames.${guestNames[hash % guestNames.length]}`
                ),
                number: 1000 + (hash % 9000),
              })
            : name;
          return (
            <ReviewCard
              key={review.id || index}
              review={review}
              username={username}
              isGuest={isGuest}
            />
          );
        })}
      </div>
    </section>
  );
}
