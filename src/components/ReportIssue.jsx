import { useState, useEffect } from "react";
import { useLanguage } from "@/context/LanguageContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { cn } from "@/lib/utils";
import {
  Bug,
  Download,
  Ellipsis,
  Gauge,
  Loader,
  OctagonX,
  PanelsTopLeft,
} from "lucide-react";
import { toast } from "sonner";
import { API_URL } from "@/config/api";

// The value is what shows up as the report's category on the Discord side
const ISSUE_CATEGORIES = [
  { value: "Bug", key: "bug", icon: Bug },
  { value: "Crash", key: "crash", icon: OctagonX },
  { value: "Downloads", key: "downloads", icon: Download },
  { value: "Performance", key: "performance", icon: Gauge },
  { value: "Interface", key: "interface", icon: PanelsTopLeft },
  { value: "Other", key: "other", icon: Ellipsis },
];

const MAX_DETAILS_LENGTH = 2000;

const getToken = async () => {
  const { getAuthToken } = await import("@/utils/authHelper");
  return getAuthToken();
};

const ReportIssue = ({ isOpen, onClose }) => {
  const [category, setCategory] = useState("");
  const [details, setDetails] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { t } = useLanguage();
  const canSubmit = !!category && !!details.trim();

  useEffect(() => {
    if (!isOpen) {
      setCategory("");
      setDetails("");
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (isLoading) return;
    if (!canSubmit) {
      toast.error(t("common.reportDialog.missingInfo"), {
        description: t("common.reportDialog.missingInfoDesc"),
      });
      return;
    }

    setIsLoading(true);
    try {
      const body = JSON.stringify({
        reportType: "AscendaraApp",
        reason: category,
        details: details.trim(),
      });
      const submit = async () =>
        fetch(`${API_URL}/app/report/feature`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Get a fresh token for each request to ensure timestamp validity
            Authorization: `Bearer ${await getToken()}`,
          },
          body,
        });

      let response = await submit();
      // If token is expired or invalid, try once more with a new token
      if (response.status === 401) {
        response = await submit();
      }
      if (!response.ok) {
        throw new Error("Failed to submit report");
      }

      toast.success(t("common.reportDialog.success"));
      onClose();
    } catch (error) {
      console.error("Error submitting report:", error);
      toast.error(t("common.reportDialog.error"), {
        description: t("common.reportDialog.couldNotReportDesc"),
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <form
          className="space-y-5"
          onSubmit={e => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("common.reportDialog.title")}</DialogTitle>
            <DialogDescription>{t("common.reportDialog.description")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label className="text-foreground">
              {t("common.reportDialog.reasonLabel")}
            </Label>
            <div role="radiogroup" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ISSUE_CATEGORIES.map(({ value, key, icon: Icon }) => {
                const selected = category === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setCategory(value)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors",
                      selected
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-accent"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                        selected
                          ? "bg-primary text-secondary"
                          : "bg-accent/30 text-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-sm font-medium text-foreground">
                      {t(`common.reportDialog.categories.${key}`)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="report-issue-details" className="text-foreground">
                {t("common.reportDialog.detailsLabel")}
              </Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {details.length}/{MAX_DETAILS_LENGTH}
              </span>
            </div>
            <Textarea
              id="report-issue-details"
              className="min-h-[120px] text-foreground"
              value={details}
              maxLength={MAX_DETAILS_LENGTH}
              onChange={e => setDetails(e.target.value)}
              placeholder={t("common.reportDialog.detailsPlaceholder")}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" className="text-primary" onClick={onClose}>
              {t("common.reportDialog.cancel")}
            </Button>
            <Button type="submit" className="text-secondary" disabled={isLoading || !canSubmit}>
              {isLoading ? (
                <>
                  <Loader className="mr-2 h-4 w-4 animate-spin" />
                  {t("common.reportDialog.submitting")}
                </>
              ) : (
                t("common.reportDialog.submit")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ReportIssue;
