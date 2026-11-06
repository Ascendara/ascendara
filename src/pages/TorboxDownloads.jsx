import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
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
import { useLanguage } from "@/context/LanguageContext";
import { useSettings } from "@/context/SettingsContext";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { AlertCircle, Download, StopCircle, Trash } from "lucide-react";
import torboxProvider from "@/services/downloads/debrid/torboxProvider";
import {
  getDownloadKey,
  getStoredDownloadData,
  isSentToPc,
} from "@/services/downloads/torboxRecords";
import {
  DebridAccountBar,
  DebridEmpty,
  DebridItem,
  DebridList,
  DebridLoading,
  DebridTabs,
  formatBytes as formatSize,
} from "@/components/debrid/DebridDownloadParts";
import HandoffCountdown from "@/components/debrid/HandoffCountdown";
import "@/lib/utils";
import {
  getUserInfo,
  getAllDownloads,
  controlDownload,
  getApiKey,
  getDirectDownloadLink,
} from "@/services/downloads/torboxService";

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

  const [tab, setTab] = useState("ready");
  const [refreshing, setRefreshing] = useState(false);

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

      await controlDownload(apiKey, download, "delete");

      // Update the downloads list after successful deletion
      fetchTorboxDownloads();

      toast.success(
        t("torbox.download_deleted_desc", {
          name: download?.name || download?.files?.[0]?.short_name || t("common.file"),
        })
      );
    } catch (error) {
      console.error("[TorboxDownloads] Error deleting download:", error);
      toast.error(t("torbox.error_deleting_download"), { description: error?.message });
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
      // Get the API key early - needed for both stored and fallback paths
      const apiKey = getApiKey(settings);
      if (!apiKey) {
        toast.error(t("torbox.error_no_api_key"));
        clearDownloadLock();
        return;
      }

      // Try to get stored download data from local storage
      const torboxData = manageStoredGameNames();
      const storedData = getStoredDownloadData(torboxData, download);
      const hasStoredGameData = storedData && storedData.gameData;

      // Always request a fresh direct download link from TorBox.
      // Relying on download.files[0].url breaks for zip downloads and for any
      // download that was added to TorBox outside of Ascendara.
      toast.info(
        t("torbox.processing_download", {
          name: hasStoredGameData
            ? storedData.gameData.game
            : download.name || t("common.file"),
        })
      );

      const downloadUrlResponse = await getDirectDownloadLink(
        apiKey,
        download.id,
        download._torboxType
      );

      if (!downloadUrlResponse) {
        throw new Error("Failed to get direct download URL");
      }

      console.log(
        "Download URL response structure:",
        JSON.stringify(downloadUrlResponse, null, 2)
      );

      let directUrl = null;

      if (typeof downloadUrlResponse === "string") {
        directUrl = downloadUrlResponse;
      } else if (downloadUrlResponse && typeof downloadUrlResponse === "object") {
        directUrl =
          downloadUrlResponse.download_url ||
          downloadUrlResponse.url ||
          (typeof downloadUrlResponse.data === "string"
            ? downloadUrlResponse.data
            : null) ||
          downloadUrlResponse.data?.download_url ||
          downloadUrlResponse.data?.url;
      }

      if (!directUrl || typeof directUrl !== "string") {
        console.error("Invalid download URL format:", downloadUrlResponse);
        throw new Error("Failed to extract download URL from response");
      }

      if (!directUrl.startsWith("http")) {
        directUrl = `https://${directUrl.replace(/^(?:https?:\/\/)?/, "")}`;
      }

      console.log("Extracted direct URL:", directUrl);
      toast.success(t("torbox.download_ready"));

      if (hasStoredGameData) {
        const { gameData } = storedData;
        const sanitizedGameName = gameData.game.replace(/[<>:"/\\|?*]/g, "");

        await window.electron.downloadFile(
          directUrl,
          sanitizedGameName,
          gameData.online || false,
          gameData.dlc || false,
          gameData.vr || false,
          false,
          gameData.version || "",
          gameData.imgID || null,
          gameData.size || "",
          0,
          gameData.gameID || ""
        );

        toast.success(t("torbox.download_started", { name: gameData.game }));
      } else {
        const fileName =
          storedData?.name ||
          download.name ||
          download.files?.[0]?.short_name ||
          download.files?.[0]?.name ||
          t("common.file");
        const sanitizedName = fileName.replace(/[<>:"/\\|?*]/g, "");

        await window.electron.downloadFile(
          directUrl,
          sanitizedName,
          false,
          false,
          false,
          false,
          "",
          storedData?.imgUrl || null,
          formatSize(download.size) || "",
          0,
          ""
        );

        toast.success(t("torbox.download_started", { name: fileName }));
      }

      // Mark this download as downloaded to PC
      const updatedDownloadedToPc = {
        ...downloadedToPc,
        [getDownloadKey(download)]: {
          timestamp: Date.now(),
          name: hasStoredGameData
            ? storedData.gameData.game
            : download.name || t("common.file"),
        },
      };

      setDownloadedToPc(updatedDownloadedToPc);
      localStorage.setItem("torboxDownloadedToPc", JSON.stringify(updatedDownloadedToPc));
    } catch (error) {
      console.error("[TorboxDownloads] Error downloading to PC:", error);
      toast.error(t("torbox.error_downloading_to_pc"));
      clearDownloadLock();
    }
  };

  const storedDownloads = manageStoredGameNames();
  const displayName = download => {
    const entry =
      getStoredDownloadData(storedDownloads, download) ||
      download.files?.map(file => storedDownloads[file.url]).find(Boolean);
    return (
      entry?.name ||
      entry?.gameData?.game ||
      download.name ||
      download.files?.[0]?.short_name ||
      t("common.unknown")
    );
  };
  const describe = download => {
    const state = (download.download_state || download.status || "").toLowerCase();
    const sent = isSentToPc(downloadedToPc, storedDownloads, download);
    const ready = state === "completed" || state === "cached";
    if (sent && ready)
      return { group: "sent", tone: "done", status: t("debrid.statusSent"), ready };
    if (ready)
      return { group: "ready", tone: "ready", status: t("debrid.statusReady"), ready };
    if (state === "error" || state.startsWith("failed"))
      return { group: "cloud", tone: "error", status: t("debrid.statusFailed"), ready };
    if (/download|upload|metadl|checking/.test(state))
      return {
        group: "cloud",
        tone: "active",
        status: t("debrid.statusDownloading"),
        ready,
      };
    return {
      group: "cloud",
      tone: "waiting",
      status: state
        ? state.charAt(0).toUpperCase() + state.slice(1)
        : t("debrid.statusQueued"),
      ready,
    };
  };
  const progressOf = download =>
    typeof download.progress === "number"
      ? download.progress > 1
        ? download.progress
        : download.progress * 100
      : typeof download.percent === "number"
        ? download.percent
        : 0;
  const described = torboxDownloads.map(download => ({
    download,
    ...describe(download),
  }));
  const counts = { ready: 0, cloud: 0, sent: 0 };
  for (const entry of described) counts[entry.group]++;
  const visible = described.filter(entry => entry.group === tab);
  const planName =
    [
      t("torbox.plan_free"),
      t("torbox.plan_essential"),
      t("torbox.plan_pro"),
      t("torbox.plan_standard"),
    ][userInfo?.plan] || null;
  const empty = {
    ready: ["debrid.emptyReady", "debrid.emptyReadyDesc"],
    cloud: ["debrid.emptyCloud", "debrid.emptyCloudDesc"],
    sent: ["debrid.emptySent", "debrid.emptySentDesc"],
  }[tab];

  return (
    <>
      <div className="space-y-6">
        <DebridAccountBar
          provider={torboxProvider}
          account={userInfo?.email}
          badge={planName}
          detail={
            userInfo?.premium_expires_at && userInfo.plan > 0
              ? t("debrid.expires", {
                  date: new Date(userInfo.premium_expires_at).toLocaleDateString(),
                })
              : null
          }
          stats={
            userInfo
              ? [
                  [
                    t("debrid.downloads"),
                    (userInfo.total_downloaded ?? 0).toLocaleString(),
                  ],
                  [
                    t("debrid.data"),
                    formatSize(userInfo.total_bytes_downloaded) || "0 B",
                  ],
                ]
              : []
          }
          loading={userInfoLoading && !userInfo}
          error={userInfoError}
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            try {
              await Promise.all([fetchTorboxDownloads(), fetchUserInfo()]);
            } finally {
              setRefreshing(false);
            }
          }}
        />

        <DebridTabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "ready", label: t("debrid.tabReady"), count: counts.ready },
            { id: "cloud", label: t("debrid.tabCloud"), count: counts.cloud },
            { id: "sent", label: t("debrid.tabSent"), count: counts.sent },
          ]}
        />

        {isLoading ? (
          <DebridLoading label={t("debrid.loadingDownloads")} />
        ) : error ? (
          <div className="flex flex-col items-center py-16 text-center">
            <AlertCircle className="text-destructive h-8 w-8" />
            <p className="mt-3 text-sm text-muted-foreground">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={fetchTorboxDownloads}
            >
              {t("common.retry")}
            </Button>
          </div>
        ) : visible.length === 0 ? (
          <DebridEmpty title={t(empty[0])} description={t(empty[1])} />
        ) : (
          <DebridList>
            {visible.map(({ download, tone, status, ready }, idx) => {
              const size = formatSize(download.size);
              const speed =
                tone === "active" && download.download_speed
                  ? formatSize(download.download_speed)
                  : null;
              const meta = [size, speed && `${speed}/s`].filter(Boolean).join(" · ");
              return (
                <DebridItem
                  key={download.id || `torbox-${idx}`}
                  name={displayName(download)}
                  kind={t(
                    download._torboxType === "torrent"
                      ? "debrid.kindTorrent"
                      : "debrid.kindLink"
                  )}
                  status={status}
                  tone={tone}
                  progress={ready ? undefined : progressOf(download)}
                  meta={meta}
                  note={
                    download._torboxType === "torrent" && tone !== "done" ? (
                      <HandoffCountdown
                        storageKey={torboxProvider.metadataStorageKey}
                        recordKey={getDownloadKey(download)}
                      />
                    ) : null
                  }
                  action={
                    tone === "ready" ? (
                      <Button size="sm" onClick={() => handleDownloadToPC(download)}>
                        <Download className="mr-2 h-4 w-4" />
                        {t("debrid.downloadToPc")}
                      </Button>
                    ) : null
                  }
                  menu={[
                    ...(tone === "done"
                      ? [
                          {
                            label: t("debrid.downloadAgain"),
                            icon: Download,
                            onClick: () => handleRedownloadConfirm(download),
                          },
                        ]
                      : []),
                    ...(!ready && tone !== "error"
                      ? [
                          {
                            label: t("debrid.stop"),
                            icon: StopCircle,
                            onClick: () => handleStopDownload(download),
                          },
                        ]
                      : []),
                    {
                      label: t("debrid.delete"),
                      icon: Trash,
                      destructive: true,
                      onClick: () => handleDeleteDownload(download),
                    },
                  ]}
                />
              );
            })}
          </DebridList>
        )}
      </div>

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
                  await controlDownload(settings.torboxApiKey, confirmStop, "stop");

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
                  toast.error(t("torbox.error_stopping_download"), {
                    description: error?.message,
                  });
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
    </>
  );
};

export default TorboxDownloads;
