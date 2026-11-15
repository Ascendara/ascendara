import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useLanguage } from "@/context/LanguageContext";
import nexusModsService from "@/services/integrations/nexusModsService";
import {
  BookX,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  ExternalLink,
  Loader,
  Tag,
  Trash2,
} from "lucide-react";
import { useState } from "react";

/** A Nexus mod's details and files, each downloadable from Nexus. */
export default function ModDetailsDialog({
  open,
  onOpenChange,
  mod,
  files,
  loading,
  onDownload,
}) {
  const { t } = useLanguage();
  const [showOldVersions, setShowOldVersions] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>{mod?.name}</AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-muted-foreground">
            {mod?.uploader?.name
              ? `${t("gameScreen.modBy")} ${mod.uploader.name}`
              : t("gameScreen.modDetails")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          {mod?.pictureUrl && (
            <div className="aspect-video overflow-hidden rounded-lg bg-muted">
              <img
                src={mod.pictureUrl}
                alt={mod.name}
                className="h-full w-full object-cover"
              />
            </div>
          )}

          {mod?.summary && <p className="text-sm text-muted-foreground">{mod.summary}</p>}

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {mod?.version && (
              <span className="flex items-center gap-1">
                <Tag className="h-4 w-4" />v{mod.version}
              </span>
            )}
            {mod?.modCategory?.name && (
              <span className="rounded bg-muted px-2 py-0.5">{mod.modCategory.name}</span>
            )}
          </div>

          <Separator />

          {/* Mod Files Section */}
          <div>
            <h3 className="mb-3 font-semibold text-primary">
              {t("gameScreen.modFiles")}
            </h3>
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : files.length > 0 ? (
              <div className="space-y-2">
                {/* Current/Main files */}
                {[...files]
                  .filter(
                    file =>
                      !["OLD_VERSION", "REMOVED", "ARCHIVED"].includes(file.category)
                  )
                  .sort((a, b) => (b.primary || 0) - (a.primary || 0))
                  .map((file, index) => (
                    <div
                      key={file.fileId || index}
                      className={`flex items-center justify-between rounded-lg border p-3 ${
                        file.primary === 1 ? "border-primary/50 bg-primary/10" : "bg-card"
                      }`}
                    >
                      <div className="flex-1 overflow-hidden">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-medium text-foreground">
                            {file.name}
                          </p>
                          {file.primary === 1 && (
                            <span className="shrink-0 rounded bg-primary px-1.5 py-0.5 text-xs font-medium text-secondary">
                              {t("gameScreen.mainFile")}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                          {file.version && <span>v{file.version}</span>}
                          {file.sizeInBytes && (
                            <span>
                              {nexusModsService.formatFileSize(file.sizeInBytes)}
                            </span>
                          )}
                          {file.category && <span>{file.category}</span>}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="ml-3 gap-1 text-secondary"
                        onClick={() => onDownload(mod, file.fileId)}
                      >
                        <Download className="h-4 w-4" />
                        {t("gameScreen.downloadFile")}
                      </Button>
                    </div>
                  ))}

                {/* Hidden categories collapsible sections */}
                {["OLD_VERSION", "ARCHIVED", "REMOVED"].map(category => {
                  const filesInCategory = files.filter(
                    file => file.category === category
                  );
                  if (filesInCategory.length === 0) return null;

                  const isExpanded = showOldVersions;
                  const categoryLabels = {
                    OLD_VERSION: { key: "oldVersions", icon: Clock },
                    ARCHIVED: { key: "archivedFiles", icon: BookX },
                    REMOVED: { key: "removedFiles", icon: Trash2 },
                  };
                  const { key, icon: Icon } = categoryLabels[category];

                  return (
                    <div key={category} className="mt-4">
                      <button
                        onClick={() => setShowOldVersions(!showOldVersions)}
                        className="flex w-full items-center justify-between rounded-lg border border-dashed bg-muted/30 px-4 py-3 text-sm text-muted-foreground transition-colors hover:bg-muted/50"
                      >
                        <span className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          {t(`gameScreen.${key}`, { count: filesInCategory.length })}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </button>

                      {isExpanded && (
                        <div className="mt-2 space-y-2">
                          {filesInCategory.map((file, index) => (
                            <div
                              key={file.fileId || index}
                              className="flex items-center justify-between rounded-lg border bg-card/50 p-3 opacity-75"
                            >
                              <div className="flex-1 overflow-hidden">
                                <div className="flex items-center gap-2">
                                  <p className="truncate font-medium text-foreground">
                                    {file.name}
                                  </p>
                                </div>
                                <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                                  {file.version && <span>v{file.version}</span>}
                                  {file.sizeInBytes && (
                                    <span>
                                      {nexusModsService.formatFileSize(file.sizeInBytes)}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="ml-3 gap-1 text-primary"
                                onClick={() => onDownload(mod, file.fileId)}
                              >
                                <Download className="h-4 w-4" />
                                {t("gameScreen.downloadFile")}
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  {t("gameScreen.noFilesFound")}
                </p>
                <Button
                  variant="outline"
                  className="mt-3 gap-2"
                  onClick={() => onDownload(mod)}
                >
                  <ExternalLink className="h-4 w-4" />
                  {t("gameScreen.viewOnNexus")}
                </Button>
              </div>
            )}
          </div>
        </div>

        <AlertDialogFooter className="mt-4">
          <Button
            className="text-primary"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("common.close")}
          </Button>
          <Button className="gap-2 text-secondary" onClick={() => onDownload(mod)}>
            <ExternalLink className="h-4 w-4" />
            {t("gameScreen.viewOnNexus")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
