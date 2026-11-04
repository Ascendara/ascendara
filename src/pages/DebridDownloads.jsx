import { lazy, Suspense, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useSettings } from "@/context/SettingsContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  getOrderedProviders,
  getPreferredProvider,
} from "@/services/downloads/debridService";
import DebridIcon from "@/components/DebridIcon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const pages = {
  torbox: lazy(() => import("./TorboxDownloads")),
  realdebrid: lazy(() => import("./RealDebridDownloads")),
};

export default function DebridDownloads() {
  const { settings } = useSettings();
  const { t } = useLanguage();
  const [params, setParams] = useSearchParams();
  const [lastService, setLastService] = useState(() =>
    localStorage.getItem("debridDownloadsProvider")
  );
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

  return (
    <>
      <div className="container mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 pt-6">
        <h1 className="text-xl font-semibold">{t("debrid.downloadsTitle")}</h1>
        <Select
          value={provider.id}
          onValueChange={id => {
            localStorage.setItem("debridDownloadsProvider", id);
            setLastService(id);
            setParams(current => {
              const next = new URLSearchParams(current);
              next.set("service", id);
              return next;
            });
          }}
        >
          <SelectTrigger className="w-52" aria-label={t("debrid.chooseService")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {providers.map(item => (
              <SelectItem key={item.id} value={item.id}>
                <span className="flex items-center gap-2">
                  <DebridIcon provider={item} className="h-4 w-4" />
                  {item.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Suspense
        fallback={<p className="p-6 text-muted-foreground">{t("common.loading")}</p>}
      >
        <Page key={provider.id} />
      </Suspense>
    </>
  );
}
