import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useSettings } from "@/context/SettingsContext";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";

const DllSharingConsentDialog = ({ open, onOpenChange }) => {
  const { t } = useTranslation();
  const { setSettingsLocal } = useSettings();
  const [policiesRead, setPoliciesRead] = useState(false);
  const [saving, setSaving] = useState(false);

  const finish = async enroll => {
    setSaving(true);
    try {
      if (enroll) {
        const saved = await window.electron.updateSetting("contributeRepairDlls", true);
        if (!saved) throw new Error(t("settings.contributeRepairDllsSaveError"));
        setSettingsLocal({ contributeRepairDlls: true });
      }
      await window.electron.setTimestampValue("dllSharingPromptSeen", true);
      onOpenChange(false);
    } catch {
      toast.error(t("settings.contributeRepairDllsSaveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="border-border">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-2xl font-bold text-foreground">
            {t("app.dllSharingConsent.title")}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p className="text-foreground">{t("app.dllSharingConsent.intro")}</p>
              <p className="text-sm text-muted-foreground">
                {t("settings.contributeRepairDllsDescription")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("settings.contributeRepairDllsControl")}
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div
          className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-card/50"
          onClick={() => setPoliciesRead(checked => !checked)}
        >
          <Checkbox
            id="dll-sharing-policies"
            checked={policiesRead}
            onClick={event => {
              event.stopPropagation();
              setPoliciesRead(checked => !checked);
            }}
            onCheckedChange={setPoliciesRead}
            className="mt-0.5"
          />
          <div className="text-sm text-foreground">
            {t("app.dllSharingConsent.readPolicies")}{" "}
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                window.electron.openURL("https://ascendara.app/terms");
              }}
              className="inline text-primary hover:underline"
            >
              {t("welcome.termsOfService")}
            </button>{" "}
            {t("app.dllSharingConsent.and")}{" "}
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                window.electron.openURL("https://ascendara.app/privacy");
              }}
              className="inline text-primary hover:underline"
            >
              {t("welcome.privacyPolicy")}
            </button>
          </div>
        </div>

        <AlertDialogFooter className="gap-3 sm:justify-end">
          <Button
            variant="outline"
            className="text-foreground"
            disabled={!policiesRead || saving}
            onClick={() => finish(false)}
          >
            {t("app.dllSharingConsent.decline")}
          </Button>
          <Button
            className="text-secondary"
            disabled={!policiesRead || saving}
            onClick={() => finish(true)}
          >
            {t("app.dllSharingConsent.enroll")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DllSharingConsentDialog;
