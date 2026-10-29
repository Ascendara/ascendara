import { useEffect, useRef, useState } from "react";
import { Gamepad2, RotateCcw, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/context/LanguageContext";
import { updateStoreArtwork } from "@/hooks/useStoreGame";

const MAX_COVER_BYTES = 20 * 1024 * 1024;

// Store-owned games can come back from the store with a placeholder name or no
// artwork; this lets the user correct how the entry shows in their library.
export default function FixStoreShortcutDialog({
  open,
  onOpenChange,
  game,
  artwork,
  onRename,
}) {
  const { t } = useLanguage();
  const fileInput = useRef(null);
  const [name, setName] = useState(game.game);
  // undefined = unchanged, null = restore the store cover, string = new image
  const [cover, setCover] = useState(undefined);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(game.game);
    setCover(undefined);
  }, [open, game.game]);

  const chooseCover = event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type) || file.size > MAX_COVER_BYTES) {
      toast.error(t("storeAccounts.fixShortcut.invalidImage"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setCover(reader.result);
    reader.onerror = () => toast.error(t("storeAccounts.fixShortcut.invalidImage"));
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setSaving(true);
    try {
      if (cover !== undefined) {
        const result = await window.electron.storeAccounts.setCover(
          game.store,
          game.id,
          cover
        );
        if (!result.success) throw new Error(result.error);
        updateStoreArtwork(`${game.store}:${game.id}`, result.data);
      }
      const trimmed = name.trim();
      if (trimmed && trimmed !== game.game && !onRename(trimmed)) {
        throw new Error(t("storeAccounts.display.saveError"));
      }
      toast.success(t("storeAccounts.fixShortcut.saved"));
      onOpenChange(false);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const preview = cover === undefined ? artwork.grid : cover;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-2xl font-bold text-foreground">
            {t("storeAccounts.fixShortcut.title")}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            {t("storeAccounts.fixShortcut.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex gap-4">
          <div className="relative aspect-[2/3] w-28 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
            {preview ? (
              <img src={preview} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Gamepad2 className="h-8 w-8 text-muted-foreground/30" />
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
              {t("storeAccounts.fixShortcut.name")}
              <Input
                value={name}
                maxLength={300}
                onChange={event => setName(event.target.value)}
                className="bg-background text-foreground"
              />
            </label>
            <span className="text-sm font-medium text-foreground">
              {t("storeAccounts.fixShortcut.cover")}
            </span>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={chooseCover}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => fileInput.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" />
                {t("storeAccounts.fixShortcut.uploadCover")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={() => setCover(null)}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t("storeAccounts.fixShortcut.resetCover")}
              </Button>
            </div>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel className="text-primary" disabled={saving}>
            {t("common.cancel")}
          </AlertDialogCancel>
          <Button
            className="bg-primary text-secondary"
            disabled={saving || !name.trim()}
            onClick={save}
          >
            {t("common.save")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
