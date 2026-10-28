import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Heart, MessageSquare, Palette, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ReviewCard from "@/components/ReviewCard";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { getLikedReviews, likeReview } from "@/services/firebase/firebaseService";
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

// Shown when someone without an Ascend account, or whose trial or
// subscription has ended, tries to like a review
function LikeUpsellDialog({ t, review, username, expired, onClose }) {
  const navigate = useNavigate();
  const perks = [
    { icon: Heart, key: "like" },
    { icon: Palette, key: "cards" },
    ...(expired ? [] : [{ icon: Sparkles, key: "trial" }]),
  ];
  return (
    <Dialog open={!!review} onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Heart className="h-5 w-5 fill-red-500 text-red-500" aria-hidden="true" />
            {t("download.reviews.likeUpsell.title")}
          </DialogTitle>
          <DialogDescription>
            {t(
              expired
                ? "download.reviews.likeUpsell.expiredDescription"
                : "download.reviews.likeUpsell.description"
            )}
          </DialogDescription>
        </DialogHeader>
        {review && (
          <div className="pointer-events-none select-none">
            <ReviewCard review={review} username={username} isGuest={false} />
          </div>
        )}
        <ul className="space-y-2">
          {perks.map(({ icon: Icon, key }) => (
            <li key={key} className="flex items-center gap-2 text-sm text-foreground">
              <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              {t(`download.reviews.likeUpsell.perks.${key}`)}
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" className="text-primary" onClick={onClose}>
            {t("download.reviews.likeUpsell.later")}
          </Button>
          <Button className="text-secondary" onClick={() => navigate("/ascend")}>
            {t(
              expired
                ? "download.reviews.likeUpsell.expiredCta"
                : "download.reviews.likeUpsell.cta"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function GameReviews({ gameID, onRating, onReviewCount, sectionRef }) {
  const { t } = useLanguage();
  const { isAuthenticated } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [status, setStatus] = useState("loading");
  const [attempt, setAttempt] = useState(0);
  const [likedIds, setLikedIds] = useState(() => new Set());
  const [upsell, setUpsell] = useState(null);

  useEffect(() => {
    setLikedIds(new Set());
    if (!gameID || !isAuthenticated) return;
    let cancelled = false;
    getLikedReviews(gameID).then(result => {
      if (!cancelled && !result.error) setLikedIds(new Set(result.liked));
    });
    return () => {
      cancelled = true;
    };
  }, [gameID, isAuthenticated]);

  const setLikeCount = (reviewId, likeCount) =>
    setReviews(current =>
      current.map(review => (review.id === reviewId ? { ...review, likeCount } : review))
    );

  const setLiked = (reviewId, liked) =>
    setLikedIds(current => {
      const next = new Set(current);
      if (liked) next.add(reviewId);
      else next.delete(reviewId);
      return next;
    });

  const handleLike = async (review, username) => {
    if (!isAuthenticated) {
      setUpsell({ review, username });
      return;
    }
    const liked = !likedIds.has(review.id);
    const previousCount = Number(review.likeCount) || 0;
    setLiked(review.id, liked);
    setLikeCount(review.id, Math.max(0, previousCount + (liked ? 1 : -1)));
    const result = await likeReview(gameID, review.id, liked);
    if (result.error) {
      setLiked(review.id, !liked);
      setLikeCount(review.id, previousCount);
      if (result.code === "ASCEND_REQUIRED") {
        setUpsell({ review, username, expired: true });
        return;
      }
      toast.error(t("download.reviews.likeFailed"), { description: result.error });
      return;
    }
    setLiked(review.id, result.liked);
    setLikeCount(review.id, result.likeCount);
  };

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
              liked={likedIds.has(review.id)}
              onLike={
                // Only member reviews can be liked: guests have nobody to credit
                review.id && review.isAscendAccount === true && !isGuest
                  ? () => handleLike(review, username)
                  : undefined
              }
            />
          );
        })}
      </div>
      <LikeUpsellDialog
        t={t}
        review={upsell?.review}
        username={upsell?.username}
        expired={upsell?.expired}
        onClose={() => setUpsell(null)}
      />
    </section>
  );
}
