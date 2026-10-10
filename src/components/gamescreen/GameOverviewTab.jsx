import { useState } from "react";
import SafeHtml from "@/components/SafeHtml";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLanguage } from "@/context/LanguageContext";
import {
  CloudOff,
  Edit3,
  ImageIcon,
  Info,
  Loader,
  Plus,
  Search,
  Terminal,
} from "lucide-react";

const PREVIEW_COUNT = 6;

function DetailGroup({ title, children }) {
  return (
    <div>
      <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="mt-1.5 text-sm text-foreground">{children}</div>
    </div>
  );
}

/** About the game, its screenshots, and the details that describe this install. */
export default function GameOverviewTab({
  game,
  steamData,
  steamLoading,
  screenshots,
  onEditGameInfo,
  isAuthenticated,
  onGetAscend,
  isOnLinux,
  umuId,
  umuIdInput,
  onUmuIdInputChange,
  umuIdSaving,
  onSaveUmuId,
}) {
  const { t } = useLanguage();
  const [showAllScreenshots, setShowAllScreenshots] = useState(false);
  const hasMatch = steamData?.appid || game?.steamAppId;
  const hasDescription = steamData?.about_the_game || steamData?.summary;
  const visibleScreenshots = showAllScreenshots
    ? screenshots
    : screenshots.slice(0, PREVIEW_COUNT);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-4">
        {hasDescription ? (
          <section className="rounded-xl border border-border/40 bg-card p-6">
            <h2 className="mb-3 text-xl font-semibold text-foreground">
              {t("gameScreen.aboutGame")}
            </h2>
            {steamData.about_the_game ? (
              <SafeHtml
                className="steam-description leading-relaxed text-muted-foreground"
                html={steamData.about_the_game}
              />
            ) : (
              <p className="leading-relaxed text-muted-foreground">{steamData.summary}</p>
            )}
          </section>
        ) : (
          <section className="flex items-center justify-center rounded-xl border border-dashed border-border/60 bg-card px-6 py-12 text-center text-sm text-muted-foreground">
            {steamLoading ? (
              <Loader className="h-5 w-5 animate-spin text-primary" />
            ) : (
              <div>
                <p className="font-medium text-foreground">
                  {t("gameScreen.noSteamMatch")}
                </p>
                <p className="mt-1">{t("gameScreen.noSteamMatchDescription")}</p>
              </div>
            )}
          </section>
        )}

        {screenshots.length > 0 && (
          <section className="rounded-xl border border-border/40 bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-foreground">
                {t("gameScreen.screenshots")}
              </h2>
              {!showAllScreenshots && screenshots.length > PREVIEW_COUNT && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-primary"
                  onClick={() => setShowAllScreenshots(true)}
                >
                  {t("gameScreen.viewAll")} ({screenshots.length})
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {visibleScreenshots.map((screenshot, index) => (
                <button
                  key={index}
                  type="button"
                  className="group relative aspect-video overflow-hidden rounded-lg bg-muted transition-all hover:ring-2 hover:ring-primary"
                  onClick={() => window.electron.openURL(screenshot.formatted_url)}
                >
                  <img
                    src={screenshot.formatted_url}
                    alt={t("gameScreen.screenshotAlt", { number: index + 1 })}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      <aside className="space-y-4">
        <section className="space-y-5 rounded-xl border border-border/40 bg-card p-5">
          {/* Matched store entry that the description, artwork and achievements come from */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {steamData?.cover?.url ? (
                <img
                  src={steamData.cover.url}
                  alt={steamData.name}
                  className="h-12 w-20 shrink-0 rounded object-cover"
                />
              ) : (
                <div className="flex h-12 w-20 shrink-0 items-center justify-center rounded bg-muted">
                  {hasMatch ? (
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <Search className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {hasMatch
                    ? steamData?.name || game?.game || game?.name
                    : t("gameScreen.noSteamMatch")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {hasMatch
                    ? `Steam App ID: ${steamData?.appid || game?.steamAppId}`
                    : t("gameScreen.noSteamMatchDescription")}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={onEditGameInfo}
            >
              {hasMatch ? <Edit3 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {hasMatch ? t("gameScreen.editGameInfo") : t("gameScreen.setGameInfo")}
            </Button>
          </div>

          {steamData?.developers?.length > 0 && (
            <DetailGroup title={t("download.developers")}>
              {steamData.developers.join(", ")}
            </DetailGroup>
          )}
          {steamData?.publishers?.length > 0 && (
            <DetailGroup title={t("download.publishers")}>
              {steamData.publishers.join(", ")}
            </DetailGroup>
          )}
        </section>

        {isOnLinux && (
          <section className="space-y-2 rounded-xl border border-border/40 bg-card p-5">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">{t("gameScreen.umuId")}</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 cursor-help text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">
                      {t("gameScreen.umuIdDescription")}{" "}
                      <button
                        onClick={() =>
                          window.electron.openURL("https://umu.openwinecomponents.org")
                        }
                        className="underline"
                      >
                        umu.openwinecomponents.org
                      </button>
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex gap-2">
              <Input
                value={umuIdInput}
                onChange={e => onUmuIdInputChange(e.target.value)}
                placeholder="umu-default"
                className="h-8 text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 shrink-0 text-xs text-primary"
                disabled={umuIdSaving || umuIdInput === umuId}
                onClick={onSaveUmuId}
              >
                {umuIdSaving ? (
                  <Loader className="h-3 w-3 animate-spin" />
                ) : (
                  t("common.save")
                )}
              </Button>
            </div>
            {umuId && (
              <p className="text-xs text-muted-foreground">
                {t("gameScreen.umuIdActive")}{" "}
                <span className="font-mono text-foreground">{umuId}</span>
              </p>
            )}
          </section>
        )}

        {!isAuthenticated && (
          <section className="space-y-3 rounded-xl border border-border/40 bg-card p-5">
            <div className="flex items-start gap-3">
              <CloudOff className="h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-medium">{t("gameScreen.cloudLibraryPromo")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("gameScreen.cloudLibraryPromoDesc")}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={onGetAscend}>
              {t("gameScreen.getAscend")}
            </Button>
          </section>
        )}
      </aside>
    </div>
  );
}
