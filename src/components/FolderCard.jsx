
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Folder, FolderOpen, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { getFolderByName, deleteFolder, loadFolders } from "@/lib/folderManager";
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


// Keep covers available synchronously when cards remount after navigation.
const thumbnailCache = new Map();
window.addEventListener("game-cover-updated", ({ detail }) => {
  if (!detail?.gameName) return;
  if (detail.dataUrl) thumbnailCache.set(detail.gameName, detail.dataUrl);
  else thumbnailCache.delete(detail.gameName);
});
const getPreview = items => items.slice(0, 4).map(game => {
  const id = game.game || game.name;
  return { id, name: id, image: thumbnailCache.get(id) || null };
});

const FolderCard = ({ name, onClick, className, refreshKey, folder: suppliedFolder }) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [isHovered, setIsHovered] = useState(false);
  const folder = suppliedFolder || getFolderByName(name);
  const folderGames = folder?.items || [];
  const previewKey = JSON.stringify(folderGames.slice(0, 4).map(game => game.game || game.name));
  const [gameThumbnails, setGameThumbnails] = useState(() => getPreview(folderGames));
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    let active = true;
    const ids = JSON.parse(previewKey);
    const refresh = async () => {
      const results = await Promise.all(ids.map(async id => {
        let image = thumbnailCache.get(id);
        if (!image) {
          try {
            const base64 = await window.electron.getGameImage(id, "grid");
            image = base64 ? `data:image/jpeg;base64,${base64}` : null;
            if (image) thumbnailCache.set(id, image);
          } catch { image = null; }
        }
        return { id, name: id, image };
      }));
      if (active) setGameThumbnails(results);
    };
    const onCoverUpdate = ({ detail }) => {
      if (ids.includes(detail?.gameName)) refresh();
    };
    refresh();
    window.addEventListener("game-cover-updated", onCoverUpdate);
    return () => {
      active = false;
      window.removeEventListener("game-cover-updated", onCoverUpdate);
    };
  }, [previewKey, refreshKey]);

  useEffect(() => {
    const onRemoveRequested = ({ detail }) => {
      if (detail?.folderName === name) setShowDeleteDialog(true);
    };
    window.addEventListener("ascendara:remove-folder-requested", onRemoveRequested);
    return () => window.removeEventListener("ascendara:remove-folder-requested", onRemoveRequested);
  }, [name]);

  const handleFolderClick = e => {
    e.stopPropagation();
    if (onClick) {
      onClick();
    } else {
      navigate(`/folderview/${encodeURIComponent(name)}`);
    }
  };

  const slots = Array(4).fill(null).map((_, i) => gameThumbnails[i] ?? null);

  return (
    <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
      <Card
        data-library-folder={name}
        className={cn(
          "group relative overflow-hidden rounded-xl border border-border bg-card shadow-md transition-all duration-200",
          "hover:-translate-y-1 hover:shadow-xl hover:border-primary/30",
          "cursor-pointer",
          className
        )}
        onClick={handleFolderClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <CardContent className="p-0">
          <div className="relative aspect-[2/3] overflow-hidden bg-muted/20">
            {/* 2×2 portrait thumbnail grid */}
            <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-0.5 p-0.5">
              {slots.map((slot, index) => (
                slot?.image ? (
                  <div key={slot.id} className="overflow-hidden">
                    <img
                      src={slot.image}
                      alt={slot.name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <div
                    key={`empty-${index}`}
                    className="flex items-center justify-center bg-muted/40"
                  >
                    <Folder className="h-5 w-5 text-muted-foreground/30" />
                  </div>
                )
              ))}
            </div>

            {/* Hover overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />

            {/* Delete button — top-right on hover */}
            <button
              type="button"
              className={cn(
                "absolute right-2 top-2 z-20 rounded-full bg-black/50 p-1.5 text-white transition-opacity hover:bg-destructive/80",
                isHovered ? "opacity-100" : "pointer-events-none opacity-0"
              )}
              title={t("library.removeFolder")}
              onClick={e => {
                e.stopPropagation();
                setShowDeleteDialog(true);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>

            {/* Game count badge — top-left */}
            <span className="absolute left-2 top-2 z-20 flex items-center gap-1 rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {isHovered ? <FolderOpen className="h-3 w-3" /> : <Folder className="h-3 w-3" />}
              {folderGames.length}
            </span>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col items-start gap-1 px-3 py-2">
          <h3 className="w-full truncate text-sm font-semibold leading-tight text-foreground">
            {name}
          </h3>
          <p className="text-xs text-muted-foreground">
            {folderGames.length === 0
              ? t("library.dragGamesHere")
              : `${folderGames.length} ${t("library.gamesInFolder")}`}
          </p>
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
