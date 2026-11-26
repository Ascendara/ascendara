import { Radio } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Asks people who updated (and never saw the welcome step) to opt in to the
// live count once. Either answer is saved, so it never asks again.
const LivePingDialog = ({ open, onAnswer }) => {
  const { t } = useTranslation();

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="border-border">
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Radio className="h-5 w-5" />
            </div>
            <AlertDialogTitle className="text-2xl font-bold text-foreground">
              {t("app.livePing.title")}
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p className="text-foreground">{t("app.livePing.description")}</p>
              <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                {t("app.livePing.privacy")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("app.livePing.settingsNote")}
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-3 sm:justify-end">
          <AlertDialogCancel className="text-foreground" onClick={() => onAnswer(false)}>
            {t("app.livePing.optOut")}
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => onAnswer(true)}>
            {t("app.livePing.optIn")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default LivePingDialog;
