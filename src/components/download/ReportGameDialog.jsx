import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";
import {
  Ban,
  ChevronRight,
  CloudOff,
  EyeOff,
  FileText,
  ImageUp,
  Link2Off,
  Loader,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { API_URL } from "@/config/api";
import { getReporterHeaders } from "@/services/firebase/firebaseService";

const FILE_ISSUE_REPORT_PATTERN =
  /\b(?:missing|corrupt(?:ed|ion)?|incomplete|damaged)\b.{0,30}\b(?:files?|downloads?|archives?|installations?)\b|\b(?:files?|downloads?|archives?|installations?)\b.{0,30}\b(?:missing|corrupt(?:ed|ion)?|incomplete|damaged)\b/i;

// Wrong artwork is handled by ArtworkCorrectionDialog, not reports
const REPORT_REASONS = [
  { value: "linksnotworking", key: "linksNotWorking", icon: Link2Off },
  { value: "filesnotdownloading", key: "filesNotDownloading", icon: CloudOff },
  { value: "gamedetails", key: "gameDetails", icon: FileText },
  { value: "notagame", key: "notAGame", icon: Ban },
  { value: "image-bad", key: "imageBad", icon: EyeOff },
];

// Reports land in a Discord embed field, which caps at 1024 characters
const MAX_DETAILS_LENGTH = 1000;

// A game can be reported once a day from this install
const REPORTED_GAMES_KEY = "ascendara_reported_games";
const REPORT_REPEAT_MS = 24 * 60 * 60 * 1000;

const reportKey = gameData => String(gameData?.gameID || gameData?.game || "");

const loadReportedGames = () => {
  try {
    const reported = JSON.parse(localStorage.getItem(REPORTED_GAMES_KEY)) || {};
    const cutoff = Date.now() - REPORT_REPEAT_MS;
    return Object.fromEntries(
      Object.entries(reported).filter(([, time]) => time > cutoff)
    );
  } catch (e) {
    return {};
  }
};

export const hasReportedGame = gameData => {
  const key = reportKey(gameData);
  return !!key && key in loadReportedGames();
};

const rememberReportedGame = gameData => {
  const key = reportKey(gameData);
  if (!key) return;
  localStorage.setItem(
    REPORTED_GAMES_KEY,
    JSON.stringify({ ...loadReportedGames(), [key]: Date.now() })
  );
};

export const fetchAuthToken = async () => {
  const authHeaders = await window.electron.getAuthHeaders();
  const response = await fetch(`${API_URL}/auth/token`, {
    headers: authHeaders,
  });
  if (!response.ok) {
    throw new Error("Failed to obtain token");
  }
  const { token } = await response.json();
  return token;
};

export default function ReportGameDialog({
  open,
  onOpenChange,
  gameData,
  useV2,
  onFixArtwork,
}) {
  const { t } = useLanguage();
  const [isReporting, setIsReporting] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const showIndexRefreshWarning = FILE_ISSUE_REPORT_PATTERN.test(reportDetails);
  const canSubmit = !!reportReason && !!reportDetails.trim();

  useEffect(() => {
    if (!open) {
      setReportReason("");
      setReportDetails("");
    }
  }, [open]);

  const handleSubmitReport = async () => {
    if (isReporting) return;
    if (!canSubmit) {
      toast.error(t("download.reportError"));
      return;
    }
    if (hasReportedGame(gameData)) {
      toast.info(t("download.toast.alreadyReported"));
      onOpenChange(false);
      return;
    }

    setIsReporting(true);
    try {
      // Use v2 endpoint with gameID if using local index
      const endpoint = useV2 ? `${API_URL}/app/v2/report` : `${API_URL}/app/report`;

      const body = JSON.stringify({
        reportType: "GameBrowsing",
        reason: reportReason,
        details: reportDetails.trim(),
        ...(useV2 ? { gameID: gameData.gameID } : { gameName: gameData.game }),
      });

      const submit = async () =>
        fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${await fetchAuthToken()}`,
            ...(await getReporterHeaders()),
          },
          body,
        });

      let reportResponse = await submit();
      // If token is expired or invalid, try once more with a new token
      if (reportResponse.status === 401) {
        reportResponse = await submit();
      }
      if (reportResponse.status === 429) {
        toast.error(t("download.toast.reportRateLimited"));
        onOpenChange(false);
        return;
      }
      if (!reportResponse.ok) {
        throw new Error("Failed to submit report");
      }

      rememberReportedGame(gameData);
      toast.success(t("download.toast.reportSubmitted"));
      onOpenChange(false);
    } catch (error) {
      console.error("Error submitting report:", error);
      toast.error(t("download.toast.reportFailed"));
    } finally {
      setIsReporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <form
          className="space-y-5"
          onSubmit={e => {
            e.preventDefault();
            handleSubmitReport();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("download.reportDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("download.reportDialog.description", { game: gameData.game })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label className="text-foreground">{t("download.reportReason")}</Label>
            <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
              {REPORT_REASONS.map(({ value, key, icon: Icon }) => {
                const selected = reportReason === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setReportReason(value)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                      selected
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-accent"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                        selected
                          ? "bg-primary text-secondary"
                          : "bg-accent/30 text-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground">
                        {t(`download.reportReasons.${key}`)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t(`download.reportReasonDescriptions.${key}`)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {onFixArtwork && (
            <button
              type="button"
              onClick={onFixArtwork}
              className="flex w-full items-center gap-3 rounded-lg border border-dashed border-border px-3 py-2.5 text-left transition-colors hover:bg-accent"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent/30">
                <ImageUp className="h-4 w-4 text-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">
                  {t("download.reportDialog.wrongArtwork")}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("download.reportDialog.wrongArtworkDesc")}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          )}

          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="report-details" className="text-foreground">
                {t("download.reportDialog.detailsLabel")}
              </Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {reportDetails.length}/{MAX_DETAILS_LENGTH}
              </span>
            </div>
            <Textarea
              id="report-details"
              placeholder={t("download.reportDescription")}
              value={reportDetails}
              maxLength={MAX_DETAILS_LENGTH}
              onChange={e => setReportDetails(e.target.value)}
              className="min-h-[110px] text-foreground"
            />
          </div>

          {showIndexRefreshWarning && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-foreground"
            >
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <span>{t("download.refreshIndexBeforeReport")}</span>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="text-primary"
              onClick={() => onOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              className="text-secondary"
              disabled={isReporting || !canSubmit}
            >
              {isReporting ? (
                <>
                  <Loader className="mr-2 h-4 w-4 animate-spin" />
                  {t("download.submitting")}
                </>
              ) : (
                t("download.submitReport")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
