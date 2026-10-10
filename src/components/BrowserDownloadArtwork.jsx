import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader, Search, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const BASE = "https://api.ascendara.app/api/proxy/steamgrid";

export default function BrowserDownloadArtwork({ initialQuery, value, onChange }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [previews, setPreviews] = useState({});
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setResults([]);
    setError(false);
    setBusy(query.trim().length >= 2);
    if (query.trim().length < 2) return () => controller.abort();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `${BASE}/search/autocomplete/${encodeURIComponent(query.trim())}`,
          { signal: controller.signal }
        );
        if (!response.ok) throw new Error("Search failed");
        const data = await response.json();
        if (!data.success || !Array.isArray(data.data)) throw new Error("Search failed");
        if (!controller.signal.aborted)
          setResults(
            data.data
              .filter(game => Number.isSafeInteger(game.id) && game.id > 0)
              .slice(0, 8)
          );
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, 350);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    setPreviews({});
    setLoadingPreview(!!value);
    if (!value) return () => controller.abort();
    const types = [
      ["grid", "grids", "styles=alternate&dimensions=600x900"],
      ["hero", "heroes", "styles=alternate"],
      ["logo", "logos", "styles=white&sort=score"],
    ];
    const loadPreviews = async () => {
      const nextPreviews = {};
      for (const [key, type, params] of types) {
        try {
          let response = await fetch(
            `${BASE}/${type}/game/${value.id}?${params}&sort=score`,
            { signal: controller.signal }
          );
          if (response.ok) {
            let data = await response.json();
            if (
              key === "logo" &&
              (!data.success || !Array.isArray(data.data) || data.data.length === 0)
            ) {
              response = await fetch(
                `${BASE}/logos/game/${value.id}?styles=official&sort=score`,
                { signal: controller.signal }
              );
              data = response.ok ? await response.json() : null;
            }
            if (response.ok && data?.success && Array.isArray(data.data)) {
              nextPreviews[key] = data.data[0]?.url || null;
            }
          }
        } catch {
          if (controller.signal.aborted) return;
        }
      }
      if (!controller.signal.aborted) {
        setPreviews(nextPreviews);
        setLoadingPreview(false);
      }
    };
    void loadPreviews();
    return () => controller.abort();
  }, [value]);

  return (
    <section className="space-y-3 rounded-xl border border-border bg-muted/20 p-4 text-foreground">
      <div>
        <h3 className="text-sm font-medium text-foreground">
          {t("browserDownload.artworkTitle")}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("browserDownload.artworkDescription")}
        </p>
      </div>
      <div className="relative">
        <Search
          className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          className="pl-9 text-primary"
          value={query}
          onChange={event => setQuery(event.target.value)}
          maxLength={200}
          aria-label={t("browserDownload.searchArtwork")}
          placeholder={t("browserDownload.searchArtwork")}
        />
      </div>
      <div aria-live="polite" className="text-xs text-muted-foreground">
        {busy ? (
          <span className="flex items-center gap-2">
            <Loader className="h-3 w-3 animate-spin" />
            {t("browserDownload.searching")}
          </span>
        ) : error ? (
          t("browserDownload.artworkError")
        ) : query.trim().length >= 2 && !results.length ? (
          t("browserDownload.noArtworkResults")
        ) : null}
      </div>
      {!!results.length && (
        <div className="max-h-36 space-y-1 overflow-y-auto">
          {results.map(game => (
            <Button
              key={game.id}
              variant={value?.id === game.id ? "secondary" : "ghost"}
              className="h-auto w-full justify-between gap-2 whitespace-normal text-left text-foreground"
              onClick={() => onChange(game)}
              aria-pressed={value?.id === game.id}
            >
              <span>{game.name}</span>
              {value?.id === game.id && <Check className="h-4 w-4 shrink-0" />}
            </Button>
          ))}
        </div>
      )}
      {value && (
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-sm font-medium text-foreground">{value.name}</p>
          {loadingPreview ? (
            <p className="text-xs text-muted-foreground">
              {t("browserDownload.loadingArtwork")}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {["grid", "hero", "logo"].map(key => (
                <div key={key} className="space-y-1">
                  <div className="flex h-24 items-center justify-center overflow-hidden rounded-md bg-background p-1">
                    {previews[key] ? (
                      <img
                        src={previews[key]}
                        alt={t(`browserDownload.${key}`)}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <span className="text-center text-xs text-muted-foreground">
                        {t("browserDownload.noPreview")}
                      </span>
                    )}
                  </div>
                  <p className="text-center text-xs text-muted-foreground">
                    {t(`browserDownload.${key}`)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <Button
        variant="link"
        className="h-auto p-0 text-xs text-primary"
        onClick={() => onChange(null)}
        aria-pressed={!value}
      >
        {t("browserDownload.noArtwork")}
        {!value && <Check className="ml-2 h-3 w-3" />}
      </Button>
    </section>
  );
}
