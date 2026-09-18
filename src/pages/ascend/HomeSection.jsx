import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import LevelingCard from "@/components/LevelingCard";
import {
  Users,
  Loader2,
  Cloud,
  CloudUpload,
  Zap,
  MessageCircle,
  UserPlus,
  Clock,
  Gamepad2,
  Trophy,
  RefreshCw,
} from "lucide-react";

export default function HomeSection({
  user,
  userStatus,
  t,
  setActiveSection,
  friends,
  incomingRequests,
  localStats,
  formatPlaytime,
  loadingLocalStats,
  recentGames,
  gameImages,
  formatPlaytimeDetailed,
  loadingProfileStats,
  profileStats,
  handleSyncProfile,
  isSyncingProfile,
}) {
  return (
    <div className="space-y-6">
      {/* Hero Welcome Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-6 md:p-8"
      >
        {/* Decorative elements */}
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-primary/5 blur-2xl" />

        <div className="relative flex flex-col gap-6 md:flex-row md:items-center">
          {/* Profile Avatar */}
          <div className="relative shrink-0">
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200 }}
              className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary via-primary/90 to-primary/70 shadow-xl shadow-primary/20 ring-4 ring-background md:h-28 md:w-28"
            >
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName}
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="text-primary-foreground text-4xl font-bold">
                  {(user.displayName || user.email || "U")[0].toUpperCase()}
                </span>
              )}
            </motion.div>
            <div
              className={`border-3 absolute bottom-1 right-1 h-5 w-5 rounded-full border-background shadow-lg ${
                userStatus === "online"
                  ? "bg-green-500"
                  : userStatus === "away"
                    ? "bg-yellow-500"
                    : userStatus === "busy"
                      ? "bg-red-500"
                      : "bg-gray-500"
              }`}
            />
          </div>

          {/* Welcome Text */}
          <div className="flex-1 space-y-2">
            <motion.h1
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="flex items-center gap-2 text-3xl font-bold tracking-tight md:text-4xl"
            >
              {t("ascend.welcome", {
                name: user.displayName || t("account.welcome"),
              })}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="text-muted-foreground"
            >
              {t("ascend.homeSubtitle")}
            </motion.p>

            {/* Quick Action Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex flex-wrap gap-2 pt-2"
            >
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setActiveSection("friends")}
                className="gap-2"
              >
                <Users className="h-4 w-4" />
                {t("ascend.nav.friends")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setActiveSection("messages")}
                className="gap-2"
              >
                <MessageCircle className="h-4 w-4" />
                {t("ascend.nav.messages")}
              </Button>
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onClick={() => setActiveSection("friends")}
          className="group relative overflow-hidden rounded-xl border border-border/50 bg-card/50 p-5 text-left transition-all hover:border-primary/30 hover:bg-card hover:shadow-lg hover:shadow-primary/5"
        >
          <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-primary/10 blur-xl transition-all group-hover:bg-primary/20" />
          <div className="relative">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="h-5 w-5" />
            </div>
            <p className="mt-3 text-3xl font-bold">{friends.length}</p>
            <p className="text-sm text-muted-foreground">{t("ascend.stats.friends")}</p>
          </div>
        </motion.button>

        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          onClick={() => setActiveSection("requests")}
          className="group relative overflow-hidden rounded-xl border border-border/50 bg-card/50 p-5 text-left transition-all hover:border-primary/30 hover:bg-card hover:shadow-lg hover:shadow-primary/5"
        >
          <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-amber-500/10 blur-xl transition-all group-hover:bg-amber-500/20" />
          <div className="relative">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
              <UserPlus className="h-5 w-5" />
            </div>
            <p className="mt-3 text-3xl font-bold">{incomingRequests.length}</p>
            <p className="text-sm text-muted-foreground">{t("ascend.stats.requests")}</p>
          </div>
        </motion.button>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="group relative overflow-hidden rounded-xl border border-border/50 bg-card/50 p-5 text-left"
        >
          <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-emerald-500/10 blur-xl" />
          <div className="relative">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
              <Gamepad2 className="h-5 w-5" />
            </div>
            <p className="mt-3 text-3xl font-bold">{localStats.totalGames}</p>
            <p className="text-sm text-muted-foreground">{t("ascend.profile.games")}</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="group relative overflow-hidden rounded-xl border border-border/50 bg-card/50 p-5 text-left"
        >
          <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-violet-500/10 blur-xl" />
          <div className="relative">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
              <Clock className="h-5 w-5" />
            </div>
            <p className="mt-3 text-3xl font-bold">
              {formatPlaytime(localStats.totalPlaytime)}
            </p>
            <p className="text-sm text-muted-foreground">{t("ascend.stats.playtime")}</p>
          </div>
        </motion.div>
      </div>

      {/* Level Progress Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        {loadingLocalStats ? (
          <div className="flex items-center justify-center rounded-xl border border-border/50 bg-card/50 p-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <LevelingCard
            level={localStats.level}
            currentXP={localStats.currentXP}
            nextLevelXp={localStats.nextLevelXp}
            totalXP={localStats.xp}
          />
        )}
      </motion.div>

      {/* Recent Games Section */}
      {recentGames.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {t("profile.topGames") || "Top Games"}
            </h2>
            <span className="text-sm text-muted-foreground">
              {localStats.gamesPlayed} {t("profile.gamesPlayed") || "played"}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {recentGames.map((game, index) => {
              const gameId = game.game || game.name;
              return (
                <motion.div
                  key={gameId}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + index * 0.05 }}
                  className="group flex items-center gap-4 rounded-xl border border-border/50 bg-card/50 p-4 transition-all hover:bg-card hover:shadow-md"
                >
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg shadow-md">
                    {gameImages[gameId] ? (
                      <img
                        src={gameImages[gameId]}
                        alt={gameId}
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-muted">
                        <Gamepad2 className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-medium">{gameId}</h3>
                    <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{formatPlaytimeDetailed(game.playTime || 0)}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-medium text-primary">#{index + 1}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Cloud Sync Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
      >
        {loadingProfileStats ? (
          <div className="flex items-center justify-center rounded-xl border border-border/50 bg-card/50 p-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : profileStats ? (
          <div className="mb-40 rounded-xl border border-border/50 bg-gradient-to-br from-card/80 to-card/50 p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Cloud className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-semibold">{t("ascend.profile.stats")}</h2>
                  <p className="text-xs text-muted-foreground">
                    {t("ascend.profile.cloudSynced") || "Synced to cloud"}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSyncProfile}
                disabled={isSyncingProfile}
                className="gap-2"
              >
                {isSyncingProfile ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {t("ascend.profile.resync")}
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-border/30 bg-muted/30 p-4 text-center">
                <Trophy className="mx-auto h-5 w-5 text-amber-500" />
                <p className="mt-2 text-2xl font-bold">{profileStats.level}</p>
                <p className="text-xs text-muted-foreground">
                  {t("ascend.profile.level")}
                </p>
              </div>
              <div className="rounded-xl border border-border/30 bg-muted/30 p-4 text-center">
                <Zap className="mx-auto h-5 w-5 text-yellow-500" />
                <p className="mt-2 text-2xl font-bold">
                  {profileStats.xp?.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">{t("ascend.profile.xp")}</p>
              </div>
              <div className="rounded-xl border border-border/30 bg-muted/30 p-4 text-center">
                <Gamepad2 className="mx-auto h-5 w-5 text-emerald-500" />
                <p className="mt-2 text-2xl font-bold">{profileStats.totalGames}</p>
                <p className="text-xs text-muted-foreground">
                  {t("ascend.profile.games")}
                </p>
              </div>
              <div className="rounded-xl border border-border/30 bg-muted/30 p-4 text-center">
                <Clock className="mx-auto h-5 w-5 text-violet-500" />
                <p className="mt-2 text-2xl font-bold">
                  {formatPlaytime(profileStats.totalPlaytime)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("ascend.profile.playtime")}
                </p>
              </div>
            </div>
            {profileStats.lastSynced && (
              <p className="mt-4 text-center text-xs text-muted-foreground">
                {t("ascend.profile.lastSynced", {
                  date: new Date(profileStats.lastSynced).toLocaleDateString(),
                })}
              </p>
            )}
          </div>
        ) : (
          <div className="relative mb-40 overflow-hidden rounded-xl border border-dashed border-primary/30 bg-gradient-to-br from-primary/5 to-transparent p-8 text-center">
            <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
            <div className="relative">
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring" }}
                className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10"
              >
                <CloudUpload className="h-8 w-8 text-primary" />
              </motion.div>
              <h2 className="text-lg font-semibold">{t("ascend.profile.syncTitle")}</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                {t("ascend.profile.syncDescription")}
              </p>
              <Button
                onClick={handleSyncProfile}
                className="mt-4 gap-2 text-secondary"
                disabled={isSyncingProfile}
              >
                {isSyncingProfile ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CloudUpload className="h-4 w-4" />
                )}
                {t("ascend.profile.syncButton")}
              </Button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
