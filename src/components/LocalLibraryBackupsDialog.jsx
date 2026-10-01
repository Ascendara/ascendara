import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Gamepad2, Loader, Search, Check, ChevronDown, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

export default function LocalLibraryBackupsDialog({
  open,
  onOpenChange,
  gameNames,
  backupLocation,
}) {
  const { t, i18n } = useTranslation();
  const [game, setGame] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const normalize = value =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase(i18n.resolvedLanguage || i18n.language);
  const searchWords = normalize(search.trim()).split(/\s+/).filter(Boolean);
  const matchingGames = [...new Set(gameNames)]
    .filter(name => searchWords.every(word => normalize(name).includes(word)))
    .sort((a, b) => a.localeCompare(b, i18n.resolvedLanguage || i18n.language));
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const selectedGame = gameNames.includes(game) ? game : "";

  useEffect(() => {
    if (!open) {
      setPickerOpen(false);
      setSearch("");
    }
  }, [open]);

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
          <DialogTitle className="pr-6">{t("library.libraryBackups.title")}</DialogTitle>
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
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  {t("library.libraryBackups.chooseGame")}
                </p>
                <Popover
                  open={pickerOpen && open}
                  onOpenChange={next => {
                    setPickerOpen(next);
                    setSearch("");
                  }}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="h-auto min-h-12 w-full justify-start gap-3 rounded-xl text-foreground"
                      aria-label={t("library.libraryBackups.chooseGame")}
                    >
                      <Gamepad2
                        className="h-5 w-5 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <span
                        className={`min-w-0 flex-1 truncate text-left ${selectedGame ? "font-medium" : "text-muted-foreground"}`}
                      >
                        {selectedGame || t("library.libraryBackups.chooseGame")}
                      </span>
                      <ChevronDown
                        className="h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className="w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-xl border-border bg-popover p-0 text-foreground shadow-lg"
                  >
                    <div className="relative border-b border-border p-3">
                      <Search
                        className="absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <Input
                        value={search}
                        onChange={event => setSearch(event.target.value)}
                        placeholder={t("library.libraryBackups.searchGames")}
                        aria-label={t("library.libraryBackups.searchGames")}
                        className="pl-9 pr-9"
                        onKeyDown={event => {
                          if (event.key === "ArrowDown") {
                            event.preventDefault();
                            event.currentTarget
                              .closest("[data-radix-popper-content-wrapper]")
                              ?.querySelector("[data-game-option]")
                              ?.focus();
                          }
                        }}
                      />
                      {search && (
                        <button
                          type="button"
                          onClick={event => {
                            setSearch("");
                            event.currentTarget.parentElement
                              .querySelector("input")
                              ?.focus();
                          }}
                          className="absolute right-5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={t("library.libraryBackups.clearSearch")}
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                    <p className="px-4 py-2 text-xs text-muted-foreground" role="status">
                      {t("library.libraryBackups.matchingGames", {
                        count: matchingGames.length,
                      })}
                    </p>
                    <div
                      className="max-h-[min(18rem,var(--radix-popover-content-available-height))] overflow-y-auto p-1.5"
                      onKeyDown={event => {
                        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
                          return;
                        const buttons = [
                          ...event.currentTarget.querySelectorAll("[data-game-option]"),
                        ];
                        const index = buttons.indexOf(document.activeElement);
                        if (index < 0) return;
                        event.preventDefault();
                        const next =
                          event.key === "Home"
                            ? 0
                            : event.key === "End"
                              ? buttons.length - 1
                              : Math.max(
                                  0,
                                  Math.min(
                                    buttons.length - 1,
                                    index + (event.key === "ArrowDown" ? 1 : -1)
                                  )
                                );
                        buttons[next]?.focus();
                      }}
                    >
                      {matchingGames.length === 0 ? (
                        <p className="px-3 py-5 text-center text-sm text-muted-foreground">
                          {t("library.libraryBackups.noMatchingGames")}
                        </p>
                      ) : (
                        matchingGames.map(name => (
                          <button
                            type="button"
                            key={name}
                            data-game-option
                            aria-pressed={name === selectedGame}
                            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none ${name === selectedGame ? "bg-primary/10 text-primary" : "text-foreground"}`}
                            onClick={() => {
                              if (name !== selectedGame) {
                                setBackups([]);
                                setError("");
                                setLoading(true);
                                setGame(name);
                              }
                              setPickerOpen(false);
                              setSearch("");
                            }}
                          >
                            <Gamepad2
                              className="h-4 w-4 shrink-0 text-muted-foreground"
                              aria-hidden="true"
                            />
                            <span className="min-w-0 flex-1 break-words">{name}</span>
                            {name === selectedGame && (
                              <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
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
                  <p role="alert" className="text-destructive text-sm">
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
