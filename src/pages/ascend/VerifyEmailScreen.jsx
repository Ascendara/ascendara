import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Check,
  Loader2,
  LogOut,
  MailCheck,
  MousePointerClick,
  RefreshCw,
} from "lucide-react";

const RESEND_COOLDOWN = 60;
const SENDER_EMAIL = "welcome@ascendara.app";

const STEPS = [
  { key: "stepOpen", icon: MailCheck },
  { key: "stepClick", icon: MousePointerClick },
  { key: "stepReturn", icon: RefreshCw },
];

const VerifyEmailScreen = ({
  t,
  email,
  preview,
  reloadUser,
  onResend,
  isResending,
  onSignOut,
  onExitPreview,
}) => {
  const reduceMotion = useReducedMotion();
  const [isChecking, setIsChecking] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleCheck = async () => {
    if (preview) {
      onExitPreview();
      return;
    }
    setIsChecking(true);
    const result = await reloadUser();
    setIsChecking(false);
    if (result.success && result.user?.emailVerified) {
      toast.success(t("account.verification.verified"));
    } else {
      toast.error(t("account.verification.notYet"));
    }
  };

  const handleResend = async () => {
    // Preview never sends a real email, it only exercises the cooldown
    if (!preview) await onResend();
    setCooldown(RESEND_COOLDOWN);
  };

  const fadeUp = delay => ({
    initial: reduceMotion ? false : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.35, delay, ease: "easeOut" },
  });

  return (
    <div className="mx-auto flex min-h-[80vh] w-full max-w-5xl items-center px-6 py-10 lg:px-10">
      <div className="grid w-full items-center gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
        <section className="min-w-0">
          <motion.div {...fadeUp(0)} className="relative mb-6 h-16 w-16">
            {!reduceMotion && (
              <motion.span
                className="absolute inset-0 rounded-2xl bg-primary/20"
                animate={{ scale: [1, 1.35], opacity: [0.6, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                aria-hidden="true"
              />
            )}
            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10">
              <MailCheck className="h-7 w-7 text-primary" aria-hidden="true" />
            </div>
          </motion.div>

          <motion.div {...fadeUp(0.05)}>
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {t("account.verification.eyebrow")}
            </p>
            <h1 className="text-3xl font-bold tracking-tight lg:text-4xl">
              {t("account.verification.title")}
            </h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
              {t("account.verification.subtitle")}
            </p>
          </motion.div>

          <motion.div
            {...fadeUp(0.1)}
            className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/50 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                {t("account.verification.sentTo")}
              </p>
              <p className="mt-0.5 truncate text-sm font-medium">{email}</p>
            </div>
            <button
              type="button"
              onClick={preview ? onExitPreview : onSignOut}
              className="shrink-0 text-xs font-medium text-primary hover:underline"
            >
              {t("account.verification.wrongEmail")}
            </button>
          </motion.div>
        </section>

        <motion.section
          {...fadeUp(0.15)}
          className="min-w-0 rounded-2xl border border-border/60 bg-card/40 p-6"
        >
          <ol className="space-y-3 border-l-2 border-primary/40 pl-4">
            {STEPS.map(({ key, icon: Icon }, index) => (
              <li key={key} className="flex items-center gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-[11px] text-muted-foreground">
                  {index + 1}
                </span>
                <span className="flex-1 text-sm">
                  {t(`account.verification.${key}`, { sender: SENDER_EMAIL })}
                </span>
                <Icon
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </li>
            ))}
          </ol>

          <div className="mt-6 space-y-3">
            <Button
              onClick={handleCheck}
              disabled={isChecking}
              className="h-11 w-full text-secondary"
            >
              {isChecking ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              {t("account.verification.checkNow")}
            </Button>
            <Button
              onClick={handleResend}
              variant="outline"
              className="h-11 w-full"
              disabled={isResending || cooldown > 0}
            >
              {isResending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              {cooldown > 0
                ? t("account.verification.resendIn", { seconds: cooldown })
                : t("account.verification.resend")}
            </Button>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3 border-t border-border/60 pt-4">
            <div
              className="flex items-center gap-2 text-xs text-muted-foreground"
              role="status"
            >
              <span className="relative flex h-2 w-2">
                {!reduceMotion && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                )}
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              {t("account.verification.checking")}
            </div>
            <button
              type="button"
              onClick={preview ? onExitPreview : onSignOut}
              className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              {t("account.signOut")}
            </button>
          </div>

          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            {t("account.verification.spamTip")}
          </p>
        </motion.section>
      </div>
    </div>
  );
};

export default VerifyEmailScreen;
