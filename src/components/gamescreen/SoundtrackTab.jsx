import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/LanguageContext";
import { trackDownload } from "@/services/integrations/khinsiderService";
import { Copy, Download, HeadphoneOff, Music2, Play } from "lucide-react";
import { toast } from "sonner";

const TRACKS_PER_PAGE = 12;

export default function SoundtrackTab({
  gameName,
  soundtrack,
  loading,
  error,
  onRetry,
  page,
  onPageChange,
  onPlayTrack,
}) {
  const { t } = useLanguage();
  const pageCount = Math.ceil(soundtrack.length / TRACKS_PER_PAGE);

  const downloadAll = async () => {
    toast.success(t("gameScreen.downloadingAllTracks"));
    const results = await Promise.all(
      soundtrack.map(track =>
        trackDownload(window.electron.downloadSoundtrack(track.url, gameName))
      )
    );
    if (results.every(res => res?.success)) {
      toast.success(t("gameScreen.allDownloadsComplete"));
    } else {
      toast.error(t("gameScreen.someDownloadsFailed"));
    }
  };

  const downloadTrack = track => {
    toast.success(t("gameScreen.downloadStarted"));
    trackDownload(window.electron.downloadSoundtrack(track.url, gameName)).then(res => {
      if (res?.success) {
        toast.success(t("gameScreen.downloadComplete"));
      } else {
        toast.error(t("gameScreen.downloadFailed"));
      }
    });
  };

  if (loading) {
    return (
      <section className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border/40 bg-card py-16">
        <Music2 className="h-8 w-8 animate-pulse text-primary/60" />
        <p className="animate-pulse text-sm font-medium text-primary/70">
          {t("gameScreen.loadingSoundtrack")}
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border/40 bg-card px-6 py-16 text-center">
        <HeadphoneOff className="h-10 w-10 text-muted-foreground" />
        <p className="max-w-md text-sm text-muted-foreground">
          {t(`gameScreen.${error}`)}
        </p>
        <Button variant="outline" onClick={onRetry}>
          {t("gameScreen.soundtrackRetry")}
        </Button>
      </section>
    );
  }

  if (soundtrack.length === 0) {
    return (
      <section className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border/40 bg-card py-16 text-center">
        <div className="rounded-full bg-muted p-4">
          <HeadphoneOff className="h-10 w-10 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="font-medium">{t("gameScreen.noSoundtrackFound")}</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {t("gameScreen.noSoundtrackDescription")}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border/40 bg-card">
      <div className="flex items-center justify-between gap-4 p-6">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold text-foreground">
            {gameName} {t("gameScreen.soundtrack")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {soundtrack.length} {t("gameScreen.aboutSoundtracks")}{" "}
            <a
              onClick={() => window.electron.openURL("https://downloads.khinsider.com/")}
              className="inline cursor-pointer text-primary hover:underline"
            >
              Khinsider
            </a>
            .
          </p>
        </div>
        <Button variant="outline" className="shrink-0 gap-2" onClick={downloadAll}>
          <Download className="h-4 w-4" />
          {t("gameScreen.downloadAll")}
        </Button>
      </div>

      <div className="divide-y divide-border/40 border-t border-border/40">
        {soundtrack
          .slice(page * TRACKS_PER_PAGE, (page + 1) * TRACKS_PER_PAGE)
          .map((track, index) => (
            <div
              key={index}
              className="group grid grid-cols-[3rem,1fr,auto] items-center gap-4 px-6 py-2 transition-colors hover:bg-accent/50"
            >
              <div className="relative flex h-8 items-center justify-center text-sm font-medium tabular-nums text-muted-foreground/70">
                <span className="transition-opacity group-hover:opacity-0">
                  {String(page * TRACKS_PER_PAGE + index + 1).padStart(2, "0")}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute inset-0 h-8 w-full p-0 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => onPlayTrack(track)}
                  title={t("gameScreen.playTrack")}
                >
                  <Play className="h-4 w-4" />
                </Button>
              </div>

              <p className="truncate text-sm font-medium">{track.title}</p>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => downloadTrack(track)}
                  title={t("gameScreen.downloadTrack")}
                >
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => {
                    navigator.clipboard.writeText(track.title);
                    toast.success(t("gameScreen.trackNameCopied"));
                  }}
                  title={t("gameScreen.copyTrackName")}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
      </div>

      <div className="flex items-center justify-between border-t border-border/40 px-6 py-4">
        <div className="text-sm text-muted-foreground">
          {t("gameScreen.showingTracks", {
            from: page * TRACKS_PER_PAGE + 1,
            to: Math.min((page + 1) * TRACKS_PER_PAGE, soundtrack.length),
            total: soundtrack.length,
          })}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.max(0, page - 1))}
            disabled={page === 0}
          >
            {t("common.prev")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.min(pageCount - 1, page + 1))}
            disabled={page >= pageCount - 1}
          >
            {t("common.next")}
          </Button>
        </div>
      </div>
    </section>
  );
}
