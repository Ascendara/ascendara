import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  User,
  Users,
  Eye,
  CloudUpload,
  Zap,
  Settings,
  MessageCircle,
  Check,
  Gamepad2,
  Trophy,
  RefreshCw,
  CloudIcon,
  Sparkle,
  CreditCard,
  Crown,
  BadgeCheck,
  Heart,
  BadgeDollarSign,
  ListOrdered,
  Puzzle,
  Infinity,
  Smartphone,
} from "lucide-react";

export default function SubscriptionSettingsCard({
  ascendAccess,
  t,
  isDev,
  devSubscriptionState,
  setDevSubscriptionState,
  userData,
  handleViewInvoices,
  handleManageSubscription,
  deletedAccountWarning,
  handleSubscribe,
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/50">
      {/* Animated background effects for subscribed/verified users */}
      {(ascendAccess.isSubscribed || ascendAccess.isVerified) && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className={`absolute -right-20 -top-20 h-64 w-64 rounded-full blur-3xl ${ascendAccess.isVerified ? "bg-gradient-to-br from-blue-500/20 to-cyan-500/10" : "bg-gradient-to-br from-yellow-500/20 to-amber-500/10"}`}
          />
          <div
            className={`absolute -bottom-20 -left-20 h-64 w-64 rounded-full blur-3xl ${ascendAccess.isVerified ? "bg-gradient-to-br from-violet-500/20 to-blue-500/10" : "bg-gradient-to-br from-primary/20 to-violet-500/10"}`}
          />
          <div
            className={`absolute left-1/2 top-0 h-px w-1/2 -translate-x-1/2 bg-gradient-to-r from-transparent to-transparent ${ascendAccess.isVerified ? "via-blue-500/50" : "via-yellow-500/50"}`}
          />
        </div>
      )}

      <div className="relative flex items-center justify-between border-b border-border/50 p-5">
        <div className="flex items-center gap-2">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-lg ${ascendAccess.isVerified ? "bg-gradient-to-br from-blue-500/20 to-cyan-500/20" : ascendAccess.isSubscribed ? "bg-gradient-to-br from-yellow-500/20 to-amber-500/20" : "bg-primary/10"}`}
          >
            {ascendAccess.isVerified ? (
              <BadgeCheck className="h-4 w-4 text-blue-500" />
            ) : (
              <BadgeDollarSign
                className={`h-4 w-4 ${ascendAccess.isSubscribed ? "text-yellow-500" : "text-primary"}`}
              />
            )}
          </div>
          <h2 className="mt-2 font-semibold">{t("ascend.settings.subscription")}</h2>
        </div>
        {ascendAccess.isVerified ? (
          <div className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-500/20 to-cyan-500/20 px-3 py-1">
            <BadgeCheck className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
              VERIFIED
            </span>
          </div>
        ) : ascendAccess.isSubscribed ? (
          <div className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-yellow-500/20 to-amber-500/20 px-3 py-1">
            <Sparkle className="h-3.5 w-3.5 text-yellow-500" />
            <span className="text-xs font-medium text-yellow-600 dark:text-yellow-400">
              PRO
            </span>
          </div>
        ) : null}
      </div>

      {/* Developer Mode Subscription State Switcher */}
      {isDev && (
        <div className="border-t border-border bg-muted/30 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-muted-foreground">
              Dev: Subscription State
            </span>
            <Select value={devSubscriptionState} onValueChange={setDevSubscriptionState}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="trial">Trial Active</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="subscribed">Subscribed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div className="relative p-5">
        {(isDev && devSubscriptionState === "verified") ||
        (!isDev && ascendAccess.isVerified) ? (
          // Verified User - Special Design
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 shadow-lg shadow-blue-500/25">
                  <BadgeCheck className="h-8 w-8 text-white" />
                </div>
                <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-background">
                  <Check className="h-4 w-4 text-white" />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="bg-gradient-to-r from-blue-500 to-cyan-600 bg-clip-text text-xl font-bold text-transparent">
                    {t("ascend.settings.verifiedUser") || "Verified User"}
                  </h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("ascend.settings.verifiedDescription") ||
                    "You have full access to all Ascend features"}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 p-4 ring-1 ring-emerald-500/20"
              >
                <div className="absolute -right-4 -top-4 h-12 w-12 rounded-full bg-emerald-500/10 blur-xl transition-all group-hover:bg-emerald-500/20" />
                <p className="mb-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  {t("ascend.settings.status")}
                </p>
                <p className="flex items-center gap-2 font-semibold text-emerald-600 dark:text-emerald-400">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
                  </span>
                  {t("ascend.settings.active")}
                </p>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-500/10 to-blue-500/5 p-4 ring-1 ring-blue-500/20"
              >
                <div className="absolute -right-4 -top-4 h-12 w-12 rounded-full bg-blue-500/10 blur-xl transition-all group-hover:bg-blue-500/20" />
                <p className="mb-1 text-xs font-medium text-blue-600 dark:text-blue-400">
                  {t("ascend.settings.accessType") || "Access Type"}
                </p>
                <p className="font-semibold text-blue-600 dark:text-blue-400">
                  {t("ascend.settings.lifetime") || "Lifetime"}
                </p>
              </motion.div>
            </div>

            <div className="rounded-xl bg-gradient-to-r from-blue-500/10 via-cyan-500/10 to-violet-500/10 p-4 ring-1 ring-blue-500/20">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20">
                  <Heart className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {t("ascend.settings.verifiedThankYou") ||
                      "Thank you for being part of Ascendara!"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("ascend.settings.verifiedThankYouSub") ||
                      "Your contributions help make this possible"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (isDev && devSubscriptionState === "subscribed") ||
          (!isDev && ascendAccess.isSubscribed) ? (
          // Active Subscription - Premium Design
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-yellow-500 to-amber-600 shadow-lg shadow-yellow-500/25">
                  <BadgeDollarSign className="h-8 w-8 text-white" />
                </div>
                <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-background">
                  <BadgeCheck className="h-4 w-4 text-white" />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="bg-gradient-to-r from-yellow-500 to-amber-600 bg-clip-text text-xl font-bold text-transparent">
                    {t("ascend.settings.ascendSubscription") || "Ascend"}
                  </h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("ascend.settings.thankYouSubscriber")}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 p-4 ring-1 ring-emerald-500/20"
              >
                <div className="absolute -right-4 -top-4 h-12 w-12 rounded-full bg-emerald-500/10 blur-xl transition-all group-hover:bg-emerald-500/20" />
                <p className="mb-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  {t("ascend.settings.status")}
                </p>
                <p className="flex items-center gap-2 font-semibold text-emerald-600 dark:text-emerald-400">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
                  </span>
                  {t("ascend.settings.active")}
                </p>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 p-4 ring-1 ring-primary/20"
              >
                <div className="absolute -right-4 -top-4 h-12 w-12 rounded-full bg-primary/10 blur-xl transition-all group-hover:bg-primary/20" />
                <p className="mb-1 text-xs font-medium text-primary">
                  {t("ascend.settings.billingCycle")}
                </p>
                <p className="font-semibold">
                  {userData?.ascendSubscription?.lifetime === true
                    ? t("ascend.settings.lifetime")
                    : userData?.ascendSubscription?.intervalCount === 6
                      ? t("ascend.settings.sixMonths")
                      : t("ascend.settings.monthly")}
                </p>
              </motion.div>
            </div>

            <div className="rounded-xl bg-gradient-to-r from-yellow-500/10 via-amber-500/10 to-orange-500/10 p-4 ring-1 ring-yellow-500/20">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-500/20">
                  <Heart className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {t("ascend.settings.supportMessage")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("ascend.settings.supportMessageSub")}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-12 gap-2 border-primary/30 bg-primary/5 hover:bg-primary/10"
                onClick={handleViewInvoices}
              >
                <CreditCard className="h-4 w-4" />
                {t("ascend.settings.viewInvoices")}
              </Button>
              <Button
                variant="outline"
                className="h-12 gap-2 border-primary/30 bg-primary/5 hover:bg-primary/10"
                onClick={handleManageSubscription}
              >
                <Settings className="h-4 w-4" />
                {t("ascend.settings.manageSubscription")}
              </Button>
            </div>
          </div>
        ) : (isDev && devSubscriptionState === "trial") ||
          (!isDev && ascendAccess.hasAccess && ascendAccess.daysRemaining > 0) ? (
          // Trial Active - Premium Features Showcase
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/20 to-green-600/20 ring-2 ring-emerald-500/20">
                  <BadgeCheck className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold">
                  {t("ascend.settings.trialActive") || "Trial Active"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t("ascend.settings.trialDaysRemaining", {
                    days:
                      isDev && devSubscriptionState === "trial"
                        ? 5
                        : ascendAccess.daysRemaining,
                  })}
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-gradient-to-br from-primary/10 to-violet-500/10 p-4 ring-1 ring-primary/20">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium">
                  {t("ascend.settings.trialProgress")}
                </span>
                <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
                  {isDev && devSubscriptionState === "trial"
                    ? 5
                    : ascendAccess.daysRemaining}{" "}
                  {t("ascend.settings.daysLeft")}
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-muted/50">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{
                    width: `${((7 - (isDev && devSubscriptionState === "trial" ? 5 : ascendAccess.daysRemaining)) / 7) * 100}%`,
                  }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className="h-full rounded-full bg-gradient-to-r from-primary to-violet-500"
                />
              </div>
            </div>

            <div className="rounded-xl bg-gradient-to-r from-emerald-500/10 via-green-500/10 to-teal-500/10 p-4 ring-1 ring-emerald-500/20">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/20">
                  <Sparkle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {t("ascend.settings.enjoyingAscend") ||
                      "Enjoying all Ascend features"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("ascend.settings.subscribeToKeep") ||
                      "Subscribe to keep them forever"}
                  </p>
                </div>
              </div>
            </div>

            <div className="max-h-[280px] space-y-2 overflow-y-auto pr-2">
              {[
                {
                  icon: Users,
                  title: "Friends System",
                  desc: "Build your gaming network",
                },
                {
                  icon: MessageCircle,
                  title: "Real-Time Chat",
                  desc: "Chat with friends directly",
                },
                {
                  icon: CloudIcon,
                  title: "Cloud Sync",
                  desc: "Data synced across devices",
                },
                {
                  icon: Gamepad2,
                  title: "Retro Cloud Saves",
                  desc: "Emulator saves backed up",
                },
                {
                  icon: Trophy,
                  title: "Public Leaderboard",
                  desc: "Compete with the community",
                },
                {
                  icon: Infinity,
                  title: "Unlimited Downloads",
                  desc: "No download restrictions",
                },
                {
                  icon: Zap,
                  title: "FLiNG Trainer",
                  desc: "Auto trainer downloads",
                },
                {
                  icon: ListOrdered,
                  title: "Download Queue",
                  desc: "Queue multiple downloads",
                },
                {
                  icon: Sparkle,
                  title: "And More",
                  desc: "Plus many other features",
                },
              ].map((feature, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-3 rounded-lg bg-muted/30 p-2.5"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <feature.icon className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium">{feature.title}</p>
                    <p className="text-[10px] text-muted-foreground">{feature.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            {!deletedAccountWarning ? (
              <Button
                className="h-12 w-full gap-2 bg-gradient-to-r from-yellow-500 to-amber-600 text-white shadow-lg shadow-yellow-500/25 transition-all hover:scale-[1.02] hover:shadow-yellow-500/40"
                onClick={handleSubscribe}
              >
                <Crown className="h-4 w-4" />
                {t("ascend.settings.keepAscendForever") || "Keep Ascend Forever"}
              </Button>
            ) : (
              <div className="bg-destructive/10 border-destructive/30 text-destructive rounded-lg border p-4 text-center text-sm">
                {t("account.errors.cannotSubscribeDeleted") ||
                  "Cannot subscribe - account deleted"}
              </div>
            )}
          </div>
        ) : (
          // No Access / Trial Expired - Premium Features Showcase
          <div className="space-y-5">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-yellow-500/20 to-amber-600/20 ring-2 ring-yellow-500/20">
                <Crown className="h-8 w-8 text-yellow-600 dark:text-yellow-400" />
              </div>
              <h3 className="text-xl font-bold">
                {t("ascend.settings.keepAscend") || "Keep Ascend Forever"}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("ascend.settings.keepAscendDescription") ||
                  "Subscribe to make all these features permanent"}
              </p>
            </div>

            <div className="max-h-[400px] space-y-2 overflow-y-auto pr-2">
              {[
                {
                  icon: Users,
                  title: t("ascend.premium.friends.title"),
                  desc: t("ascend.premium.friends.description"),
                },
                {
                  icon: Smartphone,
                  title: t("ascend.premium.webView.title"),
                  desc: t("ascend.premium.webView.description"),
                },
                {
                  icon: MessageCircle,
                  title: t("ascend.premium.chat.title"),
                  desc: t("ascend.premium.chat.description"),
                },
                {
                  icon: User,
                  title: t("ascend.premium.profile.title"),
                  desc: t("ascend.premium.profile.description"),
                },
                {
                  icon: CloudIcon,
                  title: t("ascend.premium.cloudSync.title"),
                  desc: t("ascend.premium.cloudSync.description"),
                },
                {
                  icon: CloudUpload,
                  title: t("ascend.premium.cloudBackups.title"),
                  desc: t("ascend.premium.cloudBackups.description"),
                },
                {
                  icon: Gamepad2,
                  title: t("ascend.premium.retroCloudSaves.title"),
                  desc: t("ascend.premium.retroCloudSaves.description"),
                },
                {
                  icon: Trophy,
                  title: t("ascend.premium.leaderboard.title"),
                  desc: t("ascend.premium.leaderboard.description"),
                },
                {
                  icon: RefreshCw,
                  title: t("ascend.premium.autoUpdate.title"),
                  desc: t("ascend.premium.autoUpdate.description"),
                },
                {
                  icon: Eye,
                  title: t("ascend.premium.upcoming.title"),
                  desc: t("ascend.premium.upcoming.description"),
                },
                {
                  icon: Puzzle,
                  title: t("ascend.premium.nexusMods.title"),
                  desc: t("ascend.premium.nexusMods.description"),
                },
                {
                  icon: Infinity,
                  title: t("ascend.premium.unlimitedDownloads.title"),
                  desc: t("ascend.premium.unlimitedDownloads.description"),
                },
                {
                  icon: Zap,
                  title: t("ascend.premium.flingTrainer.title"),
                  desc: t("ascend.premium.flingTrainer.description"),
                },
                {
                  icon: ListOrdered,
                  title: t("ascend.premium.downloadQueue.title"),
                  desc: t("ascend.premium.downloadQueue.description"),
                },
                {
                  icon: Users,
                  title: t("ascend.premium.communities.title"),
                  desc: t("ascend.premium.communities.description"),
                },
                {
                  icon: Sparkle,
                  title: t("ascend.premium.moreComing.title"),
                  desc: t("ascend.premium.moreComing.description"),
                },
              ].map((feature, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="group relative flex items-start gap-3 rounded-lg bg-gradient-to-r from-muted/50 to-muted/30 p-3 transition-colors hover:from-primary/10 hover:to-primary/5"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary/20">
                    <feature.icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{feature.title}</p>
                      {feature.badge && (
                        <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary">
                          {feature.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{feature.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            {!deletedAccountWarning ? (
              <Button
                className="h-12 w-full gap-2 bg-gradient-to-r from-yellow-500 to-amber-600 text-white shadow-lg shadow-yellow-500/25 transition-all hover:scale-[1.02] hover:shadow-yellow-500/40"
                onClick={handleSubscribe}
              >
                <Crown className="h-4 w-4" />
                {t("ascend.settings.subscribeToPro") || "Subscribe to Ascend Pro"}
              </Button>
            ) : (
              <div className="bg-destructive/10 border-destructive/30 text-destructive rounded-lg border p-4 text-center text-sm">
                {t("account.errors.cannotSubscribeDeleted") ||
                  "Cannot subscribe - this device is associated with a deleted account"}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
