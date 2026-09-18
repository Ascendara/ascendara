import { Link } from "react-router-dom";
import { retroBackupPlatform } from "@/services/retroService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  Cloud,
  Gamepad2,
  RefreshCw,
  Trash2,
  Crown,
  CloudOff,
  FolderSync,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function CloudBackupsSection({
  t,
  ascendAccess,
  setActiveSection,
  loadBackups,
  backupFilterGame,
  loadingBackups,
  setBackupFilterGame,
  backups,
  deletingBackup,
  handleDeleteBackup,
}) {
  return (
    <div className="mb-24 space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-cyan-500/10 p-6">
        <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-cyan-500 shadow-lg">
            <Cloud className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">
              {t("ascend.cloudBackups.title") || "Cloud Backups"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("ascend.cloudBackups.subtitle") || "Backup and restore your game saves"}
            </p>
          </div>
        </div>
      </div>

      {!ascendAccess.isSubscribed && !ascendAccess.isVerified ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/50 bg-card/30 py-20">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
            <Crown className="h-8 w-8 text-amber-500" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">
            {t("ascend.cloudBackups.subscriptionRequired") || "Subscription Required"}
          </h3>
          <p className="mt-2 max-w-sm text-center text-sm text-muted-foreground">
            {t("ascend.cloudBackups.subscriptionRequiredDesc") ||
              "Cloud backups require an active Ascend subscription. Upgrade to access this feature."}
          </p>
          <Button onClick={() => setActiveSection("premium")} className="mt-6">
            <Crown className="mr-2 h-4 w-4" />
            {t("ascend.cloudBackups.viewPlans") || "View Plans"}
          </Button>
        </div>
      ) : (
        <>
          {/* Backups List */}
          <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/50">
            <div className="flex items-center justify-between border-b border-border/50 p-5">
              <div className="flex items-center gap-2">
                <Cloud className="h-5 w-5 text-primary" />
                <h2 className="font-semibold">
                  {t("ascend.cloudBackups.yourBackups") || "Your Backups"}
                </h2>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadBackups(backupFilterGame || null)}
                disabled={loadingBackups}
              >
                {loadingBackups ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="p-5">
              <div className="mb-4">
                <Input
                  placeholder={
                    t("ascend.cloudBackups.filterByGame") || "Filter by game name..."
                  }
                  value={backupFilterGame}
                  onChange={e => {
                    setBackupFilterGame(e.target.value);
                    loadBackups(e.target.value || null);
                  }}
                />
              </div>
              {loadingBackups ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : backups.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <CloudOff className="h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-4 text-sm text-muted-foreground">
                    {t("ascend.cloudBackups.noBackups") || "No backups found"}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Group backups by game */}
                  {Object.entries(
                    backups.reduce((acc, backup) => {
                      const gameName = backup.gameName;
                      if (!acc[gameName]) acc[gameName] = [];
                      acc[gameName].push(backup);
                      return acc;
                    }, {})
                  ).map(([gameName, gameBackups]) => (
                    <div key={gameName} className="space-y-2">
                      {/* Game Header */}
                      <div className="flex items-center gap-2 px-2">
                        <Gamepad2 className="h-4 w-4 text-primary" />
                        <h3 className="font-semibold text-foreground">{gameName}</h3>
                        <span className="text-xs text-muted-foreground">
                          ({gameBackups.length} backup
                          {gameBackups.length !== 1 ? "s" : ""})
                        </span>
                      </div>
                      {/* Backups for this game */}
                      <div className="space-y-2">
                        {gameBackups.map(backup => (
                          <div
                            key={backup.backupId}
                            className="ml-6 flex items-center justify-between rounded-xl border border-border/50 bg-muted/30 p-4"
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                                <Cloud className="h-4 w-4 text-primary" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-medium">
                                  {backup.backupName}
                                </p>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span>
                                    {new Date(backup.createdAt).toLocaleDateString()}{" "}
                                    {new Date(backup.createdAt).toLocaleTimeString()}
                                  </span>
                                  {backup.size && backup.size > 0 && (
                                    <>
                                      <span>•</span>
                                      <span>
                                        {(backup.size / 1024 / 1024).toFixed(2)} MB
                                      </span>
                                    </>
                                  )}
                                </div>
                                <div className="mt-1 flex items-center gap-2">
                                  <span className="rounded-full bg-gradient-to-r from-blue-500 to-purple-500 px-2 py-0.5 text-xs font-medium text-white">
                                    <Cloud className="mr-1 inline h-3 w-3" />
                                    Cloud
                                  </span>
                                  {backup.existsLocally && (
                                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                      <FolderSync className="mr-1 inline h-3 w-3" />
                                      Local
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {retroBackupPlatform(backup.gameName) && (
                                <Link
                                  to={`/retro?saves=${retroBackupPlatform(backup.gameName)}`}
                                  className="inline-flex h-9 items-center rounded-md border border-input px-3 text-sm font-medium text-foreground hover:bg-accent"
                                >
                                  Restore Retro saves
                                </Link>
                              )}
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={deletingBackup === backup.backupId}
                                  >
                                    {deletingBackup === backup.backupId ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-4 w-4" />
                                    )}
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>
                                      {t("ascend.cloudBackups.deleteTitle") ||
                                        "Delete Backup?"}
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                      {t("ascend.cloudBackups.deleteDesc") ||
                                        "This will permanently delete this backup from cloud storage. This action cannot be undone."}
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>
                                      {t("common.cancel") || "Cancel"}
                                    </AlertDialogCancel>
                                    <Button
                                      variant="destructive"
                                      onClick={() => handleDeleteBackup(backup.backupId)}
                                    >
                                      {t("common.delete") || "Delete"}
                                    </Button>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
