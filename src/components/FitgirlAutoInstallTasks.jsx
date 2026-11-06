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
import {
  readDownloadChoice,
  saveDownloadChoice,
} from "@/services/downloads/fitgirlInstallOptions";
import { FitgirlInstallSwitches } from "@/components/FitgirlInstallToggles";
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

// Trigger decisions go to the DevTools console and the main-process log.
const logDecision = message => {
  console.log("[autoinstall]", message);
  try {
    window.electron?.fitgirlAutoInstallLog?.(message)?.catch?.(() => {});
  } catch {}
};

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
          log: logDecision,
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
  // This pack's switches, prefilled from its download choice or Settings.
  const [choice, setChoice] = useState(null);
  useEffect(() => setChoice(current ? { ...current.options } : null), [current]);
  const next = () => setAsks(list => list.slice(1));
  const install = () => {
    const options = { ...(choice || current.options), ask: true };
    saveDownloadChoice(current.game, options);
    logDecision(`${current.game}: install chosen in the pop-up`);
    void runFitgirlInstall(current.game, options, t);
  };
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
          {choice && (
            <FitgirlInstallSwitches
              value={choice}
              onChange={setChoice}
              idPrefix="fitgirl-ask"
              hide={["ask"]}
            />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel
              className="text-foreground"
              onClick={() => logDecision(`${current.game}: not now chosen in the pop-up`)}
            >
              {t("fitgirlInstall.notNow")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={install}>
              {t("fitgirlInstall.install")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
