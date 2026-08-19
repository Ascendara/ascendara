import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  Heart,
  Gamepad2,
  Gift,
  FolderUp,
  Pencil,
  Folder,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  getFolderByName,
  deleteFolder,
  removeGameFromFolder,
  updateFolderName,
  loadFolders,
} from "@/lib/folderManager";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Module-level image cache — persists across renders
const imageCache = {};

// Defined outside FolderView so it never gets recreated on parent re-render,
// which was causing the cleanup `cancelled = true` to fire before IPC resolved.
const GameCard = React.memo(({ game, favorites, onPlay, onRemove, onToggleFavorite, t }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [imageData, setImageData] = useState(() => imageCache[game.game || game.name] ?? null);
  const gameId = game.game || game.name;
  const isFavorite = favorites.includes(gameId);

  useEffect(() => {
    let cancelled = false;
    if (imageCache[gameId]) {
      setImageData(imageCache[gameId]);
      return;
    }
    (async () => {
      try {
        const base64 = await window.electron.getGameImage(gameId, "grid");
        if (!cancelled && base64) {
          const dataUrl = `data:image/jpeg;base64,${base64}`;
          imageCache[gameId] = dataUrl;
          setImageData(dataUrl);
        }
      } catch {
        // no image available
      }
    })();
    return () => { cancelled = true; };
  }, [gameId]);

  return (
    <Card
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border bg-card shadow-md transition-all duration-200",
        "hover:-translate-y-1 hover:shadow-xl hover:border-primary/30",
        "cursor-pointer"
      )}
      onClick={e => {
        if (e.target.closest("button")) return;
        onPlay(game);
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <CardContent className="p-0">
        <div className="relative aspect-[2/3] overflow-hidden">
          {imageData ? (
            <img
              src={imageData}
              alt={gameId}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted">
              <Gamepad2 className="h-12 w-12 text-muted-foreground/30" />
            </div>
          )}
          <div className={cn(
            "absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/20 to-transparent p-3 transition-opacity duration-200",
            isHovered ? "opacity-100" : "opacity-0"
          )}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {game.online && <Gamepad2 className="h-3.5 w-3.5 text-white/70" />}
                {game.dlc && <Gift className="h-3.5 w-3.5 text-white/70" />}
              </div>
              <div className="flex items-center gap-1">
                <button
                  className="rounded-full bg-black/40 p-1.5 text-white hover:bg-black/60"
                  title={t("library.removeFromFolder")}
                  onClick={e => { e.stopPropagation(); onRemove(gameId); }}
                >
                  <FolderUp className="h-3.5 w-3.5" />
                </button>
                <button
                  className="rounded-full bg-black/40 p-1.5 text-white hover:bg-black/60"
                  title={isFavorite ? t("library.removeFavorite") : t("library.addFavorite")}
                  onClick={e => { e.stopPropagation(); onToggleFavorite(gameId); }}
                >
                  <Heart className={cn("h-3.5 w-3.5", isFavorite ? "fill-primary text-primary" : "fill-none text-white")} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-1 px-3 py-2">
        <h3 className="w-full truncate text-sm font-semibold leading-tight text-foreground">
          {gameId}
        </h3>
        <p className="text-xs text-muted-foreground">
          {game.playTime !== undefined
            ? game.playTime < 60
              ? t("library.lessThanMinute")
              : game.playTime < 3600
                ? `${Math.floor(game.playTime / 60)}m`
                : `${Math.floor(game.playTime / 3600)}h`
            : t("library.neverPlayed")}
        </p>
      </CardFooter>
    </Card>
  );
});

