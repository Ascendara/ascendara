import { lazy, Suspense, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useSettings } from "@/context/SettingsContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  getOrderedProviders,
  getPreferredProvider,
} from "@/services/downloads/debridService";
import DebridIcon from "@/components/DebridIcon";
import { DebridLoading } from "@/components/debrid/DebridDownloadParts";
import { cn } from "@/lib/utils";

const pages = {
  torbox: lazy(() => import("./TorboxDownloads")),
  realdebrid: lazy(() => import("./RealDebridDownloads")),
};

export default function DebridDownloads() {
  const { settings } = useSettings();
  const { t } = useLanguage();
  const [params, setParams] = useSearchParams();
  const [lastService, setLastService] = useState(() => {
    try {
      return localStorage.getItem("debridDownloadsProvider");
    } catch {
      return null;
    }
  });
  const ordered = getOrderedProviders(settings).filter(provider => pages[provider.id]);
  const configured = ordered.filter(provider => settings[provider.apiKeySetting]?.trim());
  const providers = configured.length ? configured : ordered;
  const provider =
    providers.find(item => item.id === params.get("service")) ||
    providers.find(item => item.id === lastService) ||
    providers.find(item => item.id === getPreferredProvider(settings)?.id) ||
    providers[0];
  if (settings.debridEnabled !== true) return <Navigate to="/" replace />;
  if (!provider) return null;
  const Page = pages[provider.id];

  const select = id => {
    try {
      localStorage.setItem("debridDownloadsProvider", id);
    } catch {
      /* Remembering the choice is optional */
    }
    setLastService(id);
    setParams(current => {
      const next = new URLSearchParams(current);
      next.set("service", id);
      return next;
    });
  };

  return (
    <div className="container mx-auto max-w-5xl px-4 pb-8 pt-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {t("debrid.downloadsTitle")}
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            {t("debrid.downloadsDescription")}
          </p>
        </div>
        {providers.length > 1 && (
          <div
            role="tablist"
            aria-label={t("debrid.chooseService")}
            className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-border/60 p-1"
          >
            {providers.map(item => {
              const active = item.id === provider.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => select(item.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "bg-primary text-secondary shadow-sm"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  <DebridIcon provider={item} className="h-4 w-4" />
                  {item.name}
                </button>
              );
            })}
          </div>
        )}
      </header>
      <Suspense fallback={<DebridLoading label={t("common.loading")} />}>
        <Page key={provider.id} />
      </Suspense>
    </div>
  );
}
