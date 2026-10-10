import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/context/LanguageContext";
import { Loader, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const FILE_ISSUE_REPORT_PATTERN =
  /\b(?:missing|corrupt(?:ed|ion)?|incomplete|damaged)\b.{0,30}\b(?:files?|downloads?|archives?|installations?)\b|\b(?:files?|downloads?|archives?|installations?)\b.{0,30}\b(?:missing|corrupt(?:ed|ion)?|incomplete|damaged)\b/i;

const REPORT_REASONS = [
  ["gamedetails", "gameDetails"],
  ["filesnotdownloading", "filesNotDownloading"],
  ["notagame", "notAGame"],
  ["linksnotworking", "linksNotWorking"],
  ["image-error", "imageError"],
  ["image-bad", "imageBad"],
];

const fetchAuthToken = async () => {
  const authHeaders = await window.electron.getAuthHeaders();
  const response = await fetch("https://api.ascendara.app/auth/token", {
    headers: authHeaders,
  });
  if (!response.ok) {
    throw new Error("Failed to obtain token");
  }
  const { token } = await response.json();
  return token;
};

export default function ReportGameDialog({ open, onOpenChange, gameData, useV2 }) {
  const { t } = useLanguage();
  const [isReporting, setIsReporting] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const showIndexRefreshWarning = FILE_ISSUE_REPORT_PATTERN.test(reportDetails);

  const resetForm = () => {
    setReportReason("");
    setReportDetails("");
  };

  const handleSubmitReport = async () => {
    if (!reportReason || !reportDetails.trim()) {
      toast.error(t("download.reportError"));
      return;
    }

    setIsReporting(true);
    try {
      // Use v2 endpoint with gameID if using local index
      const endpoint = useV2
        ? "https://api.ascendara.app/app/v2/report"
        : "https://api.ascendara.app/app/report";

      const body = JSON.stringify({
        reportType: "GameBrowsing",
        reason: reportReason,
        details: reportDetails,
        ...(useV2 ? { gameID: gameData.gameID } : { gameName: gameData.game }),
      });

      const submit = async () =>
        fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${await fetchAuthToken()}`,
          },
          body,
        });

      let reportResponse = await submit();
      // If token is expired or invalid, try once more with a new token
      if (reportResponse.status === 401) {
        reportResponse = await submit();
      }
      if (!reportResponse.ok) {
        throw new Error("Failed to submit report");
      }

      toast.success(t("download.toast.reportSubmitted"));
      resetForm();
    } catch (error) {
      console.error("Error submitting report:", error);
      toast.error(t("download.toast.reportFailed"));
    } finally {
      setIsReporting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <form
          onSubmit={e => {
            e.preventDefault();
            handleSubmitReport();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold text-foreground">
              {t("download.reportBroken")}: {gameData.game}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 text-sm text-muted-foreground">
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {t("download.reportReason")}
                  </label>
                  <Select value={reportReason} onValueChange={setReportReason}>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={t("download.reportReasons.placeholder")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {REPORT_REASONS.map(([value, key]) => (
                        <SelectItem key={value} value={value}>
                          {t(`download.reportReasons.${key}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {t("download.reportDescription")}
                  </label>
                  <Textarea
                    placeholder={t("download.reportDescription")}
                    value={reportDetails}
                    onChange={e => setReportDetails(e.target.value)}
                    className="min-h-[100px]"
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
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 gap-2">
            <AlertDialogCancel className="text-primary" onClick={resetForm}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <Button type="submit" className="text-secondary" disabled={isReporting}>
              {isReporting ? (
                <>
                  <Loader className="mr-2 h-4 w-4 animate-spin" />
                  {t("download.submitting")}
                </>
              ) : (
                t("download.submitReport")
              )}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
