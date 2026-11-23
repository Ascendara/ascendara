import { useEffect, useState } from "react";
import { FileText, Loader, Send } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/context/LanguageContext";
import { API_URL } from "@/config/api";
import { getReporterHeaders } from "@/services/firebase/firebaseService";
import { fetchAuthToken } from "@/components/download/ReportGameDialog";

const LOG_FILES = ["downloadmanager.log", "debug.log", "gamehandler.log"];
const NEVER_PROMPT_KEY = "downloadReportPrompt";
const MAX_NOTE_LENGTH = 1000;

export const shouldPromptDownloadReports = () => {
  try {
    return localStorage.getItem(NEVER_PROMPT_KEY) !== "never";
  } catch {
    return true;
  }
};

const buildDetails = (game, downloadingData, errorMessage) =>
  [
    "**Game Information**",
    `• Name: ${game.game}`,
    `• Version: ${game.version || "Unknown"}`,
    `• Size: ${game.size || "Unknown"}`,
    "",
    "**Error**",
    "```",
    errorMessage || "Unknown error",
    "```",
    ...(downloadingData.message && downloadingData.message !== errorMessage
      ? ["", "**Original Error**", "```", downloadingData.message, "```"]
      : []),
    ...(downloadingData.previousError
      ? ["", "**Error Before Retry**", "```", downloadingData.previousError, "```"]
      : []),
    "",
    "**Download State**",
    `• Progress: ${downloadingData.progressCompleted || "0"}%`,
    `• Speed: ${downloadingData.progressDownloadSpeeds || "N/A"}`,
    "",
    "**System Info**",
    `• Platform: ${window.electron.getPlatform() || "Unknown"}`,
    `• App Version: v${__APP_VERSION__ || "Unknown"}`,
    `• Timestamp: ${new Date().toISOString()}`,
  ].join("\n");

const postReport = async (path, body) =>
  fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await fetchAuthToken()}`,
      ...(await getReporterHeaders()),
    },
    body: JSON.stringify(body),
  });

/**
 * Sends a download error report. Returns the response so callers can tell a
 * rate limit or a required update apart from a failure.
 */
const sendDownloadReport = async ({
  game,
  downloadingData,
  errorMessage,
  note,
  includeLogs,
}) => {
  const details = buildDetails(game, downloadingData, errorMessage);
  const base = {
    reportType: "GameDownload",
    reason: `Download Error: ${game.game}`,
    details,
    gameName: game.game,
  };
  const logs = includeLogs ? await window.electron.getReportLogs().catch(() => ({})) : {};
  const state = { ...downloadingData };
  delete state.ownerPid;
  let response = await postReport("/app/reports", {
    ...base,
    ...(game.gameID ? { gameID: String(game.gameID) } : {}),
    error: downloadingData.message || errorMessage || "",
    userNote: note || undefined,
    context: {
      platform: window.electron.getPlatform(),
      appVersion: __APP_VERSION__,
      game: {
        name: game.game,
        version: game.version,
        size: game.size,
        online: game.online,
        dlc: game.dlc,
        isVr: game.isVr,
        privateSource: Boolean(game.privateSource),
      },
      downloadingData: state,
    },
    logs,
  });
  // An API without the report inbox yet still takes the plain report
  if (response.status === 404 || response.status === 405) {
    response = await postReport("/app/report/feature", {
      ...base,
      details: note ? `${details}\n\n**Note from user**\n${note}` : details,
    });
  }
  return response;
};

export default function DownloadReportDialog({
  open,
  onOpenChange,
  game,
  downloadingData,
  errorMessage,
  onReported,
  onDismissed,
}) {
  const { t } = useLanguage();
  const [includeLogs, setIncludeLogs] = useState(true);
  const [note, setNote] = useState("");
  const [neverAsk, setNeverAsk] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      setIncludeLogs(true);
      setNote("");
      setNeverAsk(false);
    }
  }, [open]);

  const close = sent => {
    if (neverAsk) {
      try {
        localStorage.setItem(NEVER_PROMPT_KEY, "never");
      } catch {}
    }
    if (!sent) onDismissed?.();
    onOpenChange(false);
  };

  const handleSend = async () => {
    if (sending) return;
    setSending(true);
    try {
      const response = await sendDownloadReport({
        game,
        downloadingData,
        errorMessage,
        note: note.trim(),
        includeLogs,
      });
      if (response.status === 426) {
        toast.error(t("downloads.reportDialog.updateRequired"));
        return;
      }
      if (response.status === 429) {
        toast.error(t("downloads.reportDialog.rateLimited"));
        return;
      }
      if (!response.ok) throw new Error(`Report failed (${response.status})`);
      onReported?.();
      toast.success(t("downloads.errorReported"), {
        description: t("downloads.errorReportedDescription"),
      });
      close(true);
    } catch (error) {
      console.error("Failed to report error:", error);
      toast.error(t("common.reportDialog.couldNotReport"), {
        description: t("common.reportDialog.couldNotReportDesc"),
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={value => (value ? onOpenChange(true) : !sending && close(false))}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("downloads.reportDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("downloads.reportDialog.description", { game: game.game })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <p className="mb-2 font-medium text-foreground">
              {t("downloads.reportDialog.includes")}
            </p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>{t("downloads.reportDialog.includesError")}</li>
              <li>{t("downloads.reportDialog.includesSystem")}</li>
            </ul>
          </div>

          <div
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3"
            onClick={() => !sending && setIncludeLogs(value => !value)}
          >
            <Checkbox
              checked={includeLogs}
              onCheckedChange={setIncludeLogs}
              onClick={event => event.stopPropagation()}
              disabled={sending}
              className="mt-0.5"
            />
            <span className="space-y-1">
              <span className="flex items-center gap-2 font-medium text-foreground">
                <FileText className="h-4 w-4" />
                {t("downloads.reportDialog.includeLogs")}
              </span>
              <span className="block text-xs text-muted-foreground">
                {t("downloads.reportDialog.includeLogsDesc", {
                  files: LOG_FILES.join(", "),
                })}
              </span>
            </span>
          </div>

          <div className="space-y-2">
            <Label htmlFor="download-report-note" className="text-foreground">
              {t("downloads.reportDialog.noteLabel")}
            </Label>
            <Textarea
              id="download-report-note"
              value={note}
              maxLength={MAX_NOTE_LENGTH}
              disabled={sending}
              onChange={event => setNote(event.target.value)}
              placeholder={t("downloads.reportDialog.notePlaceholder")}
              className="min-h-[80px] text-foreground"
            />
          </div>

          <div
            className="flex cursor-pointer items-center gap-3 text-xs text-muted-foreground"
            onClick={() => !sending && setNeverAsk(value => !value)}
          >
            <Checkbox
              checked={neverAsk}
              onCheckedChange={setNeverAsk}
              onClick={event => event.stopPropagation()}
              disabled={sending}
            />
            {t("downloads.reportDialog.dontAsk")}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={sending}>
            {t("downloads.reportDialog.notNow")}
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending}
            className="gap-2 text-secondary"
          >
            {sending ? (
              <Loader className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {sending
              ? t("downloads.reportDialog.sending")
              : t("downloads.reportDialog.send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
