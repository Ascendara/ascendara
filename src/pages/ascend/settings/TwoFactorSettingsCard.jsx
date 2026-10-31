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
import { Loader2, Mail, ShieldCheck } from "lucide-react";
import {
  disableTwoFactor,
  enableTwoFactor,
  getCurrentUser,
  getTwoFactorStatus,
  sendTwoFactorCode,
} from "@/services/firebase/firebaseService";
import TwoFactorCodeInput from "../TwoFactorCodeInput";

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
    <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/60">
      <div className="flex items-center justify-between border-b border-border/50 p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">{t("account.twoFactor.settings.title")}</h2>
        </div>
      </div>
      <div className="p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{t("account.twoFactor.settings.label")}</span>
              {enabled !== null && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    enabled
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {enabled
                    ? t("account.twoFactor.settings.on")
                    : t("account.twoFactor.settings.off")}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("account.twoFactor.settings.description")}
            </p>
          </div>
          <Button
            variant={enabled ? "outline" : "default"}
            className={enabled ? "shrink-0" : "shrink-0 text-secondary"}
            disabled={enabled === null || isSending}
            onClick={() => sendCode(enabled ? "disable" : "enable")}
          >
            {isSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {enabled
              ? t("account.twoFactor.settings.turnOff")
              : t("account.twoFactor.settings.turnOn")}
          </Button>
        </div>
      </div>

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
