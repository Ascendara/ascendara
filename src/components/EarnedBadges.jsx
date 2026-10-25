import { Bug, MessageSquareText } from "lucide-react";
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
  { field: "gameReviewer", icon: MessageSquareText, color: "text-pink-500" },
  { field: "bugCatcher", icon: Bug, color: "text-green-500" },
];

export default function EarnedBadges({ user, className = "h-4 w-4", style }) {
  const { t } = useLanguage();
  const earned = EARNED_BADGES.filter(badge => user?.[badge.field] === true);
  if (!earned.length) return null;

  return (
    <TooltipProvider delayDuration={200}>
      {earned.map(({ field, icon: Icon, color }) => (
        <Tooltip key={field}>
          <TooltipTrigger asChild>
            <span
              className="inline-flex shrink-0 cursor-help"
              aria-label={t(`ascend.badges.${field}`)}
            >
              <Icon className={`${className} shrink-0 ${color}`} style={style} />
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="font-semibold text-secondary">{t(`ascend.badges.${field}`)}</p>
            <p className="text-secondary">{t(`ascend.badges.${field}Description`)}</p>
          </TooltipContent>
        </Tooltip>
      ))}
    </TooltipProvider>
  );
}
