import { useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Game Screenshots Component
 * Displays a carousel of game screenshots
 */
const GameScreenshots = ({ screenshots = [], className }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  // Handle navigation
  const goToNext = () => {
    setCurrentIndex(prevIndex =>
      prevIndex === screenshots.length - 1 ? 0 : prevIndex + 1
    );
  };

  const goToPrevious = () => {
    setCurrentIndex(prevIndex =>
      prevIndex === 0 ? screenshots.length - 1 : prevIndex - 1
    );
  };

  const toggleFullscreen = () => {
    setFullscreen(!fullscreen);
  };

  // If no screenshots, return null
  if (!screenshots || screenshots.length === 0) {
    return null;
  }

  return (
    <div className={cn("group relative", className)}>
      {/* Fullscreen overlay */}
      {fullscreen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={toggleFullscreen}
        >
          <div className="relative flex h-full w-full items-center justify-center">
            <img
              src={
                screenshots[currentIndex].formatted_url || screenshots[currentIndex].url
              }
              alt={`Screenshot ${currentIndex + 1}`}
              className="max-h-screen max-w-full object-contain"
            />

            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 top-4 bg-black/50 text-white hover:bg-black/70"
              onClick={toggleFullscreen}
            >
              <Maximize2 className="h-5 w-5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 text-white hover:bg-black/70"
              onClick={e => {
                e.stopPropagation();
                goToPrevious();
              }}
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 text-white hover:bg-black/70"
              onClick={e => {
                e.stopPropagation();
                goToNext();
              }}
            >
              <ChevronRight className="h-6 w-6" />
            </Button>

            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1.5">
              {screenshots.map((_, index) => (
                <button
                  key={index}
                  className={cn(
                    "h-2 w-2 rounded-full transition-all",
                    index === currentIndex ? "bg-white" : "bg-white/50"
                  )}
                  onClick={e => {
                    e.stopPropagation();
                    setCurrentIndex(index);
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main carousel */}
      <div className="relative overflow-hidden rounded-lg">
        <div className="relative aspect-video bg-black/10">
          <img
            src={screenshots[currentIndex].formatted_url || screenshots[currentIndex].url}
            alt={`Screenshot ${currentIndex + 1}`}
            className="h-full w-full object-cover"
          />

          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2 bg-black/50 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100"
            onClick={toggleFullscreen}
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>

        {screenshots.length > 1 && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100"
              onClick={goToPrevious}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100"
              onClick={goToNext}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </>
        )}
      </div>

      {/* Thumbnail navigation */}
      {screenshots.length > 1 && (
        <div className="scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent mt-2 flex gap-2 overflow-x-auto pb-1">
          {screenshots.map((screenshot, index) => (
            <button
              key={index}
              className={cn(
                "h-12 w-20 flex-shrink-0 overflow-hidden rounded transition-all",
                index === currentIndex
                  ? "ring-2 ring-primary"
                  : "opacity-70 hover:opacity-100"
              )}
              onClick={() => setCurrentIndex(index)}
            >
              <img
                src={screenshot.formatted_url || screenshot.url}
                alt={`Thumbnail ${index + 1}`}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default GameScreenshots;
