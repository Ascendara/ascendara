import { useEffect, useState } from "react";
import { useSearch } from "@/context/SearchContext";
import gameService from "@/services/games/gameService";
import { useSettings } from "@/context/SettingsContext";
import { filterMatureGames } from "@/lib/matureContent";

export const useGameIndexSearch = () => {
  const { registerSearchable, unregisterSearchable } = useSearch();
  const [isLoading, setIsLoading] = useState(false);
  const { settings } = useSettings();
  const showMature = Boolean(settings?.seeInappropriateContent);

  useEffect(() => {
    let isMounted = true;

    const loadGameIndex = async () => {
      setIsLoading(true);
      try {
        const gamesData = await gameService.getAllGames();

        if (!isMounted) return;

        // Mature games only show when the setting allows them
        const games = filterMatureGames(gamesData?.games || [], showMature);

        const searchableGames = games.map(game => ({
          id: game.gameID || game.game,
          type: "index",
          label: game.game,
          description: game.description || "Available for download",
          keywords: [
            game.game,
            ...(game.tags || []),
            game.online ? "online" : "",
            game.singlePlayer ? "singleplayer" : "",
          ].filter(Boolean),
          badge: game.online ? "Online" : null,
          onSelect: navigate => {
            navigate("/download", {
              state: {
                gameData: game,
              },
            });
          },
        }));

        if (isMounted) {
          registerSearchable("index", searchableGames);
        }
      } catch (error) {
        console.error("Error loading game index for search:", error);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadGameIndex();

    // Background syncs replace the index without remounting this hook
    const handleIndexRefreshed = () => {
      gameService.clearMemoryCache();
      loadGameIndex();
    };
    window.addEventListener("index-refreshed", handleIndexRefreshed);

    return () => {
      isMounted = false;
      window.removeEventListener("index-refreshed", handleIndexRefreshed);
      unregisterSearchable("index");
    };
  }, [registerSearchable, unregisterSearchable, showMature]);

  return { isLoading };
};
