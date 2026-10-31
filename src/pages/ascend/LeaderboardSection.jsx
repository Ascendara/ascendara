import { EmptyState } from "./primitives";
import ProfileImage, { getInitial } from "@/components/ProfileImage";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  CloudUpload,
  Zap,
  ChevronRight,
  X,
  Clock,
  Gamepad2,
  Trophy,
  RefreshCw,
  Star,
  Award,
} from "lucide-react";
import EarnedBadges from "@/components/EarnedBadges";

export default function LeaderboardSection({
  leaderboardData,
  loadingLeaderboard,
  loadLeaderboard,
  t,
  handleViewProfile,
  setActiveSection,
}) {
  if (!leaderboardData && !loadingLeaderboard) {
    loadLeaderboard();
  }
  const formatPlaytimeHours = seconds => {
    const hours = Math.floor(seconds / 3600);
    if (hours < 1) return "<1h";
    if (hours >= 1000) return `${(hours / 1000).toFixed(1)}k h`;
    return `${hours}h`;
  };
  return (
    <div className="mb-12 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {t("ascend.leaderboard.subtitle", {
            defaultValue: "Top players in the Ascendara community",
          })}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={loadLeaderboard}
          disabled={loadingLeaderboard}
          className="shrink-0 gap-2 rounded-xl"
        >
          <RefreshCw className={`h-4 w-4 ${loadingLeaderboard ? "animate-spin" : ""}`} />
          {t("ascend.leaderboard.refresh", { defaultValue: "Refresh" })}
        </Button>
      </div>

      {loadingLeaderboard ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="relative">
            <div className="h-20 w-20 rounded-full border-4 border-primary/20" />
            <div className="absolute inset-0 h-20 w-20 animate-spin rounded-full border-4 border-transparent border-t-primary" />
          </div>
          <p className="mt-6 text-muted-foreground">
            {t("ascend.leaderboard.loading") || "Loading leaderboard..."}
          </p>
        </div>
      ) : leaderboardData?.topThree?.length > 0 ? (
        <>
          {/* User Blocked Warning */}
          {leaderboardData.userBlocked && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl bg-red-500/10 p-5"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-500/20">
                  <X className="h-6 w-6 text-red-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-red-600 dark:text-red-400">
                    You are not eligible for the leaderboard
                  </h3>
                  <p className="mt-1 text-sm text-red-600/80 dark:text-red-400/80">
                    {leaderboardData.userBlockedReason ||
                      "Your account has been restricted from appearing on the leaderboard."}
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Podium stays in rank order for keyboard and narrow layouts. */}
          <div className="grid gap-4 sm:grid-cols-3 sm:items-end">
            {leaderboardData.topThree.map((player, index) => (
              <button
                key={player.uid}
                type="button"
                onClick={() => handleViewProfile(player.uid)}
                className={`group relative min-w-0 overflow-hidden rounded-2xl p-5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                  index === 0
                    ? "bg-primary/10 shadow sm:order-2 sm:py-7"
                    : index === 1
                      ? "bg-card/60 shadow hover:bg-card sm:order-1"
                      : "bg-card/60 shadow hover:bg-card sm:order-3"
                }`}
              >
                <div className="mb-5 flex items-center justify-between">
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-semibold tabular-nums ${index === 0 ? "bg-primary text-secondary" : "bg-muted text-muted-foreground"}`}
                  >
                    #{index + 1}
                  </span>
                  <Trophy
                    className={`h-4 w-4 ${index === 0 ? "text-yellow-500" : index === 1 ? "text-slate-400" : "text-amber-600"}`}
                  />
                </div>
                <div className="flex flex-col items-center text-center">
                  <div
                    className={`mb-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary ring-1 ring-border/50 ${index === 0 ? "sm:h-20 sm:w-20" : ""}`}
                  >
                    <ProfileImage
                      src={player.photoURL}
                      className="h-full w-full object-cover"
                      fallback={
                        <span className="text-2xl font-semibold">
                          {getInitial(player.displayName)}
                        </span>
                      }
                    />
                  </div>
                  <div className="flex w-full min-w-0 items-center justify-center gap-1.5">
                    <h2 className="mb-0 truncate text-base font-semibold transition-colors group-hover:text-primary">
                      {player.displayName}
                    </h2>
                    <EarnedBadges user={player} className="h-4 w-4" />
                  </div>
                  <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    <Star className="h-3 w-3" />
                    {t("ascend.profile.level", { defaultValue: "Level" })} {player.level}
                  </span>
                  <p className="mt-5 text-2xl font-semibold tabular-nums tracking-tight">
                    {(player.xp || 0).toLocaleString()}{" "}
                    <span className="text-xs font-medium text-muted-foreground">XP</span>
                  </p>
                  <div className="mt-4 flex w-full flex-wrap items-center justify-center gap-3 border-t border-border/40 pt-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      {formatPlaytimeHours(player.totalPlaytime || 0)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Gamepad2 className="h-3.5 w-3.5" />
                      {player.totalGames || 0}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Runner-ups List */}
          {leaderboardData.runnerUps?.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="space-y-3"
            >
              <h2 className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Award className="h-3.5 w-3.5" />
                Runner-ups
              </h2>
              <div className="overflow-hidden rounded-2xl bg-card/60 shadow">
                {leaderboardData.runnerUps.map((user, index) => (
                  <motion.button
                    type="button"
                    key={user.uid}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(index * 0.03, 0.2) }}
                    onClick={() => handleViewProfile(user.uid)}
                    className="group flex w-full items-center gap-3 border-b border-border/40 px-4 py-3.5 text-left outline-none transition-colors last:border-b-0 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:gap-4"
                  >
                    {/* Rank */}
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center text-sm font-semibold tabular-nums text-muted-foreground">
                      {index + 4}
                    </div>

                    {/* Avatar */}
                    <div className="relative shrink-0">
                      <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-primary">
                        <ProfileImage
                          src={user.photoURL}
                          className="h-full w-full object-cover"
                          fallback={
                            <span className="text-sm font-semibold text-secondary">
                              {getInitial(user.displayName)}
                            </span>
                          }
                        />
                      </div>
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-[15px] font-semibold">
                          {user.displayName}
                        </h3>
                        <EarnedBadges user={user} className="h-[18px] w-[18px]" />
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Star className="h-3.5 w-3.5" />
                          Level {user.level}
                        </span>
                        <span className="flex items-center gap-1">
                          <Zap className="h-3.5 w-3.5" />
                          {user.xp?.toLocaleString()} XP
                        </span>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="hidden shrink-0 items-center gap-4 text-sm text-muted-foreground sm:flex">
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {formatPlaytimeHours(user.totalPlaytime)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Gamepad2 className="h-4 w-4" />
                        {user.totalGames}
                      </span>
                    </div>

                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </>
      ) : (
        <EmptyState
          icon={Trophy}
          title={t("ascend.leaderboard.empty")}
          description={t("ascend.leaderboard.emptyDescription")}
          action={
            <Button
              onClick={() => setActiveSection("home")}
              className="gap-2 text-secondary"
            >
              <CloudUpload className="h-4 w-4" />
              {t("ascend.leaderboard.syncProfile")}
            </Button>
          }
        />
      )}
    </div>
  );
}
