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
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { changePassword, resetPassword } from "@/services/firebase/firebaseService";

// Same rule as signup: 8+ characters with upper, lower, number and special character
const PASSWORD_RULE =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;

function PasswordField({
  id,
  label,
  value,
  onChange,
  show,
  disabled,
  autoComplete,
  autoFocus,
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={e => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          placeholder="••••••••"
          className="pl-10"
          disabled={disabled}
        />
      </div>
    </div>
  );
}

export default function ChangePasswordDialog({ open, onOpenChange, email, t }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);

  useEffect(() => {
    if (open) return;
    setCurrent("");
    setNext("");
    setConfirm("");
    setShow(false);
    setError("");
  }, [open]);

  const save = async event => {
    event.preventDefault();
    if (!current) return setError(t("account.errors.passwordRequired"));
    if (!PASSWORD_RULE.test(next))
      return setError(t("account.errors.passwordRequirements"));
    if (next !== confirm) return setError(t("account.errors.passwordMismatch"));
    if (next === current) return setError(t("account.changePassword.samePassword"));
    setIsSaving(true);
    setError("");
    const result = await changePassword(current, next);
    setIsSaving(false);
    if (!result.success) {
      setError(result.error || t("account.changePassword.failed"));
      return;
    }
    toast.success(t("account.changePassword.changed"));
    onOpenChange(false);
  };

  const sendReset = async () => {
    if (!email) return;
    setIsSendingReset(true);
    const result = await resetPassword(email);
    setIsSendingReset(false);
    if (result.success) {
      toast.success(t("account.resetPassword.sentDescription", { email }));
    } else {
      toast.error(result.error || t("account.resetPassword.failed"));
    }
  };

  const busy = isSaving || isSendingReset;

  return (
    <Dialog open={open} onOpenChange={value => !isSaving && onOpenChange(value)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {t("account.changePassword.title")}
          </DialogTitle>
          <DialogDescription>{t("account.changePassword.description")}</DialogDescription>
        </DialogHeader>
        <form id="change-password-form" onSubmit={save} className="space-y-4">
          <PasswordField
            id="change-password-current"
            label={t("account.changePassword.current")}
            value={current}
            onChange={value => {
              setCurrent(value);
              setError("");
            }}
            show={show}
            disabled={busy}
            autoComplete="current-password"
            autoFocus
          />
          <PasswordField
            id="change-password-new"
            label={t("account.changePassword.new")}
            value={next}
            onChange={value => {
              setNext(value);
              setError("");
            }}
            show={show}
            disabled={busy}
            autoComplete="new-password"
          />
          <PasswordField
            id="change-password-confirm"
            label={t("account.changePassword.confirm")}
            value={confirm}
            onChange={value => {
              setConfirm(value);
              setError("");
            }}
            show={show}
            disabled={busy}
            autoComplete="new-password"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setShow(s => !s)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-primary"
            >
              {show ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
              {show ? t("account.changePassword.hide") : t("account.changePassword.show")}
            </button>
            {email && (
              <button
                type="button"
                onClick={sendReset}
                disabled={busy}
                className="text-xs text-muted-foreground transition-colors hover:text-primary disabled:opacity-50"
              >
                {isSendingReset && (
                  <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                )}
                {t("account.changePassword.forgotCurrent")}
              </button>
            )}
          </div>
          {error && <p className="text-destructive text-xs">{error}</p>}
        </form>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={isSaving}
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            form="change-password-form"
            className="text-secondary"
            disabled={busy}
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("account.changePassword.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
