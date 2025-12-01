import React, { useState, useEffect } from "react";
import { useLanguage } from "@/context/LanguageContext";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ExternalLink,
  CircleCheck,
  ChevronRight,
  ChevronLeft,
  Globe,
  Puzzle,
  Terminal,
  Cookie,
  Copy,
  Check,
  Loader,
  Radio,
} from "lucide-react";

const STEAMRIP_POSTS_URL = "https://steamrip.com/wp-json/wp/v2/posts?per_page=1&page=1";

const RefreshIndexDialog = ({ open, onOpenChange, onStartRefresh }) => {
  const { t } = useLanguage();
  const [step, setStep] = useState(1);
  const [hasExtension, setHasExtension] = useState(null);
  const [cfClearance, setCfClearance] = useState("");
  const [copied, setCopied] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [cookieReceived, setCookieReceived] = useState(false);
  const [hasStartedRefresh, setHasStartedRefresh] = useState(false);

  // Listen for cookie from extension via protocol handler
  useEffect(() => {
    if (!open || step !== 3 || hasStartedRefresh) return;

    const handleCookieReceived = (event, data) => {
      if (data?.cookie && !hasStartedRefresh) {
        console.log("Received cookie from extension");
        setCfClearance(data.cookie);
        setCookieReceived(true);
        setIsListening(false);
        setHasStartedRefresh(true);
        // Auto-start refresh after a brief delay to show success state
        setTimeout(() => {
          onStartRefresh({ method: "extension", cfClearance: data.cookie });
          handleClose();
        }, 1000);
      }
    };

    // Start listening
    setIsListening(true);
    setCookieReceived(false);

    if (window.electron?.ipcRenderer) {
      window.electron.ipcRenderer.on("steamrip-cookie-received", handleCookieReceived);
      return () => {
        window.electron.ipcRenderer.off("steamrip-cookie-received", handleCookieReceived);
        setIsListening(false);
      };
    }
  }, [open, step, hasStartedRefresh]);

  const resetDialog = () => {
    setStep(1);
    setHasExtension(null);
    setCfClearance("");
    setCopied(false);
    setIsListening(false);
    setCookieReceived(false);
    setHasStartedRefresh(false);
  };

  const handleClose = () => {
    resetDialog();
    onOpenChange(false);
  };

  const handleOpenSteamRIP = () => {
    window.electron.openURL(STEAMRIP_POSTS_URL);
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(STEAMRIP_POSTS_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStartWithExtension = () => {
    // Extension will handle sending the cookie to Ascendara
    onStartRefresh({ method: "extension" });
    handleClose();
  };

  const handleStartWithCookie = () => {
    if (cfClearance.trim()) {
      onStartRefresh({ method: "manual", cfClearance: cfClearance.trim() });
      handleClose();
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                {t("refreshDialog.step1Title") || "Complete Cloudflare Verification"}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-4 text-sm text-muted-foreground">
                  <p>
                    {t("refreshDialog.step1Description") ||
                      "First, you need to open the SteamRIP posts link and complete Cloudflare's verification challenge."}
                  </p>
                  <div className="rounded-lg border bg-muted/50 p-4">
                    <p className="mb-3 text-sm font-medium text-foreground">
                      {t("refreshDialog.clickToOpen") ||
                        "Click the button below to open SteamRIP:"}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="default"
                        size="sm"
                        className="gap-2 text-secondary"
                        onClick={handleOpenSteamRIP}
                      >
                        <ExternalLink className="h-4 w-4" />
                        {t("refreshDialog.openSteamRIP") || "Open SteamRIP"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={handleCopyUrl}
                      >
                        {copied ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                        {copied
                          ? t("download.linkCopied")
                          : t("refreshDialog.copyLink") || "Copy Link"}
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t("refreshDialog.step1Note") ||
                      "Complete the captcha/verification, then click Next to continue."}
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button variant="outline" className="text-primary" onClick={handleClose}>
                {t("common.cancel") || "Cancel"}
              </Button>
              <Button onClick={() => setStep(2)} className="gap-2 text-secondary">
                {t("common.next") || "Next"}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </AlertDialogFooter>
          </>
        );

      case 2:
        return (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                {t("refreshDialog.step2Title")}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>{t("refreshDialog.step2Description")}</p>
                  <span
                    className="block cursor-pointer text-xs text-muted-foreground hover:underline"
                    onClick={() =>
                      window.electron.openURL("https://ascendara.app/extension")
                    }
                  >
                    {t("download.downloadOptions.getExtension")}
                  </span>
                  <div className="grid gap-3">
                    <Button
                      variant="outline"
                      className="h-auto justify-start gap-3 p-4 text-left"
                      onClick={() => {
                        setHasExtension(true);
                        setStep(3);
                      }}
                    >
                      <CircleCheck className="h-5 w-5 shrink-0 text-green-500" />
                      <div>
                        <span className="block font-medium text-foreground">
                          {t("refreshDialog.yesHaveExtension") ||
                            "Yes, I have the extension"}
                        </span>
                      </div>
                    </Button>
                    <Button
                      variant="outline"
                      className="h-auto justify-start gap-3 p-4 text-left"
                      onClick={() => {
                        setHasExtension(false);
                        setStep(4);
                      }}
                    >
                      <Terminal className="h-5 w-5 shrink-0 text-orange-500" />
                      <div>
                        <span className="block font-medium text-foreground">
                          {t("refreshDialog.noExtension") || "No, I don't have it"}
                        </span>
                        <span className="block text-sm text-muted-foreground">
                          {t("refreshDialog.noExtensionDesc") ||
                            "I'll manually copy the cookie from browser dev tools"}
                        </span>
                      </div>
                    </Button>
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button
                variant="ghost"
                onClick={() => setStep(1)}
                className="gap-2 text-primary"
              >
                <ChevronLeft className="h-4 w-4" />
                {t("common.back") || "Back"}
              </Button>
              <Button variant="outline" className="text-primary" onClick={handleClose}>
                {t("common.cancel") || "Cancel"}
              </Button>
            </AlertDialogFooter>
          </>
        );

      case 3:
        // Has extension - waiting for extension to send data
        return (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                {cookieReceived
                  ? t("refreshDialog.cookieReceivedTitle") || "Cookie Received!"
                  : t("refreshDialog.listeningTitle") || "Waiting for Extension..."}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-4 text-sm text-muted-foreground">
                  {cookieReceived ? (
                    <div className="flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/10 p-4">
                      <CircleCheck className="h-6 w-6 text-green-500" />
                      <span className="text-green-600 dark:text-green-400">
                        {t("refreshDialog.cookieReceivedDesc") ||
                          "Successfully received the cookie from the extension!"}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/10 p-4">
                        <Loader className="h-5 w-5 animate-spin text-primary" />
                        <div>
                          <span className="block font-medium text-foreground">
                            {t("refreshDialog.listeningStatus") ||
                              "Listening for extension..."}
                          </span>
                          <span className="block text-sm text-muted-foreground">
                            {t("refreshDialog.listeningDesc") ||
                              "Ascendara is waiting to receive the cookie from the browser extension."}
                          </span>
                        </div>
                      </div>
                      <div className="rounded-lg border bg-muted/50 p-4">
                        <ol className="list-inside list-decimal space-y-2 text-sm">
                          <li>
                            {t("refreshDialog.extStep1") ||
                              "Complete the Cloudflare captcha on the SteamRIP page"}
                          </li>
                          <li>
                            {t("refreshDialog.extStep2") ||
                              "Look for the Ascendara extension popup"}
                          </li>
                          <li>
                            {t("refreshDialog.extStep3") ||
                              "Click 'Send to Ascendara' in the popup"}
                          </li>
                        </ol>
                      </div>
                    </>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button
                variant="ghost"
                onClick={() => setStep(2)}
                className="gap-2 text-primary"
                disabled={cookieReceived}
              >
                <ChevronLeft className="h-4 w-4" />
                {t("common.back") || "Back"}
              </Button>
              <Button
                variant="outline"
                className="text-primary"
                onClick={handleClose}
                disabled={cookieReceived}
              >
                {t("common.cancel") || "Cancel"}
              </Button>
            </AlertDialogFooter>
          </>
        );

      case 4:
        // No extension - manual cookie extraction
        return (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Terminal className="h-5 w-5 text-primary" />
                {t("refreshDialog.step4Title") || "Open Developer Tools"}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-4 text-sm text-muted-foreground">
                  <p>
                    {t("refreshDialog.step4Description") ||
                      "Follow these steps to get the cf_clearance cookie:"}
                  </p>
                  <div className="rounded-lg border bg-muted/50 p-4">
                    <ol className="list-inside list-decimal space-y-3 text-sm">
                      <li>
                        <span className="font-medium text-foreground">
                          {t("refreshDialog.manualStep1") || "Open Chrome DevTools"}
                        </span>
                        <span className="ml-5 block text-muted-foreground">
                          {t("refreshDialog.manualStep1Desc") ||
                            "Press F12 or right-click → Inspect"}
                        </span>
                      </li>
                      <li>
                        <span className="font-medium text-foreground">
                          {t("refreshDialog.manualStep2") || "Go to the Network tab"}
                        </span>
                        <span className="ml-5 block text-muted-foreground">
                          {t("refreshDialog.manualStep2Desc") ||
                            "Click on 'Network' in the DevTools panel"}
                        </span>
                      </li>
                      <li>
                        <span className="font-medium text-foreground">
                          {t("refreshDialog.manualStep3") || "Reload the page"}
                        </span>
                        <span className="ml-5 block text-muted-foreground">
                          {t("refreshDialog.manualStep3Desc") ||
                            "Press F5 or click the refresh button"}
                        </span>
                      </li>
                      <li>
                        <span className="font-medium text-foreground">
                          {t("refreshDialog.manualStep4") || "Find the 'posts' request"}
                        </span>
                        <span className="ml-5 block text-muted-foreground">
                          {t("refreshDialog.manualStep4Desc") ||
                            "Look for 'posts' in the network requests list"}
                        </span>
                      </li>
                      <li>
                        <span className="font-medium text-foreground">
                          {t("refreshDialog.manualStep5") ||
                            "Copy the cf_clearance cookie"}
                        </span>
                        <span className="ml-5 block text-muted-foreground">
                          {t("refreshDialog.manualStep5Desc") ||
                            "Click on the request → Cookies tab → Copy cf_clearance value"}
                        </span>
                      </li>
                    </ol>
                  </div>
                  <span
                    className="block cursor-pointer text-xs text-muted-foreground hover:underline"
                    onClick={() =>
                      window.electron.openURL("https://ascendara.app/extension")
                    }
                  >
                    {t("refreshDialog.orJustGetExtension")}
                  </span>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button
                variant="ghost"
                onClick={() => setStep(2)}
                className="gap-2 text-primary"
              >
                <ChevronLeft className="h-4 w-4" />
                {t("common.back") || "Back"}
              </Button>
              <Button variant="outline" className="text-primary" onClick={handleClose}>
                {t("common.cancel") || "Cancel"}
              </Button>
              <Button onClick={() => setStep(5)} className="gap-2 text-secondary">
                {t("common.next") || "Next"}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </AlertDialogFooter>
          </>
        );

      case 5:
        // Paste cookie
        return (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Cookie className="h-5 w-5 text-primary" />
                {t("refreshDialog.step5Title") || "Paste the Cookie"}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-4 text-sm text-muted-foreground">
                  <p>
                    {t("refreshDialog.step5Description") ||
                      "Paste the cf_clearance cookie value below:"}
                  </p>
                  <div className="space-y-2">
                    <Input
                      placeholder={
                        t("refreshDialog.cookiePlaceholder") ||
                        "Paste cf_clearance cookie here..."
                      }
                      value={cfClearance}
                      onChange={e => setCfClearance(e.target.value)}
                      className="font-mono text-sm"
                    />
                    <span className="block text-xs text-muted-foreground">
                      {t("refreshDialog.cookieNote") ||
                        "The cookie should be a long string of letters and numbers."}
                    </span>
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button
                variant="ghost"
                onClick={() => setStep(4)}
                className="gap-2 text-primary"
              >
                <ChevronLeft className="h-4 w-4" />
                {t("common.back") || "Back"}
              </Button>
              <Button variant="outline" className="text-primary" onClick={handleClose}>
                {t("common.cancel") || "Cancel"}
              </Button>
              <Button
                onClick={() => {
                  onStartRefresh({ method: "manual", cfClearance: cfClearance.trim() });
                  handleClose();
                }}
                disabled={!cfClearance.trim()}
                className="gap-2 text-secondary"
              >
                {t("refreshDialog.startRefresh") || "Start Refresh"}
                <CircleCheck className="h-4 w-4" />
              </Button>
            </AlertDialogFooter>
          </>
        );

      case 6:
        // Loading step - starting refresh
        return (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Loader className="h-5 w-5 animate-spin text-primary" />
                {t("refreshDialog.startingRefresh") || "Starting Refresh..."}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="text-sm text-muted-foreground">
                  <div className="flex flex-col items-center justify-center py-8">
                    <div className="mb-4 rounded-full bg-primary/10 p-4">
                      <Loader className="h-8 w-8 animate-spin text-primary" />
                    </div>
                    <span className="text-center text-muted-foreground">
                      {t("refreshDialog.preparingRefresh") ||
                        "Preparing to refresh the game index..."}
                    </span>
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button
                onClick={() => {
                  onStartRefresh({
                    method: hasExtension ? "extension" : "manual",
                    cfClearance,
                  });
                  handleClose();
                }}
                className="w-full gap-2"
              >
                {t("refreshDialog.beginRefresh") || "Begin Refresh"}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </AlertDialogFooter>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">{renderStep()}</AlertDialogContent>
    </AlertDialog>
  );
};

export default RefreshIndexDialog;
