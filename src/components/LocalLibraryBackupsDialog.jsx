import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Gamepad2, Loader } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function LocalLibraryBackupsDialog({
  open,
  onOpenChange,
  gameNames,
  backupLocation,
}) {
  const { t, i18n } = useTranslation();
  const [game, setGame] = useState("");
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const selectedGame = gameNames.includes(game) ? game : "";

  useEffect(() => {
    if (!open || !selectedGame || !backupLocation) return;
    let active = true;
    setLoading(true);
    setError("");
    setBackups([]);
    Promise.resolve()
      .then(() => window.electron.ludusavi("list-backups", selectedGame))
      .then(result => {
        if (!active) return;
        if (!result?.success) throw new Error(result?.error);
        const info = Object.values(result.data?.games || {})[0];
        setBackups(
          [...(info?.backups || [])].sort(
            (a, b) => (Date.parse(b.when) || 0) - (Date.parse(a.when) || 0)
          )
        );
      })
      .catch(() => {
        if (active) setError(t("library.libraryBackups.listFailed"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, selectedGame, backupLocation, t]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden border-border bg-background p-0 text-foreground sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-5 text-left">
          <DialogTitle className="pr-6 text-lg font-semibold text-foreground">
            {t("library.libraryBackups.title")}
          </DialogTitle>
          <DialogDescription className="pr-6 text-sm leading-relaxed text-muted-foreground">
            {t("library.libraryBackups.viewerDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto px-6 py-5">
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm leading-relaxed text-muted-foreground">
            {t("library.libraryBackups.viewerAscendHint")}
          </div>
          {!backupLocation ? (
            <p className="text-sm text-muted-foreground">
              {t("library.libraryBackups.locationRequired")}
            </p>
          ) : gameNames.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("library.libraryBackups.noLibraryGames")}
            </p>
          ) : (
            <>
              <Select
                value={selectedGame}
                onValueChange={value => {
                  setBackups([]);
                  setError("");
                  setLoading(true);
                  setGame(value);
                }}
              >
                <SelectTrigger
                  className="text-foreground"
                  aria-label={t("library.libraryBackups.chooseGame")}
                >
                  <SelectValue placeholder={t("library.libraryBackups.chooseGame")} />
                </SelectTrigger>
                <SelectContent>
                  {[...gameNames]
                    .sort((a, b) => a.localeCompare(b))
                    .map(name => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {selectedGame &&
                (loading ? (
                  <p
                    role="status"
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <Loader className="h-4 w-4 animate-spin" aria-hidden="true" />
                    {t("library.libraryBackups.loadingLocal")}
                  </p>
                ) : error ? (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                ) : backups.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                    {t("library.libraryBackups.noLocalBackups")}
                  </p>
                ) : (
                  <ul className="divide-y divide-border rounded-xl border border-border">
                    {backups.map((backup, index) => (
                      <li key={backup.name} className="flex items-center gap-3 p-4">
                        <Gamepad2
                          className="h-4 w-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-sm font-medium text-foreground">
                            {backup.name}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {backup.when
                              ? new Date(backup.when).toLocaleString(
                                  i18n.resolvedLanguage || i18n.language
                                )
                              : ""}
                          </p>
                        </div>
                        {index === 0 && (
                          <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                            {t("library.libraryBackups.latest")}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ))}
            </>
          )}
        </div>
        <DialogFooter className="shrink-0 border-t border-border bg-muted/10 px-6 py-4">
          <Button
            variant="outline"
            className="text-foreground"
            onClick={() => onOpenChange(false)}
          >
            {t("library.libraryBackups.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
