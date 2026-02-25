import React from "react";
import { useTranslation } from "react-i18next";
import { FlaskConical, TestTube2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

const BranchWelcomeDialog = ({ branch, open, onOpenChange }) => {
  const { t } = useTranslation();

  const isPublicTesting = branch === "public-testing";
  const isExperimental = branch === "experimental";

  if (!isPublicTesting && !isExperimental) return null;

  const handleDismiss = () => {
    // Cache the dismissal in localStorage so it never shows again
    localStorage.setItem(`branch-welcome-${branch}-shown`, "true");
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="border-border">
        <AlertDialogHeader>
          <div className="flex items-center gap-4">
            {isPublicTesting ? (
              <TestTube2 className="mb-2 h-10 w-10 text-blue-500" />
            ) : (
              <FlaskConical className="mb-2 h-10 w-10 text-orange-500" />
            )}
            <AlertDialogTitle className="text-2xl font-bold text-foreground">
              {isPublicTesting
                ? t("branchWelcome.publicTesting.title")
                : t("branchWelcome.experimental.title")}
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <div className="text-foreground">
                {isPublicTesting
                  ? t("branchWelcome.publicTesting.welcome")
                  : t("branchWelcome.experimental.welcome")}
              </div>
              <div className="space-y-2 rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                <p className="font-semibold text-foreground">
                  {isPublicTesting
                    ? t("branchWelcome.publicTesting.whatToExpect")
                    : t("branchWelcome.experimental.whatToExpect")}
                </p>
                <ul className="list-inside list-disc space-y-1">
                  {isPublicTesting ? (
                    <>
                      <li>{t("branchWelcome.publicTesting.feature1")}</li>
                      <li>{t("branchWelcome.publicTesting.feature2")}</li>
                      <li>{t("branchWelcome.publicTesting.feature3")}</li>
                    </>
                  ) : (
                    <>
                      <li>{t("branchWelcome.experimental.feature1")}</li>
                      <li>{t("branchWelcome.experimental.feature2")}</li>
                      <li>{t("branchWelcome.experimental.feature3")}</li>
                    </>
                  )}
                </ul>
              </div>
              <div className="text-sm text-muted-foreground">
                {isPublicTesting
                  ? t("branchWelcome.publicTesting.autoUpdate")
                  : t("branchWelcome.experimental.autoUpdate")}
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogAction onClick={handleDismiss}>
            {t("branchWelcome.okayUnderstand")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default BranchWelcomeDialog;
