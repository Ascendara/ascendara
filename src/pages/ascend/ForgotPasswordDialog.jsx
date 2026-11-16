import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Mail, MailCheck } from "lucide-react";
import { resetPassword } from "@/services/firebase/firebaseService";

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function ForgotPasswordDialog({ open, onOpenChange, initialEmail, t }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!open) return;
    setEmail(initialEmail || "");
    setError("");
    setSentTo(null);
  }, [open, initialEmail]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const send = async event => {
    event?.preventDefault();
    const address = email.trim();
    if (!EMAIL_PATTERN.test(address)) {
      setError(t("account.errors.invalidEmail"));
      return;
    }
    setIsSending(true);
    setError("");
    const result = await resetPassword(address);
    setIsSending(false);
    if (result.retryAfter) setCooldown(result.retryAfter);
    if (!result.success) {
      setError(result.error || t("account.resetPassword.failed"));
      return;
    }
    setCooldown(60);
    setSentTo(address);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {sentTo
              ? t("account.resetPassword.sentTitle")
              : t("account.resetPassword.title")}
          </DialogTitle>
          <DialogDescription>
            {sentTo
              ? t("account.resetPassword.sentDescription", { email: sentTo })
              : t("account.resetPassword.description")}
          </DialogDescription>
        </DialogHeader>

        {sentTo ? (
          <div className="flex items-start gap-3 rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">
            <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p>{t("account.resetPassword.checkSpam")}</p>
          </div>
        ) : (
          <form id="forgot-password-form" onSubmit={send} className="space-y-2">
            <Label htmlFor="forgot-password-email">{t("account.form.email")}</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="forgot-password-email"
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={e => {
                  setEmail(e.target.value);
                  setError("");
                }}
                placeholder={t("account.form.emailPlaceholder")}
                className="pl-10"
                disabled={isSending}
              />
            </div>
            {error && <p className="text-destructive text-xs">{error}</p>}
          </form>
        )}

        <DialogFooter className="flex-col gap-3 sm:flex-col">
          {sentTo ? (
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                disabled={isSending || cooldown > 0}
                onClick={send}
              >
                {isSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {cooldown > 0
                  ? t("account.resetPassword.resendIn", { seconds: cooldown })
                  : t("account.resetPassword.resend")}
              </Button>
              <Button className="text-secondary" onClick={() => onOpenChange(false)}>
                {t("account.resetPassword.backToSignIn")}
              </Button>
            </div>
          ) : (
            <Button
              type="submit"
              form="forgot-password-form"
              className="w-full text-secondary"
              disabled={isSending || cooldown > 0}
            >
              {isSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {cooldown > 0
                ? t("account.resetPassword.resendIn", { seconds: cooldown })
                : t("account.resetPassword.send")}
            </Button>
          )}
          <button
            type="button"
            onClick={() => window.electron?.openURL("https://ascendara.app/discord")}
            className="text-center text-xs text-muted-foreground transition-colors hover:text-primary"
          >
            {t("account.resetPassword.noAccess")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
