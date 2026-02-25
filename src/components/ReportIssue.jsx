import React, { useState, useEffect } from "react";
import { useLanguage } from "@/context/LanguageContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Loader } from "lucide-react";
import { toast } from "sonner";

const ReportIssue = ({ isOpen, onClose }) => {
  const [reportReason, setReportReason] = useState("");
  const [details, setDetails] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [authToken, setAuthToken] = useState("");
  const { t } = useLanguage();

  useEffect(() => {
    const fetchToken = async () => {
      try {
        const token = await getToken();
        setAuthToken(token);
      } catch (error) {
        console.error("Error fetching token:", error);
        toast.error(t("common.reportDialog.authFailed"), {
          description: t("common.reportDialog.authFailedDesc"),
        });
      }
    };

    if (isOpen) {
      fetchToken();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setReportReason("");
      setDetails("");
    }
  }, [isOpen]);

  const getToken = async () => {
    // Import at top of file: import { getAuthToken } from "@/utils/authHelper";
    const { getAuthToken } = await import("@/utils/authHelper");
    return getAuthToken();
  };

  const handleSubmit = async () => {
    if (!reportReason.trim() || !details.trim()) {
      toast.error(t("common.reportDialog.missingInfo"), {
        description: t("common.reportDialog.missingInfoDesc"),
      });
      return;
    }

    const promise = new Promise(async (resolve, reject) => {
      try {
        // Get a fresh token for each request to ensure timestamp validity
        const freshToken = await getToken();

        const response = await fetch("https://api.ascendara.app/app/report/feature", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${freshToken}`,
          },
          body: JSON.stringify({
            reportType: "AscendaraApp",
            reason: reportReason,
            details: details,
          }),
        });

        if (response.ok) {
          resolve();
        } else {
          // If token is expired or invalid, try once more with a new token
          if (response.status === 401) {
            const newToken = await getToken();
            const retryResponse = await fetch(
              "https://api.ascendara.app/app/report/feature",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${newToken}`,
                },
                body: JSON.stringify({
                  reportType: "AscendaraApp",
                  reason: reportReason,
                  details: details,
                }),
              }
            );

            if (retryResponse.ok) {
              resolve();
            } else {
              reject(new Error("Failed to submit report after token refresh"));
            }
          } else {
            reject(new Error("Failed to submit report"));
          }
        }
      } catch (error) {
        reject(error);
      }
    });

    toast.promise(promise, {
      loading: t("common.reportDialog.submitting"),
      success: t("common.reportDialog.success"),
      error: err => `${t("common.reportDialog.error")}: ${err.message}`,
    });

    try {
      await promise;
      onClose();
    } catch (error) {
      console.error("Error submitting report:", error);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent className="sm:max-w-[425px]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-2xl font-bold text-foreground">
            {t("common.reportDialog.title")}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            {t("common.reportDialog.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label className="text-primary" htmlFor="reason">
              {t("common.reportDialog.reasonLabel")}
            </Label>
            <Input
              id="reason"
              className="text-foreground"
              value={reportReason}
              onChange={e => setReportReason(e.target.value)}
              placeholder={t("common.reportDialog.reasonPlaceholder")}
            />
          </div>
          <div className="grid gap-2">
            <Label className="text-primary" htmlFor="details">
              {t("common.reportDialog.detailsLabel")}
            </Label>
            <Textarea
              id="details"
              className="text-foreground"
              value={details}
              onChange={e => setDetails(e.target.value)}
              placeholder={t("common.reportDialog.detailsPlaceholder")}
              rows={4}
            />
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel className="text-primary" onClick={onClose}>
            {t("common.reportDialog.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleSubmit}
            disabled={isLoading}
            className="bg-primary text-secondary hover:bg-primary/90"
          >
            {isLoading ? (
              <>
                <Loader className="mr-2 h-4 w-4 animate-spin" />
                {t("common.reportDialog.submitting")}
              </>
            ) : (
              t("common.reportDialog.submit")
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default ReportIssue;
