import { useEffect, useState } from "react";
import { useSearch } from "@/context/SearchContext";

export const useLibrarySearch = () => {
  const { registerSearchable, unregisterSearchable } = useSearch();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadLibraryGames = async () => {
      setIsLoading(true);
      try {
        const installedGames = await window.electron.getGames();
        const customGames = await window.electron.getCustomGames();

        if (!isMounted) return;

        const safeInstalledGames = Array.isArray(installedGames) ? installedGames : [];
        const safeCustomGames = Array.isArray(customGames) ? customGames : [];

        const filteredInstalledGames = safeInstalledGames.filter(
          game =>
            !game.downloadingData?.verifying &&
            !game.downloadingData?.downloading &&
            !game.downloadingData?.extracting &&
            !game.downloadingData?.updating &&
            !game.downloadingData?.stopped &&
            (!game.downloadingData?.verifyError ||
              game.downloadingData.verifyError.length === 0)
        );

        const allGames = [
          ...filteredInstalledGames.map(game => ({
            ...game,
            isCustom: false,
          })),
          ...safeCustomGames.map(game => ({
            name: game.game,
            game: game.game,
            version: game.version,
            online: game.online,
            dlc: game.dlc,
            isVr: game.isVr,
            executable: game.executable,
            playTime: game.playTime,
            isCustom: true,
            custom: true,
          })),
        ];

        const searchableGames = allGames.map(game => ({
          id: game.game,
          type: "library",
          label: game.game,
          description: game.isCustom ? "Custom Game" : "Installed Game",
          keywords: [
            game.game,
            game.isCustom ? "custom" : "installed",
            ...(game.tags || []),
          ],
          badge: game.isCustom ? "Custom" : "Installed",
          onSelect: navigate => {
            navigate("/gamescreen", {
              state: { gameData: game },
            });
          },
        }));

        if (isMounted) {
          registerSearchable("library", searchableGames);
        }
      } catch (error) {
        console.error("Error loading library games for search:", error);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadLibraryGames();

    return () => {
      isMounted = false;
      unregisterSearchable("library");
    };
  }, [registerSearchable, unregisterSearchable]);

  return { isLoading };
};
