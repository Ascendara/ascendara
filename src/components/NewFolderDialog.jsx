import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/context/LanguageContext";
import { loadFolders } from "@/lib/folderManager";

const NewFolderDialog = ({ open, onOpenChange, onCreate }) => {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const handleCreate = () => {
    const trimmedName = name.trim();

    // Check if name is empty
    if (!trimmedName) {
      setError(t("library.newFolder.required"));
      return;
    }

    // Check if folder with this name already exists
    const folders = loadFolders();
    const folderExists = folders.some(folder => folder.game === trimmedName);

    if (folderExists) {
      setError(t("library.newFolder.exists"));
      return;
    }

    setError("");
    onCreate(trimmedName);
    setName("");
    if (onOpenChange) onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="border-border bg-background">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg font-semibold text-foreground">
            {t("library.newFolder.title")}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            {t("library.newFolder.desc")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          autoFocus
          className="text-foreground"
          placeholder={t("library.newFolder.placeholder")}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") handleCreate();
          }}
        />
        {error && <div className="mt-2 text-sm text-primary">{error}</div>}
        <AlertDialogFooter>
          <AlertDialogCancel className="text-foreground">
            {t("common.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-primary text-secondary"
            onClick={e => {
              e.preventDefault();
              handleCreate();
            }}
          >
            {t("library.newFolder.create")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default NewFolderDialog;
