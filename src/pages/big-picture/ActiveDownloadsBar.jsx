import { Download } from "lucide-react";

// --- ACTIVE DOWNLOAD COMPONENT ---
const ActiveDownloadsBar = ({ downloads, t }) => {
  if (!downloads || downloads.length === 0) return null;

  return (
    <div className="absolute bottom-20 left-24 right-24 z-50 flex flex-col gap-2">
      <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-400">
        <Download className="h-4 w-4" /> {t("bigPicture.activeDownloads")} (
        {downloads.length})
      </h3>
      <div className="no-scrollbar flex gap-4 overflow-x-auto pb-2">
        {downloads.map(game => {
          const data = game.downloadingData || {};
          const progress = parseFloat(data.progressCompleted || 0);
          const speed = data.progressDownloadSpeeds || "0 KB/s";

          // Calculate downloaded from progress and total size
          const total = game.size || "0 MB";
          const calculateDownloaded = () => {
            if (!game.size || progress === 0) return "0 MB";
            const sizeMatch = game.size.match(/([\d.]+)\s*(GB|MB|KB)/);
            if (!sizeMatch) return "0 MB";
            const sizeValue = parseFloat(sizeMatch[1]);
            const sizeUnit = sizeMatch[2];
            const downloadedValue = ((sizeValue * progress) / 100).toFixed(2);
            return `${downloadedValue} ${sizeUnit}`;
          };
          const downloaded = calculateDownloaded();

          const status = data.extracting
            ? t("bigPicture.extracting")
            : data.verifying
              ? t("bigPicture.verifying")
              : t("bigPicture.downloading");

          return (
            <div
              key={game.game}
              className="flex min-w-[300px] max-w-[400px] flex-1 flex-col gap-2 rounded-lg border border-white/10 bg-muted/90 p-3 shadow-lg backdrop-blur"
            >
              <div className="flex items-center justify-between text-xs font-bold uppercase">
                <span className="max-w-[180px] truncate text-primary">{game.game}</span>
                <span className="text-primary">{speed}</span>
              </div>

              <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`absolute left-0 top-0 h-full rounded-full transition-all duration-300 ${data.extracting ? "animate-pulse bg-amber-500" : "bg-primary"}`}
                  style={{ width: `${progress}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[10px] font-bold tracking-wider text-slate-400">
                <span>
                  {downloaded} / {total}
                </span>
                <span>{progress.toFixed(1)}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export { ActiveDownloadsBar };
