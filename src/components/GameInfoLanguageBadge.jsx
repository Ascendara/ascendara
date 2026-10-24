import { BadgeCheck } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { hasTranslatedGameInfo } from "@/lib/steamLanguages";
import { cn } from "@/lib/utils";

// Marks languages whose game info is translated too, not just the UI
export default function GameInfoLanguageBadge({ code, className }) {
  const { t } = useLanguage();
  if (!hasTranslatedGameInfo(code)) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn("inline-flex shrink-0 text-primary", className)}
            aria-label={t("settings.gameInfoTranslated")}
          >
            <BadgeCheck className="h-4 w-4" />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-secondary">
          {t("settings.gameInfoTranslated")}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
