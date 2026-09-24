import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ExternalLink, Search, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { retroCall } from "@/services/retroService";
import expanded from "../../electron/modules/retro/expanded-catalogue.json";

export default function RetroEmulators({ access, platforms, onChoose, onClose, busy }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const [chosenPlatforms, setChosenPlatforms] = useState({});
  const entries = [...expanded.emulators, ...expanded.resources];
  const names = ids =>
    ids.map(id => platforms.find(p => p.id === id)?.name).filter(Boolean);
  const matches = entries.filter(
    entry =>
      (group === "all" || entry.group === group) &&
      [t(entry.nameKey), t(`retro.families.${entry.group}`), t(entry.notesKey), ...names(entry.platforms || [])]
        .join(" ")
        .toLowerCase()
        .includes(query.trim().toLowerCase())
  );
  const openWebsite = async id => {
    try {
      await retroCall("website", null, id);
    } catch (error) {
      toast.error(error.message);
    }
  };
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto border-border bg-background text-foreground">
        <DialogHeader className="pr-6 text-left">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {t("retro.expanded.title")}
          </DialogTitle>
          <DialogDescription>{t("retro.expanded.description")}</DialogDescription>
        </DialogHeader>
        {access.loading ? (
          <p
            role="status"
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("retro.expanded.checking")}
          </p>
        ) : (
          !access.allowed && (
            <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
              <p className="text-sm">{t("retro.expanded.locked")}</p>
              <Button asChild className="text-secondary">
                <Link to="/ascend">
                  {t(
                    access.signedIn ? "retro.expanded.explore" : "retro.expanded.signIn"
                  )}
                </Link>
              </Button>
            </div>
          )
        )}
        {access.error && (
          <div role="alert" className="space-y-2">
            <p className="text-sm text-destructive">{access.error}</p>
            <Button variant="outline" onClick={access.retry}>
              {t("retro.errors.retry")}
            </Button>
          </div>
        )}
        {access.allowed && (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                value={query}
                onChange={event => setQuery(event.target.value)}
                aria-label={t("retro.expanded.search")}
                placeholder={t("retro.expanded.search")}
              />
            </div>
            <div className="flex flex-wrap gap-2" aria-label={t("retro.expanded.groups")}>
              {["all", "Nintendo", "Sony", "Microsoft", "Sega", "Multi-system"].map(
                value => (
                  <Button
                    key={value}
                    size="sm"
                    variant={group === value ? "default" : "outline"}
                    className={group === value ? "text-secondary" : undefined}
                    aria-pressed={group === value}
                    onClick={() => setGroup(value)}
                  >
                    {value === "all" ? t("retro.expanded.all") : t(`retro.families.${value}`)}
                  </Button>
                )
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {matches.map(entry => (
                <article
                  key={entry.id}
                  className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold">{t(entry.nameKey)}</h3>
                      <span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
                        {t(
                          entry.args
                            ? "retro.expanded.preset"
                            : entry.platforms
                              ? "retro.expanded.experimental"
                              : "retro.expanded.resource"
                        )}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {names(entry.platforms || []).join(" · ") || t(`retro.families.${entry.group}`)}
                    </p>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {t(entry.notesKey)}
                  </p>
                  <div className="mt-auto flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!access.allowed}
                      onClick={() => openWebsite(entry.id)}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      {t(
                        entry.platforms
                          ? "retro.expanded.download"
                          : "retro.expanded.openResource"
                      )}
                    </Button>
                    {entry.args && (
                      <div className="flex w-full items-center gap-2">
                        <Select
                          value={chosenPlatforms[entry.id] || entry.platforms[0]}
                          onValueChange={value =>
                            setChosenPlatforms(previous => ({
                              ...previous,
                              [entry.id]: value,
                            }))
                          }
                        >
                          <SelectTrigger
                            className="min-w-0 flex-1"
                            aria-label={t("retro.expanded.consoleFor", {
                              name: t(entry.nameKey),
                            })}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {entry.platforms.map(id => (
                              <SelectItem key={id} value={id}>
                                {platforms.find(p => p.id === id)?.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          className="text-secondary"
                          disabled={!access.allowed || busy}
                          onClick={() =>
                            onChoose(
                              chosenPlatforms[entry.id] || entry.platforms[0],
                              entry.id
                            )
                          }
                        >
                          {t("retro.expanded.configure")}
                        </Button>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
            {!matches.length && (
              <p className="py-8 text-center text-muted-foreground">
                {t("retro.expanded.noResults")}
              </p>
            )}
          </>
        )}
        {!access.allowed && !access.loading && (
          <div className="grid gap-3 sm:grid-cols-3">
            {["moreSystems", "easySetup", "cloudSaves"].map(key => (
              <div key={key} className="space-y-2 rounded-xl border border-border p-4">
                <Sparkles className="h-4 w-4 text-primary/70" />
                <h3 className="text-sm font-medium">{t(`retro.layout.${key}`)}</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t(`retro.layout.${key}Hint`)}
                </p>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("retro.expanded.localNotice")}
        </p>
      </DialogContent>
    </Dialog>
  );
}
