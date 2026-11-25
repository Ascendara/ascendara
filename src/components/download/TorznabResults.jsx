import { useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { useSettings } from "@/context/SettingsContext";
import { torznabErrorKey } from "@/components/TorznabSettings";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Radar,
  RefreshCw,
} from "lucide-react";

const RESULT_LIMIT = 5;

export const TORZNAB_SOURCE = "Prowlarr";

export function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i >= 3 ? 2 : 0)} ${units[i]}`;
}

function formatAge(iso) {
  const time = Date.parse(iso || "");
  if (!Number.isFinite(time)) return null;
  const days = Math.max(0, Math.floor((Date.now() - time) / 86400000));
  if (days < 1) return "<1d";
  if (days < 365) return `${days}d`;
  return `${Math.floor(days / 365)}y`;
}

const resultKey = r => r.infoHash || r.magnet || r.link || r.guid;

/**
 * A source entry for a picked release: the page keeps the game's identity and
 * only its download options change to the release's magnet.
 */
export function torznabEntry(gameData, result, magnet) {
  return {
    ...gameData,
    customSource: TORZNAB_SOURCE,
    torznabRelease: {
      key: resultKey(result),
      title: result.title,
      indexer: result.indexer,
    },
    version: undefined,
    latest_update: undefined,
    torrentLink: undefined,
    size: formatSize(result.size) || gameData?.size,
    download_links: { torrent: [magnet] },
  };
}

/** Live search of the user's Prowlarr / Torznab indexers for this game. */
export default function TorznabResults({ gameName, current, onSelect, onSendUsenet }) {
  const { t } = useLanguage();
  const { settings } = useSettings();
  const [state, setState] = useState({ status: "idle" });
  const [resolving, setResolving] = useState(null);
  const [resolveError, setResolveError] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setState({ status: "idle" });
    setExpanded(false);
    setResolveError(null);
  }, [gameName, settings.torznabUrl]);

  if (!settings.torznabEnabled || !settings.torznabUrl || !gameName) return null;

  const search = async () => {
    setState({ status: "loading" });
    setResolveError(null);
    try {
      const response = await window.electron.torznab.search(gameName);
      if (response?.error) setState({ status: "error", error: response.error });
      else setState({ status: "done", ...response });
    } catch {
      setState({ status: "error", error: "badResponse" });
    }
  };

  const pick = async result => {
    const key = resultKey(result);
    setResolving(key);
    setResolveError(null);
    try {
      if (result.protocol === "usenet") {
        const response = await onSendUsenet(result);
        if (response?.error) setResolveError({ key, code: response.error, usenet: true });
        return;
      }
      const magnet = await window.electron.torznab.resolve(result);
      if (typeof magnet === "string") onSelect(result, magnet);
      else setResolveError({ key, code: magnet?.error });
    } catch {
      setResolveError({ key, code: "badResponse" });
    } finally {
      setResolving(null);
    }
  };

  const results = state.results || [];
  const visible = expanded ? results : results.slice(0, RESULT_LIMIT);
  const activeKey = current?.torznabRelease?.key;

  return (
    <section className="rounded-xl bg-card p-5 shadow">
      <div className="flex items-center gap-2">
        <Radar className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-medium">{t("download.torznab.title")}</h2>
        {state.status === "done" && (
          <button
            type="button"
            onClick={search}
            aria-label={t("download.torznab.searchAgain")}
            className="ml-auto rounded p-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {t("download.torznab.description")}
      </p>

      {(state.status === "idle" || state.status === "error") && (
        <button
          type="button"
          onClick={search}
          className="mt-3 w-full rounded-lg border border-border py-2 text-sm font-medium text-primary transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t("download.torznab.search")}
        </button>
      )}
      {state.status === "error" && (
        <p className="text-destructive mt-2 text-xs">{t(torznabErrorKey(state.error))}</p>
      )}
      {state.status === "loading" && (
        <div className="mt-3 flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("download.torznab.searching")}
        </div>
      )}
      {state.status === "done" && results.length === 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {t("download.torznab.noResults")}
        </p>
      )}
      {state.status === "done" && state.failed?.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t("download.torznab.someFailed", { count: state.failed.length })}
        </p>
      )}

      {visible.length > 0 && (
        <ul className="mt-3 space-y-2">
          {visible.map(result => {
            const key = resultKey(result);
            const active = key === activeKey;
            const size = formatSize(result.size);
            const age = formatAge(result.publishedAt);
            const failed = resolveError?.key === key;
            return (
              <li key={key}>
                <button
                  type="button"
                  disabled={active || !!resolving}
                  onClick={() => pick(result)}
                  title={result.title}
                  className={`w-full rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default ${active ? "border-primary/40 bg-primary/10" : "border-border hover:bg-muted/50"}`}
                >
                  <div className="flex items-start gap-2">
                    <span className="line-clamp-2 break-all text-sm font-medium">
                      {result.title}
                    </span>
                    {resolving === key && (
                      <Loader2 className="ml-auto h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                    )}
                    {active && (
                      <span className="ml-auto flex shrink-0 items-center gap-1 text-xs text-primary">
                        <Check className="h-3 w-3" />
                        {t("download.otherSources.viewing")}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {size && <span className="tabular-nums">{size}</span>}
                    {result.seeders != null && (
                      <span className="flex items-center gap-0.5 tabular-nums">
                        <ArrowUp className="h-3 w-3" />
                        {result.seeders}
                      </span>
                    )}
                    {result.leechers != null && (
                      <span className="flex items-center gap-0.5 tabular-nums">
                        <ArrowDown className="h-3 w-3" />
                        {result.leechers}
                      </span>
                    )}
                    {age && <span className="tabular-nums">{age}</span>}
                    {result.protocol === "usenet" && (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                        {t("download.torznab.usenetBadge")}
                      </span>
                    )}
                    {result.indexer && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium">
                        {result.indexer}
                      </span>
                    )}
                  </div>
                  {failed && (
                    <p className="text-destructive mt-1.5 text-xs">
                      {resolveError.usenet
                        ? t(`usenet.errors.${resolveError.code}`)
                        : t(torznabErrorKey(resolveError.code))}
                    </p>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {results.length > RESULT_LIMIT && (
        <button
          type="button"
          onClick={() => setExpanded(value => !value)}
          aria-expanded={expanded}
          className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
          {expanded ? t("app.changelog.showLess") : t("app.changelog.showMore")}
        </button>
      )}
    </section>
  );
}
