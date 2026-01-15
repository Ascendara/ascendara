import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/context/LanguageContext";
import { useSettings } from "@/context/SettingsContext";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  Download,
  Server,
  HardDrive,
  Clock,
  CircleCheck,
  AlertCircle,
  Loader2,
  MoreVertical,
  Trash,
  StopCircle,
  RefreshCw,
  Coffee,
  AlertTriangle,
  Loader,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getUserInfo,
  getAllDownloads,
  controlWebDownload,
  getApiKey,
  getDirectDownloadLink,
} from "@/services/torboxService";

// Helper function to check if there are active downloads
const checkActiveDownloads = async () => {
  try {
    // Check for pending download lock (prevents race condition when navigating quickly)
    const pendingDownload = localStorage.getItem("pendingDownloadLock");
    if (pendingDownload) {
      const lockTime = parseInt(pendingDownload, 10);
      // Lock expires after 10 seconds (in case of crash/error)
      if (Date.now() - lockTime < 10000) {
        return 1; // Treat as active download
      } else {
        localStorage.removeItem("pendingDownloadLock");
      }
    }

    const games = await window.electron.getGames();
    const activeDownloads = games.filter(game => {
      const { downloadingData } = game;
      return (
        downloadingData &&
        (downloadingData.downloading ||
          downloadingData.extracting ||
          downloadingData.updating)
      );
    });
    return activeDownloads.length;
  } catch (error) {
    console.error("Error checking active downloads:", error);
    return 0;
  }
};

// Set download lock before starting download
const setDownloadLock = () => {
  localStorage.setItem("pendingDownloadLock", Date.now().toString());
};

// Clear download lock (called when download actually starts or fails)
const clearDownloadLock = () => {
  localStorage.removeItem("pendingDownloadLock");
};

// Utility function to manage stored game names
const manageStoredGameNames = () => {
  try {
    // Simply retrieve the stored game names without expiration logic
    const torboxNames = JSON.parse(localStorage.getItem("torboxGameNames") || "{}");
    return torboxNames;
  } catch (err) {
    console.error("Error managing stored game names:", err);
    return {};
  }
};

