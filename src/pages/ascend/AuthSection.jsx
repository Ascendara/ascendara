import { motion, AnimatePresence, MotionConfig, useReducedMotion } from "framer-motion";
import { useId } from "react";
import { Button } from "@/components/ui/button";
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
  Shield,
  Cloud,
  Zap,
  AlertTriangle,
  MessageCircle,
  UserPlus,
  Check,
  Gamepad2,
  Trophy,
  ExternalLink,
  ListOrdered,
  Puzzle,
  Infinity as InfinityIcon,
  Smartphone,
  Joystick,
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
import "./auth.css";

function ConsentCheckbox({ id, checked, onChange, disabled }) {
  return (
    <span className="ascend-consent-check">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
      />
      <span className="ascend-consent-mark" aria-hidden="true">
        <svg viewBox="0 0 20 20">
          <path d="m5 10 3.2 3.2L15 6.5" />
        </svg>
      </span>
    </span>
  );
}

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
  const modeIndicatorId = useId();
  const reduceMotion = useReducedMotion();
  return (
    <MotionConfig reducedMotion="user">
      <div className="ascend-auth mx-auto w-full max-w-6xl mt-12 px-6 pb-24 pt-4 lg:px-10">
        <div className="grid items-start gap-8 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-14">
          <section className="min-w-0">
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {t("account.auth.eyebrow")}
            </p>
            <h1
              className={`ascend-auth-headline${isLogin ? " ascend-auth-headline-login whitespace-nowrap" : ""}`}
            >
              {isLogin
                ? t("account.auth.loginHeadline")
                : t("account.auth.signupHeadline")}
              {isLogin ? " " : <br />}
              <span className="ascend-auth-script">
                {isLogin ? t("account.auth.loginAccent") : t("account.auth.signupAccent")}
                <svg aria-hidden="true" viewBox="0 0 300 16" preserveAspectRatio="none">
                  <path d="M3 10 Q140 -2 297 7 M25 15 Q155 5 281 13" />
                </svg>
              </span>
            </h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">
              {t("account.auth.intro")}
            </p>

            <section
              aria-labelledby="ascend-features-title"
              className="ascend-auth-features mt-5 border-t border-border/60 pt-4"
            >
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2
                  id="ascend-features-title"
                  className="text-xs font-medium text-muted-foreground"
                >
                  {t("account.featuresIntro")}
                </h2>
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  {t("account.features.moreComing")}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                {[
                  { icon: Cloud, name: "cloudSyncandBackups" },
                  { icon: Smartphone, name: "mobileView" },
                  { icon: Zap, name: "autoUpdate" },
                  { icon: ListOrdered, name: "downloadQueues" },
                ].map(({ icon: Icon, name }) => (
                  <div key={name} className="relative pl-6">
                    <Icon
                      className="absolute left-0 top-0.5 h-4 w-4 text-primary"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                    <h3 className="text-xs font-medium">
                      {t(`account.features.${name}`)}
                    </h3>
                    <p className="mt-1 text-xs leading-[1.5] text-muted-foreground">
                      {t(`account.features.${name}Desc`)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-x-3 gap-y-2 border-t border-border/40 pt-3">
                {[
                  { icon: User, name: "profiles" },
                  { icon: UserPlus, name: "friends" },
                  { icon: MessageCircle, name: "chat" },
                  { icon: Trophy, name: "leaderboard" },
                  { icon: Gamepad2, name: "retroCloudSaves" },
                  { icon: InfinityIcon, name: "unlimitedDownloads" },
                  { icon: Puzzle, name: "nexusMods" },
                  { icon: Zap, name: "trainers" },
                  { icon: Joystick, name: "emulatorPresets" },
                ].map(({ icon: Icon, name }) => (
                  <span
                    key={name}
                    className="flex items-center gap-2 text-xs text-muted-foreground"
                    title={
                      name === "profiles" ? t("account.features.profilesDesc") : undefined
                    }
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {t(`account.features.${name}`)}
                  </span>
                ))}
              </div>
            </section>
            <div className="mt-5 border-l-2 border-primary/50 pl-3">
              <p className="text-sm font-medium">{t("account.pricingFriendly")}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {t("account.pricingDetails")}
              </p>
              <button
                type="button"
                onClick={() =>
                  window.electron?.openURL("https://ascendara.app/ascend?ref=app")
                }
                className="mt-1 inline-flex items-center gap-2 text-xs font-medium text-primary hover:underline"
              >
                {t("common.learnMore")}
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </section>

          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="ascend-auth-form min-w-0"
            aria-labelledby="ascend-auth-title"
          >
            <div
              className="ascend-auth-modes mb-4"
              role="group"
              aria-labelledby="ascend-auth-title"
            >
              {[false, true].map(login => (
                <button
                  key={String(login)}
                  type="button"
                  aria-pressed={isLogin === login}
                  disabled={isSubmitting || isGoogleLoading}
                  onClick={() => {
                    if (isLogin !== login) toggleMode();
                  }}
                  className="ascend-auth-mode"
                >
                  {isLogin === login && (
                    <motion.span
                      layoutId={modeIndicatorId}
                      className="ascend-auth-mode-indicator"
                      transition={
                        reduceMotion
                          ? { duration: 0 }
                          : { type: "spring", stiffness: 420, damping: 34 }
                      }
                      aria-hidden="true"
                    />
                  )}
                  <span className="relative">
                    {login ? t("account.form.signIn") : t("account.form.createAccount")}
                  </span>
                </button>
              ))}
            </div>
            <h2 id="ascend-auth-title" className="sr-only">
              {isLogin ? t("account.loginSubtitle") : t("account.form.createAccount")}
            </h2>
            <div>
              <div className="space-y-3">
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
                            ? t("account.errors.cannotCreateAccount")
                            : t("account.errors.accountExists")}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {accountExistsError.isDeleted
                            ? t("account.errors.deletedAccountMessage")
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
                      className="space-y-3"
                    >
                      {/* Link with PC checkbox */}
                      <div className="flex items-start gap-2.5">
                        <ConsentCheckbox
                          id="linkpc"
                          checked={linkWithPC}
                          onChange={event => setLinkWithPC(event.target.checked)}
                          disabled={isSubmitting || isGoogleLoading}
                        />
                        <label
                          htmlFor="linkpc"
                          className="cursor-pointer text-xs leading-relaxed text-muted-foreground"
                        >
                          {t("account.form.linkWithPC")}{" "}
                          <button
                            type="button"
                            onClick={() =>
                              window.electron?.openURL(
                                "https://ascendara.app/docs/features/ascend#privacy,-security-&-abuse-prevention"
                              )
                            }
                            className="inline-flex cursor-pointer items-center text-[10px] font-medium text-primary hover:underline"
                          >
                            {t("common.learnMore")}
                            <ExternalLink className="ml-0.5 h-2.5 w-2.5" />
                          </button>
                        </label>
                      </div>

                      {/* Free trial checkbox */}
                      <div className="flex items-start gap-2.5">
                        <ConsentCheckbox
                          id="freetrial"
                          checked={startFreeTrial}
                          onChange={event => setStartFreeTrial(event.target.checked)}
                          disabled={isSubmitting || isGoogleLoading}
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
                  className="h-11 w-full gap-2 rounded-md border-border bg-background transition-colors hover:bg-muted disabled:opacity-50"
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
                    <span className="bg-background px-3 text-[10px] uppercase tracking-wider text-muted-foreground">
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
                              autoComplete="nickname"
                              type="text"
                              placeholder={t("account.form.displayNamePlaceholder")}
                              value={formData.displayName}
                              onChange={handleInputChange}
                              className="h-11 rounded-md border-border/70 bg-card/50 pl-9 text-sm transition-all focus:bg-background focus:shadow-md"
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
                        autoComplete="email"
                        type="email"
                        placeholder={t("account.form.emailPlaceholder")}
                        value={formData.email}
                        onChange={handleInputChange}
                        className="h-11 rounded-md border-border/70 bg-card/50 pl-9 text-sm transition-all focus:bg-background focus:shadow-md"
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
                        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
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
                              autoComplete={isLogin ? "current-password" : "new-password"}
                              type={showPassword ? "text" : "password"}
                              placeholder="••••••••"
                              value={formData.password}
                              onChange={handleInputChange}
                              className="h-11 rounded-md border-border/70 bg-card/50 pl-9 pr-9 text-sm transition-all focus:bg-background focus:shadow-md"
                              disabled={isSubmitting}
                            />
                            <button
                              type="button"
                              aria-label={t("account.form.password")}
                              aria-pressed={showPassword}
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
                          <Label
                            htmlFor="confirmPassword"
                            className="text-xs font-medium"
                          >
                            {t("account.form.confirmPassword")}
                          </Label>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              id="confirmPassword"
                              name="confirmPassword"
                              autoComplete="new-password"
                              type={showConfirmPassword ? "text" : "password"}
                              placeholder="••••••••"
                              value={formData.confirmPassword}
                              onChange={handleInputChange}
                              className="h-11 rounded-md border-border/70 bg-card/50 pl-9 pr-9 text-sm transition-all focus:bg-background focus:shadow-md"
                              disabled={isSubmitting}
                            />
                            <button
                              type="button"
                              aria-label={t("account.form.confirmPassword")}
                              aria-pressed={showConfirmPassword}
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
                              autoComplete={isLogin ? "current-password" : "new-password"}
                              type={showPassword ? "text" : "password"}
                              placeholder={t("account.form.passwordPlaceholder")}
                              value={formData.password}
                              onChange={handleInputChange}
                              className="h-11 rounded-md border-border/70 bg-card/50 pl-9 pr-9 text-sm transition-all focus:bg-background focus:shadow-md"
                              disabled={isSubmitting}
                            />
                            <button
                              type="button"
                              aria-label={t("account.form.password")}
                              aria-pressed={showPassword}
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
                    className="h-12 w-full rounded-md text-sm font-semibold text-secondary shadow-sm transition-colors"
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
                      className="text-center text-xs leading-relaxed text-muted-foreground"
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
                <div className="space-y-2 border-t border-border/60 pt-4 text-center">
                  <button
                    type="button"
                    onClick={toggleMode}
                    disabled={isSubmitting || isGoogleLoading}
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
          </motion.section>
        </div>

        {/* Email Confirmation Dialog */}
        <AlertDialog
          open={showEmailConfirmDialog}
          onOpenChange={setShowEmailConfirmDialog}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                {t("account.confirmEmail.title")}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 pt-2">
                  <p className="text-sm text-muted-foreground">
                    {t("account.confirmEmail.message")}
                  </p>
                  <div className="rounded-lg border bg-muted/50 p-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      {t("account.confirmEmail.emailLabel")}
                    </p>
                    <p className="mt-1 font-mono text-sm font-semibold text-foreground">
                      {pendingSignupData?.email}
                    </p>
                  </div>
                  <p className="text-destructive text-xs">
                    <AlertTriangle className="mr-1 inline h-3 w-3" />
                    {t("account.confirmEmail.warning")}
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
                {t("account.confirmEmail.goBack")}
              </AlertDialogCancel>
              <Button
                onClick={handleConfirmSignup}
                disabled={isSubmitting}
                className="text-secondary"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("account.confirmEmail.creating")}
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    {t("account.confirmEmail.confirm")}
                  </>
                )}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </MotionConfig>
  );
}
