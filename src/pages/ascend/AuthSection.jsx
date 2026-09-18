import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  ArrowRight,
  Sparkles,
  Shield,
  Cloud,
  Zap,
  AlertTriangle,
  MessageCircle,
  UserPlus,
  Check,
  Gamepad2,
  Trophy,
  Gift,
  ExternalLink,
  ListOrdered,
  Puzzle,
  Infinity as InfinityIcon,
  Smartphone,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import GoogleIcon from "./GoogleIcon";

export default function AuthSection({
  isLogin,
  t,
  accountExistsError,
  setAccountExistsError,
  setIsLogin,
  deletedAccountWarning,
  setDeletedAccountWarning,
  linkWithPC,
  setLinkWithPC,
  isSubmitting,
  startFreeTrial,
  setStartFreeTrial,
  handleGoogleSignIn,
  isGoogleLoading,
  handleSubmit,
  formData,
  handleInputChange,
  showPassword,
  setShowPassword,
  showConfirmPassword,
  setShowConfirmPassword,
  toggleMode,
  showEmailConfirmDialog,
  setShowEmailConfirmDialog,
  pendingSignupData,
  setPendingSignupData,
  handleConfirmSignup,
}) {
  return (
    <div className="container mx-auto flex min-h-[80vh] max-w-5xl items-center px-6 py-8">
      <div className="grid w-full items-center gap-12 lg:grid-cols-2 lg:gap-20">
        {/* Left side - Branding & Features Showcase */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-8"
        >
          {/* Header */}
          <div className="space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="inline-flex items-center gap-2.5 rounded-full bg-primary/10 px-4 py-1.5"
            >
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">
                {isLogin ? t("account.welcomeBack") : t("account.setUp")}
              </span>
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-4xl font-bold tracking-tight lg:text-5xl"
            >
              {isLogin ? t("account.loginSubtitle") : t("account.joinAscend")}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="text-base text-muted-foreground"
            >
              {isLogin ? t("account.welcomeBackIntro") : t("account.featuresIntro")}
            </motion.p>
          </div>

          {/* Premium Features Showcase */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="space-y-4"
          >
            {/* Top 3 Hero Features */}
            <div className="space-y-3">
              {/* Cloud Sync */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="group relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/20 via-cyan-600/10 to-transparent p-5"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="relative flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cyan-500/20 ring-1 ring-cyan-500/30">
                    <Cloud className="h-6 w-6 text-cyan-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold text-foreground">
                      {t("account.features.cloudSyncandBackups")}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("account.features.cloudSyncandBackupsDesc")}
                    </p>
                  </div>
                </div>
              </motion.div>

              {/* Two Column - Mobile View & Profiles */}
              <div className="grid grid-cols-2 gap-3">
                {/* Mobile View & Remote Access */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.4 }}
                  className="group relative overflow-hidden rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/20 to-amber-600/10 p-4"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                  <div className="relative flex flex-col gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/20 ring-1 ring-amber-500/30">
                      <Smartphone className="h-5 w-5 text-amber-400" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold">
                        {t("account.features.mobileView")}
                      </h4>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t("account.features.mobileViewDesc")}
                      </p>
                    </div>
                  </div>
                </motion.div>

                {/* Profiles */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.45 }}
                  className="group relative overflow-hidden rounded-xl border border-purple-500/20 bg-gradient-to-br from-purple-500/20 to-purple-600/10 p-4"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                  <div className="relative flex flex-col gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/20 ring-1 ring-purple-500/30">
                      <User className="h-5 w-5 text-purple-400" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold">
                        {t("account.features.profiles")}
                      </h4>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t("account.features.profilesDesc")}
                      </p>
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>

            {/* Two Column - Auto Updates & Download Queues */}
            <div className="grid grid-cols-2 gap-3">
              {/* Auto Updates */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5 }}
                className="group relative overflow-hidden rounded-xl border border-orange-500/20 bg-gradient-to-br from-orange-500/20 to-orange-600/10 p-4"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="relative flex flex-col gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/20 ring-1 ring-orange-500/30">
                    <Zap className="h-5 w-5 text-orange-400" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold">
                      {t("account.features.autoUpdate")}
                    </h4>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t("account.features.autoUpdateDesc")}
                    </p>
                  </div>
                </div>
              </motion.div>

              {/* Download Queues */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.55 }}
                className="group relative overflow-hidden rounded-xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/20 to-indigo-600/10 p-4"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="relative flex flex-col gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/20 ring-1 ring-indigo-500/30">
                    <ListOrdered className="h-5 w-5 text-indigo-400" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold">
                      {t("account.features.downloadQueues")}
                    </h4>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t("account.features.downloadQueuesDesc")}
                    </p>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Additional Features Grid */}
            <div className="grid grid-cols-3 gap-2">
              {[
                {
                  icon: UserPlus,
                  labelKey: "account.features.friends",
                  bgClass: "bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/15",
                  iconClass: "text-blue-400",
                },
                {
                  icon: MessageCircle,
                  labelKey: "account.features.chat",
                  bgClass: "bg-green-500/10 border-green-500/20 hover:bg-green-500/15",
                  iconClass: "text-green-400",
                },
                {
                  icon: Trophy,
                  labelKey: "account.features.leaderboard",
                  bgClass: "bg-yellow-500/10 border-yellow-500/20 hover:bg-yellow-500/15",
                  iconClass: "text-yellow-400",
                },
                {
                  icon: Gamepad2,
                  labelKey: "account.features.retroCloudSaves",
                  bgClass: "bg-rose-500/10 border-rose-500/20 hover:bg-rose-500/15",
                  iconClass: "text-rose-400",
                },
                {
                  icon: InfinityIcon,
                  labelKey: "account.features.unlimitedDownloads",
                  bgClass: "bg-violet-500/10 border-violet-500/20 hover:bg-violet-500/15",
                  iconClass: "text-violet-400",
                },
                {
                  icon: Puzzle,
                  labelKey: "account.features.nexusMods",
                  bgClass:
                    "bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/15",
                  iconClass: "text-emerald-400",
                },
                {
                  icon: Zap,
                  labelKey: "account.features.trainers",
                  bgClass: "bg-pink-500/10 border-pink-500/20 hover:bg-pink-500/15",
                  iconClass: "text-pink-400",
                },
              ].map((feature, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + index * 0.03 }}
                  className={`group relative overflow-hidden rounded-lg border p-3 transition-colors ${feature.bgClass}`}
                >
                  <div className="flex flex-col items-center gap-2 text-center">
                    <feature.icon className={`h-4 w-4 ${feature.iconClass}`} />
                    <span className="text-xs font-medium">{t(feature.labelKey)}</span>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Coming Soon Banner */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="flex items-center gap-3 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/20">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t("account.features.moreComing")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("account.features.moreComingDesc")}
                </p>
              </div>
            </motion.div>
          </motion.div>
        </motion.div>

        {/* Right side - Form */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="relative w-full max-w-lg justify-self-end"
        >
          {/* Pricing notice - only on signup */}
          {!isLogin && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="relative mb-8 overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5"
            >
              <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/20 blur-2xl" />
              <div className="relative flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20">
                  <Gift className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-semibold text-primary">
                    {t("account.pricingFriendly")}
                  </span>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {t("account.pricingDetails")}{" "}
                    <a
                      onClick={() =>
                        window.electron.openURL("https://ascendara.app/ascend?ref=app")
                      }
                      className="inline-flex cursor-pointer items-center text-primary hover:underline"
                    >
                      {t("common.learnMore")}
                      <ExternalLink className="ml-1 inline-block h-3 w-3" />
                    </a>
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Glassmorphism card container */}
          <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/80 p-6 shadow-2xl backdrop-blur-xl">
            {/* Decorative gradient orbs */}
            <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-primary/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />

            <div className="relative space-y-5">
              {/* Account Already Exists Error */}
              {accountExistsError && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="border-destructive/30 bg-destructive/10 rounded-xl border p-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="bg-destructive/20 flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
                      <Shield className="text-destructive h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <h3 className="text-destructive text-sm font-semibold">
                        {accountExistsError.isDeleted
                          ? t("account.errors.cannotCreateAccount") ||
                            "Cannot Create Account"
                          : t("account.errors.accountExists")}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {accountExistsError.isDeleted
                          ? t("account.errors.deletedAccountMessage") ||
                            "This device is associated with a deleted account. You cannot create another account. Please contact support for assistance."
                          : accountExistsError.email
                            ? t("account.errors.accountExistsWithEmail", {
                                email: accountExistsError.email,
                              })
                            : t("account.errors.accountExistsNoEmail")}
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {!accountExistsError.isDeleted && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => {
                              setAccountExistsError(null);
                              setIsLogin(true);
                            }}
                          >
                            {t("account.errors.signInInstead")}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() =>
                            window.electron?.openURL("https://discord.gg/ascendara")
                          }
                        >
                          {t("account.errors.getSupport")}
                        </Button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Deleted Account Warning */}
              {deletedAccountWarning && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="border-destructive/30 bg-destructive/10 rounded-xl border p-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="bg-destructive/20 flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
                      <Shield className="text-destructive h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <h3 className="text-destructive text-sm font-semibold">
                        {t("account.errors.accountDeleted")}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {t("account.errors.accountDeletedMessage")}
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() =>
                            window.electron?.openURL("https://discord.gg/ascendara")
                          }
                        >
                          {t("account.errors.getSupport")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => setDeletedAccountWarning(false)}
                        >
                          {t("common.dismiss")}
                        </Button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Checkboxes - only on signup (moved to top) */}
              <AnimatePresence mode="wait">
                {!isLogin && (
                  <motion.div
                    key="checkboxes"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-2 rounded-lg border border-border/30 bg-muted/30 p-3"
                  >
                    {/* Link with PC checkbox */}
                    <div className="flex items-start gap-2.5">
                      <Checkbox
                        id="linkpc"
                        checked={linkWithPC}
                        onCheckedChange={setLinkWithPC}
                        disabled={isSubmitting}
                        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer data-[state=checked]:border-primary data-[state=checked]:bg-primary"
                      />
                      <label
                        htmlFor="linkpc"
                        className="cursor-pointer text-xs leading-relaxed text-muted-foreground"
                      >
                        {t("account.form.linkWithPC")}{" "}
                        <a
                          onClick={() =>
                            window.electron?.openURL(
                              "https://ascendara.app/docs/features/ascend#privacy,-security-&-abuse-prevention"
                            )
                          }
                          className="inline-flex cursor-pointer items-center text-[10px] font-medium text-primary hover:underline"
                        >
                          {t("common.learnMore")}
                          <ExternalLink className="ml-0.5 h-2.5 w-2.5" />
                        </a>
                      </label>
                    </div>

                    {/* Free trial checkbox */}
                    <div className="flex items-start gap-2.5">
                      <Checkbox
                        id="freetrial"
                        checked={startFreeTrial}
                        onCheckedChange={setStartFreeTrial}
                        disabled={isSubmitting}
                        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer data-[state=checked]:border-primary data-[state=checked]:bg-primary"
                      />
                      <label
                        htmlFor="freetrial"
                        className="cursor-pointer text-xs leading-relaxed text-muted-foreground"
                      >
                        {t("ascend.access.trial")}
                      </label>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Google Sign In */}
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full gap-2 rounded-xl border-border/50 bg-background/50 transition-all hover:bg-background/80 hover:shadow-md disabled:opacity-50"
                onClick={handleGoogleSignIn}
                disabled={
                  isGoogleLoading ||
                  isSubmitting ||
                  (!isLogin && (!linkWithPC || !startFreeTrial))
                }
              >
                {isGoogleLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <GoogleIcon className="h-4 w-4" />
                )}
                <span className="text-sm">{t("account.form.continueWithGoogle")}</span>
              </Button>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border/50" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-card/80 px-3 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {t("account.form.orContinueWith")}
                  </span>
                </div>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-3">
                {/* Display Name - only on signup */}
                <AnimatePresence mode="wait">
                  {!isLogin && (
                    <motion.div
                      key="displayName"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="space-y-1.5">
                        <Label htmlFor="displayName" className="text-xs font-medium">
                          {t("account.form.displayName")}
                        </Label>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            id="displayName"
                            name="displayName"
                            type="text"
                            placeholder={t("account.form.displayNamePlaceholder")}
                            value={formData.displayName}
                            onChange={handleInputChange}
                            className="h-9 rounded-lg border-border/50 bg-background/50 pl-9 text-sm transition-all focus:bg-background focus:shadow-md"
                            disabled={isSubmitting}
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Email */}
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-medium">
                    {t("account.form.email")}
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder={t("account.form.emailPlaceholder")}
                      value={formData.email}
                      onChange={handleInputChange}
                      className="h-9 rounded-lg border-border/50 bg-background/50 pl-9 text-sm transition-all focus:bg-background focus:shadow-md"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                {/* Password fields in a row for signup */}
                <AnimatePresence mode="wait">
                  {!isLogin ? (
                    <motion.div
                      key="passwordRow"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="grid grid-cols-2 gap-3"
                    >
                      <div className="space-y-1.5">
                        <Label htmlFor="password" className="text-xs font-medium">
                          {t("account.form.password")}
                        </Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            id="password"
                            name="password"
                            type={showPassword ? "text" : "password"}
                            placeholder="••••••••"
                            value={formData.password}
                            onChange={handleInputChange}
                            className="h-9 rounded-lg border-border/50 bg-background/50 pl-9 pr-9 text-sm transition-all focus:bg-background focus:shadow-md"
                            disabled={isSubmitting}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                          >
                            {showPassword ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="confirmPassword" className="text-xs font-medium">
                          {t("account.form.confirmPassword")}
                        </Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            id="confirmPassword"
                            name="confirmPassword"
                            type={showConfirmPassword ? "text" : "password"}
                            placeholder="••••••••"
                            value={formData.confirmPassword}
                            onChange={handleInputChange}
                            className="h-9 rounded-lg border-border/50 bg-background/50 pl-9 pr-9 text-sm transition-all focus:bg-background focus:shadow-md"
                            disabled={isSubmitting}
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                          >
                            {showConfirmPassword ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="passwordSingle"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <div className="space-y-1.5">
                        <Label htmlFor="password" className="text-xs font-medium">
                          {t("account.form.password")}
                        </Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            id="password"
                            name="password"
                            type={showPassword ? "text" : "password"}
                            placeholder={t("account.form.passwordPlaceholder")}
                            value={formData.password}
                            onChange={handleInputChange}
                            className="h-9 rounded-lg border-border/50 bg-background/50 pl-9 pr-9 text-sm transition-all focus:bg-background focus:shadow-md"
                            disabled={isSubmitting}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                          >
                            {showPassword ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Submit button */}
                <Button
                  type="submit"
                  className="h-10 w-full rounded-xl text-sm font-medium text-secondary shadow-lg shadow-primary/20 transition-all hover:shadow-xl hover:shadow-primary/30"
                  disabled={
                    isSubmitting ||
                    isGoogleLoading ||
                    (!isLogin && (!linkWithPC || !startFreeTrial))
                  }
                >
                  {isSubmitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="mr-2 h-4 w-4" />
                  )}
                  {isLogin ? t("account.form.signIn") : t("account.form.createAccount")}
                </Button>
              </form>

              {/* Terms notice - only on signup */}
              <AnimatePresence mode="wait">
                {!isLogin && (
                  <motion.div
                    key="terms-notice"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-center text-[10px] leading-relaxed text-muted-foreground"
                  >
                    {t("account.form.termsPrefix")}{" "}
                    <button
                      type="button"
                      onClick={() =>
                        window.electron?.openURL("https://ascendara.app/ascend/terms")
                      }
                      className="font-medium text-primary hover:underline"
                    >
                      {t("account.form.termsLink")}
                    </button>{" "}
                    {t("account.form.termsAnd")}{" "}
                    <button
                      type="button"
                      onClick={() =>
                        window.electron?.openURL("https://ascendara.app/ascend/privacy")
                      }
                      className="font-medium text-primary hover:underline"
                    >
                      {t("account.form.privacyLink")}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Footer links */}
              <div className="space-y-1 pt-2 text-center">
                <button
                  type="button"
                  onClick={toggleMode}
                  className="text-xs text-muted-foreground transition-colors hover:text-primary"
                >
                  {isLogin ? t("account.noAccount") : t("account.haveAccount")}
                </button>
                {isLogin && (
                  <p>
                    <button
                      type="button"
                      onClick={() =>
                        window.electron?.openURL("https://ascendara.app/discord")
                      }
                      className="text-xs text-muted-foreground transition-colors hover:text-primary"
                    >
                      {t("account.forgotPassword")}
                    </button>
                  </p>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Email Confirmation Dialog */}
      <AlertDialog open={showEmailConfirmDialog} onOpenChange={setShowEmailConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              {t("account.confirmEmail.title") || "Confirm Your Email"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-2">
                <p className="text-sm text-muted-foreground">
                  {t("account.confirmEmail.message") ||
                    "Please confirm that your email address is correct. Once your account is created, you will NOT be able to change your email address."}
                </p>
                <div className="rounded-lg border bg-muted/50 p-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t("account.confirmEmail.emailLabel") || "Email Address:"}
                  </p>
                  <p className="mt-1 font-mono text-sm font-semibold text-foreground">
                    {pendingSignupData?.email}
                  </p>
                </div>
                <p className="text-destructive text-xs">
                  <AlertTriangle className="mr-1 inline h-3 w-3" />
                  {t("account.confirmEmail.warning") ||
                    "This email cannot be changed after account creation!"}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setShowEmailConfirmDialog(false);
                setPendingSignupData(null);
              }}
            >
              {t("account.confirmEmail.goBack") || "Go Back & Edit"}
            </AlertDialogCancel>
            <Button
              onClick={handleConfirmSignup}
              disabled={isSubmitting}
              className="text-secondary"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("account.confirmEmail.creating") || "Creating Account..."}
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  {t("account.confirmEmail.confirm") || "Yes, Create Account"}
                </>
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