const FolderView = () => {
  const { folderName } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [folderGames, setFolderGames] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const lastFolderNameRef = useRef(folderName);
  const lastFolderGamesRef = useRef([]);
  const isMounted = useRef(true);
  const [isLoading, setIsLoading] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renameError, setRenameError] = useState("");

  // Keep the last valid folderName and games for smooth transition
  React.useEffect(() => {
    if (folderName) lastFolderNameRef.current = folderName;
  }, [folderName]);
  React.useEffect(() => {
    if (folderGames && folderGames.length > 0) lastFolderGamesRef.current = folderGames;
  }, [folderGames]);

  // Debounced folder/favorites loading to prevent flicker
  // Track component mount/unmount
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Immediate folder loading on initial mount and folder change
  useEffect(() => {
    // Immediately load folder data when component mounts or folder changes
    // This prevents the empty state when switching folders
    if (!isMounted.current) return;

    // Set loading state
    setIsLoading(true);

    // Immediately load and cache folder data
    const folder = getFolderByName(decodeURIComponent(folderName));
    if (folder && folder.items) {
      folder.items.forEach(game => {
        const gameId = game.game || game.name;
        if (!imageCache[gameId]) {
          const localStorageKey = `game-cover-${gameId}`;
          const cachedImage = localStorage.getItem(localStorageKey);
          if (cachedImage) {
            imageCache[gameId] = cachedImage;
          }
        }
      });

      // Keep previous games visible until new ones are ready
      // Only update if the games actually changed
      const newGames = folder.items;
      const isSame =
        folderGames.length === newGames.length &&
        folderGames.every(
          (g, i) => (g.game || g.name) === (newGames[i].game || newGames[i].name)
        );
      if (!isSame) {
        setFolderGames(newGames);
      }
    }

    // Load folder-specific favorites
    const favoritesObj = JSON.parse(localStorage.getItem("folder-favorites") || "{}");
    const folderKey = decodeURIComponent(folderName);
    const newFavs = favoritesObj[folderKey] || [];
    const favsSame =
      favorites.length === newFavs.length && favorites.every((f, i) => f === newFavs[i]);
    if (!favsSame) {
      setFavorites(newFavs);
    }

    // Clear loading state
    setIsLoading(false);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderName]);

  // Sort games to show favorites at the top
  useEffect(() => {
    // Only resort if we have games and either favorites changed or folder changed
    if (folderGames.length > 0) {
      // Get the original folder data to maintain original order for non-favorites
      const folder = getFolderByName(decodeURIComponent(folderName));
      const originalItems = folder?.items || [];

      // Create a map of original positions
      const originalPositions = {};
      originalItems.forEach((game, index) => {
        const gameId = game.game || game.name;
        originalPositions[gameId] = index;
      });

      const sortedGames = [...folderGames].sort((a, b) => {
        const aId = a.game || a.name;
        const bId = b.game || b.name;
        const aIsFav = favorites.includes(aId);
        const bIsFav = favorites.includes(bId);

        // If both are favorites or both are not favorites, use original order
        if (aIsFav === bIsFav) {
          return originalPositions[aId] - originalPositions[bId];
        }

        // Otherwise, favorites go first
        return aIsFav ? -1 : 1;
      });

      setFolderGames(sortedGames);
    }
  }, [favorites, folderName]);

  // Folder-specific favorite toggle (multiple favorites per folder, pinned to top)
  const toggleFavorite = gameId => {
    setFavorites(prev => {
      const folderKey = decodeURIComponent(folderName);
      const favoritesObj = JSON.parse(localStorage.getItem("folder-favorites") || "{}");
      const prevFavs = favoritesObj[folderKey] || [];
      let newFavorites;

      if (prevFavs.includes(gameId)) {
        // Unfavorite - remove from favorites
        newFavorites = prevFavs.filter(id => id !== gameId);
      } else {
        // Favorite - add to favorites
        newFavorites = [...prevFavs, gameId];
      }

      favoritesObj[folderKey] = newFavorites;
      localStorage.setItem("folder-favorites", JSON.stringify(favoritesObj));

      // Get the original folder data to maintain original order
      const folder = getFolderByName(decodeURIComponent(folderName));
      const originalItems = folder?.items || [];

      // Create a map of original positions
      const originalPositions = {};
      originalItems.forEach((game, index) => {
        const gameId = game.game || game.name;
        originalPositions[gameId] = index;
      });

      // Reorder folderGames so favorites are first, but maintain original order otherwise
      setFolderGames(currGames => {
        return [...currGames].sort((a, b) => {
          const aId = a.game || a.name;
          const bId = b.game || b.name;
          const aIsFav = newFavorites.includes(aId);
          const bIsFav = newFavorites.includes(bId);

          // If both are favorites or both are not favorites, use original order
          if (aIsFav === bIsFav) {
            return originalPositions[aId] - originalPositions[bId];
          }

          // Otherwise, favorites go first
          return aIsFav ? -1 : 1;
        });
      });

      return newFavorites;
    });
  };

  // Handle folder deletion with cleanup of favorites
  const handleDeleteFolder = () => {
    const folderKey = decodeURIComponent(folderName);

    // First clean up favorites for this folder
    const favoritesObj = JSON.parse(localStorage.getItem("folder-favorites") || "{}");
    if (favoritesObj[folderKey]) {
      delete favoritesObj[folderKey];
      localStorage.setItem("folder-favorites", JSON.stringify(favoritesObj));
    }

    // Move games back to main library if needed
    const folders = loadFolders();
    const folder = folders.find(f => f.game === folderKey);
    if (folder && folder.items && folder.items.length > 0) {
      // Add all games back to main list
      const mainGames = JSON.parse(localStorage.getItem("games") || "[]");
      const updatedGames = [...mainGames, ...folder.items];
      localStorage.setItem("games", JSON.stringify(updatedGames));
    }

    // Then delete the folder
    deleteFolder(folderKey);
    navigate("/library");
  };

  const handlePlayGame = async game => {
    const gameId = game.game || game.name;
    console.log("Play game:", gameId);
    // Get the complete game data from the main library to ensure we have all properties
    try {
      // First try to get from installed games
      const installedGames = await window.electron.getGames();
      const installedGame = installedGames.find(g => (g.game || g.name) === gameId);

      if (installedGame) {
        // Use the installed game data but preserve any folder-specific properties
        navigate("/gamescreen", {
          state: {
            gameData: {
              ...installedGame,
              // Preserve folder-specific properties if they exist
              ...(game.folderSpecificProps
                ? { folderSpecificProps: game.folderSpecificProps }
                : {}),
            },
          },
        });
        return;
      }

      // If not found in installed games, try custom games
      const customGames = await window.electron.getCustomGames();
      const customGame = customGames.find(g => (g.game || g.name) === gameId);

      if (customGame) {
        // Use the custom game data but preserve any folder-specific properties
        navigate("/gamescreen", {
          state: {
            gameData: {
              ...customGame,
              isCustom: true,
              // Preserve folder-specific properties if they exist
              ...(game.folderSpecificProps
                ? { folderSpecificProps: game.folderSpecificProps }
                : {}),
            },
          },
        });
        return;
      }
    } catch (error) {
      console.error("Error loading complete game data:", error);
    }

    // Fallback to using the folder game data if we couldn't get the complete data
    navigate("/gamescreen", {
      state: {
        gameData: game,
      },
    });
  };

  // Handle removing a game from the folder
  const handleRemoveFromFolder = gameId => {
    const folderKey = decodeURIComponent(folderName);

    // Remove from favorites if it was favorited
    if (favorites.includes(gameId)) {
      const favoritesObj = JSON.parse(localStorage.getItem("folder-favorites") || "{}");
      if (favoritesObj[folderKey]) {
        favoritesObj[folderKey] = favoritesObj[folderKey].filter(id => id !== gameId);
        localStorage.setItem("folder-favorites", JSON.stringify(favoritesObj));
        setFavorites(prev => prev.filter(id => id !== gameId));
      }
    }

    // Remove from folder
    removeGameFromFolder(gameId, folderKey);

    // Update UI
    const updatedGames = folderGames.filter(game => (game.game || game.name) !== gameId);
    setFolderGames(updatedGames);

    // If this was the last game in the folder, navigate back to library
    if (updatedGames.length === 0) {
      // Small delay to allow the UI to update before navigating
      setTimeout(() => {
        navigate("/library");
      }, 300);
    }
  };

  const decodedName = decodeURIComponent(lastFolderNameRef.current || "");

  return (
    <div className="fixed inset-0 top-[60px] flex overflow-hidden bg-background">

      {/* ── Sidebar ── */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-border/60">
        <button
          className="flex items-center gap-3 border-b border-border/60 px-4 pb-3 pt-3 transition-colors hover:bg-accent/50"
          onClick={() => navigate("/library")}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 ring-1 ring-primary/30">
            <ChevronLeft className="h-4 w-4 text-primary" />
          </span>
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate text-sm font-semibold leading-none text-foreground">{t("common.back")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("library.backToLibrary")}</p>
          </div>
        </button>

        <div className="px-4 pt-4">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Folder</p>
          <div className="flex items-center gap-2">
            <Folder className="h-4 w-4 shrink-0 text-primary" />
            <p className="flex-1 truncate text-sm font-semibold text-foreground">{decodedName}</p>
            <button
              className="shrink-0 rounded p-1 hover:bg-accent"
              onClick={() => {
                setNewFolderName(decodedName);
                setRenameError("");
                setShowRenameDialog(true);
              }}
            >
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {folderGames.length} {t("library.gamesInFolder")}
          </p>
        </div>

        <div className="flex-1" />

        <div className="px-4 pb-4">
          <button
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-destructive/80 transition-colors hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Folder className="h-4 w-4" />
            {t("library.deleteFolder")}
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex flex-1 flex-col overflow-hidden">

      {/* Rename Folder Dialog — renders as portal, position in tree doesn't matter */}
      <AlertDialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <AlertDialogContent className="border-border bg-background">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-semibold text-foreground">
              {t("library.renameFolderTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {t("library.renameFolderDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-4">
            <Input
              value={newFolderName}
              onChange={e => {
                setNewFolderName(e.target.value);
                setRenameError("");
              }}
              placeholder={t("library.folderNamePlaceholder")}
              className="text-foreground"
              autoFocus
            />
            {renameError && (
              <p className="text-secondary-foreground mt-2 text-sm">{renameError}</p>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel className="text-foreground">
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-primary text-secondary"
              onClick={e => {
                e.preventDefault();

                // Validate input
                if (!newFolderName.trim()) {
                  setRenameError(t("library.folderNameRequired"));
                  return;
                }

                const oldFolderName = decodeURIComponent(folderName);

                // Check if a folder with this name already exists
                const folders = loadFolders();
                const folderExists = folders.some(
                  folder => folder.game === newFolderName && folder.game !== oldFolderName
                );

                if (folderExists) {
                  setRenameError(t("library.thisIsNamedThat"));
                  return;
                }

                try {
                  // Update folder name
                  updateFolderName(oldFolderName, newFolderName);

                  // Navigate to the new folder URL
                  navigate(`/folderview/${encodeURIComponent(newFolderName)}`);

                  // Close dialog
                  setShowRenameDialog(false);
                } catch (error) {
                  setRenameError(error.message || t("library.folderRenameError"));
                }
              }}
            >
              {t("common.save")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Folder Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent
          className="border-border bg-background"
          onClick={e => e.stopPropagation()}
        >
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
              className="bg-primary text-secondary"
              onClick={e => {
                e.stopPropagation();
                handleDeleteFolder();
                setShowDeleteDialog(false);
              }}
            >
              {t("common.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {(() => {
            const gamesToShow =
              folderGames.length > 0 ? folderGames : lastFolderGamesRef.current;

            if (gamesToShow.length === 0 && !isLoading) {
              return (
                <div className="mt-16 flex flex-col items-center justify-center text-center">
                  <Folder className="mb-4 h-16 w-16 text-primary" />
                  <h2 className="mb-2 text-2xl font-bold">{t("library.emptyFolderTitle")}</h2>
                  <p className="mb-4 text-muted-foreground">{t("library.emptyFolderDescription")}</p>
                </div>
              );
            }

            return (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {gamesToShow.map(game => (
                  <GameCard
                  key={game.game || game.name}
                  game={game}
                  favorites={favorites}
                  onPlay={handlePlayGame}
                  onRemove={handleRemoveFromFolder}
                  onToggleFavorite={toggleFavorite}
                  t={t}
                />
                ))}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
};

export default FolderView;