const TorboxDownloads = () => {
  const { t } = useLanguage();
  const { settings } = useSettings();
  const { isAuthenticated } = useAuth();

  // State for TorBox downloads
  const [torboxDownloads, setTorboxDownloads] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  // Remove serverStats state, use only userInfo for real data
  const [userInfo, setUserInfo] = useState(null);
  const [userInfoLoading, setUserInfoLoading] = useState(true);
  const [userInfoError, setUserInfoError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmStop, setConfirmStop] = useState(null);
  // State for redownload dialog
  const [confirmRedownload, setConfirmRedownload] = useState(false);
  const [redownloadTarget, setRedownloadTarget] = useState(null);

  // Helper to trigger redownload dialog
  const handleRedownloadConfirm = download => {
    setRedownloadTarget(download);
    setConfirmRedownload(true);
  };
  // Helper to actually redownload
  const handleRedownload = () => {
    setConfirmRedownload(false);
    if (redownloadTarget) {
      handleDownloadToPC(redownloadTarget);
      setRedownloadTarget(null);
    }
  };

  // State to track downloads that have been downloaded to PC
  const [downloadedToPc, setDownloadedToPc] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("torboxDownloadedToPc") || "{}");
    } catch (err) {
      console.error("Error loading downloaded to PC state:", err);
      return {};
    }
  });

  // Polling interval reference
  const pollingRef = useRef(null);

  // Fetch TorBox downloads
  const fetchTorboxDownloads = async () => {
    if (!settings?.torboxApiKey) {
      setError("TorBox API key not found in settings");
      setIsLoading(false);
      return;
    }

    try {
      // Use the getAllDownloads service function
      const downloads = await getAllDownloads(settings.torboxApiKey);
      console.log("[TorboxDownloads] Downloads fetched:", downloads);
      setTorboxDownloads(downloads || []);
      setError(null);
    } catch (err) {
      console.error("[TorboxDownloads] Error fetching downloads:", err);
      setError("Failed to fetch TorBox downloads");
    } finally {
      setIsLoading(false);
    }
  };

  // Remove fetchServerStats, only fetch userInfo

  // Fetch user information
  const fetchUserInfo = async () => {
    if (!settings?.torboxApiKey) {
      setUserInfoError("No TorBox API key in settings");
      setUserInfoLoading(false);
      setUserInfo(null);
      return;
    }

    // Only show loading state on initial load, not on refresh
    if (userInfo === null) {
      setUserInfoLoading(true);
    }
    setUserInfoError(null);
    try {
      const info = await getUserInfo(settings.torboxApiKey);
      console.debug("[TorboxDownloads] User info API response:", info);
      if (!info || typeof info !== "object" || !info.email) {
        setUserInfoError("Unexpected user info response");
        setUserInfo(null);
      } else {
        setUserInfo(info);
      }
    } catch (err) {
      setUserInfoError(err?.message || "Failed to fetch user info");
      setUserInfo(null);
      console.error("[TorboxDownloads] Error fetching user info:", err);
    } finally {
      setUserInfoLoading(false);
    }
  };

  // Setup polling
  useEffect(() => {
    // Initial fetch
    fetchTorboxDownloads();
    fetchUserInfo();

    // Setup polling interval (every 10 seconds for downloads, 60 seconds for user info)
    const downloadInterval = setInterval(() => {
      fetchTorboxDownloads();
    }, 10000);

    // Separate interval for user info (every 60 seconds)
    const userInfoInterval = setInterval(() => {
      fetchUserInfo();
    }, 60000);

    // Cleanup interval on unmount
    return () => {
      clearInterval(downloadInterval);
      clearInterval(userInfoInterval);
    };
  }, [settings.torboxApiKey]);

  // Handle stop download
  const handleStopDownload = download => {
    // Try to get the stored name from localStorage before setting confirmStop
    try {
      const torboxNames = manageStoredGameNames();
      let storedName = null;

      // Check for stored name using the same logic as in TorboxDownloadCard
      if (download.id && torboxNames[download.id]) {
        storedName = torboxNames[download.id].name;
      } else if (download.url && torboxNames[download.url]) {
        storedName = torboxNames[download.url].name;
      } else if (download.files && Array.isArray(download.files)) {
        for (const file of download.files) {
          if (file.url && torboxNames[file.url]) {
            storedName = torboxNames[file.url].name;
            break;
          }
        }
      } else if (download.original_url && torboxNames[download.original_url]) {
        storedName = torboxNames[download.original_url].name;
      }

      // Add the stored name to the download object if found
      if (storedName) {
        setConfirmStop({ ...download, displayName: storedName });
      } else {
        setConfirmStop(download);
      }
    } catch (err) {
      console.error("Error retrieving stored game name for stop dialog:", err);
      setConfirmStop(download);
    }
  };

  // Handle delete download
  const handleDeleteDownload = download => {
    // Try to get the stored name from localStorage before setting confirmDelete
    try {
      const torboxNames = manageStoredGameNames();
      let storedName = null;

      // Check for stored name using the same logic as in TorboxDownloadCard
      if (download.id && torboxNames[download.id]) {
        storedName = torboxNames[download.id].name;
      } else if (download.url && torboxNames[download.url]) {
        storedName = torboxNames[download.url].name;
      } else if (download.files && Array.isArray(download.files)) {
        for (const file of download.files) {
          if (file.url && torboxNames[file.url]) {
            storedName = torboxNames[file.url].name;
            break;
          }
        }
      } else if (download.original_url && torboxNames[download.original_url]) {
        storedName = torboxNames[download.original_url].name;
      }

      // Add the stored name to the download object if found
      if (storedName) {
        setConfirmDelete({ ...download, displayName: storedName });
      } else {
        setConfirmDelete(download);
      }
    } catch (err) {
      console.error("Error retrieving stored game name for delete dialog:", err);
      setConfirmDelete(download);
    }
  };

  const deleteDownload = async download => {
    if (!download || !download.id) {
      toast.error(t("torbox.error_invalid_download"));
      return;
    }

    try {
      const apiKey = getApiKey(settings);
      if (!apiKey) {
        toast.error(t("torbox.error_no_api_key"));
        return;
      }

      await controlWebDownload(apiKey, {
        webdl_id: download.id,
        operation: "delete",
      });

      // Update the downloads list after successful deletion
      fetchTorboxDownloads();

      toast.success(
        t("torbox.download_deleted_desc", {
          name: download?.name || download?.files?.[0]?.short_name || t("common.file"),
        })
      );
    } catch (error) {
      console.error("[TorboxDownloads] Error deleting download:", error);
      toast.error(t("torbox.error_deleting_download"));
    }
  };

  // Handle download to PC
  const handleDownloadToPC = async download => {
    if (!download || !download.id) {
      toast.error(t("torbox.error_invalid_download"));
      return;
    }

    // Check download queue limit for non-Ascend users
    if (!isAuthenticated) {
      const activeCount = await checkActiveDownloads();
      if (activeCount > 0) {
        toast.error(t("download.toast.downloadQueueLimit"));
        return;
      }
      // Set lock immediately to prevent race condition
      setDownloadLock();
    }

    try {
      // First, try to get stored download data from local storage
      const torboxData = manageStoredGameNames();
      const storedData = torboxData[download.id] || null;

      if (!storedData || !storedData.gameData) {
        // If no stored data, try to download directly from the current download
        if (download.files && download.files.length > 0 && download.files[0].url) {
          // Get a direct file URL from the download
          const fileUrl = download.files[0].url;
          const fileName =
            storedData?.name ||
            download.name ||
            download.files[0].short_name ||
            "download";

          toast.info(t("torbox.starting_download_to_pc", { name: fileName }));

          try {
            // Use electron to download the file
            await window.electron.downloadFile(
              fileUrl,
              fileName,
              false, // online
              false, // dlc
              false, // isVr
              false, // updateFlow
              "", // version
              storedData?.imgUrl || null, // imgID
              download.size ? formatBytes(download.size) : "", // size
              0, // additionalDirIndex
              "" // gameID
            );

            toast.success(t("torbox.download_started", { name: fileName }));
          } catch (error) {
            console.error("[TorboxDownloads] Error starting download:", error);
            toast.error(t("torbox.error_starting_download"));
            clearDownloadLock();
          }
          return;
        }

        toast.error(t("torbox.error_no_download_data"));
        clearDownloadLock();
        return;
      }

      // We have stored data, use it to process the download like in Download.jsx
      const { gameData, provider, originalUrl } = storedData;

      toast.info(t("torbox.processing_download", { name: gameData.game }));

      // Get the API key
      const apiKey = getApiKey(settings);
      if (!apiKey) {
        toast.error(t("torbox.error_no_api_key"));
        return;
      }

      // Get a fresh direct download link
      const downloadUrlResponse = await getDirectDownloadLink(apiKey, download.id);

      // Check if we have a valid response
      if (!downloadUrlResponse) {
        throw new Error("Failed to get direct download URL");
      }

      // Log the response structure to understand its format
      console.log(
        "Download URL response structure:",
        JSON.stringify(downloadUrlResponse, null, 2)
      );

      // Extract the URL string from the response
      // Based on the error message, we know the URL is in the data property
      let directUrl = null;

      // Simple extraction logic that checks common patterns
      if (typeof downloadUrlResponse === "string") {
        directUrl = downloadUrlResponse;
      } else if (downloadUrlResponse && typeof downloadUrlResponse === "object") {
        // Check the most likely places for the URL based on the API response
        directUrl =
          downloadUrlResponse.data ||
          downloadUrlResponse.download_url ||
          downloadUrlResponse.url ||
          (downloadUrlResponse.data && downloadUrlResponse.data.url);
      }

      if (!directUrl || typeof directUrl !== "string") {
        console.error("Invalid download URL format:", downloadUrlResponse);
        throw new Error("Failed to extract download URL from response");
      }

      // Ensure the URL is properly formatted
      if (!directUrl.startsWith("http")) {
        directUrl = `https://${directUrl.replace(/^(?:https?:\/\/)?/, "")}`;
      }

      console.log("Extracted direct URL:", directUrl);

      // Sanitize game name
      const sanitizedGameName = gameData.game.replace(/[<>:"/\\|?*]/g, "");

      toast.success(t("torbox.download_ready"));

      // Start the download using electron
      await window.electron.downloadFile(
        directUrl,
        sanitizedGameName,
        gameData.online || false,
        gameData.dlc || false,
        gameData.vr || false, // isVr
        false, // updateFlow - explicitly set to false
        gameData.version || "",
        gameData.imgID || null,
        gameData.size || "",
        0, // additionalDirIndex
        gameData.gameID || "" // gameID
      );

      toast.success(t("torbox.download_started", { name: gameData.game }));

      // Mark this download as downloaded to PC
      const updatedDownloadedToPc = {
        ...downloadedToPc,
        [download.id]: {
          timestamp: Date.now(),
          name: gameData.game,
        },
      };

      // Update state and save to localStorage
      setDownloadedToPc(updatedDownloadedToPc);
      localStorage.setItem("torboxDownloadedToPc", JSON.stringify(updatedDownloadedToPc));
    } catch (error) {
      console.error("[TorboxDownloads] Error downloading to PC:", error);
      toast.error(t("torbox.error_downloading_to_pc"));
      clearDownloadLock();
    }
  };

  // Format bytes to human readable format
  const formatBytes = (bytes, decimals = 2) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 mt-10">
        <h1 className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-4xl font-bold text-transparent">
          {t("torbox.title")}
        </h1>
        <p className="mt-2 text-muted-foreground">{t("torbox.description")}</p>
      </div>

      {/* Account Info Card */}
      <Card className="mb-8 border-border/40 bg-gradient-to-br from-background to-muted/20 shadow-lg">
        <CardContent className="p-6">
          {userInfoLoading && !userInfo ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="ml-3 text-muted-foreground">
                {t("torbox.loading_account")}
              </span>
            </div>
          ) : userInfoError ? (
            <div className="flex items-center justify-center py-8">
              <AlertCircle className="text-destructive h-6 w-6" />
              <span className="text-destructive ml-3">{userInfoError}</span>
            </div>
          ) : (
            userInfo && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="rounded-xl bg-primary/10 p-3">
                      <Server className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold">{t("torbox.account")}</h3>
                      <p className="text-sm text-muted-foreground">{userInfo.email}</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={async () => {
                      try {
                        await fetchTorboxDownloads();
                        await fetchUserInfo();
                        toast(t("torbox.data_refreshed"));
                      } catch (err) {
                        console.error("Error in refresh handler:", err);
                        if (toast.error) toast.error("Refresh failed");
                      }
                    }}
                  >
                    <RefreshCw className="h-4 w-4" />
                    {t("common.refresh")}
                  </Button>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="rounded-lg border border-border/50 bg-background/50 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <div className="rounded-md bg-primary/10 p-1.5">
                        <HardDrive className="h-4 w-4 text-primary" />
                      </div>
                      <span className="text-sm font-medium text-muted-foreground">
                        {t("torbox.plan")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={userInfo.plan > 0 ? "default" : "outline"}
                        className="text-xs text-secondary"
                      >
                        {userInfo.plan === 0
                          ? t("torbox.plan_free")
                          : userInfo.plan === 1
                            ? t("torbox.plan_essential")
                            : userInfo.plan === 2
                              ? t("torbox.plan_standard")
                              : userInfo.plan === 3
                                ? t("torbox.plan_pro")
                                : "Unknown"}
                      </Badge>
                      {userInfo.premium_expires_at && userInfo.plan > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {t("torbox.expires", {
                            date: new Date(
                              userInfo.premium_expires_at
                            ).toLocaleDateString(),
                          })}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/50 bg-background/50 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <div className="rounded-md bg-primary/10 p-1.5">
                        <Download className="h-4 w-4 text-primary" />
                      </div>
                      <span className="text-sm font-medium text-muted-foreground">
                        {t("torbox.downloads")}
                      </span>
                    </div>
                    <p className="text-2xl font-bold">
                      {userInfo.total_downloaded.toLocaleString()}
                    </p>
                  </div>

                  <div className="rounded-lg border border-border/50 bg-background/50 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <div className="rounded-md bg-primary/10 p-1.5">
                        <HardDrive className="h-4 w-4 text-primary" />
                      </div>
                      <span className="text-sm font-medium text-muted-foreground">
                        {t("torbox.data")}
                      </span>
                    </div>
                    <p className="text-2xl font-bold">
                      {(userInfo.total_bytes_downloaded / 1024 ** 3).toFixed(2)} GB
                    </p>
                  </div>
                </div>
              </div>
            )
          )}
        </CardContent>
      </Card>

      {/* Tabs for download categories */}
      <Tabs defaultValue="ready" className="w-full">
        <TabsList className="mb-6 grid w-full grid-cols-3 lg:w-[400px]">
          <TabsTrigger value="ready" className="gap-2">
            <CircleCheck className="h-4 w-4" />
            {t("torbox.ready")}
          </TabsTrigger>
          <TabsTrigger value="downloading" className="gap-2">
            <Loader2 className="h-4 w-4" />
            {t("torbox.downloading")}
          </TabsTrigger>
          <TabsTrigger value="completed" className="gap-2">
            <Download className="h-4 w-4" />
            {t("torbox.completed")}
          </TabsTrigger>
        </TabsList>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-lg">{t("torbox.loading_downloads")}</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="text-destructive mb-2 h-12 w-12" />
            <h3 className="mb-1 text-xl font-semibold">{t("common.error")}</h3>
            <p className="text-muted-foreground">{error}</p>
            <Button variant="outline" className="mt-4" onClick={fetchTorboxDownloads}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {t("common.retry")}
            </Button>
          </div>
        ) : (
          <>
            <TabsContent value="ready">
              {/* ab shows downloads that are completed or cached on server but not yet downloaded to PC */}
              {(() => {
                const readyDownloads = torboxDownloads.filter(
                  d =>
                    (d.download_state?.toLowerCase() === "completed" ||
                      d.download_state?.toLowerCase() === "cached") &&
                    !downloadedToPc[d.id]
                );

                return readyDownloads.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <div className="mx-auto w-fit rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 p-8">
                      <Coffee className="h-16 w-16 text-primary" />
                    </div>
                    <h3 className="mb-2 mt-4 text-2xl font-semibold">
                      {t("torbox.no_ready_downloads")}
                    </h3>
                    <p className="mt-1 max-w-md text-center text-muted-foreground">
                      {t("torbox.no_ready_downloads_desc")}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {readyDownloads.map((download, idx) => (
                      <TorboxDownloadCard
                        key={download.id || `torbox-ready-${idx}`}
                        download={download}
                        onDelete={() => handleDeleteDownload(download)}
                        onDownloadToPC={() => handleDownloadToPC(download)}
                      />
                    ))}
                  </div>
                );
              })()}
            </TabsContent>

            <TabsContent value="downloading">
              {/* Downloading tab shows downloads that are in progress on the server */}
              {(() => {
                const downloadingDownloads = torboxDownloads.filter(
                  d =>
                    d.download_state?.toLowerCase() !== "completed" &&
                    d.download_state?.toLowerCase() !== "cached" &&
                    d.download_state?.toLowerCase() !== "error"
                );

                return downloadingDownloads.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <div className="mx-auto w-fit rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 p-8">
                      <Coffee className="h-16 w-16 text-primary" />
                    </div>
                    <h3 className="mb-2 mt-4 text-2xl font-semibold">
                      {t("torbox.no_downloading")}
                    </h3>
                    <p className="mt-1 max-w-md text-center text-muted-foreground">
                      {t("torbox.no_downloading_desc")}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {downloadingDownloads.map((download, idx) => (
                      <TorboxDownloadCard
                        key={download.id || `torbox-downloading-${idx}`}
                        download={download}
                        onStop={() => handleStopDownload(download)}
                        onDelete={() => handleDeleteDownload(download)}
                        onDownloadToPC={() => handleDownloadToPC(download)}
                      />
                    ))}
                  </div>
                );
              })()}
            </TabsContent>

            <TabsContent value="completed">
              {/* Completed tab shows downloads that have been downloaded to PC */}
              {(() => {
                const completedDownloads = torboxDownloads.filter(
                  d => downloadedToPc[d.id]
                );

                return completedDownloads.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <div className="mx-auto w-fit rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 p-8">
                      <Coffee className="h-16 w-16 text-primary" />
                    </div>
                    <h3 className="mb-2 mt-4 text-2xl font-semibold">
                      {t("torbox.no_completed_downloads")}
                    </h3>
                    <p className="mt-1 max-w-md text-center text-muted-foreground">
                      {t("torbox.no_completed_downloads_desc")}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {completedDownloads.map((download, idx) => (
                      <TorboxDownloadCard
                        key={download.id || `torbox-completed-${idx}`}
                        download={download}
                        onDelete={() => handleDeleteDownload(download)}
                        isCompletedTab={true}
                        onRedownloadConfirm={handleRedownloadConfirm}
                      />
                    ))}
                  </div>
                );
              })()}
            </TabsContent>
          </>
        )}
      </Tabs>

      {/* Redownload Confirmation Dialog */}
      <AlertDialog open={!!confirmRedownload} onOpenChange={setConfirmRedownload}>
        <AlertDialogContent className="border-border">
          <AlertDialogHeader>
            <div className="flex items-center gap-4">
              <AlertDialogTitle className="text-2xl font-bold text-foreground">
                {t("torbox.redownload_same_file")}
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="space-y-4">
              <p className="text-foreground">
                {t("torbox.redownload_same_file_confirm")}
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-3 sm:justify-end">
            <AlertDialogCancel className="text-foreground">
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleRedownload}>
              {t("common.redownload")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmation Dialogs */}
      <AlertDialog open={!!confirmStop} onOpenChange={() => setConfirmStop(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("torbox.stop_download")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("torbox.stop_download_confirm", {
                name:
                  confirmStop?.displayName ||
                  confirmStop?.name ||
                  confirmStop?.files?.[0]?.short_name ||
                  t("torbox.this_file"),
              })}
              &nbsp;
              {t("common.action_cannot_be_undone")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await controlWebDownload(settings.torboxApiKey, {
                    webdl_id: confirmStop.id,
                    operation: "stop",
                  });

                  toast.success(
                    t("torbox.download_stopped_desc", {
                      name:
                        confirmStop?.displayName ||
                        confirmStop?.name ||
                        confirmStop?.files?.[0]?.short_name ||
                        t("common.file"),
                    })
                  );

                  // Refresh downloads to show updated status
                  fetchTorboxDownloads();
                } catch (error) {
                  console.error("Error stopping download:", error);
                  toast.error(t("torbox.error_stopping_download"));
                }
                setConfirmStop(null);
              }}
            >
              {t("common.stop")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("torbox.delete_download")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("torbox.delete_download_confirm", {
                name:
                  confirmDelete?.displayName ||
                  confirmDelete?.name ||
                  confirmDelete?.files?.[0]?.short_name ||
                  t("torbox.this_file"),
              })}
              {t("common.action_cannot_be_undone")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteDownload(confirmDelete);
                setConfirmDelete(null);
              }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// TorBox Download Card Component
