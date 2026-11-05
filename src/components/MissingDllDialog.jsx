import { useState } from "react";
import { Loader, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Shown when a game is blocked from launching because an online-fix / crack
 * DLL the install expects is missing — almost always because antivirus
 * quarantined it. Explains the cause and offers the real fix (exclude the
 * game folders so it stops happening), then verifying the files to restore
 * what was removed.
 */
const MissingDllDialog = ({ open, info, onClose, t }) => {
  const [excluding, setExcluding] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const game = info?.game;
  const missing = Array.isArray(info?.missing) ? info.missing : [];
  const fileNames = missing.map(entry => entry.file).join(", ");

  const handleAddExclusion = async () => {
    setExcluding(true);
    try {
      const result = await window.electron.folderExclusion(true);
      if (result?.success) {
        toast.success(
          t("gameScreen.missingDll.exclusionAdded", {
            defaultValue:
              "Added your game folders to Windows Security. Verify the game to restore the missing files.",
          })
        );
      } else {
        toast.error(
          result?.error ||
            t("gameScreen.missingDll.exclusionFailed", {
              defaultValue: "Couldn't update Windows Security.",
            })
        );
      }
    } catch (error) {
      toast.error(
        t("gameScreen.missingDll.exclusionFailed", {
          defaultValue: "Couldn't update Windows Security.",
        })
      );
    }
    setExcluding(false);
  };

  const handleVerify = async () => {
    if (!game) return;
    setVerifying(true);
    try {
      const result = await window.electron.verifyGame(game);
      if (result?.success) {
        toast.success(
          t("gameScreen.missingDll.verifyOk", {
            defaultValue: "All files are present. Try launching again.",
          })
        );
        onClose?.();
      } else {
        toast.warning(
          t("gameScreen.missingDll.verifyFailed", {
            defaultValue:
              "Some files are still missing. Open Downloads to repair or re-download the game.",
          })
        );
      }
    } catch (error) {
      toast.error(
        t("gameScreen.missingDll.verifyError", {
          defaultValue: "Couldn't verify the game files.",
        })
      );
    }
    setVerifying(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={value => !value && onClose?.()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <ShieldAlert className="h-6 w-6 text-destructive" />
            {t("gameScreen.missingDll.title", {
              defaultValue: "A required file is missing",
            })}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3 text-muted-foreground">
            <span className="block">
              {t("gameScreen.missingDll.message", {
                game: game || t("common.thisGame", { defaultValue: "this game" }),
                files: fileNames,
                defaultValue:
                  "Ascendara can't launch {{game}} because {{files}} is missing. Your antivirus most likely removed it — online-fix files are often flagged, even though they're part of the game.",
              })}
            </span>
            <span className="block">
              {t("gameScreen.missingDll.guidance", {
                defaultValue:
                  "Add your game folders to Windows Security so it stops removing them, then verify the game to restore what was deleted.",
              })}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex gap-2">
          <Button
            variant="outline"
            className="mr-auto text-primary"
            onClick={() => onClose?.()}
          >
            {t("common.cancel", { defaultValue: "Cancel" })}
          </Button>

          <Button variant="outline" onClick={handleVerify} disabled={verifying}>
            {verifying ? (
              <>
                <Loader className="mr-2 h-4 w-4 animate-spin" />
                {t("gameScreen.missingDll.verifying", {
                  defaultValue: "Verifying…",
                })}
              </>
            ) : (
              t("gameScreen.missingDll.verify", { defaultValue: "Verify game files" })
            )}
          </Button>

          <Button className="text-secondary" onClick={handleAddExclusion} disabled={excluding}>
            {excluding ? (
              <>
                <Loader className="mr-2 h-4 w-4 animate-spin" />
                {t("gameScreen.missingDll.excluding", { defaultValue: "Working…" })}
              </>
            ) : (
              <>
                <ShieldCheck className="mr-2 h-4 w-4" />
                {t("gameScreen.missingDll.addExclusion", {
                  defaultValue: "Add to Windows Security",
                })}
              </>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default MissingDllDialog;
