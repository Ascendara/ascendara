import SectionHeader from "./SectionHeader";
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
  Crown,
  BadgeCheck,
  Hammer,
} from "lucide-react";

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
      <SectionHeader
        icon={Trophy}
        title={t("ascend.leaderboard.title")}
        description={t("ascend.leaderboard.subtitle", {
          defaultValue: "Top players in the Ascendara community",
        })}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={loadLeaderboard}
            disabled={loadingLeaderboard}
            className="gap-2 rounded-xl"
          >
            <RefreshCw
              className={`h-4 w-4 ${loadingLeaderboard ? "animate-spin" : ""}`}
            />
            {t("ascend.leaderboard.refresh", { defaultValue: "Refresh" })}
          </Button>
        }
      />

      {loadingLeaderboard ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="relative">
            <div className="h-20 w-20 rounded-full border-4 border-yellow-500/20" />
            <div className="absolute inset-0 h-20 w-20 animate-spin rounded-full border-4 border-transparent border-t-yellow-500" />
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
              className="rounded-2xl border border-red-500/30 bg-gradient-to-r from-red-500/10 to-orange-500/10 p-5"
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
                className={`group relative min-w-0 overflow-hidden rounded-2xl border p-5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                  index === 0
                    ? "border-primary/30 bg-gradient-to-b from-primary/10 to-card/70 sm:order-2 sm:py-7"
                    : index === 1
                      ? "border-border/60 bg-card/60 hover:border-primary/30 sm:order-1"
                      : "border-border/60 bg-card/60 hover:border-primary/30 sm:order-3"
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
                    className={`mb-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-primary/10 text-primary ring-1 ring-border/50 ${index === 0 ? "sm:h-20 sm:w-20" : ""}`}
                  >
                    {player.photoURL ? (
                      <img
                        src={player.photoURL}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-2xl font-semibold">
                        {player.displayName?.[0]?.toUpperCase() || "U"}
                      </span>
                    )}
                  </div>
                  <div className="flex w-full min-w-0 items-center justify-center gap-1.5">
                    <h2 className="truncate text-base font-semibold transition-colors group-hover:text-primary">
                      {player.displayName}
                    </h2>
                    {player.owner && (
                      <Crown className="h-4 w-4 shrink-0 text-yellow-500" />
                    )}
                    {player.contributor && (
                      <Hammer className="h-4 w-4 shrink-0 text-orange-500" />
                    )}
                    {player.verified && (
                      <BadgeCheck className="h-4 w-4 shrink-0 text-blue-500" />
                    )}
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
              <h2 className="flex items-center gap-2 text-lg font-semibold text-muted-foreground">
                <Award className="h-5 w-5" />
                Runner-ups
              </h2>
              <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/50">
                {leaderboardData.runnerUps.map((user, index) => (
                  <motion.button
                    type="button"
                    key={user.uid}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(index * 0.03, 0.2) }}
                    onClick={() => handleViewProfile(user.uid)}
                    className="group flex w-full items-center gap-3 border-b border-border/40 p-4 text-left outline-none transition-colors last:border-b-0 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:gap-4"
                  >
                    {/* Rank */}
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/50 font-bold text-muted-foreground">
                      {index + 4}
                    </div>

                    {/* Avatar */}
                    <div className="relative shrink-0">
                      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-md">
                        {user.photoURL ? (
                          <img
                            src={user.photoURL}
                            alt=""
                            className="h-full w-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <span className="text-lg font-bold text-white">
                            {user.displayName?.[0]?.toUpperCase() || "U"}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <h3 className="truncate font-semibold">{user.displayName}</h3>
                        {user.owner && <Crown className="h-4 w-4 text-yellow-500" />}
                        {user.contributor && (
                          <Hammer className="h-4 w-4 text-orange-500" />
                        )}
                        {user.verified && (
                          <BadgeCheck className="h-4 w-4 text-blue-500" />
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 text-primary" />
                          Level {user.level}
                        </span>
                        <span className="flex items-center gap-1">
                          <Zap className="h-3.5 w-3.5 text-yellow-500" />
                          {user.xp?.toLocaleString()} XP
                        </span>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="hidden shrink-0 items-center gap-4 text-sm text-muted-foreground sm:flex">
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4 text-violet-500" />
                        {formatPlaytimeHours(user.totalPlaytime)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Gamepad2 className="h-4 w-4 text-emerald-500" />
                        {user.totalGames}
                      </span>
                    </div>

                    <ChevronRight className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary" />
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </>
      ) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative overflow-hidden rounded-2xl border-2 border-dashed border-yellow-500/30 bg-gradient-to-br from-yellow-500/5 via-transparent to-amber-500/5 p-12 text-center"
        >
          <div className="absolute -right-20 -top-20 h-48 w-48 rounded-full bg-yellow-500/10 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 h-48 w-48 rounded-full bg-amber-500/10 blur-3xl" />
          <div className="relative">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-yellow-500/20 to-amber-500/20 shadow-lg">
              <Trophy className="h-10 w-10 text-yellow-500/50" />
            </div>
            <h2 className="text-2xl font-bold">
              {t("ascend.leaderboard.empty") || "No leaderboard data yet"}
            </h2>
            <p className="mx-auto mt-3 max-w-md text-muted-foreground">
              {t("ascend.leaderboard.emptyDescription") ||
                "Sync your profile to appear on the leaderboard and compete with other players!"}
            </p>
            <Button
              onClick={() => setActiveSection("home")}
              className="mt-6 gap-2 text-secondary"
            >
              <CloudUpload className="h-4 w-4" />
              {t("ascend.leaderboard.syncProfile") || "Sync Your Profile"}
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