const TorboxDownloadCard = ({
  download,
  onStop,
  onDelete,
  onDownloadToPC,
  isCompletedTab,
  onRedownloadConfirm,
}) => {
  const { t } = useLanguage();
  const [storedName, setStoredName] = useState(null);

  // Try to get a better name from local storage
  useEffect(() => {
    try {
      // Get stored game names with automatic cleanup of old entries
      const torboxNames = manageStoredGameNames();

      // Look for a match based on download ID or URL
      if (download) {
        // First check if we have a direct match by ID
        if (download.id && torboxNames[download.id]) {
          setStoredName(torboxNames[download.id].name);
          return;
        }

        // Check if we have a match by URL
        if (download.url && torboxNames[download.url]) {
          setStoredName(torboxNames[download.url].name);
          return;
        }

        // Check if we have a match in any of the files
        if (download.files && Array.isArray(download.files)) {
          for (const file of download.files) {
            if (file.url && torboxNames[file.url]) {
              setStoredName(torboxNames[file.url].name);
              return;
            }
          }
        }

        // If we still don't have a match, try to match by original URL if available
        if (download.original_url && torboxNames[download.original_url]) {
          setStoredName(torboxNames[download.original_url].name);
          return;
        }
      }
    } catch (err) {
      console.error("Error retrieving stored game name:", err);
    }
  }, [download]);

  // Fallbacks for missing fields
  const name =
    storedName ||
    download?.name ||
    download?.files?.[0]?.short_name ||
    t("common.unknown");
  // If progress is a float (0-1), convert to percent
  let progress = 0;
  if (typeof download?.progress === "number") {
    progress =
      download.progress > 1 ? download.progress : Math.round(download.progress * 100);
  } else if (typeof download?.percent === "number") {
    progress = download.percent;
  }
  const status = download?.download_state || download?.status || download?.state || "";
  const size = download?.size ? formatBytes(download.size) : null;
  const downloaded = download?.downloaded || null;
  // Consider both completed and cached as completed states
  const isCompleted =
    status.toLowerCase() === "completed" || status.toLowerCase() === "cached";

  // Format the file size for display
  function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  }

  // State for confirmation dialog when re-downloading
  const [confirmRedownload, setConfirmRedownload] = useState(false);

  // Check if this download has been downloaded to PC
  const isDownloadedToPc =
    download?.id &&
    window.localStorage.getItem("torboxDownloadedToPc") &&
    JSON.parse(window.localStorage.getItem("torboxDownloadedToPc"))[download.id];

  // Handle download to PC with confirmation for re-downloading
  const handleDownloadClick = () => {
    if (isDownloadedToPc) {
      setConfirmRedownload(true);
    } else if (onDownloadToPC) {
      onDownloadToPC();
    }
  };

  return (
    <Card className="group overflow-hidden border border-border/40 bg-gradient-to-br from-background to-muted/10 shadow-sm transition-all hover:border-primary/30 hover:shadow-md">
      <CardContent className="p-5">
        <div className="mb-3 flex items-start justify-between">
          <div className="flex-1">
            {status?.toLowerCase() === "downloading" && (
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 text-secondary">
                <Loader className="h-3.5 w-3.5 animate-spin" />
                <span className="text-xs font-medium">{t("torbox.downloading")}</span>
              </div>
            )}
            {isCompleted && !isDownloadedToPc && (
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 text-secondary">
                <CircleCheck className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">
                  {t("torbox.ready_to_download")}
                </span>
              </div>
            )}
            {isDownloadedToPc && (
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-2.5 py-1 text-green-600 dark:text-green-400">
                <CircleCheck className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">{t("torbox.downloaded")}</span>
              </div>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-70 transition-opacity group-hover:opacity-100"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {!isCompleted && onStop && (
                <DropdownMenuItem onClick={onStop}>
                  <StopCircle className="mr-2 h-4 w-4" />
                  {t("torbox.stop_download")}
                </DropdownMenuItem>
              )}
              {isCompleted &&
                (isCompletedTab && onRedownloadConfirm ? (
                  <DropdownMenuItem onClick={() => onRedownloadConfirm(download)}>
                    <Download className="mr-2 h-4 w-4" />
                    {t("torbox.redownload")}
                  </DropdownMenuItem>
                ) : (
                  onDownloadToPC && (
                    <DropdownMenuItem onClick={onDownloadToPC}>
                      <Download className="mr-2 h-4 w-4" />
                      {t("torbox.download_to_pc")}
                    </DropdownMenuItem>
                  )
                ))}
              {onDelete && (
                <DropdownMenuItem
                  onClick={onDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash className="mr-2 h-4 w-4" />
                  {t("common.delete")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <h3 className="mb-3 line-clamp-2 text-base font-semibold leading-snug">{name}</h3>

        <div className="space-y-2">
          <Progress
            value={progress}
            className="h-2.5"
            color={isCompleted ? "bg-success" : undefined}
          />

          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {downloaded && size ? `${downloaded} / ${size}` : size ? `${size}` : ""}
            </span>
            <span className="font-medium text-foreground">
              {progress ? `${progress}%` : null}
            </span>
          </div>
        </div>

        {isCompleted && onDownloadToPC && (
          <Button
            className="mt-4 w-full gap-2 font-medium text-secondary"
            size="sm"
            onClick={onDownloadToPC}
          >
            <Download className="h-4 w-4" />
            {t("torbox.download_to_pc")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default TorboxDownloads;
