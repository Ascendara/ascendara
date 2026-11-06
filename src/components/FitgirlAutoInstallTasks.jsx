import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useSettings } from "@/context/SettingsContext";
import { useLanguage } from "@/context/LanguageContext";
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
import { readDownloadChoice } from "@/services/downloads/fitgirlInstallOptions";
import { takeFitgirlActions } from "@/services/downloads/fitgirlAutoInstallTrigger";

// Start the FitGirl verify + install in the main process and toast the result.
// Main refuses a second run for a game that is still installing.
export async function runFitgirlInstall(game, options, t) {
  try {
    const result = await window.electron.fitgirlAutoInstall(game, options);
    if (result?.success) toast.success(t("fitgirlInstall.installed", { game }));
    else if (result?.error)
      toast.error(
        t("fitgirlInstall.failed", {
          error: result.stage ? `${result.stage}: ${result.error}` : result.error,
        })
      );
    return result;
  } catch (error) {
    console.error("[autoinstall] Could not start:", error);
    toast.error(t("fitgirlInstall.failed", { error: error.message }));
    return { success: false, error: error.message };
  }
}

// App-wide: when a FitGirl pack finishes downloading, ask or install, on any page.
export default function FitgirlAutoInstallTasks() {
  const { settings } = useSettings();
  const { t } = useLanguage();
  const handled = useRef(new Set());
  const [asks, setAsks] = useState([]);

  useEffect(() => {
    if (!window.electron?.fitgirlAutoInstall) return undefined;
    let running = false;
    const poll = async () => {
      if (running) return;
      running = true;
      try {
        const [downloads, states] = await Promise.all([
          window.electron.getDownloads(),
          window.electron.fitgirlAutoInstallStatus(),
        ]);
        const actions = takeFitgirlActions(downloads, {
          settings,
          readChoice: readDownloadChoice,
          handled: handled.current,
          states: states || {},
        });
        for (const action of actions) {
          if (action.action === "ask") setAsks(current => [...current, action]);
          else void runFitgirlInstall(action.game, action.options, t);
        }
      } catch (error) {
        console.warn("[autoinstall] Could not check finished downloads:", error.message);
      } finally {
        running = false;
      }
    };
    void poll();
    const timer = setInterval(poll, 5000);
    return () => clearInterval(timer);
  }, [settings, t]);

  const current = asks[0];
  const next = () => setAsks(list => list.slice(1));
  return (
    <AlertDialog open={!!current} onOpenChange={open => !open && next()}>
      {current && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">
              {t("fitgirlInstall.promptTitle", { game: current.game })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("fitgirlInstall.promptDescription", { path: current.installerPath })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-foreground">
              {t("fitgirlInstall.notNow")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void runFitgirlInstall(current.game, current.options, t)}
            >
              {t("fitgirlInstall.install")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
