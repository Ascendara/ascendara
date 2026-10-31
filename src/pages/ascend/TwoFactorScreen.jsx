import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Check, Loader2, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import {
  sendTwoFactorCode,
  verifyTwoFactorCode,
} from "@/services/firebase/firebaseService";
import TwoFactorCodeInput from "./TwoFactorCodeInput";

const RESEND_COOLDOWN = 60;
const SENDER_EMAIL = "noreply@ascendara.app";

const TwoFactorScreen = ({ t, email, onVerified, onSignOut }) => {
  const reduceMotion = useReducedMotion();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const sentOnMount = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const sendCode = async ({ quiet = false } = {}) => {
    setIsSending(true);
    const result = await sendTwoFactorCode("signin");
    setIsSending(false);
    if (result.alreadyVerified) {
      await onVerified();
      return;
    }
    if (result.success) {
      setCooldown(RESEND_COOLDOWN);
      if (!quiet) toast.success(t("account.twoFactor.codeSent"));
    } else if (result.retryAfter) {
      // A code from a moment ago is still on its way, so keep waiting for it
      setCooldown(result.retryAfter);
      if (!quiet) toast.error(result.error);
    } else {
      setError(result.error || t("account.twoFactor.sendFailed"));
    }
  };

  // The code goes out as soon as this screen shows
  useEffect(() => {
    if (sentOnMount.current) return;
    sentOnMount.current = true;
    sendCode({ quiet: true });
  }, []);

  const handleVerify = async (submitted = code) => {
    if (submitted.length !== 6 || isVerifying) return;
    setIsVerifying(true);
    setError("");
    const result = await verifyTwoFactorCode(submitted);
    if (result.success) {
      toast.success(t("account.twoFactor.verified"));
      await onVerified();
      return;
    }
    setIsVerifying(false);
    setCode("");
    setError(result.error || t("account.twoFactor.verifyFailed"));
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
                className="pointer-events-none absolute -inset-2 rounded-3xl bg-primary/30 blur-xl"
                animate={{ opacity: [0.35, 0.9] }}
                transition={{
                  duration: 1.6,
                  repeat: Infinity,
                  repeatType: "mirror",
                  ease: "easeInOut",
                }}
                aria-hidden="true"
              />
            )}
            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10">
              <ShieldCheck className="h-7 w-7 text-primary" aria-hidden="true" />
            </div>
          </motion.div>

          <motion.div {...fadeUp(0.05)}>
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {t("account.twoFactor.eyebrow")}
            </p>
            <h1 className="text-3xl font-bold tracking-tight lg:text-4xl">
              {t("account.twoFactor.title")}
            </h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
              {t("account.twoFactor.subtitle")}
            </p>
          </motion.div>

          <motion.div
            {...fadeUp(0.1)}
            className="mt-6 flex items-center justify-between gap-3 rounded-xl bg-card/50 px-4 py-3 shadow"
          >
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                {t("account.twoFactor.sentTo")}
              </p>
              <p className="mt-0.5 truncate text-sm font-medium">{email}</p>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="shrink-0 text-xs font-medium text-primary hover:underline"
            >
              {t("account.twoFactor.notYou")}
            </button>
          </motion.div>
        </section>

        <motion.section
          {...fadeUp(0.15)}
          className="min-w-0 rounded-2xl bg-card/40 p-6 shadow"
        >
          <form
            onSubmit={event => {
              event.preventDefault();
              handleVerify();
            }}
          >
            <label className="mb-3 block text-sm font-medium">
              {t("account.twoFactor.enterCode")}
            </label>
            <TwoFactorCodeInput
              value={code}
              onChange={next => {
                setCode(next);
                if (error) setError("");
              }}
              onComplete={handleVerify}
              disabled={isVerifying}
              autoFocus
            />
            <p
              className={`mt-3 min-h-[1.25rem] text-xs ${error ? "text-destructive" : "text-muted-foreground"}`}
              role={error ? "alert" : undefined}
            >
              {error || t("account.twoFactor.expires")}
            </p>

            <div className="mt-4 space-y-3">
              <Button
                type="submit"
                disabled={isVerifying || code.length !== 6}
                className="h-11 w-full text-secondary"
              >
                {isVerifying ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                {t("account.twoFactor.verify")}
              </Button>
              <Button
                type="button"
                onClick={() => sendCode()}
                variant="outline"
                className="h-11 w-full"
                disabled={isSending || cooldown > 0}
              >
                {isSending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                {cooldown > 0
                  ? t("account.twoFactor.resendIn", { seconds: cooldown })
                  : t("account.twoFactor.resend")}
              </Button>
            </div>
          </form>

          <div className="mt-5 flex items-center justify-between gap-3 border-t border-border/60 pt-4">
            <p className="text-xs text-muted-foreground">
              {t("account.twoFactor.from", { sender: SENDER_EMAIL })}
            </p>
            <button
              type="button"
              onClick={onSignOut}
              className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              {t("account.signOut")}
            </button>
          </div>

          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            {t("account.twoFactor.spamTip")}
          </p>
        </motion.section>
      </div>
    </div>
  );
};

export default TwoFactorScreen;
