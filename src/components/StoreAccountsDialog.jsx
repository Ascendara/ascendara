import { useCallback, useEffect, useRef, useState } from "react";
import {
  Library,
  Loader2,
  RefreshCw,
  ShieldCheck,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";
import { storeGameKey, storeNames } from "@/lib/storeLibrary";

// Each store gets a recognisable monogram instead of a generic icon
const storeMarks = { steam: "S", epic: "E", gog: "G" };

// Connect stores and choose which of their games show up in the library.
// Owned games themselves live in the library as regular cards.
export default function StoreAccountsDialog({
  open,
  onOpenChange,
  preferences,
  onPreferencesChange,
  onShowInLibrary,
}) {
  const { t } = useLanguage();
  const [snapshot, setSnapshot] = useState(null);
  const [pending, setPending] = useState({});
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState(false);
  const mounted = useRef(false);
  const locks = useRef(new Set());

  const refresh = useCallback(async () => {
    const result = await window.electron.storeAccounts.state();
    if (!result.success) throw new Error(result.error);
    if (mounted.current) setSnapshot(result.data);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    refresh().catch(() =>
      setError(
        t("storeAccounts.loadFailed", "Could not load store accounts. Try reopening this window.")
      )
    );
  }, [open, refresh, t]);

  const act = async (action, store) => {
    if (locks.current.has(store) && !["cancel", "disconnect"].includes(action)) return;
    locks.current.add(store);
    setPending(previous => ({ ...previous, [store]: action }));
    setError("");
    try {
      const result = await window.electron.storeAccounts[action](store);
      if (!result.success) throw new Error(result.error);
      // Connecting a store means you want to see its games, so make sure
      // they actually show up instead of staying hidden behind a switch
      if (action === "connect" && (!preferences.enabled || !preferences.stores.includes(store)))
        update({
          ...preferences,
          enabled: true,
          stores: [...new Set([...preferences.stores, store])],
        });
      window.dispatchEvent(new Event("store-accounts-updated"));
    } catch (failure) {
      if (mounted.current)
        setError(
          failure.message ||
            t("storeAccounts.failed", "The account operation failed. Please try again.")
        );
    } finally {
      locks.current.delete(store);
      if (mounted.current) {
        setPending(previous => ({ ...previous, [store]: null }));
        await refresh().catch(() => {});
      }
    }
  };

  const update = next => setSaveError(!onPreferencesChange(next));
  const accounts = snapshot?.accounts || [];
  const connected = accounts.filter(account => account.connected);
  const hiddenGames = new Set(preferences.hiddenGames || []);
  const hiddenEntries = connected.flatMap(account => account.games
    .filter(game => hiddenGames.has(storeGameKey(account.store, game.id)))
    .map(game => ({ ...game, store: account.store })));
  const visibleCount = connected
    .filter(account => preferences.stores.includes(account.store))
    .reduce((sum, account) => sum + account.games.filter(game =>
      !hiddenGames.has(storeGameKey(account.store, game.id))).length, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden border-border bg-background p-0 text-foreground sm:max-w-xl">
        <DialogHeader className="shrink-0 px-6 pb-4 pt-6 text-left">
          <DialogTitle className="pr-6">{t("storeAccounts.title", "Store accounts")}</DialogTitle>
          <DialogDescription className="pr-6 leading-relaxed">
            {t(
              "storeAccounts.description",
              "Connect your accounts to browse games you own, including games that are not installed."
            )}{" "}
            <button
              type="button"
              className="inline-flex items-center text-sm font-medium text-primary hover:underline"
              onClick={() => window.electron.openURL("https://ascendara.app/docs/features/importing#store-accounts")}
            >
              {t("common.learnMore")}
              <ExternalLink className="ml-1 h-3 w-3" />
            </button>
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-5">
          {(error || saveError) && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {error ||
                t(
                  "storeAccounts.display.saveError",
                  "Could not save this preference. Please try again."
                )}
            </p>
          )}
          {snapshot && !snapshot.secureStorage && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {t(
                "storeAccounts.keyring",
                "Secure storage is unavailable. Unlock your system keyring and restart Ascendara to connect accounts."
              )}
            </p>
          )}

          {/* Master switch for owned games in the library */}
          <div className="flex items-center gap-4 rounded-xl border border-border/60 bg-card p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Library className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <label htmlFor="show-owned-games" className="cursor-pointer text-sm font-semibold">
                {t("storeAccounts.display.show", "Show connected-store games")}
              </label>
              <p
                id="show-owned-description"
                className="mt-0.5 text-xs leading-relaxed text-muted-foreground"
              >
                {t(
                  "storeAccounts.display.showDescription",
                  "Include games you own on other stores, even when they are not installed."
                )}
              </p>
            </div>
            <Switch
              id="show-owned-games"
              aria-describedby="show-owned-description"
              checked={preferences.enabled}
              onCheckedChange={enabled => update({ ...preferences, enabled })}
            />
          </div>

          {hiddenEntries.length > 0 && (
            <div className="rounded-xl border border-border/60 bg-card p-4">
              <h3 className="text-sm font-semibold">
                {t("storeAccounts.gameOptions.hidden", "Removed from Library")}
              </h3>
              <div className="mt-3 max-h-40 space-y-1 overflow-y-auto">
                {hiddenEntries.map(game => (
                  <div key={storeGameKey(game.store, game.id)} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate" title={game.name}>
                      {game.name} · {storeNames[game.store]}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => update({
                      ...preferences,
                      hiddenGames: (preferences.hiddenGames || []).filter(key =>
                        key !== storeGameKey(game.store, game.id)),
                    })}>
                      {t("storeAccounts.gameOptions.restore", "Restore")}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* One row per store: connection and whether it shows in the library */}
          {!snapshot && !error ? (
            <div
              role="status"
              className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"
            >
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {t("storeAccounts.loading", "Loading accounts")}
            </div>
          ) : (
            <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-card">
              {accounts.map(account => {
                const busy = Boolean(pending[account.store] || account.busy);
                const visible = preferences.stores.includes(account.store);
                return (
                  <li key={account.store} className="flex items-center gap-3 p-4">
                    <span
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold",
                        account.connected
                          ? "bg-primary text-secondary"
                          : "bg-muted text-muted-foreground"
                      )}
                      aria-hidden="true"
                    >
                      {storeMarks[account.store]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold">{storeNames[account.store]}</h3>
                        {account.connected && (
                          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                        )}
                      </div>
                      <p
                        className="truncate text-xs text-muted-foreground"
                        title={account.displayName}
                      >
                        {account.connected
                          ? [
                              account.displayName,
                              t("storeAccounts.gameCount", {
                                defaultValue: "{{count}} games",
                                count: account.games.length,
                              }),
                              account.lastSync &&
                                new Date(account.lastSync).toLocaleDateString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                }),
                            ]
                              .filter(Boolean)
                              .join(" · ")
                          : t("storeAccounts.notConnected", "Not connected")}
                      </p>
                      {account.error && (
                        <p role="alert" className="mt-0.5 text-xs text-destructive">
                          {account.error}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {busy ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-2"
                          onClick={() => act("cancel", account.store)}
                        >
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          {t("storeAccounts.cancel", "Cancel")}
                        </Button>
                      ) : account.connected ? (
                        <>
                          {account.error ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!snapshot.secureStorage}
                              onClick={() => act("connect", account.store)}
                            >
                              {t("storeAccounts.reconnect", "Reconnect")}
                            </Button>
                          ) : (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-muted-foreground"
                              title={t("storeAccounts.refresh", "Refresh")}
                              aria-label={t("storeAccounts.refresh", "Refresh")}
                              onClick={() => act("refresh", account.store)}
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-muted-foreground hover:text-red-500"
                            onClick={() => act("disconnect", account.store)}
                          >
                            {t("storeAccounts.disconnect", "Disconnect")}
                          </Button>
                          <Switch
                            checked={visible}
                            disabled={!preferences.enabled}
                            aria-label={t("storeAccounts.showInLibrary", {
                              defaultValue: "Show {{store}} games in library",
                              store: storeNames[account.store],
                            })}
                            title={t("storeAccounts.showInLibrary", {
                              defaultValue: "Show {{store}} games in library",
                              store: storeNames[account.store],
                            })}
                            onCheckedChange={checked =>
                              update({
                                ...preferences,
                                stores: checked
                                  ? [...preferences.stores, account.store]
                                  : preferences.stores.filter(id => id !== account.store),
                              })
                            }
                          />
                        </>
                      ) : (
                        <Button
                          size="sm"
                          className="text-secondary"
                          disabled={!snapshot.secureStorage}
                          onClick={() => act("connect", account.store)}
                        >
                          {t("storeAccounts.connect", "Connect")}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
            <p className="flex gap-2">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              {t(
                "storeAccounts.privacy",
                "Sign in directly with each store. Saved sessions and library data are encrypted on this device. Disconnect removes Ascendara’s saved connection and library."
              )}
            </p>
            <p className="pl-6">
              {t(
                "storeAccounts.display.note",
                "Installed games take priority, so matching store titles are hidden. Store games open in their own launcher or downloads page."
              )}{" "}
              {t(
                "storeAccounts.localOnly",
                "Ubisoft and Battle.net remain available through the local launcher scan. Installation is handled by each store; GOG opens your downloads page."
              )}
            </p>
          </div>
        </div>

        <DialogFooter className="shrink-0 flex-row items-center gap-2 border-t border-border bg-muted/10 px-6 py-4 sm:justify-between sm:space-x-0">
          <p className="mr-auto text-xs text-muted-foreground">
            {!connected.length
              ? t("storeAccounts.start", "Connect a store above to see your owned games.")
              : preferences.enabled
                ? t("storeAccounts.summary", {
                    defaultValue: "{{count}} owned games in your library",
                    count: visibleCount,
                  })
                : t("storeAccounts.summaryHidden", "Owned games are hidden from your library")}
          </p>
          {onShowInLibrary && connected.length > 0 && preferences.enabled && visibleCount > 0 ? (
            <Button className="gap-2 text-secondary" onClick={onShowInLibrary}>
              {t("storeAccounts.viewInLibrary", "View in library")}
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              variant="outline"
              className="text-foreground"
              onClick={() => onOpenChange(false)}
            >
              {t("common.close", "Close")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
