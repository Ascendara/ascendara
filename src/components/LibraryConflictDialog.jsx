import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/LanguageContext";
import { libraryInstallKey } from "@/lib/libraryConflicts";
import { toast } from "sonner";

export default function LibraryConflictDialog({ conflict, resolve, onLater }) {
  const { t } = useLanguage();
  if (!conflict) return null;
  const choose = choice => {
    if (!resolve(conflict.key, choice)) return;
    toast.success(t(choice === "both" ? "library.duplicateInstalls.keptAll" : "library.duplicateInstalls.keptOne", {
      game: conflict.variants[0].game || conflict.variants[0].name,
      defaultValue: choice === "both" ? "Saved: keeping all entries for {{game}}." : "Saved: keeping the selected install for {{game}} and hiding the others.",
    }));
  };
  return (
    <AlertDialog
      open
      onOpenChange={open => {
        if (!open) onLater();
      }}
    >
      <AlertDialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("library.duplicateInstalls.title", {
              defaultValue: "Multiple installs found",
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("library.duplicateInstalls.description", {
              defaultValue:
                "Keep all entries, or choose one and permanently hide the others. This choice applies to your library and Big Picture. Your game files stay on disk.",
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <h3 className="font-semibold">
          {conflict.variants[0].game || conflict.variants[0].name}
        </h3>
        {conflict.variants.map(game => (
          <div key={libraryInstallKey(game)} className="space-y-2 rounded-lg border p-3">
            <p className="text-sm">
              {game.isCustom
                ? t("library.duplicateInstalls.custom", {
                    defaultValue: "Custom / imported",
                  })
                : t("library.duplicateInstalls.installed", { defaultValue: "Installed" })}
              {game.version ? ` · ${game.version}` : ""}
            </p>
            <p className="break-all text-xs text-muted-foreground">
              {game.executable ||
                t("library.duplicateInstalls.noExecutable", {
                  defaultValue: "No executable selected",
                })}
            </p>
            <p className="break-all text-xs text-muted-foreground">{game._sourceDir}</p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => choose(libraryInstallKey(game))}
            >
              {t("library.duplicateInstalls.keepOne", {
                defaultValue: "Keep this entry and hide the others",
              })}
            </Button>
          </div>
        ))}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onLater}>
            {t("library.duplicateInstalls.later", { defaultValue: "Decide later" })}
          </AlertDialogCancel>
          <Button onClick={() => choose("both")}>
            {t("library.duplicateInstalls.keepAll", { defaultValue: "Keep all entries" })}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
