import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Loader2,
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
    <div className="mb-24 space-y-8">
      {/* Hero Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-yellow-500/20 via-amber-500/10 to-orange-500/10 p-8"
      >
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-yellow-500/20 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-amber-500/20 blur-3xl" />
        <div className="absolute left-1/2 top-0 h-px w-1/2 -translate-x-1/2 bg-gradient-to-r from-transparent via-yellow-500/50 to-transparent" />

        <div className="relative flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-yellow-500 to-amber-600 shadow-xl shadow-yellow-500/30">
            <Trophy className="h-8 w-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">
              {t("ascend.leaderboard.title") || "Leaderboard"}
            </h1>
            <p className="text-muted-foreground">
              {t("ascend.leaderboard.subtitle") ||
                "Top players in the Ascendara community"}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadLeaderboard}
            disabled={loadingLeaderboard}
            className="ml-auto gap-2"
          >
            {loadingLeaderboard ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {t("ascend.leaderboard.refresh") || "Refresh"}
          </Button>
        </div>
      </motion.div>

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

          {/* Top 3 Podium */}
          <div className="grid grid-cols-3 gap-4 pt-8">
            {/* 2nd Place */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex flex-col items-center"
            >
              {leaderboardData.topThree[1] && (
                <div
                  onClick={() => handleViewProfile(leaderboardData.topThree[1].uid)}
                  className="group relative mt-6 w-full cursor-pointer rounded-2xl border border-gray-400/30 bg-gradient-to-b from-gray-400/20 via-gray-400/10 to-transparent p-6 pt-8 transition-all hover:border-gray-400/50 hover:shadow-xl hover:shadow-gray-400/10"
                >
                  <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gray-400/10 blur-2xl transition-all group-hover:bg-gray-400/20" />

                  {/* Rank Badge */}
                  <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-gray-300 to-gray-500 text-lg font-bold text-white shadow-lg">
                      2
                    </div>
                  </div>

                  <div className="relative flex flex-col items-center text-center">
                    {/* Avatar */}
                    <div className="relative mb-4">
                      <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-gray-300 to-gray-500 shadow-lg ring-4 ring-gray-400/30">
                        {leaderboardData.topThree[1].photoURL ? (
                          <img
                            src={leaderboardData.topThree[1].photoURL}
                            alt=""
                            className="h-full w-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <span className="text-2xl font-bold text-white">
                            {leaderboardData.topThree[1].displayName?.[0]?.toUpperCase() ||
                              "U"}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Name & Badges */}
                    <div className="mb-2 flex items-center gap-1">
                      <h3 className="truncate text-lg font-bold">
                        {leaderboardData.topThree[1].displayName}
                      </h3>
                      {leaderboardData.topThree[1].owner && (
                        <Crown className="h-4 w-4 text-yellow-500" />
                      )}
                      {leaderboardData.topThree[1].contributor && (
                        <Hammer className="h-4 w-4 text-orange-500" />
                      )}
                      {leaderboardData.topThree[1].verified && (
                        <BadgeCheck className="h-4 w-4 text-blue-500" />
                      )}
                    </div>

                    {/* Stats */}
                    <div className="mb-3 flex items-center gap-2 rounded-full bg-gray-400/10 px-3 py-1">
                      <Star className="h-4 w-4 text-gray-400" />
                      <span className="text-sm font-semibold">
                        Level {leaderboardData.topThree[1].level}
                      </span>
                    </div>

                    <div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Zap className="h-3 w-3 text-yellow-500" />
                        {leaderboardData.topThree[1].xp?.toLocaleString()} XP
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-violet-500" />
                        {formatPlaytimeHours(leaderboardData.topThree[1].totalPlaytime)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>

            {/* 1st Place - Center & Elevated */}
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.1 }}
              className="flex flex-col items-center"
            >
              {leaderboardData.topThree[0] && (
                <div
                  onClick={() => handleViewProfile(leaderboardData.topThree[0].uid)}
                  className="group relative mt-8 w-full cursor-pointer rounded-2xl border-2 border-yellow-500/50 bg-gradient-to-b from-yellow-500/30 via-amber-500/20 to-orange-500/10 p-6 pt-10 transition-all hover:border-yellow-500/70 hover:shadow-2xl hover:shadow-yellow-500/20"
                >
                  <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-yellow-500/20 blur-3xl transition-all group-hover:bg-yellow-500/30" />
                  <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-amber-500/20 blur-2xl" />

                  {/* Crown & Rank */}
                  <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2">
                    <div className="relative">
                      <Crown className="absolute -top-4 left-1/2 h-6 w-6 -translate-x-1/2 text-yellow-500" />
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 text-xl font-bold text-white shadow-xl shadow-yellow-500/30">
                        1
                      </div>
                    </div>
                  </div>

                  <div className="relative flex flex-col items-center text-center">
                    {/* Avatar */}
                    <div className="relative mb-4">
                      <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-yellow-400 to-amber-600 shadow-xl shadow-yellow-500/30 ring-4 ring-yellow-500/50">
                        {leaderboardData.topThree[0].photoURL ? (
                          <img
                            src={leaderboardData.topThree[0].photoURL}
                            alt=""
                            className="h-full w-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <span className="text-3xl font-bold text-white">
                            {leaderboardData.topThree[0].displayName?.[0]?.toUpperCase() ||
                              "U"}
                          </span>
                        )}
                      </div>
                      <div className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-yellow-500 shadow-lg">
                        <Trophy className="h-4 w-4 text-white" />
                      </div>
                    </div>

                    {/* Name & Badges */}
                    <div className="mb-2 flex items-center gap-1">
                      <h3 className="truncate text-xl font-bold">
                        {leaderboardData.topThree[0].displayName}
                      </h3>
                      {leaderboardData.topThree[0].owner && (
                        <Crown className="h-5 w-5 text-yellow-500" />
                      )}
                      {leaderboardData.topThree[0].contributor && (
                        <Hammer className="h-5 w-5 text-orange-500" />
                      )}
                      {leaderboardData.topThree[0].verified && (
                        <BadgeCheck className="h-5 w-5 text-blue-500" />
                      )}
                    </div>

                    {/* Stats */}
                    <div className="mb-3 flex items-center gap-2 rounded-full bg-yellow-500/20 px-4 py-1.5">
                      <Star className="h-5 w-5 text-yellow-500" />
                      <span className="font-bold text-yellow-600 dark:text-yellow-400">
                        Level {leaderboardData.topThree[0].level}
                      </span>
                    </div>

                    <div className="flex flex-wrap justify-center gap-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Zap className="h-4 w-4 text-yellow-500" />
                        {leaderboardData.topThree[0].xp?.toLocaleString()} XP
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4 text-violet-500" />
                        {formatPlaytimeHours(leaderboardData.topThree[0].totalPlaytime)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Gamepad2 className="h-4 w-4 text-emerald-500" />
                        {leaderboardData.topThree[0].totalGames} games
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>

            {/* 3rd Place */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex flex-col items-center"
            >
              {leaderboardData.topThree[2] && (
                <div
                  onClick={() => handleViewProfile(leaderboardData.topThree[2].uid)}
                  className="group relative mt-6 w-full cursor-pointer rounded-2xl border border-amber-700/30 bg-gradient-to-b from-amber-700/20 via-amber-700/10 to-transparent p-6 pt-8 transition-all hover:border-amber-700/50 hover:shadow-xl hover:shadow-amber-700/10"
                >
                  <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-amber-700/10 blur-2xl transition-all group-hover:bg-amber-700/20" />

                  {/* Rank Badge */}
                  <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-amber-600 to-amber-800 text-lg font-bold text-white shadow-lg">
                      3
                    </div>
                  </div>

                  <div className="relative flex flex-col items-center text-center">
                    {/* Avatar */}
                    <div className="relative mb-4">
                      <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-amber-600 to-amber-800 shadow-lg ring-4 ring-amber-700/30">
                        {leaderboardData.topThree[2].photoURL ? (
                          <img
                            src={leaderboardData.topThree[2].photoURL}
                            alt=""
                            className="h-full w-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <span className="text-2xl font-bold text-white">
                            {leaderboardData.topThree[2].displayName?.[0]?.toUpperCase() ||
                              "U"}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Name & Badges */}
                    <div className="mb-2 flex items-center gap-1">
                      <h3 className="truncate text-lg font-bold">
                        {leaderboardData.topThree[2].displayName}
                      </h3>
                      {leaderboardData.topThree[2].owner && (
                        <Crown className="h-4 w-4 text-yellow-500" />
                      )}
                      {leaderboardData.topThree[2].contributor && (
                        <Hammer className="h-4 w-4 text-orange-500" />
                      )}
                      {leaderboardData.topThree[2].verified && (
                        <BadgeCheck className="h-4 w-4 text-blue-500" />
                      )}
                    </div>

                    {/* Stats */}
                    <div className="mb-3 flex items-center gap-2 rounded-full bg-amber-700/10 px-3 py-1">
                      <Star className="h-4 w-4 text-amber-600" />
                      <span className="text-sm font-semibold">
                        Level {leaderboardData.topThree[2].level}
                      </span>
                    </div>

                    <div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Zap className="h-3 w-3 text-yellow-500" />
                        {leaderboardData.topThree[2].xp?.toLocaleString()} XP
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-violet-500" />
                        {formatPlaytimeHours(leaderboardData.topThree[2].totalPlaytime)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
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
              <div className="space-y-2">
                {leaderboardData.runnerUps.map((user, index) => (
                  <motion.div
                    key={user.uid}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + index * 0.05 }}
                    onClick={() => handleViewProfile(user.uid)}
                    className="group flex cursor-pointer items-center gap-4 rounded-xl border border-border/50 bg-card/50 p-4 transition-all hover:border-primary/30 hover:bg-card hover:shadow-lg"
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
                  </motion.div>
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
