import { useState, useEffect } from "react";
import { Card, CardContent } from "./ui/card";
import { cn } from "@/lib/utils";
import { sanitizeText } from "@/lib/utils";
import { Play } from "lucide-react";
import { Button } from "./ui/button";
import { AspectRatio } from "./ui/aspect-ratio";
import { Skeleton } from "./ui/skeleton";

const RecentGameCard = ({ game, onPlay }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [imageData, setImageData] = useState(null);
  const [loading, setLoading] = useState(true);
  const sanitizedGameName = sanitizeText(game.game || game.name);

  // Load game image via IPC (no localStorage caching - data URLs blow out
  // the per-origin localStorage quota; IPC reads from disk are fast)
  useEffect(() => {
    let isMounted = true;
    const gameId = game.game || game.name;

    const loadGameImage = async () => {
      try {
        const imageBase64 = await window.electron.getGameImage(gameId);
        if (imageBase64 && isMounted) {
          setImageData(`data:image/jpeg;base64,${imageBase64}`);
        }
      } catch (error) {
        console.error("Error loading game image:", error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    // Listen for game cover update events
    const handleCoverUpdate = event => {
      const { gameName, dataUrl } = event.detail;
      if (gameName === gameId && dataUrl && isMounted) {
        console.log(`[RecentGameCard] Received cover update for ${gameName}`);
        setImageData(dataUrl);
      }
    };

    // Add event listener for cover updates
    window.addEventListener("game-cover-updated", handleCoverUpdate);

    // Initial load
    loadGameImage();

    return () => {
      isMounted = false;
      // Clean up event listener
      window.removeEventListener("game-cover-updated", handleCoverUpdate);
    };
  }, [game]);

  // Check if game is running
  useEffect(() => {
    const checkGameStatus = setInterval(async () => {
      const running = await window.electron.isGameRunning(game.game || game.name);
      setIsRunning(running);
    }, 1000);

    return () => clearInterval(checkGameStatus);
  }, [game]);

  const handlePlay = e => {
    e.stopPropagation();
    onPlay(game);
  };

  const getTimeSinceLastPlayed = () => {
    const lastPlayed = new Date(game.lastPlayed);
    const now = new Date();
    const diffInHours = Math.floor((now - lastPlayed) / (1000 * 60 * 60));

    if (diffInHours < 1) {
      return "Just now";
    } else if (diffInHours < 24) {
      return `${diffInHours}h ago`;
    } else {
      const diffInDays = Math.floor(diffInHours / 24);
      if (diffInDays === 1) {
        return "Yesterday";
      } else {
        return `${diffInDays}d ago`;
      }
    }
  };

  return (
    <Card
      className={cn(
        "group relative overflow-hidden transition-all duration-300",
        "cursor-pointer border-none hover:shadow-lg",
        isRunning && "ring-2 ring-primary"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <CardContent className="p-0">
        <AspectRatio ratio={16 / 9}>
          <div className="relative h-full w-full">
            {loading && <Skeleton className="absolute inset-0 h-full w-full" />}
            {!loading && imageData && (
              <img
                src={imageData}
                alt={sanitizedGameName}
                className={cn(
                  "h-full w-full object-cover transition-transform duration-300",
                  isHovered && "scale-110"
                )}
              />
            )}
            <div
              className={cn(
                "absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent",
                "transition-opacity duration-300",
                isHovered ? "opacity-100" : "opacity-80"
              )}
            >
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h3
                      className={cn(
                        "line-clamp-1 text-lg font-semibold text-white",
                        "transition-transform duration-300",
                        isHovered ? "translate-x-2" : "translate-x-0"
                      )}
                    >
                      {sanitizedGameName}
                    </h3>
                    <p
                      className={cn(
                        "text-sm text-white/80",
                        "transition-transform duration-300",
                        isHovered ? "translate-x-2" : "translate-x-0"
                      )}
                    >
                      {getTimeSinceLastPlayed()}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className={cn(
                      "text-white hover:bg-white/20 hover:text-primary",
                      "transition-transform duration-300",
                      isHovered ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0"
                    )}
                    onClick={handlePlay}
                  >
                    <Play className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </AspectRatio>
      </CardContent>
    </Card>
  );
};

export default RecentGameCard;
