import GameScreenshots from "@/components/GameScreenshots";
import SafeHtml from "@/components/SafeHtml";
import { useLanguage } from "@/context/LanguageContext";
import steamService from "@/services/gameInfoService";
import { ExternalLink, Loader } from "lucide-react";

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

/** Store-page style information about the game: description, facts, screenshots. */
export default function GameOverview({ gameData, steamData, steamLoading, steamError }) {
  const { t } = useLanguage();
  const categories = gameData.category?.length > 0 ? gameData.category : null;

  if (steamLoading) {
    return (
      <section className="flex items-center justify-center rounded-xl border border-border/40 bg-card px-6 py-16 text-sm text-muted-foreground">
        <Loader className="mr-2 h-4 w-4 animate-spin text-primary" />
        {t("download.steamLoading")}
      </section>
    );
  }

  if (!steamData) {
    return (
      <section className="rounded-xl border border-border/40 bg-card p-6 text-center">
        {steamError ? (
          <>
            <p className="font-medium text-foreground">
              {t("download.gameInfoError", "Error fetching game information")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{steamError}</p>
          </>
        ) : (
          <p className="text-muted-foreground">{t("download.noGameInfoAvailable")}</p>
        )}
      </section>
    );
  }

  const description = steamData.about_the_game || steamData.summary;
  const hasCompanies =
    steamData.developers?.length > 0 || steamData.publishers?.length > 0;
  const hasDetails = categories || hasCompanies;
  const screenshots = steamData.screenshots?.length > 0 ? steamData.screenshots : null;

  return (
    <>
      {(description || hasDetails) && (
        <section className="rounded-xl border border-border/40 bg-card p-6">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
            {description && (
              <div className="min-w-0">
                <h2 className="mb-3 text-xl font-semibold text-foreground">
                  {t("download.aboutGame")}
                </h2>
                {steamData.about_the_game ? (
                  <SafeHtml
                    className="steam-description leading-relaxed text-muted-foreground"
                    html={steamData.about_the_game}
                  />
                ) : (
                  <p className="leading-relaxed text-muted-foreground">
                    {steamData.summary}
                  </p>
                )}
              </div>
            )}

            {hasDetails && (
              <aside className="space-y-5 lg:border-l lg:border-border/40 lg:pl-8">
                {categories && (
                  <DetailGroup title={t("download.categories")}>
                    <div className="flex flex-wrap gap-1.5">
                      {categories.map((category, index) => (
                        <span
                          key={index}
                          className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                        >
                          {category}
                        </span>
                      ))}
                    </div>
                  </DetailGroup>
                )}
                {steamData.developers?.length > 0 && (
                  <DetailGroup title={t("download.developers")}>
                    {steamData.developers.join(", ")}
                  </DetailGroup>
                )}
                {steamData.publishers?.length > 0 && (
                  <DetailGroup title={t("download.publishers")}>
                    {steamData.publishers.join(", ")}
                  </DetailGroup>
                )}
              </aside>
            )}
          </div>
        </section>
      )}

      {screenshots && (
        <section className="rounded-xl border border-border/40 bg-card p-6">
          <h2 className="mb-4 text-xl font-semibold text-foreground">
            {t("download.screenshots")}
          </h2>
          <GameScreenshots
            screenshots={screenshots.slice(0, 4).map(screenshot => ({
              ...screenshot,
              url: steamService.formatImageUrl(screenshot.url, "screenshot_big"),
              formatted_url: steamService.formatImageUrl(
                screenshot.url,
                "screenshot_huge"
              ),
            }))}
            className="w-full"
          />
        </section>
      )}

      <p className="flex flex-wrap items-center justify-end gap-x-1 text-xs text-muted-foreground">
        <span>{t("download.dataProvidedBy")}</span>
        {steamData.source === "steam" ? (
          <a
            onClick={() => window.electron.openURL("https://store.steampowered.com")}
            className="flex cursor-pointer items-center text-primary hover:underline"
          >
            Steam <ExternalLink className="ml-1 h-3 w-3" />
          </a>
        ) : (
          <span>Steam</span>
        )}
        <span>. {t("download.infoMaybeInaccurate")}</span>
      </p>
    </>
  );
}
