import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";
import { Award, LockIcon, RefreshCw } from "lucide-react";

export default function AchievementsTab({
  achievements,
  loading,
  refreshing,
  onRefresh,
  page,
  perPage,
  onPageChange,
}) {
  const { t } = useLanguage();
  const all = achievements?.achievements || [];
  const unlockedCount = all.filter(a => a.achieved).length;
  const totalPages = Math.max(1, Math.ceil(all.length / perPage));
  const visible = all.slice(page * perPage, (page + 1) * perPage);

  const refreshButton = (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 w-8 p-0 text-primary hover:text-primary"
      onClick={onRefresh}
      disabled={refreshing}
      title={t("gameScreen.refreshAchievements")}
    >
      <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
    </Button>
  );

  if (loading) {
    return (
      <section className="flex flex-col items-center justify-center gap-4 rounded-xl bg-card py-16 shadow">
        <Award className="h-8 w-8 animate-pulse text-primary/70" />
        <p className="animate-pulse text-sm font-medium text-primary/80">
          {t("gameScreen.loadingAchievements")}
        </p>
      </section>
    );
  }

  if (all.length === 0) {
    return (
      <section className="flex flex-col items-center justify-center gap-4 rounded-xl bg-card py-16 text-center shadow">
        <div className="rounded-full bg-muted p-4">
          <Award className="h-10 w-10 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="flex items-center justify-center gap-1 font-medium">
            {t("gameScreen.noAchievementsFound")}
            {refreshButton}
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {t("gameScreen.noAchievementsDescription")}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl bg-card p-6 shadow">
      <div className="mb-5 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold text-foreground">
            {t("gameScreen.achievements")}
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              <span className="text-base font-semibold text-primary">
                {unlockedCount}
              </span>
              /{all.length} {t("gameScreen.achievementsUnlocked")}
            </span>
            {refreshButton}
          </div>
        </div>
        <Progress value={(unlockedCount / all.length) * 100} className="h-1.5" />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {visible.map((ach, idx) => {
          const unlocked = ach.achieved;
          const unlockDate = ach.unlockTime
            ? new Date(Number(ach.unlockTime) * 1000).toLocaleString()
            : null;
          return (
            <div
              key={ach.achID || idx + page * perPage}
              className={cn(
                "flex items-center gap-4 rounded-lg border p-3",
                unlocked
                  ? "border-primary/30 bg-primary/5"
                  : "border-border/40 bg-background/30"
              )}
              tabIndex={0}
              aria-label={ach.message}
            >
              <div className="relative shrink-0">
                <img
                  src={ach.icon}
                  alt={ach.message}
                  className="h-14 w-14 rounded-md bg-card"
                  style={{
                    filter: unlocked ? "none" : "grayscale(0.85) brightness(0.85)",
                  }}
                />
                {!unlocked && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/50">
                    <LockIcon className="h-5 w-5 text-white/80" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "truncate text-sm font-semibold",
                    unlocked ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {ach.message}
                </p>
                {ach.description && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {ach.description}
                  </p>
                )}
                <p
                  className={cn(
                    "mt-1 text-xs font-medium",
                    unlocked ? "text-primary" : "text-muted-foreground/70"
                  )}
                >
                  {unlocked
                    ? `${t("gameScreen.achievementUnlocked")}${unlockDate ? ` ${unlockDate}` : ""}`
                    : t("gameScreen.achievementLocked")}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.max(0, page - 1))}
            disabled={page === 0}
            aria-label={t("gameScreen.previousPage")}
          >
            {t("common.prev")}
          </Button>
          <span className="text-sm text-muted-foreground">
            {t("common.page")} {page + 1} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
            disabled={page === totalPages - 1}
            aria-label={t("gameScreen.nextPage")}
          >
            {t("common.next")}
          </Button>
        </div>
      )}
    </section>
  );
}
