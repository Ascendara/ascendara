import { useEffect, useState } from "react";
import { MessageSquare, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/LanguageContext";

export default function GameReviews({ gameID, onRating }) {
  const { t } = useLanguage();
  const [reviews, setReviews] = useState([]);
  const [status, setStatus] = useState("loading");
  const [visible, setVisible] = useState(6);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!gameID) return;
    const controller = new AbortController();
    setStatus("loading");
    setReviews([]);
    setVisible(6);
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
        setReviews(
          (Array.isArray(data.reviews) ? data.reviews : []).filter(
            review =>
              review && typeof review.comments === "string" && review.comments.trim()
          )
        );
        setStatus("ready");
      } catch (error) {
        if (!controller.signal.aborted) setStatus("error");
      }
    }
    load();
    return () => controller.abort();
  }, [gameID, onRating, attempt]);

  if (!gameID) return null;

  return (
    <section
      className="mt-8 w-full rounded-xl border border-border bg-card p-6"
      aria-labelledby="game-reviews-title"
    >
      <div className="mb-5 flex items-center gap-3">
        <MessageSquare className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <h2
          id="game-reviews-title"
          className="!m-0 text-xl font-semibold leading-tight text-foreground"
        >
          {t("download.reviews.title", { defaultValue: "Community reviews" })}
        </h2>
        {status === "ready" && (
          <span className="inline-flex h-6 shrink-0 items-center justify-center rounded-full bg-muted px-2.5 text-xs leading-none text-muted-foreground">
            {reviews.length}
          </span>
        )}
      </div>
      {status === "loading" && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("download.reviews.loading", { defaultValue: "Loading reviews…" })}
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
        {reviews.slice(0, visible).map((review, index) => (
          <article
            key={review.id || index}
            className="min-w-0 rounded-lg border-none bg-background/50 p-5"
          >
            <div className="mb-3 flex items-center gap-3">
              <div
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary"
              >
                {(typeof review.username === "string" ? review.username : "A")
                  .slice(0, 1)
                  .toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-foreground">
                  {typeof review.username === "string"
                    ? review.username
                    : t("download.reviews.anonymous", { defaultValue: "Anonymous" })}
                </p>
                {Number(review.rating) >= 1 && Number(review.rating) <= 5 && (
                  <div
                    className="mt-1 flex gap-0.5"
                    role="img"
                    aria-label={t("download.reviews.stars", {
                      defaultValue: "{{rating}} out of 5 stars",
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
                )}
              </div>
            </div>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
              {review.comments}
            </p>
          </article>
        ))}
      </div>
      {visible < reviews.length && (
        <Button
          className="mt-5"
          variant="outline"
          onClick={() => setVisible(value => value + 6)}
        >
          {t("download.reviews.showMore", { defaultValue: "Show more reviews" })}
        </Button>
      )}
    </section>
  );
}
