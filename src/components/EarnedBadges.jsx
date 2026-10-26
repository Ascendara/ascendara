import { useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { BadgeCheck, Bug, Crown, Hammer, Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";

// Badges the API grants for activity: having a reported bug marked fixed.
// Shown next to owner/contributor/verified. Reviewing games earns the review
// milestones below instead.
const EARNED_BADGES = [
  { field: "bugCatcher", icon: Bug, colors: ["#4ade80", "#16a34a"] },
];

// Review milestones, by number of different games reviewed. 40 is the top
// tier and glows like a legendary level.
const REVIEW_TIERS = [
  { count: 40, colors: ["#fde047", "#d97706"], legendary: true },
  { count: 30, colors: ["#c084fc", "#7e22ce"] },
  { count: 20, colors: ["#e879f9", "#a21caf"] },
  { count: 15, colors: ["#f472b6", "#be185d"] },
  { count: 10, colors: ["#fb7185", "#e11d48"] },
  { count: 5, colors: ["#f9a8d4", "#db2777"] },
];

// Every 10 levels earns the next tier, mirroring the tier colors and effects
// of the level card. Level 100 and up stays legendary.
const LEVEL_TIERS = [
  { level: 100, tier: "legendary", colors: ["#fde047", "#d97706"] },
  { level: 90, tier: "cosmic", colors: ["#a78bfa", "#7c3aed"] },
  { level: 80, tier: "aurora", colors: ["#e879f9", "#c026d3"] },
  { level: 70, tier: "nebula", colors: ["#818cf8", "#4f46e5"] },
  { level: 60, tier: "ocean", colors: ["#38bdf8", "#2563eb"] },
  { level: 50, tier: "crystal", colors: ["#2dd4bf", "#0891b2"] },
  { level: 40, tier: "nature", colors: ["#34d399", "#059669"] },
  { level: 30, tier: "solar", colors: ["#a3e635", "#ca8a04"] },
  { level: 20, tier: "fire", colors: ["#fbbf24", "#ea580c"] },
  { level: 10, tier: "energy", colors: ["#fb7185", "#e11d48"] },
];

// How ornate a level tier's emblem is, from 0 at level 10 to 9 at level 100
const levelRank = tier => LEVEL_TIERS.length - 1 - LEVEL_TIERS.indexOf(tier);

const LEGENDARY_GLOW = [
  "drop-shadow(0 0 1px rgba(250, 204, 21, 0.6))",
  "drop-shadow(0 0 3px rgba(250, 204, 21, 0.95))",
];

const HEXAGON = "12,1.5 21.5,6.75 21.5,17.25 12,22.5 2.5,17.25 2.5,6.75";
const HEXAGON_INNER = "12,3.6 19.7,7.85 19.7,16.15 12,20.4 4.3,16.15 4.3,7.85";

const toPath = points => `M${points.split(" ").join("L")}Z`;

// Outlines for milestone emblems: hexagons for levels, speech bubbles for
// reviews, so the two numbers never read as the same badge. centerY is the
// middle of the shape's body, which for the bubble leaves out its tail.
const MILESTONE_SHAPES = {
  hexagon: { outline: toPath(HEXAGON), inner: toPath(HEXAGON_INNER), centerY: 12 },
  bubble: {
    outline:
      "M6 2.5H18A4 4 0 0 1 22 6.5V14.5A4 4 0 0 1 18 18.5H10.5L6 22V18.5A4 4 0 0 1 2 14.5V6.5A4 4 0 0 1 6 2.5Z",
    inner:
      "M6.4 4.3H17.6A2.6 2.6 0 0 1 20.2 6.9V14.1A2.6 2.6 0 0 1 17.6 16.7H6.4A2.6 2.6 0 0 1 3.8 14.1V6.9A2.6 2.6 0 0 1 6.4 4.3Z",
    centerY: 10.5,
  },
};

// A centered baseline puts digits a little low, since they have no
// descenders, so the number is raised by a share of its font size
const DIGIT_LIFT = 0.036;

// The icon covers 52% of the emblem, centered in its 24-unit box
const ICON_SIZE = 12.5;
const ICON_OFFSET = (24 - ICON_SIZE) / 2;
// The crown's solid base makes it look low when centered by its box
const ICON_LIFT = new Map([[Crown, 0.3]]);

// A hexagon emblem with the badge icon on a gradient fill. The size classes
// passed in size the whole emblem, so it lines up with the other name icons.
function BadgeEmblem({ icon: Icon, colors, className, style }) {
  const gradientId = `badge-${useId().replace(/[^a-zA-Z0-9-_]/g, "")}`;
  return (
    <span
      className={`${className} relative inline-flex shrink-0 items-center justify-center`}
      style={style}
    >
      <svg viewBox="0 0 24 24" className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={colors[0]} />
            <stop offset="100%" stopColor={colors[1]} />
          </linearGradient>
        </defs>
        <polygon
          points={HEXAGON}
          fill={`url(#${gradientId})`}
          stroke={`url(#${gradientId})`}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <polygon
          points={HEXAGON_INNER}
          fill="none"
          stroke="white"
          strokeOpacity="0.35"
          strokeWidth="0.75"
          strokeLinejoin="round"
        />
        {/* Drawn inside the emblem's own coordinates, so the icon stays on the
            hexagon's center at sizes where a separate element would snap to
            a different pixel */}
        <Icon
          x={ICON_OFFSET}
          y={ICON_OFFSET - (ICON_LIFT.get(Icon) ?? 0)}
          size={ICON_SIZE}
          color="white"
          strokeWidth={2.75}
        />
      </svg>
    </span>
  );
}

// Level emblems grow more ornate with each tier, every tier keeping what the
// ones below it added. Rank 0 is level 10, rank 9 is level 100:
//   1 facets  2 rim  3 studs  4 wings  5 crest  6 rays  7 aurora  8 sparkles  9 crown
// Ornaments may spill a little past the emblem's box, about as far as the gap
// between badges, so the number keeps its full size.
const HEX_VERTICES = HEXAGON.split(" ").map(point => point.split(",").map(Number));
const scaleFromCenter = ([x, y], k) => [12 + (x - 12) * k, 12 + (y - 12) * k];
const RIM_POINTS = HEX_VERTICES.map(vertex => scaleFromCenter(vertex, 1.2));
const RIM = RIM_POINTS.map(point => point.join(",")).join(" ");
const FACET_LIGHT = "12,12 2.5,6.75 12,1.5 21.5,6.75";
const FACET_DARK = "12,12 21.5,17.25 12,22.5 2.5,17.25";
const WING_RIGHT = "21,8.6 26.8,6.2 25.2,12 26.8,17.8 21,15.4";
const WING_LEFT = "3,8.6 -2.8,6.2 -1.2,12 -2.8,17.8 3,15.4";
const CREST =
  "M12 -3.6L12.9 -1.1L15.4 -0.6L12.9 -0.1L12 2.4L11.1 -0.1L8.6 -0.6L11.1 -1.1Z";
const CROWN = "M7.6 2.8L6.6 -2.4L9.8 0.2L12 -3.8L14.2 0.2L17.4 -2.4L16.4 2.8Z";
const SPARKLE = "M0 -1.8L0.45 -0.45L1.8 0L0.45 0.45L0 1.8L-0.45 0.45L-1.8 0L-0.45 -0.45Z";
const RAYS = Array.from({ length: 12 }, (_, index) => {
  const angle = (index * 30 * Math.PI) / 180;
  const spread = (5 * Math.PI) / 180;
  const at = (radius, offset) =>
    `${12 + radius * Math.cos(angle + offset)},${12 + radius * Math.sin(angle + offset)}`;
  return `${at(10.5, -spread)} ${at(15.8, 0)} ${at(10.5, spread)}`;
});
const SPIN_ORIGIN = { transformBox: "view-box", transformOrigin: "12px 12px" };

// A milestone emblem: the milestone number on the tier's shape, with a light
// sweep across it, a pop when it appears, and a pulsing glow at the top tier.
// Level emblems add the ornaments above by rank. All motion is skipped when
// the system asks for reduced motion, and for still emblems like the locked
// ones in the catalog.
function MilestoneEmblem({
  value,
  colors,
  shape,
  legendary,
  rank = 0,
  still,
  className,
  style,
}) {
  const id = useId().replace(/[^a-zA-Z0-9-_]/g, "");
  const reduceMotion = useReducedMotion();
  const animated = !reduceMotion && !still;
  const glow = legendary && animated;
  const { outline, inner, centerY } = MILESTONE_SHAPES[shape];
  const fontSize = String(value).length > 2 ? 7.5 : 9.5;
  const fill = `url(#milestone-fill-${id})`;

  return (
    <motion.span
      className={`${className} relative inline-flex shrink-0 items-center justify-center`}
      style={
        legendary && !animated
          ? {
              ...style,
              filter: [LEGENDARY_GLOW[0], style?.filter].filter(Boolean).join(" "),
            }
          : style
      }
      animate={
        glow
          ? {
              filter: [...LEGENDARY_GLOW, LEGENDARY_GLOW[0]].map(shadow =>
                [shadow, style?.filter].filter(Boolean).join(" ")
              ),
            }
          : undefined
      }
      transition={
        glow ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" } : undefined
      }
    >
      <svg
        viewBox="0 0 24 24"
        className="absolute inset-0 h-full w-full overflow-visible"
        aria-hidden
      >
        <defs>
          <linearGradient id={`milestone-fill-${id}`} x1="0" y1="0" x2="1" y2="1">
            {/* Aurora tiers and up slowly trade their two colors back and forth */}
            <motion.stop
              offset="0%"
              stopColor={colors[0]}
              animate={
                animated && rank >= 7
                  ? { stopColor: [colors[0], colors[1], colors[0]] }
                  : undefined
              }
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.stop
              offset="100%"
              stopColor={colors[1]}
              animate={
                animated && rank >= 7
                  ? { stopColor: [colors[1], colors[0], colors[1]] }
                  : undefined
              }
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />
          </linearGradient>
          <linearGradient id={`milestone-crown-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
          <linearGradient id={`milestone-shine-${id}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="50%" stopColor="white" stopOpacity="0.75" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <clipPath id={`milestone-clip-${id}`}>
            <path d={outline} />
          </clipPath>
        </defs>
        {rank >= 6 && (
          <motion.g
            style={SPIN_ORIGIN}
            animate={animated ? { rotate: 360 } : undefined}
            transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
          >
            {RAYS.map(points => (
              <polygon key={points} points={points} fill={colors[0]} opacity="0.55" />
            ))}
          </motion.g>
        )}
        {rank >= 4 &&
          [WING_LEFT, WING_RIGHT].map(points => (
            <polygon
              key={points}
              points={points}
              fill={fill}
              stroke={colors[1]}
              strokeWidth="0.6"
              strokeLinejoin="round"
            />
          ))}
        {rank >= 2 && (
          <polygon
            points={RIM}
            fill="none"
            stroke={colors[1]}
            strokeWidth="1"
            strokeLinejoin="round"
            opacity="0.85"
          />
        )}
        <path
          d={outline}
          fill={fill}
          stroke={fill}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {rank >= 1 && (
          <>
            <polygon points={FACET_LIGHT} fill="white" opacity="0.16" />
            <polygon points={FACET_DARK} fill="black" opacity="0.12" />
          </>
        )}
        {rank >= 3 &&
          RIM_POINTS.map(([x, y]) => (
            <circle
              key={`${x},${y}`}
              cx={x}
              cy={y}
              r="1.05"
              fill="white"
              stroke={colors[1]}
              strokeWidth="0.5"
            />
          ))}
        <path
          d={inner}
          fill="none"
          stroke="white"
          strokeOpacity="0.35"
          strokeWidth="0.75"
          strokeLinejoin="round"
        />
        {animated && (
          <g clipPath={`url(#milestone-clip-${id})`}>
            <g transform="skewX(-20)">
              <motion.rect
                y="-4"
                width="7"
                height="32"
                fill={`url(#milestone-shine-${id})`}
                initial={{ x: -12 }}
                animate={{ x: [-12, 36] }}
                transition={{
                  duration: 1.1,
                  ease: "easeInOut",
                  repeat: Infinity,
                  // Higher tiers catch the light more often
                  repeatDelay: 3.2 - rank * 0.22,
                  delay: 0.6,
                }}
              />
            </g>
          </g>
        )}
        <motion.text
          x="12"
          y={centerY - fontSize * DIGIT_LIFT}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={fontSize}
          fontWeight="800"
          fill="white"
          stroke={colors[1]}
          strokeWidth="1.4"
          strokeLinejoin="round"
          paintOrder="stroke"
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
          initial={animated ? { scale: 0.4, opacity: 0 } : false}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 420, damping: 16, delay: 0.1 }}
        >
          {value}
        </motion.text>
        {rank >= 9 ? (
          <path
            d={CROWN}
            fill={`url(#milestone-crown-${id})`}
            stroke="#b45309"
            strokeWidth="0.55"
            strokeLinejoin="round"
          />
        ) : (
          rank >= 5 && (
            <path
              d={CREST}
              fill="white"
              stroke={colors[1]}
              strokeWidth="0.55"
              strokeLinejoin="round"
            />
          )
        )}
        {rank >= 8 && (
          <motion.g
            style={SPIN_ORIGIN}
            animate={animated ? { rotate: -360 } : undefined}
            transition={{ duration: 9, repeat: Infinity, ease: "linear" }}
          >
            {[0, 120, 240].map(angle => {
              const radians = ((angle - 90) * Math.PI) / 180;
              return (
                <path
                  key={angle}
                  d={SPARKLE}
                  transform={`translate(${12 + 14.6 * Math.cos(radians)} ${12 + 14.6 * Math.sin(radians)})`}
                  fill="white"
                  stroke={colors[0]}
                  strokeWidth="0.35"
                />
              );
            })}
          </motion.g>
        )}
      </svg>
    </motion.span>
  );
}

// Badges given out by hand, with the colors their emblems share everywhere
const OWNER_BADGE = { field: "owner", icon: Crown, colors: ["#facc15", "#ca8a04"] };
const CONTRIBUTOR_BADGE = {
  field: "contributor",
  icon: Hammer,
  colors: ["#fb923c", "#ea580c"],
};
const VERIFIED_BADGE = {
  field: "verified",
  icon: BadgeCheck,
  colors: ["#60a5fa", "#2563eb"],
};

// The special badges the catalog lists. Owner stays out since nobody can earn it.
const CATALOG_BADGES = [VERIFIED_BADGE, CONTRIBUTOR_BADGE, ...EARNED_BADGES];

// Which catalog entry a clicked badge points at
const CATALOG_SECTIONS = {
  reviewMilestone: "reviews",
  levelMilestone: "levels",
};

// Viewers without Ascend get a small pitch in the catalog. Verified, owner and
// contributor accounts have Ascend without a subscription.
const viewerHasAscend = userData =>
  Boolean(
    userData?.ascendSubscription?.active ||
    userData?.verified ||
    userData?.owner ||
    userData?.contributor
  );

// Lists hand over the level at the top level; raw user docs keep it in profileStats
const getLevel = user => Number(user?.level ?? user?.profileStats?.level) || 0;

const listContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

const listItem = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0 },
};

