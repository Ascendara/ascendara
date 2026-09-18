
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

const WatcherWarnDialog = ({ open, onOpenChange }) => {
  const { t } = useTranslation();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="border-border">
        <AlertDialogHeader>
          <div className="flex items-center gap-4">
            <AlertTriangle className="mb-2 h-10 w-10 text-red-500" />
            <AlertDialogTitle className="text-2xl font-bold text-foreground">
              {t("app.watchdog.error.title")}
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <div className="text-foreground">{t("app.watchdog.error.message")}</div>
              <div className="text-foreground">{t("app.watchdog.error.help")}</div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="gap-3 sm:justify-end">
          <AlertDialogCancel className="text-foreground">
            {t("common.ok")}
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default WatcherWarnDialog;
