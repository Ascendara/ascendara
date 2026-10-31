import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Mail, Shield, ShieldCheck } from "lucide-react";
import {
  disableTwoFactor,
  enableTwoFactor,
  getCurrentUser,
  getTwoFactorStatus,
  sendTwoFactorCode,
} from "@/services/firebase/firebaseService";
import TwoFactorCodeInput from "../TwoFactorCodeInput";
import { FocusHero, FocusPoints, StatusPill } from "./SettingsLayout";

export default function TwoFactorSettingsCard({ t }) {
  const [enabled, setEnabled] = useState(null);
  // "enable" or "disable" while the code dialog is open
  const [purpose, setPurpose] = useState(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const email = getCurrentUser()?.email;

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) return;
    getTwoFactorStatus(user)
      .then(status => setEnabled(status.enabled))
      .catch(() => setEnabled(false));
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const sendCode = async nextPurpose => {
    setIsSending(true);
    setError("");
    const result = await sendTwoFactorCode(nextPurpose);
    setIsSending(false);
    if (result.success || result.retryAfter) {
      setPurpose(nextPurpose);
      setCooldown(result.retryAfter || 60);
      if (result.success) toast.success(t("account.twoFactor.codeSent"));
      return;
    }
    toast.error(result.error || t("account.twoFactor.sendFailed"));
  };

  const closeDialog = () => {
    setPurpose(null);
    setCode("");
    setError("");
  };

  const handleSubmit = async (submitted = code) => {
    if (submitted.length !== 6 || isSubmitting) return;
    setIsSubmitting(true);
    setError("");
    const result = await (purpose === "enable" ? enableTwoFactor : disableTwoFactor)(
      submitted
    );
    setIsSubmitting(false);
    if (!result.success) {
      setCode("");
      setError(result.error || t("account.twoFactor.verifyFailed"));
      return;
    }
    setEnabled(purpose === "enable");
    toast.success(
      t(
        purpose === "enable"
          ? "account.twoFactor.settings.enabled"
          : "account.twoFactor.settings.disabled"
      )
    );
    closeDialog();
  };

  return (
    <div className="space-y-8">
      <FocusHero
        icon={enabled ? ShieldCheck : Shield}
        tone={enabled ? "success" : "muted"}
        eyebrow={t("account.twoFactor.settings.title")}
        title={t("account.twoFactor.settings.label")}
        status={
          enabled !== null && (
            <StatusPill tone={enabled ? "success" : "muted"}>
              {enabled
                ? t("account.twoFactor.settings.on")
                : t("account.twoFactor.settings.off")}
            </StatusPill>
          )
        }
        description={t("account.twoFactor.settings.description")}
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <Button
            variant={enabled ? "outline" : "default"}
            className={enabled ? "" : "text-secondary"}
            disabled={enabled === null || isSending}
            onClick={() => sendCode(enabled ? "disable" : "enable")}
          >
            {isSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {enabled
              ? t("account.twoFactor.settings.turnOff")
              : t("account.twoFactor.settings.turnOn")}
          </Button>
          {email && (
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {t("ascend.settings.pages.security.codesGoTo", { email })}
              </span>
            </span>
          )}
        </div>
      </FocusHero>

      <FocusPoints
        title={t("ascend.settings.pages.howItWorks")}
        items={[
          {
            title: t("ascend.settings.pages.security.step1Title"),
            text: t("ascend.settings.pages.security.step1Text"),
          },
          {
            title: t("ascend.settings.pages.security.step2Title"),
            text: t("ascend.settings.pages.security.step2Text"),
          },
          {
            title: t("ascend.settings.pages.security.step3Title"),
            text: t("account.twoFactor.expires"),
          },
        ]}
      />

      <Dialog open={purpose !== null} onOpenChange={open => !open && closeDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {purpose === "enable"
                ? t("account.twoFactor.settings.enableTitle")
                : t("account.twoFactor.settings.disableTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("account.twoFactor.settings.dialogDescription", { email })}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={event => {
              event.preventDefault();
              handleSubmit();
            }}
          >
            <TwoFactorCodeInput
              value={code}
              onChange={next => {
                setCode(next);
                if (error) setError("");
              }}
              onComplete={handleSubmit}
              disabled={isSubmitting}
              autoFocus
            />
            <p
              className={`mt-3 min-h-[1.25rem] text-xs ${error ? "text-destructive" : "text-muted-foreground"}`}
              role={error ? "alert" : undefined}
            >
              {error || t("account.twoFactor.expires")}
            </p>
            <DialogFooter className="mt-4 gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                disabled={isSending || cooldown > 0}
                onClick={() => sendCode(purpose)}
              >
                {cooldown > 0
                  ? t("account.twoFactor.resendIn", { seconds: cooldown })
                  : t("account.twoFactor.resend")}
              </Button>
              <Button
                type="submit"
                variant={purpose === "disable" ? "destructive" : "default"}
                className={purpose === "disable" ? "" : "text-secondary"}
                disabled={isSubmitting || code.length !== 6}
              >
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {purpose === "enable"
                  ? t("account.twoFactor.settings.turnOn")
                  : t("account.twoFactor.settings.turnOff")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
