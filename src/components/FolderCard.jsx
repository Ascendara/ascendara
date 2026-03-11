import React from "react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Folder, FolderOpen, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import {
  getFolderByName,
  deleteFolder,
  loadFolders,
  saveFolders,
} from "@/lib/folderManager";
import { useLanguage } from "@/context/LanguageContext";
import { useNavigate } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

const FolderCard = ({ name, onClick, className, refreshKey }) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [isHovered, setIsHovered] = useState(false);
  const [folderGames, setFolderGames] = useState([]);
  const [gameThumbnails, setGameThumbnails] = useState([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    // Get folder contents
    const folder = getFolderByName(name);
    if (folder && folder.items) {
      setFolderGames(folder.items);

      // Load thumbnails for up to 6 games in the folder
      const thumbnails = [];
      for (let i = 0; i < Math.min(folder.items.length, 6); i++) {
        const game = folder.items[i];
        const gameId = game.game || game.name;
        const localStorageKey = `game-cover-${gameId}`;
        const cachedImage = localStorage.getItem(localStorageKey);
        if (cachedImage) {
          thumbnails.push({
            id: gameId,
            image: cachedImage,
            name: gameId,
          });
        }
      }
      setGameThumbnails(thumbnails);
    }
  }, [name, refreshKey]);

  const handleFolderClick = e => {
    e.stopPropagation();
    // If an onClick handler was provided, use it
    if (onClick) {
      onClick();
    } else {
      // Otherwise navigate to the folder view page
      navigate(`/folderview/${encodeURIComponent(name)}`);
    }
  };

  return (
    <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
      <Card
        className={cn(
          "group relative overflow-hidden rounded-xl border border-border bg-card shadow-lg transition-all duration-200",
          "hover:-translate-y-1 hover:shadow-xl",
          "cursor-pointer",
          className
        )}
        onClick={handleFolderClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <CardContent className="flex-1 p-0">
          <div className="relative aspect-[6/5] overflow-hidden border-b border-border bg-gradient-to-b from-secondary/10 to-secondary/20">
            {/* Folder icon and name */}
            <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/30 to-transparent p-3">
              <div className="flex items-center gap-2">
                {isHovered ? (
                  <FolderOpen className="h-5 w-5 text-primary transition-transform duration-300" />
                ) : (
                  <Folder className="h-5 w-5 text-primary transition-transform duration-300" />
                )}
                <h3 className="text-base font-semibold text-foreground">{name}</h3>
              </div>
              <div className="flex items-center">
                <span
                  className={cn(
                    "rounded-full bg-secondary/50 px-2 py-0.5 text-xs text-foreground transition-all duration-300",
                    isHovered ? "mr-2" : "mr-0"
                  )}
                >
                  {folderGames.length}{" "}
                  {folderGames.length === 1
                    ? t("library.gamesInFolder")
                    : t("library.gamesInFolder")}
                </span>
                {/* Remove folder button with fade transition */}
                <button
                  type="button"
                  className={cn(
                    "hover:bg-destructive/20 rounded p-1 transition-all duration-300",
                    isHovered
                      ? "ml-0 opacity-100"
                      : "pointer-events-none ml-[-30px] opacity-0"
                  )}
                  title={t("library.removeFolder")}
                  onClick={e => {
                    e.stopPropagation();
                    setShowDeleteDialog(true);
                  }}
                >
                  <Trash2 className="h-5 w-5 text-primary" />
                </button>
              </div>
            </div>

            {/* Game thumbnails grid */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="grid h-full w-full grid-cols-3 grid-rows-2 gap-1 p-3 pt-14">
                {gameThumbnails.map((game, index) => (
                  <div
                    key={game.id}
                    className="aspect-[4/3] overflow-hidden rounded-md border border-border shadow-sm"
                    style={{ transform: `rotate(${index % 2 === 0 ? "-" : ""}1deg)` }}
                  >
                    <img
                      src={game.image}
                      alt={game.name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ))}

                {/* Empty placeholder thumbnails if less than 6 games */}
                {gameThumbnails.length < 6 &&
                  Array(6 - gameThumbnails.length)
                    .fill(0)
                    .map((_, index) => (
                      <div
                        key={`empty-${index}`}
                        className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md border border-border bg-secondary/10"
                        style={{
                          transform: `rotate(${(index + gameThumbnails.length) % 2 === 0 ? "-" : ""}1deg)`,
                        }}
                      >
                        <div className="p-1 text-center text-xs text-muted-foreground">
                          {t("library.empty")}
                        </div>
                      </div>
                    ))}
              </div>
            </div>

            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10"></div>
          </div>
        </CardContent>
        <CardFooter className="flex items-center justify-between p-5">
          <div className="text-sm text-muted-foreground">
            {folderGames.length === 0
              ? t("library.dragGamesHere")
              : t("library.clickToOpenFolder")}
          </div>
          <div
            className={cn(
              "text-xs font-medium text-primary transition-opacity duration-300",
              isHovered ? "opacity-100" : "pointer-events-none opacity-0"
            )}
          >
            {t("library.openFolder")}
          </div>
        </CardFooter>
      </Card>
      {/* Remove Folder Alert Dialog */}
      <AlertDialogContent className="border-border bg-background">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg font-semibold text-foreground">
            {t("library.confirmRemoveFolderTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            {t("library.confirmRemoveFolderDesc")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            className="text-foreground"
            onClick={e => {
              e.stopPropagation();
              setShowDeleteDialog(false);
            }}
          >
            {t("common.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            className="text-secondary"
            onClick={e => {
              e.stopPropagation();
              // Move games back to main library
              const folders = loadFolders();
              const folder = folders.find(f => f.game === name);
              let updatedGames = [];
              if (folder && folder.items && folder.items.length > 0) {
                // Add all games back to main list
                const mainGames = JSON.parse(localStorage.getItem("games") || "[]");
                updatedGames = [...mainGames, ...folder.items];
                localStorage.setItem("games", JSON.stringify(updatedGames));
              }
              // Remove folder-specific favorites
              const favoritesObj = JSON.parse(localStorage.getItem("favorites") || "{}");
              if (favoritesObj[name]) {
                delete favoritesObj[name];
                localStorage.setItem("favorites", JSON.stringify(favoritesObj));
              }
              // Delete folder
              deleteFolder(name);
              setShowDeleteDialog(false);
              // Optionally trigger a refresh (emit event or callback)
              window.dispatchEvent(new CustomEvent("ascendara:folders-updated"));
            }}
          >
            {t("library.removeFolder")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default FolderCard;
