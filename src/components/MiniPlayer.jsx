import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  useAudioPlayer,
  formatTime,
  wasMiniplayerKilled,
  resetMiniplayerKilled,
} from "@/services/audioPlayerService";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  Play,
  Pause,
  Volume,
  Volume1,
  Volume2,
  VolumeX,
  X,
  Maximize2,
  Minimize2,
} from "lucide-react";



import { useState } from "react";

export default function MiniPlayer({ expanded, onToggleExpand }) {
  const { t } = useTranslation();
  const {
    currentTrack,
    isPlaying,
    progress,
    duration,
    volume,
    play,
    pause,
    seek,
    setVolume,
    cleanup,
  } = useAudioPlayer();
  const [visible, setVisible] = useState(true);

  // Hide miniplayer if killAudioAndMiniplayer is called
  useEffect(() => {
    if (wasMiniplayerKilled()) {
      setVisible(false);
      resetMiniplayerKilled();
    }
  });

  // Restore miniplayer if a new track is set
  useEffect(() => {
    if (currentTrack && !visible) {
      setVisible(true);
    }
  }, [currentTrack, visible]);

  if (!currentTrack || !visible) return null;

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 rounded-xl bg-gradient-to-br from-background to-gray-100/95 shadow-2xl backdrop-blur-lg transition-all duration-300 ${
        expanded ? "h-96 w-96" : "h-24 w-96"
      } flex flex-col overflow-hidden`}
    >
      {/* Top: Track Info & Controls */}
      <div className="flex h-24 items-center bg-background/80 px-6 py-2">
        {/* Track Info (no album art) */}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-primary">{currentTrack.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatTime(progress)} / {formatTime(duration)}
          </p>
        </div>
        {/* Controls */}
        <div className="ml-4 flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-full transition hover:bg-primary/10 active:bg-primary/20"
                  onClick={() => (isPlaying ? pause() : play())}
                >
                  {isPlaying ? (
                    <Pause className="h-5 w-5 text-primary" />
                  ) : (
                    <Play className="h-5 w-5 text-primary" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-secondary">
                {isPlaying ? t("miniPlayer.pause") : t("miniPlayer.play")}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-full transition hover:bg-muted/30 active:bg-muted/40"
                  onClick={onToggleExpand}
                >
                  {expanded ? (
                    <Minimize2 className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <Maximize2 className="h-5 w-5 text-muted-foreground" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-secondary">
                {expanded ? t("miniPlayer.collapse") : t("miniPlayer.expand")}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="hover:bg-destructive/10 active:bg-destructive/20 h-10 w-10 rounded-full transition"
                  onClick={cleanup}
                >
                  <X className="h-5 w-5 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-secondary">
                {t("miniPlayer.close")}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Expanded: Progress, Details, Volume */}
      {expanded && (
        <div className="flex flex-1 flex-col justify-between bg-gradient-to-br from-background to-muted/90 p-12">
          {/* Track Details */}
          <div className="mb-4 text-center">
            <h3 className="mb-1 truncate text-lg font-bold text-primary">
              {currentTrack.title}
            </h3>
            <span className="inline-block rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
              {t("miniPlayer.nowPlaying")}
            </span>
          </div>
          {/* Progress Bar */}
          <div className="mb-6 select-none">
            <div
              className="relative mb-1 h-2 w-full cursor-pointer overflow-hidden rounded-full bg-primary/20"
              onClick={e => {
                const rect = e.currentTarget.getBoundingClientRect();
                const clickPos = (e.clientX - rect.left) / rect.width;
                const newTime = clickPos * (duration || 100);
                seek(Math.max(0, Math.min(duration || 100, newTime)));
              }}
            >
              <div
                className="absolute h-full bg-primary transition-all"
                style={{ width: `${(progress / (duration || 100)) * 100}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-xs text-muted-foreground">
              <span className="font-medium">{formatTime(progress)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
          {/* Volume Controls */}
          <div className="flex items-center justify-center gap-4">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-full transition hover:bg-primary/10 active:bg-primary/20"
                    onClick={() => setVolume(volume === 0 ? 0.7 : 0)}
                  >
                    {volume === 0 ? (
                      <VolumeX className="h-5 w-5 text-primary" />
                    ) : volume < 0.2 ? (
                      <Volume className="h-5 w-5 text-primary" />
                    ) : volume < 0.4 ? (
                      <Volume1 className="h-5 w-5 text-primary" />
                    ) : (
                      <Volume2 className="h-5 w-5 text-primary" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-secondary">
                  {volume === 0 ? t("miniPlayer.unmute") : t("miniPlayer.mute")}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Slider
              value={[volume * 100]}
              min={0}
              max={100}
              step={1}
              onValueChange={([value]) => setVolume(value / 100)}
              className="h-2 w-40 cursor-pointer rounded-full bg-muted"
            />
          </div>
        </div>
      )}
    </div>
  );
}
