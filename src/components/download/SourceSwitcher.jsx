import { useLanguage } from "@/context/LanguageContext";
import { useSettings } from "@/context/SettingsContext";
import { gameSource } from "@/lib/combinedSources";
import { formatLatestUpdate } from "@/lib/utils";
import { Check, Database, Globe, Layers, Wifi } from "lucide-react";

const hostsOf = game =>
  Object.entries(game.download_links || {})
    .filter(([, links]) => Array.isArray(links) && links.some(Boolean))
    .map(([host]) => host);

/** The same game from each enabled source, to compare and switch between. */
export default function SourceSwitcher({ entries, current, onSelect }) {
  const { t } = useLanguage();
  const { settings } = useSettings();
  if (!entries?.length) return null;

  return (
    <section className="rounded-xl bg-card p-5 shadow">
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-medium">{t("download.otherSources.title")}</h2>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {t("download.otherSources.description")}
      </p>
      <ul className="mt-3 space-y-2">
        {entries.map(entry => {
          const source = gameSource(entry, settings);
          const active = entry.gameID === current?.gameID;
          const hosts = hostsOf(entry);
          const updated = entry.latest_update && formatLatestUpdate(entry.latest_update);
          return (
            <li key={entry.gameID || `${entry.customSource}-${entry.version}`}>
              <button
                type="button"
                disabled={active}
                onClick={() => onSelect(entry)}
                className={`w-full rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "border-primary/40 bg-primary/10" : "border-border hover:bg-muted/50"}`}
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  {source?.official ? (
                    <Database className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate">
                    {source?.official
                      ? t("gameCard.official")
                      : source?.name || t("download.otherSources.unnamed")}
                  </span>
                  {active && (
                    <span className="ml-auto flex shrink-0 items-center gap-1 text-xs text-primary">
                      <Check className="h-3 w-3" />
                      {t("download.otherSources.viewing")}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {entry.version && <span className="tabular-nums">{entry.version}</span>}
                  {entry.size && <span className="tabular-nums">{entry.size}</span>}
                  {entry.online && (
                    <span className="flex items-center gap-1">
                      <Wifi className="h-3 w-3" />
                      {t("gameCard.online")}
                    </span>
                  )}
                  {updated && <span>{updated}</span>}
                </div>
                {hosts.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {hosts.map(host => (
                      <span
                        key={host}
                        className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
                      >
                        {host}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("download.otherSources.noLinks")}
                  </p>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
