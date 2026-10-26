import { useId } from "react";
import { BadgeCheck, Bug, Crown, Hammer, MessageSquareText } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLanguage } from "@/context/LanguageContext";

// Badges the API grants for activity: reviewing 3 different games, and having
// a reported bug marked fixed. Shown next to owner/contributor/verified.
const EARNED_BADGES = [
  { field: "gameReviewer", icon: MessageSquareText, colors: ["#f472b6", "#db2777"] },
  { field: "bugCatcher", icon: Bug, colors: ["#4ade80", "#16a34a"] },
];

const HEXAGON = "12,1.5 21.5,6.75 21.5,17.25 12,22.5 2.5,17.25 2.5,6.75";
const HEXAGON_INNER = "12,3.6 19.7,7.85 19.7,16.15 12,20.4 4.3,16.15 4.3,7.85";

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
      </svg>
      <Icon className="relative h-[52%] w-[52%] text-white" strokeWidth={2.75} />
    </span>
  );
}

// A badge emblem that explains itself on hover
function BadgeWithTooltip({ field, icon, colors, className, style }) {
  const { t } = useLanguage();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex shrink-0 cursor-help"
          aria-label={t(`ascend.badges.${field}`)}
        >
          <BadgeEmblem icon={icon} colors={colors} className={className} style={style} />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="font-semibold text-secondary">{t(`ascend.badges.${field}`)}</p>
        <p className="text-secondary">{t(`ascend.badges.${field}Description`)}</p>
      </TooltipContent>
    </Tooltip>
  );
}

// Badges granted by hand rather than earned, rendered where the caller checks
// the user's flag
function StandaloneBadge({ field, icon, colors, className = "h-4 w-4", style }) {
  return (
    <TooltipProvider delayDuration={200}>
      <BadgeWithTooltip
        field={field}
        icon={icon}
        colors={colors}
        className={className}
        style={style}
      />
    </TooltipProvider>
  );
}

export function OwnerBadge(props) {
  return (
    <StandaloneBadge
      field="owner"
      icon={Crown}
      colors={["#facc15", "#ca8a04"]}
      {...props}
    />
  );
}

export function ContributorBadge(props) {
  return (
    <StandaloneBadge
      field="contributor"
      icon={Hammer}
      colors={["#fb923c", "#ea580c"]}
      {...props}
    />
  );
}

export function VerifiedBadge(props) {
  return (
    <StandaloneBadge
      field="verified"
      icon={BadgeCheck}
      colors={["#60a5fa", "#2563eb"]}
      {...props}
    />
  );
}

export default function EarnedBadges({ user, className = "h-4 w-4", style }) {
  const earned = EARNED_BADGES.filter(badge => user?.[badge.field] === true);
  if (!earned.length) return null;

  return (
    <TooltipProvider delayDuration={200}>
      {earned.map(badge => (
        <BadgeWithTooltip
          key={badge.field}
          {...badge}
          className={className}
          style={style}
        />
      ))}
    </TooltipProvider>
  );
}
