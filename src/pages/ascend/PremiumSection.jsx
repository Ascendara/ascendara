import { motion } from "framer-motion";
import {
  User,
  Users,
  Sparkles,
  Cloud,
  CloudUpload,
  Zap,
  MessageCircle,
  Gamepad2,
  Trophy,
  RefreshCw,
  Crown,
  ListOrdered,
  Puzzle,
  Infinity,
  Smartphone,
  FlaskConical,
} from "lucide-react";

export default function PremiumSection({ t }) {
  return (
    <div className="mb-24 space-y-6">
      {/* Hero Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/20 via-primary/10 to-violet-500/10 p-8"
      >
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="absolute left-1/2 top-0 h-px w-1/2 -translate-x-1/2 bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

        <div className="relative">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-violet-600 shadow-xl shadow-primary/30">
                <Crown className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">
                  {t("ascend.premium.title") || "Premium Features"}
                </h1>
                <p className="mt-2 text-muted-foreground">
                  {t("ascend.premium.subtitle") ||
                    "Unlock the full potential of Ascendara with these exclusive features"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Features Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Friends System */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 p-6 transition-all hover:border-primary/30 hover:bg-card hover:shadow-lg hover:shadow-primary/5"
        >
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-blue-500/10 blur-2xl transition-all group-hover:bg-blue-500/20" />
          <div className="relative">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
              <Users className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">
              {t("ascend.premium.friends.title") || "Friends System"}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("ascend.premium.friends.description") ||
                "Send and accept friend requests, build your gaming network, and see when your friends are online. Connect with other Ascendara users and grow your community."}
            </p>
          </div>
        </motion.div>
        {/* WebView */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 p-6 transition-all hover:border-primary/30 hover:bg-card hover:shadow-lg hover:shadow-primary/5"
        >
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-slate-500/10 blur-2xl transition-all group-hover:bg-slate-500/20" />
          <div className="relative">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-500/10 text-slate-500">
              <Smartphone className="h-6 w-6" />
            </div>
            <div className="flex items-center gap-2">
              <h3 className="mt-4 text-lg font-semibold">
                {t("ascend.premium.webView.title")}
              </h3>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("ascend.premium.webView.description") ||
                "Find others to play with in game-specific communities. Connect with players who share your interests and coordinate multiplayer sessions."}
            </p>
          </div>
        </motion.div>

        {/* Real-Time Chat */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 p-6 transition-all hover:border-primary/30 hover:bg-card hover:shadow-lg hover:shadow-primary/5"
        >
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-green-500/10 blur-2xl transition-all group-hover:bg-green-500/20" />
          <div className="relative">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-500/10 text-green-500">
              <MessageCircle className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">
              {t("ascend.premium.chat.title") || "Real-Time Chat"}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("ascend.premium.chat.description") ||
                "Chat directly with your friends within Ascendara. Share game recommendations, coordinate play sessions, and stay connected with your gaming circle."}
            </p>
          </div>
        </motion.div>

        {/* Profile & Bio */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 p-6 transition-all hover:border-primary/30 hover:bg-card hover:shadow-lg hover:shadow-primary/5"
        >
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-purple-500/10 blur-2xl transition-all group-hover:bg-purple-500/20" />
          <div className="relative">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/10 text-purple-500">
              <User className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">
              {t("ascend.premium.profile.title") || "Profile & Bio"}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("ascend.premium.profile.description") ||
                "Set up your personalized profile with a custom bio, showcase your gaming preferences, and let others know what you're all about. Make your profile uniquely yours."}
            </p>
          </div>
        </motion.div>

        {/* Cloud Sync */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 p-6 transition-all hover:border-primary/30 hover:bg-card hover:shadow-lg hover:shadow-primary/5"
        >
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-cyan-500/10 blur-2xl transition-all group-hover:bg-cyan-500/20" />
          <div className="relative">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
              <Cloud className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">
              {t("ascend.premium.cloudSync.title") || "Cloud Sync"}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("ascend.premium.cloudSync.description") ||
                "Your profile, achievements, and game data are automatically synced to the cloud. Access your complete gaming history from anywhere, on any device."}
            </p>
          </div>
        </motion.div>

        {/* Public Leaderboard */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 p-6 transition-all hover:border-primary/30 hover:bg-card hover:shadow-lg hover:shadow-primary/5"
        >
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-yellow-500/10 blur-2xl transition-all group-hover:bg-yellow-500/20" />
          <div className="relative">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-yellow-500/10 text-yellow-500">
              <Trophy className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">
              {t("ascend.premium.leaderboard.title") || "Public Leaderboard"}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("ascend.premium.leaderboard.description") ||
                "Compete with the community on the public leaderboard. See how your stats stack up against other players and climb the ranks."}
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65 }}
          className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 p-6 transition-all hover:border-primary/30 hover:bg-card hover:shadow-lg hover:shadow-primary/5"
        >
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-sky-500/10 blur-2xl transition-all group-hover:bg-sky-500/20" />
          <div className="relative">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/10 text-sky-500">
              <CloudUpload className="h-6 w-6" />
            </div>
            <div className="flex items-center gap-2">
              <h3 className="mt-4 text-lg font-semibold">
                {t("ascend.premium.cloudBackups.title") || "Cloud Backups"}
              </h3>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("ascend.premium.cloudBackups.description") ||
                "Automatically back up your game saves to the cloud. Never lose your progress and restore your saves on any device."}
            </p>
          </div>
        </motion.div>

        {/* Retro Cloud Saves */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 p-6 transition-all hover:border-primary/30 hover:bg-card hover:shadow-lg hover:shadow-primary/5"
        >
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-rose-500/10 blur-2xl transition-all group-hover:bg-rose-500/20" />
          <div className="relative">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500">
              <Gamepad2 className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">
              {t("ascend.premium.retroCloudSaves.title") || "Retro Cloud Saves"}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("ascend.premium.retroCloudSaves.description") ||
                "Back up your Retro library's memory cards and save folders to the cloud, then restore them on any device. Ascendara keeps a recovery copy of your local saves before every restore."}
            </p>
          </div>
        </motion.div>

        {/* Auto Game Update Checking */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 p-6 transition-all hover:border-primary/30 hover:bg-card hover:shadow-lg hover:shadow-primary/5"
        >
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-indigo-500/10 blur-2xl transition-all group-hover:bg-indigo-500/20" />
          <div className="relative">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500">
              <RefreshCw className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">
              {t("ascend.premium.autoUpdate.title") || "Auto Game Update Checking"}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("ascend.premium.autoUpdate.description") ||
                "Automatically check for game updates in the background. Get notified when updates are available and install them with a single click."}
            </p>
          </div>
        </motion.div>

        {/* Upcoming Updates Peek */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 p-6 transition-all hover:border-primary/30 hover:bg-card hover:shadow-lg hover:shadow-primary/5"
        >
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-violet-500/10 blur-2xl transition-all group-hover:bg-violet-500/20" />
          <div className="relative">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/10 text-violet-500">
              <Sparkles className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">
              {t("ascend.premium.upcoming.title") || "Upcoming Updates Peek"}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("ascend.premium.upcoming.description") ||
                "Get an exclusive preview of what's coming in the next Ascendara update. Stay ahead of the curve and know what new features are on the horizon."}
            </p>
          </div>
        </motion.div>

        {/* Nexus Mod Managing */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 p-6 transition-all hover:border-primary/30 hover:bg-card hover:shadow-lg hover:shadow-primary/5"
        >
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-pink-500/10 blur-2xl transition-all group-hover:bg-pink-500/20" />
          <div className="relative">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-pink-500/10 text-pink-500">
              <Puzzle className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">
              {t("ascend.premium.nexusMods.title") || "Nexus Mod Managing"}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("ascend.premium.nexusMods.description") ||
                "Seamlessly manage your Nexus mods for supported games. Browse, install, and organize mods directly within Ascendara."}
            </p>
          </div>
        </motion.div>

        {/* Unlimited Downloads */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 p-6 transition-all hover:border-primary/30 hover:bg-card hover:shadow-lg hover:shadow-primary/5"
        >
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-emerald-500/10 blur-2xl transition-all group-hover:bg-emerald-500/20" />
          <div className="relative">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
              <Infinity className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">
              {t("ascend.premium.unlimitedDownloads.title") || "Unlimited Downloads"}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("ascend.premium.unlimitedDownloads.description") ||
                "Download as many games as you want with no restrictions. Ascend removes all download limits so you can build your library freely."}
            </p>
          </div>
        </motion.div>

        {/* FLiNG Trainer */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 p-6 transition-all hover:border-primary/30 hover:bg-card hover:shadow-lg hover:shadow-primary/5"
        >
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-orange-500/10 blur-2xl transition-all group-hover:bg-orange-500/20" />
          <div className="relative">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500/10 text-orange-500">
              <Zap className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">
              {t("ascend.premium.flingTrainer.title") || "FLiNG Trainer"}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("ascend.premium.flingTrainer.description") ||
                "Automatically downloads the correct FLiNG trainer for your game and handles installation, no manual searching or setup required."}
            </p>
          </div>
        </motion.div>

        {/* Download Queue */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 p-6 transition-all hover:border-primary/30 hover:bg-card hover:shadow-lg hover:shadow-primary/5"
        >
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-teal-500/10 blur-2xl transition-all group-hover:bg-teal-500/20" />
          <div className="relative">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-500/10 text-teal-500">
              <ListOrdered className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">
              {t("ascend.premium.downloadQueue.title") || "Download Queue"}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("ascend.premium.downloadQueue.description") ||
                "Queue multiple downloads and let Ascendara handle them automatically. Start downloads and come back when they're all ready."}
            </p>
          </div>
        </motion.div>

        {/* Experimental Branch */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65 }}
          className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 p-6 transition-all hover:border-amber-500/30 hover:bg-card hover:shadow-lg hover:shadow-amber-500/5"
        >
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-amber-500/10 blur-2xl transition-all group-hover:bg-amber-500/20" />
          <div className="relative">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
              <FlaskConical className="h-6 w-6" />
            </div>
            <div className="flex items-center gap-2">
              <h3 className="mt-4 text-lg font-semibold">
                {t("ascend.premium.experimentalBranch.title") || "Experimental Branch"}
              </h3>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("ascend.premium.experimentalBranch.description") ||
                "Easily switch to the experimental branch in Preferences to test cutting-edge features before they're released. Be the first to try new functionality and help shape Ascendara's future."}
            </p>
          </div>
        </motion.div>

        {/* And More Coming */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="group relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-violet-500/5 p-6 transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10"
        >
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/20 blur-2xl transition-all group-hover:bg-primary/30" />
          <div className="relative">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/20 text-primary">
              <Sparkles className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">
              {t("ascend.premium.moreComing.title") || "And More Coming"}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("ascend.premium.moreComing.description") ||
                "There are constantly new features for Ascend subscribers. Your subscription helps fund development of exciting new capabilities."}
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
