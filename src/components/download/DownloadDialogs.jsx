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
import { Checkbox } from "@/components/ui/checkbox";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";
import {
  Check,
  FolderIcon,
  FolderSync,
  Library,
  Loader,
  Star,
  Trash2,
  TriangleAlert,
  Trophy,
} from "lucide-react";
import { useEffect, useState } from "react";

function ChoiceCard({ selected, disabled, onSelect, children, className }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-50",
        selected
          ? "border-primary bg-primary/10"
          : "border-border hover:border-primary/50 hover:bg-muted/50",
        className
      )}
    >
      {children}
    </button>
  );
}

// One screen for redownloading a game that is already installed or whose
// folder already exists: where to install, what to do with the old copy,
// and whether to keep its stats, instead of a chain of separate prompts.
export function ExistingInstallDialog({
  prompt,
  directories,
  busy,
  gameName,
  onDirChange,
  onConfirm,
  onGoToLibrary,
  onDismiss,
}) {
  const { t } = useLanguage();
  const [action, setAction] = useState("delete");
  const [keepData, setKeepData] = useState(true);
  const open = !!prompt;

  useEffect(() => {
    if (open) {
      setAction("delete");
      setKeepData(true);
    }
  }, [open]);

  const conflict = prompt?.conflicts[prompt.dir];
  const hasFolder = !!conflict?.exists;

  const options = [
    {
      id: "delete",
      icon: Trash2,
      title: t("download.existingInstall.replace"),
      description: t("download.existingInstall.replaceDesc"),
    },
    {
      id: "rename",
      icon: FolderSync,
      title: t("download.directoryConflict.rename"),
      description: t("download.directoryConflict.renameDesc"),
    },
    {
      id: "merge",
      icon: TriangleAlert,
      title: t("download.directoryConflict.merge"),
      description: t("download.directoryConflict.mergeDesc"),
    },
  ];

  return (
    <AlertDialog
      open={open}
      onOpenChange={next => {
        if (!next && !busy) onDismiss();
      }}
    >
      <AlertDialogContent className="sm:max-w-[480px]">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {prompt?.installed
              ? t("download.reinstallWarning.title")
              : t("download.directoryConflict.title")}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            {prompt?.installed
              ? t("download.existingInstall.descInstalled", { game: gameName })
              : t("download.directoryConflict.desc", {
                  folder: conflict?.sanitizedName,
                })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-4 text-foreground">
          {directories.length > 1 && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-muted-foreground">
                {t("download.existingInstall.installTo")}
              </span>
              <div role="radiogroup" className="flex flex-col gap-1.5">
                {directories.map(({ index, path }) => (
                  <ChoiceCard
                    key={index}
                    selected={prompt?.dir === index}
                    disabled={busy}
                    onSelect={() => onDirChange(index)}
                    className="items-center py-1.5"
                  >
                    <FolderIcon className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-sm">{path}</span>
                    {prompt?.conflicts[index]?.exists && (
                      <span className="shrink-0 rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
                        {t("download.existingInstall.existingCopy")}
                      </span>
                    )}
                  </ChoiceCard>
                ))}
              </div>
            </div>
          )}

          {hasFolder ? (
            <div role="radiogroup" className="flex flex-col gap-1.5">
              {options.map(({ id, icon: Icon, title, description }) => (
                <ChoiceCard
                  key={id}
                  selected={action === id}
                  disabled={busy}
                  onSelect={() => setAction(id)}
                >
                  <Icon
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0",
                      id === "merge" && "text-yellow-500"
                    )}
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{title}</span>
                    <span className="text-xs text-muted-foreground">{description}</span>
                  </span>
                </ChoiceCard>
              ))}
              {action === "delete" && (
                <div className="mt-1 flex items-center gap-2 px-1 text-sm">
                  <Checkbox
                    checked={keepData}
                    disabled={busy}
                    onCheckedChange={setKeepData}
                  />
                  <span
                    className="cursor-pointer select-none"
                    onClick={() => !busy && setKeepData(!keepData)}
                  >
                    {t("download.existingInstall.keepData")}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("download.existingInstall.noFolderHere")}
            </p>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} onClick={onDismiss}>
            {t("common.cancel")}
          </AlertDialogCancel>
          {prompt?.installed && (
            <Button
              variant="outline"
              className="text-primary"
              disabled={busy}
              onClick={onGoToLibrary}
            >
              <Library className="mr-2 h-4 w-4" />
              {t("download.goToLibrary")}
            </Button>
          )}
          <Button
            variant={hasFolder && action !== "rename" ? "destructive" : "default"}
            className={hasFolder && action !== "rename" ? "text-foreground" : "text-secondary"}
            disabled={busy}
            onClick={() =>
              onConfirm(hasFolder ? action : null, {
                saveData: action === "delete" && keepData,
              })
            }
          >
            {busy && <Loader className="mr-2 h-4 w-4 animate-spin" />}
            {prompt?.installed
              ? t("download.existingInstall.reinstall")
              : t("download.existingInstall.continue")}
          </Button>
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