// A ladder of milestone tiles. When the user's progress is known, earned
// tiles are tinted with their tier color, the current one is ringed, and a bar
// tracks the way to the next milestone.
function MilestoneLadder({
  steps,
  shape,
  progress,
  progressLabel,
  highlighted,
  title,
  description,
  columns,
}) {
  const { t } = useLanguage();
  const known = progress !== null;
  const current = known ? steps.findLast(step => progress >= step.value) : undefined;
  const next = known ? steps.find(step => progress < step.value) : undefined;
  const previousValue = current?.value ?? 0;
  const fraction = next
    ? Math.min(1, Math.max(0, (progress - previousValue) / (next.value - previousValue)))
    : 1;

  return (
    <motion.section
      variants={listItem}
      className={`rounded-xl border p-4 transition-colors ${highlighted ? "border-primary/50 bg-primary/5" : "border-border/60 bg-muted/30"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {known && (
          <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
            {progressLabel}
          </span>
        )}
      </div>

      {known && (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full rounded-full"
              style={{
                background: `linear-gradient(90deg, ${(next ?? current).colors.join(", ")})`,
              }}
              initial={{ width: 0 }}
              animate={{ width: `${fraction * 100}%` }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {next
              ? t("ascend.badges.catalog.nextMilestone", {
                  remaining: next.value - progress,
                  name: next.label,
                })
              : t("ascend.badges.catalog.allUnlocked")}
          </p>
        </div>
      )}

      <div className={`mt-3 grid gap-2 ${columns}`}>
        {steps.map(step => {
          const earned = !known || progress >= step.value;
          const isCurrent = step === current;
          return (
            <div
              key={step.value}
              className={`relative flex min-w-0 flex-col items-center gap-1.5 rounded-lg border px-1 pb-2 pt-2.5 transition-colors ${isCurrent ? "ring-2 ring-primary/60 ring-offset-1 ring-offset-background" : ""} ${earned ? "border-transparent" : "border-dashed border-border/70"}`}
              style={
                earned
                  ? {
                      background: `linear-gradient(160deg, ${step.colors[0]}29, ${step.colors[1]}12)`,
                    }
                  : undefined
              }
            >
              <MilestoneEmblem
                value={step.value}
                colors={step.colors}
                shape={shape}
                legendary={step.legendary}
                rank={step.rank}
                still={!earned}
                className={`h-10 w-10 ${earned ? "" : "opacity-35 grayscale"}`}
              />
              {!earned && (
                <Lock className="absolute right-1.5 top-1.5 h-3 w-3 text-muted-foreground/70" />
              )}
              <span
                className={`w-full truncate text-center text-[11px] ${earned ? "font-medium text-foreground" : "text-muted-foreground"}`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </motion.section>
  );
}

// Every badge in one place: the special badges, then the level and review
// milestone ladders. The badge that was clicked is highlighted, and when the
// badge belongs to a known user their earned milestones are lit.
function BadgeCatalogDialog({ open, onOpenChange, highlight, user }) {
  const { t } = useLanguage();
  const { userData } = useAuth();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const section = CATALOG_SECTIONS[highlight] ?? highlight;

  const level = user && !user.private ? getLevel(user) : null;
  const reviewCount = Number(user?.reviewCount);
  const reviewProgress = Number.isFinite(reviewCount) ? reviewCount : null;

  const levelSteps = [...LEVEL_TIERS].reverse().map(tier => ({
    value: tier.level,
    colors: tier.colors,
    legendary: tier.tier === "legendary",
    rank: levelRank(tier),
    label: t(`ascend.badges.levelTiers.${tier.tier}`),
  }));
  const reviewSteps = [...REVIEW_TIERS].reverse().map(tier => ({
    value: tier.count,
    colors: tier.colors,
    legendary: tier.legendary,
    label: t("ascend.badges.reviewMilestone", { count: tier.count }),
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-xl flex-col gap-0 overflow-hidden p-0">
        <div className="border-b border-border/60 px-6 pb-4 pt-6">
          <DialogTitle className="text-xl">
            {t("ascend.badges.catalog.title")}
          </DialogTitle>
          <DialogDescription className="mt-1">
            {t("ascend.badges.catalog.description")}
          </DialogDescription>
        </div>

        <motion.div
          className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-5"
          variants={listContainer}
          initial={reduceMotion ? false : "hidden"}
          animate="show"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {CATALOG_BADGES.map(badge => (
              <motion.div
                key={badge.field}
                variants={listItem}
                className={`flex flex-col items-center rounded-xl border p-4 text-center transition-colors ${section === badge.field ? "border-primary/50 bg-primary/5" : "border-border/60 bg-muted/30"}`}
              >
                <BadgeEmblem
                  icon={badge.icon}
                  colors={badge.colors}
                  className="h-11 w-11"
                />
                <p className="mt-2 text-sm font-semibold">
                  {t(`ascend.badges.${badge.field}`)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t(`ascend.badges.${badge.field}Description`)}
                </p>
              </motion.div>
            ))}
          </div>

          <MilestoneLadder
            steps={levelSteps}
            shape="hexagon"
            progress={level}
            progressLabel={t("ascend.badges.catalog.levelProgress", { level })}
            columns="grid-cols-5"
            highlighted={section === "levels"}
            title={t("ascend.badges.catalog.levels")}
            description={t("ascend.badges.catalog.levelsDescription")}
          />
          <MilestoneLadder
            steps={reviewSteps}
            shape="bubble"
            progress={reviewProgress}
            progressLabel={t("ascend.badges.catalog.reviewProgress", {
              count: reviewProgress,
            })}
            columns="grid-cols-3 sm:grid-cols-6"
            highlighted={section === "reviews"}
            title={t("ascend.badges.catalog.reviews")}
            description={t("ascend.badges.catalog.reviewsDescription")}
          />
        </motion.div>

        {!viewerHasAscend(userData) && (
          <div className="flex items-center gap-3 border-t border-border bg-muted/30 px-6 py-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {t("ascend.badges.catalog.promoTitle")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("ascend.badges.catalog.promoContent")}
              </p>
            </div>
            <Button
              size="sm"
              className="shrink-0 text-secondary"
              onClick={() => {
                onOpenChange(false);
                navigate("/ascend");
              }}
            >
              {t("ascend.badges.catalog.promoAction")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// A badge emblem that explains itself on hover and, unless it's the owner
// badge, opens the badge catalog on click. Label and description default to
// the badge's translation keys, and renderEmblem replaces the icon hexagon.
function BadgeWithTooltip({
  field,
  icon,
  colors,
  className,
  style,
  label,
  description,
  renderEmblem,
  user,
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const title = label ?? t(`ascend.badges.${field}`);
  const opensCatalog = field !== "owner";
  const emblem = renderEmblem ? (
    renderEmblem(className, style)
  ) : (
    <BadgeEmblem icon={icon} colors={colors} className={className} style={style} />
  );

  const tooltip = (
    <TooltipContent className="max-w-xs">
      <p className="font-semibold text-secondary">{title}</p>
      <p className="text-secondary">
        {description ?? t(`ascend.badges.${field}Description`)}
      </p>
    </TooltipContent>
  );

  if (!opensCatalog) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex shrink-0 cursor-help" aria-label={title}>
            {emblem}
          </span>
        </TooltipTrigger>
        {tooltip}
      </Tooltip>
    );
  }

  // Badges sit inside clickable rows, cards and even buttons, so the trigger
  // is a span acting as a button, and clicks stop here. Events from the
  // dialog's portal bubble through React too, so it sits inside the same span.
  const openCatalog = event => {
    event.stopPropagation();
    setOpen(true);
  };
  return (
    <span className="contents" onClick={event => event.stopPropagation()}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="button"
            tabIndex={0}
            className="relative z-10 inline-flex shrink-0 cursor-pointer rounded-sm outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={title}
            aria-haspopup="dialog"
            onClick={openCatalog}
            onKeyDown={event => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              openCatalog(event);
            }}
          >
            {emblem}
          </span>
        </TooltipTrigger>
        {tooltip}
      </Tooltip>
      <BadgeCatalogDialog
        open={open}
        onOpenChange={setOpen}
        highlight={field}
        user={user}
      />
    </span>
  );
}

// The highest level milestone a user has reached, hidden on private profiles
function LevelMilestoneBadge({ user, className, style }) {
  const { t } = useLanguage();
  const level = getLevel(user);
  const tier = !user?.private && LEVEL_TIERS.find(entry => level >= entry.level);
  if (!tier) return null;

  // The latest milestone passed, so level 237 shows 230
  const milestone = Math.floor(level / 10) * 10;
  const tierName = t(`ascend.badges.levelTiers.${tier.tier}`);

  return (
    <BadgeWithTooltip
      field="levelMilestone"
      user={user}
      className={className}
      style={style}
      label={t("ascend.badges.levelMilestone", { tier: tierName })}
      description={t("ascend.badges.levelMilestoneDescription", { level: milestone })}
      renderEmblem={(size, emblemStyle) => (
        <MilestoneEmblem
          value={milestone}
          colors={tier.colors}
          shape="hexagon"
          legendary={tier.tier === "legendary"}
          rank={levelRank(tier)}
          className={size}
          style={emblemStyle}
        />
      )}
    />
  );
}

// The highest review milestone a user has reached
function ReviewMilestoneBadge({ user, tier, className, style }) {
  const { t } = useLanguage();
  return (
    <BadgeWithTooltip
      field="reviewMilestone"
      user={user}
      className={className}
      style={style}
      label={t("ascend.badges.reviewMilestone", { count: tier.count })}
      description={t("ascend.badges.reviewMilestoneDescription", { count: tier.count })}
      renderEmblem={(size, emblemStyle) => (
        <MilestoneEmblem
          value={tier.count}
          colors={tier.colors}
          shape="bubble"
          legendary={tier.legendary}
          className={size}
          style={emblemStyle}
        />
      )}
    />
  );
}

// Badges granted by hand rather than earned, rendered where the caller checks
// the user's flag
function StandaloneBadge({ className = "h-4 w-4", ...badge }) {
  return (
    <TooltipProvider delayDuration={200}>
      <BadgeWithTooltip {...badge} className={className} />
    </TooltipProvider>
  );
}

export function OwnerBadge(props) {
  return <StandaloneBadge {...OWNER_BADGE} {...props} />;
}

export function ContributorBadge(props) {
  return <StandaloneBadge {...CONTRIBUTOR_BADGE} {...props} />;
}

export function VerifiedBadge(props) {
  return <StandaloneBadge {...VERIFIED_BADGE} {...props} />;
}

export default function EarnedBadges({ user, className = "h-4 w-4", style }) {
  const reviewCount = Number(user?.reviewCount);
  const reviewTier =
    Number.isFinite(reviewCount) && REVIEW_TIERS.find(tier => reviewCount >= tier.count);
  const earned = EARNED_BADGES.filter(badge => user?.[badge.field] === true);
  const hasLevelMilestone = !user?.private && getLevel(user) >= 10;
  if (!earned.length && !hasLevelMilestone && !reviewTier) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <LevelMilestoneBadge user={user} className={className} style={style} />
      {reviewTier && (
        <ReviewMilestoneBadge
          user={user}
          tier={reviewTier}
          className={className}
          style={style}
        />
      )}
      {earned.map(badge => (
        <BadgeWithTooltip
          key={badge.field}
          {...badge}
          user={user}
          className={className}
          style={style}
        />
      ))}
    </TooltipProvider>
  );
}
