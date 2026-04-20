import React, { memo, useState, useCallback, useRef, useEffect } from "react";
import { Card, CardContent } from "./ui/card";
import { AspectRatio } from "./ui/aspect-ratio";
import { Skeleton } from "./ui/skeleton";
import { useNavigate } from "react-router-dom";
import { sanitizeText } from "@/lib/utils";
import { useLanguage } from "@/context/LanguageContext";
import { useImageLoader } from "@/hooks/useImageLoader";
import { Badge } from "./ui/badge";
import { Globe, Gift, ImageOff } from "lucide-react";

const HomeGameCard = memo(({ game, small }) => {
  const navigate = useNavigate();
  const [isHovered, setIsHovered] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef(null);
  const { cachedImage, loading, error } = useImageLoader(game?.imgID, {
    quality: isVisible ? "high" : "low",
    priority: isVisible ? "high" : "low",
    enabled: true,
    fallbackGameName: !game?.imgID ? game?.game : null,
    fallbackSlot: "card",
  });
  const { t } = useLanguage();

  useEffect(() => {
    if (!cardRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      {
        rootMargin: "50px 0px",
        threshold: 0.1,
      }
    );

    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, []);

  const handleClick = useCallback(() => {
    const container = document.querySelector(".page-container");
    if (container) {
      container.classList.add("fade-out");
    }

    setTimeout(() => {
      navigate("/download", {
        state: {
          gameData: {
            ...game,
            download_links: game.download_links || {},
          },
        },
      });
    }, 300);
  }, [navigate, game]);

  if (!game) return null;

  const isDLC = game.dlc;
  const isOnline = game.online;

  return (
    <Card
      ref={cardRef}
      className="group relative cursor-pointer overflow-hidden rounded-xl border-none transition-all duration-300 animate-in fade-in-50 hover:shadow-xl"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
    >
      <CardContent className="p-0">
        <AspectRatio ratio={16 / 9}>
          {loading ? (
            <Skeleton className="h-full w-full bg-muted" />
          ) : (
            <div className="relative h-full w-full">
              {cachedImage ? (
                <img
                  src={cachedImage}
                  alt={sanitizeText(game.title || game.game)}
                  className={`h-full w-full object-cover transition-transform duration-300 ${
                    isHovered ? "scale-110" : "scale-100"
                  }`}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-muted">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <ImageOff className="h-8 w-8" />
                    <span className="text-sm">Unable to Load</span>
                  </div>
                </div>
              )}
              <div
                className={`absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent transition-opacity duration-300 ${
                  isHovered ? "opacity-100" : "opacity-80"
                } ${small ? "!opacity-0" : ""}`}
              >
                {!small && (
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      {isDLC && (
                        <Badge
                          variant="outline"
                          className="border-primary/50 bg-black/50 text-white hover:bg-black/70"
                        >
                          <Gift className="mr-1 h-3 w-3 text-primary" />
                          {t("download.allDlc")}
                        </Badge>
                      )}
                      {isOnline && (
                        <Badge
                          variant="outline"
                          className="border-primary/50 bg-black/50 text-white hover:bg-black/70"
                        >
                          <Globe className="mr-1 h-3 w-3 text-primary" />
                          {t("download.online")}
                        </Badge>
                      )}
                    </div>
                    <h3
                      className={`line-clamp-2 text-lg font-semibold text-white transition-transform duration-300 ${
                        isHovered ? "translate-x-2" : "translate-x-0"
                      }`}
                    >
                      {sanitizeText(game.title || game.game)}
                    </h3>
                  </div>
                )}
              </div>
            </div>
          )}
        </AspectRatio>
      </CardContent>
    </Card>
  );
});

HomeGameCard.displayName = "HomeGameCard";

export default HomeGameCard;
