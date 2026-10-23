import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader, Search, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/config/api";

const BASE = `${API_URL}/api/proxy/steamgrid`;

export default function BrowserDownloadArtwork({
  initialQuery,
  value,
  onChange,
  selectedLogoId,
  onLogoChange,
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [previews, setPreviews] = useState({});
  const [logoOptions, setLogoOptions] = useState([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const selectedLogo = logoOptions.find(logo => logo.id === selectedLogoId) || logoOptions[0];

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
    setLogoOptions([]);
    setLoadingPreview(!!value);
    if (!value) return () => controller.abort();
    const types = [
      ["grid", "grids", "styles=alternate&dimensions=600x900"],
      ["hero", "heroes", "styles=alternate"],
    ];
    const loadPreviews = async () => {
      const nextPreviews = {};
      for (const [key, type, params] of types) {
        try {
          const response = await fetch(
            `${BASE}/${type}/game/${value.id}?${params}&sort=score`,
            { signal: controller.signal }
          );
          if (response.ok) {
            const data = await response.json();
            if (data.success && Array.isArray(data.data)) {
              nextPreviews[key] = data.data[0]?.url || null;
            }
          }
        } catch {
          if (controller.signal.aborted) return;
        }
      }
      const logos = [];
      for (const style of ["white", "official"]) {
        try {
          const response = await fetch(
            `${BASE}/logos/game/${value.id}?styles=${style}&sort=score`,
            { signal: controller.signal }
          );
          if (response.ok) {
            const data = await response.json();
            if (data.success && Array.isArray(data.data)) logos.push(...data.data);
          }
        } catch {
          if (controller.signal.aborted) return;
        }
      }
      const options = logos
        .filter(logo => Number.isSafeInteger(logo.id) && logo.id > 0 && logo.url)
        .sort((a, b) =>
          (b.language === "en" ? 2 : !b.language ? 1 : 0) -
          (a.language === "en" ? 2 : !a.language ? 1 : 0)
        )
        .slice(0, 24);
      if (!controller.signal.aborted) {
        setLogoOptions(options);
        setPreviews(nextPreviews);
        setLoadingPreview(false);
      }
    };
    void loadPreviews();
    return () => controller.abort();
  }, [value]);

  return (
    <section className="min-w-0 space-y-3 rounded-xl border border-border bg-muted/20 p-4 text-foreground">
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
                    {(key === "logo" ? selectedLogo?.url : previews[key]) ? (
                      <img
                        src={key === "logo" ? selectedLogo.url : previews[key]}
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
          {!loadingPreview && logoOptions.length > 1 && (
            <div className="min-w-0 space-y-1">
              <p className="text-xs text-muted-foreground">{t("browserDownload.logo")}</p>
              <div className="flex w-full min-w-0 max-w-full gap-2 overflow-x-auto pb-1">
                {logoOptions.map(logo => (
                  <Button
                    key={logo.id}
                    variant={selectedLogo?.id === logo.id ? "secondary" : "outline"}
                    className="h-20 w-24 shrink-0 flex-col gap-1 p-1"
                    aria-label={`${t("browserDownload.logo")} ${logo.language?.toUpperCase() || "—"}`}
                    aria-pressed={selectedLogo?.id === logo.id}
                    onClick={() => onLogoChange(logo.id)}
                  >
                    <img src={logo.thumb || logo.url} alt="" className="max-h-12 max-w-full object-contain" />
                    <span className="text-xs">{logo.language?.toUpperCase() || "—"}</span>
                  </Button>
                ))}
              </div>
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
