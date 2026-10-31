import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Server,
  Plus,
  RefreshCw,
  FolderOpen,
  Pencil,
  Trash2,
  Download,
  Shield,
  Globe,
  Check,
  ExternalLink,
  ChevronDown,
  MoreHorizontal,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { privateSourceMessage } from "@/lib/privateSourceMessages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLanguage } from "@/context/LanguageContext";
import { useSettings } from "@/context/SettingsContext";
import gameService from "@/services/games/gameService";
import { toast } from "sonner";

const empty = {
  name: "",
  type: "http",
  location: "",
  token: "",
  exclude: [],
  ignore: [],
  metadataEnabled: false,
};
const learnMore = () =>
  window.electron.openURL(
    "https://www.ascendara.app/docs/features/external-sources#self-hosted-sources"
  );
const connections = [
  {
    type: "http",
    title: "privateSources.typeHttp",
    description: "privateSources.typeHttpDesc",
    icon: Globe,
  },
  {
    type: "smb",
    title: "privateSources.typeSmb",
    description: "privateSources.typeSmbDesc",
    icon: Server,
  },
  {
    type: "local",
    title: "privateSources.typeLocal",
    description: "privateSources.typeLocalDesc",
    icon: FolderOpen,
  },
];
// How often reachability is re-checked while the list is on screen
const CHECK_INTERVAL_MS = 60 * 1000;
export default function PrivateSources() {
  const [sources, setSources] = useState([]);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const { settings, updateSetting } = useSettings();
  const { t } = useLanguage();
  const typeLabels = Object.fromEntries(connections.map(c => [c.type, t(c.title)]));
  const navigate = useNavigate();
  const load = () => window.electron.privateSources.list().then(setSources);
  const check = async () => {
    setChecking(true);
    try {
      setSources(await window.electron.privateSources.check());
    } catch (e) {
      console.warn("Private source check failed:", e);
    } finally {
      setChecking(false);
    }
  };
  useEffect(() => {
    load()
      .then(check)
      .catch(e => toast.error(privateSourceMessage(t, e)));
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);
  const run = async fn => {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      toast.error(privateSourceMessage(t, e));
    } finally {
      setBusy(false);
    }
  };
  const activate = async source => {
    await updateSetting("customSourcesMode", true);
    await updateSetting("activeCustomList", null);
    await updateSetting("customSource", {
      id: source.id,
      name: source.name,
      url: `private:${source.id}`,
      privateSourceId: source.id,
      userProvided: true,
      gameCount: source.count,
    });
    gameService.notifySourceChanged();
    navigate("/search");
  };
  const refresh = s =>
    run(async () => {
      const result = await window.electron.privateSources.refresh(s.id);
      gameService.notifySourceChanged();
      if (result.error) toast.error(privateSourceMessage(t, result.error));
    });
  const remove = s =>
    run(async () => {
      await window.electron.privateSources.remove(s.id);
      if (settings.customSource?.privateSourceId === s.id) {
        await updateSetting("customSource", null);
        await updateSetting("customSourcesMode", false);
        gameService.notifySourceChanged();
      }
    });
  return (
    <section className="overflow-hidden rounded-xl bg-card shadow">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/50 p-5">
        <div className="flex items-center gap-3">
          <Server className="h-5 w-5 shrink-0 text-primary" />
          <div>
            <h2 className="mb-0 font-semibold">{t("privateSources.title")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("privateSources.description")}{" "}
              <button
                type="button"
                onClick={learnMore}
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                {t("common.learnMore")}
                <ExternalLink className="h-3 w-3" />
              </button>
            </p>
          </div>
        </div>
        <Button
          className="gap-2 text-secondary"
          disabled={busy}
          onClick={() => setDraft({ ...empty })}
        >
          <Plus className="h-4 w-4" />
          {t("privateSources.add")}
        </Button>
      </div>
      <div className="divide-y divide-border/50">
        {!sources.length && (
          <p className="p-5 text-sm text-muted-foreground">{t("privateSources.empty")}</p>
        )}
        {sources.map(s => {
          const inUse =
            !!settings.customSourcesMode &&
            settings.customSource?.privateSourceId === s.id;
          const online = s.status === "online";
          const statusLabel = online
            ? t("privateSources.online")
            : t("privateSources.offline");
          return (
            <div
              key={s.id}
              className={cn(
                "flex items-center gap-4 px-5 py-3.5",
                inUse && "bg-primary/5"
              )}
            >
              <span
                role="img"
                aria-label={statusLabel}
                title={statusLabel}
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  online ? "bg-green-500" : "bg-red-500",
                  checking && "animate-pulse"
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium">{s.name}</p>
                  {inUse && (
                    <Badge className="gap-1 text-secondary">
                      <Check className="h-3 w-3" />
                      {t("externalSources.inUse")}
                    </Badge>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground" title={s.location}>
                  {[
                    typeLabels[s.type],
                    t("privateSources.gameCount", {
                      count: s.count.toLocaleString(),
                    }),
                    statusLabel,
                  ].join(" · ")}
                </p>
                {!online && s.error && (
                  <p role="status" className="text-destructive mt-0.5 text-xs">
                    {t("privateSources.offlineError", {
                      error: privateSourceMessage(t, s.error),
                    })}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  size="sm"
                  variant={inUse ? "secondary" : "outline"}
                  disabled={busy || !s.count}
                  onClick={() => run(() => activate(s))}
                >
                  {inUse ? t("privateSources.browseGames") : t("externalSources.use")}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground"
                      disabled={busy}
                      aria-label={t("privateSources.moreOptions", { name: s.name })}
                    >
                      {busy ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <MoreHorizontal className="h-4 w-4" />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem className="gap-2" onSelect={() => refresh(s)}>
                      <RefreshCw className="h-4 w-4" />
                      {t("privateSources.rescan")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="gap-2"
                      onSelect={() => setDraft({ ...s, token: "" })}
                    >
                      <Pencil className="h-4 w-4" />
                      {t("privateSources.edit")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="gap-2"
                      disabled={!s.count}
                      onSelect={() =>
                        run(() =>
                          window.electron.privateSources.export(s.id, {
                            fileType: t("privateSources.exportFileType"),
                          })
                        )
                      }
                    >
                      <Download className="h-4 w-4" />
                      {t("privateSources.export")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:bg-destructive/10 focus:text-destructive gap-2"
                      onSelect={() => remove(s)}
                    >
                      <Trash2 className="h-4 w-4" />
                      {t("privateSources.remove")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })}
      </div>
      <Dialog
        open={!!draft}
        onOpenChange={open => {
          if (!open && !busy) setDraft(null);
        }}
      >
        <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="border-b border-border/60 px-6 py-5 pr-12">
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Server className="h-5 w-5" />
            </div>
            <DialogTitle>
              {draft?.id ? t("privateSources.editTitle") : t("privateSources.addTitle")}
            </DialogTitle>
            <DialogDescription>{t("privateSources.dialogDescription")}</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="min-h-0 space-y-6 overflow-y-auto px-6 py-5" aria-busy={busy}>
              <fieldset disabled={busy} className="space-y-3">
                <legend className="mb-3 text-sm font-medium">
                  {t("privateSources.whereStored")}
                </legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {connections.map(({ type, title, description, icon: Icon }) => (
                    <button
                      key={type}
                      type="button"
                      aria-pressed={draft.type === type}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          type,
                          location: draft.type === type ? draft.location : "",
                          token: "",
                          clearToken: false,
                        })
                      }
                      className={cn(
                        "relative rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        draft.type === type
                          ? "border-primary bg-primary/5"
                          : "border-border/60 hover:border-primary/40 hover:bg-muted/30"
                      )}
                    >
                      <Icon
                        className={cn(
                          "mb-3 h-5 w-5",
                          draft.type === type ? "text-primary" : "text-muted-foreground"
                        )}
                      />
                      {draft.type === type && (
                        <Check className="absolute right-3 top-3 h-4 w-4 text-primary" />
                      )}
                      <span className="block text-sm font-medium">{t(title)}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {t(description)}
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="private-name">{t("privateSources.nameLabel")}</Label>
                  <Input
                    id="private-name"
                    disabled={busy}
                    placeholder={t("privateSources.namePlaceholder")}
                    value={draft.name}
                    onChange={e => setDraft({ ...draft, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="private-location">
                    {draft.type === "http"
                      ? t("privateSources.urlLabel")
                      : t("privateSources.pathLabel")}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="private-location"
                      disabled={busy}
                      aria-describedby="private-location-help"
                      value={draft.location}
                      placeholder={
                        draft.type === "http"
                          ? t("privateSources.urlPlaceholder")
                          : draft.type === "smb"
                            ? t("privateSources.smbPlaceholder")
                            : t("privateSources.pathPlaceholder")
                      }
                      onChange={e => setDraft({ ...draft, location: e.target.value })}
                    />
                    {draft.type !== "http" && (
                      <Button
                        variant="outline"
                        disabled={busy}
                        className="shrink-0 gap-2"
                        onClick={() =>
                          run(async () => {
                            const location =
                              await window.electron.privateSources.folder();
                            if (location) setDraft({ ...draft, location });
                          })
                        }
                      >
                        <FolderOpen className="h-4 w-4" />
                        {t("privateSources.browse")}
                      </Button>
                    )}
                  </div>
                  <p
                    id="private-location-help"
                    className="text-xs leading-relaxed text-muted-foreground"
                  >
                    {draft.type === "http"
                      ? t("privateSources.urlHelp")
                      : draft.type === "smb"
                        ? t("privateSources.smbHelp")
                        : t("privateSources.pathHelp")}
                  </p>
                </div>
                {draft.type === "http" && draft.location.startsWith("http:") && (
                  <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-relaxed text-amber-600 dark:text-amber-400">
                    {t("privateSources.insecureWarning")}
                  </p>
                )}
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/20 p-4">
                <Checkbox
                  id="private-metadata"
                  aria-labelledby="private-metadata-label"
                  aria-describedby="private-metadata-help"
                  disabled={busy}
                  className="mt-0.5 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  checked={draft.metadataEnabled}
                  onCheckedChange={checked =>
                    setDraft({ ...draft, metadataEnabled: checked })
                  }
                />
                <div>
                  <button
                    id="private-metadata-label"
                    type="button"
                    disabled={busy}
                    className="text-left text-sm font-medium"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        metadataEnabled: !draft.metadataEnabled,
                      })
                    }
                  >
                    {t("privateSources.metadataLabel")}
                  </button>
                  <p
                    id="private-metadata-help"
                    className="mt-1 text-xs leading-relaxed text-muted-foreground"
                  >
                    {t("privateSources.metadataHelp")}
                  </p>
                </div>
              </div>
              <details
                className="group rounded-xl border border-border/60"
                open={draft.hasToken || undefined}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
                  <span>
                    {t("privateSources.advanced")}
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      {draft.type === "http"
                        ? t("privateSources.advancedHttpDesc")
                        : t("privateSources.advancedDesc")}
                    </span>
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="space-y-4 border-t border-border/60 p-4">
                  {draft.type === "http" && (
                    <div className="space-y-2">
                      <Label htmlFor="private-token">
                        {t("privateSources.tokenLabel")}{" "}
                        <span className="font-normal text-muted-foreground">
                          {t("privateSources.optional")}
                        </span>
                      </Label>
                      <Input
                        id="private-token"
                        disabled={busy || draft.clearToken}
                        type="password"
                        autoComplete="off"
                        placeholder={
                          draft.hasToken
                            ? t("privateSources.tokenKeepPlaceholder")
                            : t("privateSources.tokenPlaceholder")
                        }
                        value={draft.token}
                        onChange={e => setDraft({ ...draft, token: e.target.value })}
                      />
                      <p className="text-xs text-muted-foreground">
                        {t("privateSources.tokenStorage")}
                      </p>
                      {draft.hasToken && (
                        <div className="flex items-center gap-2 pt-1">
                          <Checkbox
                            id="private-clear-token"
                            aria-labelledby="private-clear-token-label"
                            disabled={busy}
                            checked={!!draft.clearToken}
                            onCheckedChange={checked =>
                              setDraft({ ...draft, clearToken: checked })
                            }
                          />
                          <button
                            id="private-clear-token-label"
                            type="button"
                            disabled={busy}
                            className="text-sm"
                            onClick={() =>
                              setDraft({
                                ...draft,
                                clearToken: !draft.clearToken,
                              })
                            }
                          >
                            {t("privateSources.removeToken")}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {t("privateSources.skipHelp")}
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="private-exclude">
                        {t("privateSources.skipFolders")}
                      </Label>
                      <Textarea
                        id="private-exclude"
                        disabled={busy}
                        placeholder={t("privateSources.skipFoldersPlaceholder")}
                        value={draft.exclude.join("\n")}
                        onChange={e =>
                          setDraft({
                            ...draft,
                            exclude: e.target.value.split("\n"),
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="private-ignore">
                        {t("privateSources.skipFiles")}
                      </Label>
                      <Textarea
                        id="private-ignore"
                        disabled={busy}
                        placeholder={t("privateSources.skipFilesPlaceholder")}
                        value={draft.ignore.join("\n")}
                        onChange={e =>
                          setDraft({
                            ...draft,
                            ignore: e.target.value.split("\n"),
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              </details>
              <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                <Shield className="mt-0.5 h-4 w-4 shrink-0" />
                {t("privateSources.privacyNote")}
              </p>
            </div>
          )}
          <DialogFooter className="border-t border-border/60 bg-muted/10 px-6 py-4 sm:items-center">
            <Button
              variant="ghost"
              className="gap-2 text-muted-foreground sm:mr-auto"
              onClick={learnMore}
            >
              {t("common.learnMore")}
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => setDraft(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              className="gap-2 text-secondary"
              disabled={busy || !draft?.name.trim() || !draft?.location.trim()}
              onClick={() =>
                run(async () => {
                  const result = await window.electron.privateSources.save({
                    ...draft,
                    exclude: draft.exclude.filter(Boolean),
                    ignore: draft.ignore.filter(Boolean),
                  });
                  gameService.notifySourceChanged();
                  setDraft(null);
                  if (result.error) toast.error(privateSourceMessage(t, result.error));
                })
              }
            >
              {busy ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {busy
                ? t("privateSources.connecting")
                : draft?.id
                  ? t("privateSources.saveChanges")
                  : t("privateSources.connect")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
