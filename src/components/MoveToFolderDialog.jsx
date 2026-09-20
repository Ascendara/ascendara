import { useState } from "react";
import { FolderOpen } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function MoveToFolderDialog({ game, folders, onMove, onClose }) {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const filteredFolders = folders.filter(folder =>
    folder.game.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="flex max-h-[80vh] flex-col border-border bg-background text-foreground">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-foreground">{t("library.moveToFolder.title")}</DialogTitle>
          <DialogDescription className="break-words text-muted-foreground">
            {t("library.moveToFolder.description", { game: game.game || game.name })}
          </DialogDescription>
        </DialogHeader>
        {folders.length > 0 ? (
          <>
            <Input
              className="text-foreground"
              aria-label={t("library.moveToFolder.search")}
              placeholder={t("library.moveToFolder.search")}
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
            <div className="min-h-0 space-y-1 overflow-y-auto">
              {filteredFolders.map(folder => (
                <Button
                  key={folder.game}
                  variant="ghost"
                  className="h-auto w-full justify-start gap-3 py-3 text-left text-foreground"
                  onClick={() => onMove(folder.game)}
                >
                  <FolderOpen className="h-5 w-5 shrink-0 text-primary" />
                  <span className="min-w-0 whitespace-normal break-words">{folder.game}</span>
                </Button>
              ))}
              {filteredFolders.length === 0 && (
                <p className="py-4 text-sm text-muted-foreground">{t("library.moveToFolder.noMatches")}</p>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("library.moveToFolder.noFolders")}</p>
        )}
        <DialogFooter>
          <Button variant="outline" className="text-foreground" onClick={onClose}>
            {t("common.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
