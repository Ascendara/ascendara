import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/LanguageContext";
import {
  Check,
  FolderIcon,
  FolderSync,
  Library,
  Star,
  Trash2,
  TriangleAlert,
  Trophy,
} from "lucide-react";

export function ReinstallDialog({ open, onOpenChange, onGoToLibrary, onContinue }) {
  const { t } = useLanguage();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {t("download.reinstallWarning.title") || "Game Already Installed"}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            {t("download.reinstallWarning.desc") ||
              "This game is already installed in your library. Reinstalling may cause issues such as overwriting save data or corrupting existing files. Are you sure you want to continue?"}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </AlertDialogCancel>
          <Button className="text-foreground" onClick={onGoToLibrary}>
            <Library className="mr-2 h-4 w-4" />
            {t("download.goToLibrary") || "Go to Library"}
          </Button>
          <Button variant="destructive" className="text-foreground" onClick={onContinue}>
            {t("download.reinstallWarning.continueAnyway") || "Reinstall Anyway"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ConflictOption({ icon: Icon, title, description, className, ...props }) {
  return (
    <Button
      variant="outline"
      className={`h-auto flex-col items-start gap-1 whitespace-normal py-2 text-left ${className || ""}`}
      {...props}
    >
      <span className="flex items-center gap-2 font-medium">
        <Icon className="h-4 w-4" />
        {title}
      </span>
      <span className="text-xs font-normal text-muted-foreground">{description}</span>
    </Button>
  );
}

export function DirectoryConflictDialog({
  conflict,
  step,
  onStepChange,
  busy,
  gameName,
  onResolve,
  onDismiss,
}) {
  const { t } = useLanguage();
  return (
    <AlertDialog
      open={!!conflict}
      onOpenChange={open => {
        if (!open && !busy) onDismiss();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {step === "confirmMerge"
              ? t("download.directoryConflict.confirmMergeTitle")
              : t("download.directoryConflict.title")}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            {step === "confirmDelete"
              ? t("library.saveGameDataDescription", { game: gameName })
              : step === "confirmMerge"
                ? t("download.directoryConflict.confirmMergeDesc")
                : t("download.directoryConflict.desc", {
                    folder: conflict?.sanitizedName,
                  })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {step === "choose" && (
          <div className="flex flex-col gap-2 text-foreground">
            <ConflictOption
              icon={FolderSync}
              title={t("download.directoryConflict.rename")}
              description={t("download.directoryConflict.renameDesc")}
              disabled={busy}
              onClick={() => onResolve("rename")}
            />
            <ConflictOption
              icon={Trash2}
              title={t("download.directoryConflict.delete")}
              description={t("download.directoryConflict.deleteDesc")}
              disabled={busy}
              onClick={() => onStepChange("confirmDelete")}
            />
            <ConflictOption
              icon={TriangleAlert}
              title={t("download.directoryConflict.merge")}
              description={t("download.directoryConflict.mergeDesc")}
              disabled={busy}
              onClick={() => onStepChange("confirmMerge")}
            />
          </div>
        )}

        <AlertDialogFooter>
          {step !== "choose" && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => onStepChange("choose")}
            >
              {t("common.back") || "Back"}
            </Button>
          )}
          <AlertDialogCancel disabled={busy} onClick={onDismiss}>
            {t("common.cancel")}
          </AlertDialogCancel>
          {step === "confirmDelete" && (
            <>
              <Button
                variant="outline"
                className="text-primary"
                disabled={busy}
                onClick={() => onResolve("delete", { saveData: false })}
              >
                {t("library.saveGameDataNo")}
              </Button>
              <Button
                variant="destructive"
                className="text-foreground"
                disabled={busy}
                onClick={() => onResolve("delete", { saveData: true })}
              >
                {t("library.saveGameDataYes")}
              </Button>
            </>
          )}
          {step === "confirmMerge" && (
            <Button
              variant="destructive"
              className="text-foreground"
              disabled={busy}
              onClick={() => onResolve("merge")}
            >
              {t("download.directoryConflict.confirmMerge")}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ProviderBlockedDialog({ open, onOpenChange }) {
  const { t } = useLanguage();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {t("download.providerBlocked.title")}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            {t("download.providerBlocked.desc")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onOpenChange(false)}>
            {t("download.providerBlocked.gotIt")}
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function NoDownloadPathDialog({ open, onOpenChange, onGoToSettings }) {
  const { t } = useLanguage();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("download.noDownloadPath.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("download.noDownloadPath.desc")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </AlertDialogCancel>
          <Button onClick={onGoToSettings}>
            <FolderIcon className="mr-2 h-4 w-4" />
            {t("download.noDownloadPath.goToSettings")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function UpdateDialog({ open, onOpenChange, gameName, onConfirm }) {
  const { t } = useLanguage();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-2xl font-bold text-foreground">
            {t("download.update.title", { game: gameName })}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-4 text-muted-foreground">
            {t("download.update.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            variant="outline"
            className="text-primary"
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button className="text-secondary" onClick={onConfirm}>
            {t("common.ok")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function QueueDialog({
  open,
  onOpenChange,
  isAuthenticated,
  onCancel,
  onAddToQueue,
  onStartNow,
}) {
  const { t } = useLanguage();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-2xl font-bold text-foreground">
            {t("download.queue.title", "Download in Progress")}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-4 text-muted-foreground">
            {isAuthenticated
              ? t(
                  "download.queue.description",
                  "Another download is currently in progress. Would you like to add this game to the queue or start it now?"
                )
              : t(
                  "download.queue.descriptionFree",
                  "Another download is currently in progress. You can queue 1 download to start automatically when the current one finishes."
                )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="text-primary" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button variant="outline" className="text-primary" onClick={onAddToQueue}>
            {t("download.queue.addToQueue", "Add to Queue")}
          </Button>
          {isAuthenticated && (
            <Button className="text-secondary" onClick={onStartNow}>
              {t("download.queue.startNow", "Start Now")}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function SelectPathDialog({
  open,
  onOpenChange,
  defaultDirectory,
  additionalDirectories,
  onSelect,
}) {
  const { t } = useLanguage();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-[425px]">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("download.selectPath.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("download.selectPath.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2 py-2 text-foreground">
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => onSelect(0)}
          >
            <FolderIcon className="mr-2 h-4 w-4 shrink-0" />
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="truncate">
                {defaultDirectory || t("download.selectPath.defaultDirectory")}
              </span>
              <span className="shrink-0 rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
                {t("download.selectPath.default")}
              </span>
            </div>
          </Button>
          {additionalDirectories?.map((dir, index) => (
            <Button
              key={index}
              variant="outline"
              className="w-full justify-start"
              onClick={() => onSelect(index + 1)}
            >
              <FolderIcon className="mr-2 h-4 w-4 shrink-0" />
              <span className="truncate">{dir}</span>
            </Button>
          ))}
        </div>
        <AlertDialogFooter>
          <Button
            variant="outline"
            className="text-primary"
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function NewUserGuideDialog({ open, onClose, onFinish }) {
  const { t } = useLanguage();
  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent className="sm:max-w-[600px]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-2xl font-bold text-foreground">
            {t("download.newUserGuide.title")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("download.newUserGuide.description")}
          </AlertDialogDescription>
          <div className="mt-4">
            <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
              <iframe
                className="absolute left-0 top-0 h-full w-full rounded-lg"
                src="https://www.youtube.com/embed/1SwhCFKbhFU?si=BZ3qSKaCwSjkQfBb"
                title="YouTube video player"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="text-primary" onClick={onClose}>
            {t("download.newUserGuide.noThanks")}
          </AlertDialogCancel>
          <Button className="text-secondary" onClick={onFinish}>
            {t("download.newUserGuide.finish")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function VerifiedDialog({ open, onOpenChange }) {
  const { t } = useLanguage();
  const description = t("gameCard.verified.dialogDescription");
  const highlight = "verified by the Ascendara community";
  const [before, after] = description.split(highlight);
  const points = [
    { icon: Trophy, key: "highlyRated" },
    { icon: Star, key: "mostPopular" },
    { icon: Check, key: "alwaysWorking" },
  ];
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md border-primary/20">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-2xl font-bold">
            {t("gameCard.verified.dialogTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-4 pt-4 text-left">
            <p className="text-base leading-relaxed">
              {before}
              {description.includes(highlight) && (
                <span className="font-semibold text-primary">{highlight}</span>
              )}
              {after}
            </p>

            <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
              {points.map(({ icon: Icon, key }) => (
                <div key={key} className="flex items-start gap-3">
                  <Icon className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                  <div>
                    <h4 className="font-semibold text-foreground">
                      {t(`gameCard.verified.${key}`)}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {t(`gameCard.verified.${key}Desc`)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-sm text-muted-foreground">
              {t("gameCard.verified.selectionCriteria")}
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex justify-end pt-2">
          <AlertDialogCancel className="border-primary/20 hover:bg-primary/10">
            {t("gameCard.verified.gotIt")}
          </AlertDialogCancel>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
