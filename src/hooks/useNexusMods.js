import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useLanguage } from "@/context/LanguageContext";
import nexusModsService from "@/services/integrations/nexusModsService";

const PER_PAGE = 12;

/**
 * Browse a game's Nexus mods: paging, search, sort and the picked mod's files.
 * @param {object|null} nexusGameData - The game on Nexus, from checkModSupport
 * @param {boolean} enabled - Load the first page once the game is known
 * @param {{gameName: string, isCustom?: boolean}} [game] - Where downloaded mods are saved
 */
export function useNexusMods(nexusGameData, enabled = true, game = null) {
  const { t } = useLanguage();
  const [mods, setMods] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("endorsements");
  const [selectedMod, setSelectedMod] = useState(null);
  const [modFiles, setModFiles] = useState([]);
  const [modFilesLoading, setModFilesLoading] = useState(false);
  const [showModDetails, setShowModDetails] = useState(false);
  // Only the latest request may fill the list
  const requestRef = useRef(0);

  const domainName = nexusGameData?.domainName;

  const fetchMods = async (nextPage = 0, search = "", sort = "endorsements") => {
    if (!domainName) return;
    const request = ++requestRef.current;
    setLoading(true);
    try {
      const result = await nexusModsService.getMods(domainName, {
        count: PER_PAGE,
        offset: nextPage * PER_PAGE,
        sortBy: sort,
        searchQuery: search || null,
      });
      if (request !== requestRef.current) return;
      setMods(result.mods);
      setTotalCount(result.totalCount);
    } catch (error) {
      console.error("Error fetching mods:", error);
    }
    if (request === requestRef.current) setLoading(false);
  };

  // The game the list belongs to; enabling again keeps what was browsed
  const loadedForRef = useRef(null);

  useEffect(() => {
    if (loadedForRef.current === domainName) return;
    requestRef.current++;
    loadedForRef.current = null;
    setMods([]);
    setTotalCount(0);
    setPage(0);
    setSearchQuery("");
    setSortBy("endorsements");
    setLoading(false);
  }, [domainName]);

  useEffect(() => {
    if (!enabled || !domainName || loadedForRef.current === domainName) return;
    loadedForRef.current = domainName;
    fetchMods(0, "", "endorsements");
  }, [domainName, enabled]);

  const selectMod = async mod => {
    if (!nexusGameData?.id || !mod?.modId) return;
    setModFilesLoading(true);
    setSelectedMod(mod);
    setModFiles([]);
    setShowModDetails(true);
    try {
      setModFiles(await nexusModsService.getModFiles(nexusGameData.id, mod.modId));
    } catch (error) {
      console.error("Error fetching mod files:", error);
      setModFiles([]);
    }
    setModFilesLoading(false);
  };

  // Nexus only hands files to a signed-in website session, so the file is
  // picked on the real page in an Ascendara window, which saves it next to
  // the game instead of the browser's Downloads folder.
  const downloadMod = async (mod, fileId = null) => {
    const url = nexusModsService.getModDownloadUrl(domainName, mod.modId, fileId);
    if (!window.electron?.downloadNexusMod) {
      window.electron.openURL(url);
      return;
    }
    const toastId = toast.loading(t("gameScreen.nexusDownload.waiting"), {
      description: t("gameScreen.nexusDownload.waitingDescription"),
    });
    const removeProgress = window.electron.onNexusModDownloadProgress(
      ({ fileName, received, total }) => {
        toast.loading(t("gameScreen.nexusDownload.downloading", { file: fileName }), {
          id: toastId,
          description:
            total > 0
              ? `${Math.floor((received / total) * 100)}%`
              : nexusModsService.formatFileSize(received),
        });
      }
    );
    try {
      const result = await window.electron.downloadNexusMod({
        url,
        gameName: game?.gameName,
        isCustom: !!game?.isCustom,
      });
      if (result?.status === "completed") {
        toast.success(t("gameScreen.nexusDownload.saved", { file: result.fileName }), {
          id: toastId,
          description: result.directory,
          action: {
            label: t("gameScreen.nexusDownload.openFolder"),
            onClick: () => window.electron.openFolderPath(result.directory),
          },
        });
      } else if (result?.status === "failed") {
        toast.error(t("gameScreen.nexusDownload.failed"), { id: toastId });
      } else {
        toast.dismiss(toastId);
      }
    } catch (error) {
      console.error("Error downloading Nexus mod:", error);
      toast.error(t("gameScreen.nexusDownload.failed"), { id: toastId });
    } finally {
      removeProgress?.();
    }
  };

  const viewMod = mod => {
    window.electron.openURL(nexusModsService.getModDownloadUrl(domainName, mod.modId));
  };

  return {
    // Props for ModsSection
    sectionProps: {
      nexusGameData,
      loading,
      mods,
      popularMods: [],
      totalCount,
      page,
      perPage: PER_PAGE,
      searchQuery,
      onSearchQueryChange: setSearchQuery,
      onSearch: e => {
        e.preventDefault();
        setPage(0);
        fetchMods(0, searchQuery, sortBy);
      },
      sortBy,
      onSortChange: sort => {
        setSortBy(sort);
        setPage(0);
        fetchMods(0, searchQuery, sort);
      },
      onPageChange: nextPage => {
        setPage(nextPage);
        fetchMods(nextPage, searchQuery, sortBy);
      },
      onSelectMod: selectMod,
      onBrowse: () => fetchMods(0, "", "endorsements"),
    },
    // Props for ModDetailsDialog
    detailsProps: {
      open: showModDetails,
      onOpenChange: setShowModDetails,
      mod: selectedMod,
      files: modFiles,
      loading: modFilesLoading,
      onDownload: downloadMod,
      onView: viewMod,
    },
  };
}
