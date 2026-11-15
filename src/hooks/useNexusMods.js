import { useEffect, useRef, useState } from "react";
import nexusModsService from "@/services/integrations/nexusModsService";

const PER_PAGE = 12;

/**
 * Browse a game's Nexus mods: paging, search, sort and the picked mod's files.
 * @param {object|null} nexusGameData - The game on Nexus, from checkModSupport
 * @param {boolean} enabled - Load the first page once the game is known
 */
export function useNexusMods(nexusGameData, enabled = true) {
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

  // Nexus needs a signed-in browser to hand out files
  const downloadMod = (mod, fileId = null) => {
    window.electron.openURL(
      nexusModsService.getModDownloadUrl(domainName, mod.modId, fileId)
    );
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
    },
  };
}
