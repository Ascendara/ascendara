import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Award, ChevronDown, EyeOff, Lock, MessageSquare } from "lucide-react";
import AscendGameImage from "@/components/AscendGameImage";
import ReviewCard from "@/components/ReviewCard";
import {
  BadgeCatalogDialog,
  MilestoneEmblem,
  REVIEW_TIERS,
} from "@/components/EarnedBadges";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel } from "@/pages/ascend/primitives";
import { useLanguage } from "@/context/LanguageContext";
import { getMyReviews } from "@/services/firebase/firebaseService";

// Lowest tier first, so progress reads left to right
const TIERS = [...REVIEW_TIERS].reverse();

// How many reviews show before "Show all"
const PREVIEW_COUNT = 4;

// The review rank: the current milestone emblem, a bar toward the next one,
// and the whole ladder of milestones with the locked ones greyed out
function ReviewRank({ user, count }) {
  const { t } = useLanguage();
  const [catalogOpen, setCatalogOpen] = useState(false);
  const current = TIERS.findLast(tier => count >= tier.count);
  const next = TIERS.find(tier => count < tier.count);
  const previousCount = current?.count ?? 0;
  const fraction = next ? (count - previousCount) / (next.count - previousCount) : 1;
  const barColors = (next ?? current).colors;

  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
      <div className="flex items-center gap-4">
        {current ? (
          <MilestoneEmblem
            value={current.count}
            colors={current.colors}
            shape="bubble"
            legendary={current.legendary}
            className="h-14 w-14"
          />
        ) : (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-dashed border-border bg-muted/50">
            <Lock className="h-5 w-5 text-muted-foreground" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate font-semibold">
              {current
                ? t("ascend.badges.reviewMilestone", { count: current.count })
                : t("profile.reviews.unranked")}
            </p>
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              {t("ascend.badges.catalog.reviewProgress", { count })}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full rounded-full"
              style={{ background: `linear-gradient(90deg, ${barColors.join(", ")})` }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(1, Math.max(0, fraction)) * 100}%` }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.15 }}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {next
              ? t("profile.reviews.nextRank", {
                  count: next.count - count,
                  name: t("ascend.badges.reviewMilestone", { count: next.count }),
                })
              : t("ascend.badges.catalog.allUnlocked")}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {TIERS.map(tier => {
            const earned = count >= tier.count;
            return (
              <MilestoneEmblem
                key={tier.count}
                value={tier.count}
                colors={tier.colors}
                shape="bubble"
                legendary={earned && tier.legendary}
                still={!earned}
                className={`h-8 w-8 ${earned ? "" : "opacity-35 grayscale"}`}
              />
            );
          })}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 gap-1.5 text-xs"
          onClick={() => setCatalogOpen(true)}
        >
          <Award className="h-3.5 w-3.5" />
          {t("profile.reviews.allBadges")}
        </Button>
      </div>

      <BadgeCatalogDialog
        open={catalogOpen}
        onOpenChange={setCatalogOpen}
        highlight="reviewMilestone"
        user={{ ...user, reviewCount: count }}
      />
    </div>
  );
}

// One review with the game it's about above the review card, so a custom card
// background and colors show the same as on the game page
function ReviewItem({ review, user }) {
  const { t } = useLanguage();
  const gameName = review.gameName || review.game || "";
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 items-center gap-2.5">
        {gameName && (
          <>
            <div className="h-7 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
              <AscendGameImage name={gameName} />
            </div>
            <p className="min-w-0 flex-1 truncate text-sm font-medium">{gameName}</p>
          </>
        )}
        {/* Only the member sees these as theirs; everyone else sees a guest */}
        {review.anonymous && (
          <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            <EyeOff className="h-3 w-3" />
            {t("profile.reviews.anonymous")}
          </span>
        )}
      </div>
      <ReviewCard
        review={{ photoURL: user?.photoURL, badges: user, ...review }}
        username={user?.displayName}
        isGuest={false}
      />
    </div>
  );
}

// The signed-in member's own written reviews on their Profile page, with their
// review rank on top
export default function ProfileReviews({ user }) {
  const { t } = useLanguage();
  const [reviews, setReviews] = useState([]);
  const [status, setStatus] = useState("loading");
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    getMyReviews().then(result => {
      if (cancelled) return;
      if (result.error) {
        setStatus("error");
        return;
      }
      setReviews(
        result.reviews.filter(
          review => typeof review?.comments === "string" && review.comments.trim()
        )
      );
      setStatus("ready");
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // Milestones count games reviewed, kept on the account, which also covers
  // ratings left without a written review
  const storedCount = Number(user?.reviewCount);
  const count = Number.isFinite(storedCount)
    ? storedCount
    : status === "ready"
      ? reviews.length
      : 0;
  const shown = expanded ? reviews : reviews.slice(0, PREVIEW_COUNT);

  return (
    <Panel className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border/50 px-5 py-4">
        <h2 className="mb-0 flex items-center gap-2 font-semibold">
          <MessageSquare className="h-4 w-4 text-primary" />
          {t("profile.reviews.title")}
        </h2>
        {status === "ready" && reviews.length > 0 && (
          <span className="text-sm text-muted-foreground">{reviews.length}</span>
        )}
      </div>

      <div className="space-y-5 p-5">
        <ReviewRank user={user} count={count} />

        {status === "loading" && (
          <div className="grid gap-4 md:grid-cols-2" aria-hidden="true">
            {[0, 1].map(index => (
              <div key={index} className="space-y-2">
                <Skeleton className="h-7 w-40" />
                <Skeleton className="h-32 w-full rounded-lg" />
              </div>
            ))}
          </div>
        )}

        {status === "error" && (
          <div
            role="status"
            className="flex items-center gap-4 text-sm text-muted-foreground"
          >
            {t("profile.reviews.error")}
            <Button variant="outline" onClick={() => setAttempt(value => value + 1)}>
              {t("profile.reviews.retry")}
            </Button>
          </div>
        )}

        {status === "ready" && reviews.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {t("profile.reviews.empty")}
          </p>
        )}

        {status === "ready" && reviews.length > 0 && (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              {shown.map((review, index) => (
                <ReviewItem
                  key={review.id || `${review.gameID}-${index}`}
                  review={review}
                  user={user}
                />
              ))}
            </div>
            {reviews.length > PREVIEW_COUNT && (
              <Button
                variant="ghost"
                className="w-full gap-1.5"
                onClick={() => setExpanded(value => !value)}
              >
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                />
                {expanded
                  ? t("profile.reviews.showLess")
                  : t("profile.reviews.showAll", { count: reviews.length })}
              </Button>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}
