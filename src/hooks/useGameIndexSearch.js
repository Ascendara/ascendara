import { useEffect, useState } from "react";
import { useSearch } from "@/context/SearchContext";
import gameService from "@/services/gameService";

export const useGameIndexSearch = () => {
  const { registerSearchable, unregisterSearchable } = useSearch();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadGameIndex = async () => {
      setIsLoading(true);
      try {
        const gamesData = await gameService.getAllGames();

        if (!isMounted) return;

        const games = gamesData?.games || [];

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

    return () => {
      isMounted = false;
      unregisterSearchable("index");
    };
  }, [registerSearchable, unregisterSearchable]);

  return { isLoading };
};
