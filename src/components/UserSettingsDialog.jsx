import React, { useState, useEffect, useCallback } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { ExternalLink, Pencil, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { toast } from "sonner";

const UserSettingsDialog = () => {
  const [username, setUsername] = useState("");
  const [directory, setDirectory] = useState("");
  const [canCreateFiles, setCanCreateFiles] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    try {
      const savedUsername = await window.electron.getLocalCrackUsername();
      const savedDirectory = await window.electron.getLocalCrackDirectory();

      if (savedUsername) {
        setUsername(savedUsername);
      } else {
        const systemUsername = "Guest";
        setUsername(systemUsername);
      }
      if (savedDirectory) {
        setDirectory(savedDirectory);
        const canCreate = await window.electron.canCreateFiles(savedDirectory);
        setCanCreateFiles(canCreate);
      }
    } catch (error) {
      console.error("Error loading settings:", error);
    }
  };

  const handleSave = async () => {
    if (!canCreateFiles) {
      toast.error(t("settings.userSettings.directoryError"));
      return;
    }

    try {
      const usernameResult = await window.electron.setLocalCrackUsername(username);
      const directoryResult = await window.electron.setLocalCrackDirectory(directory);

      if (!usernameResult) {
        toast.error(t("settings.userSettings.usernameError"));
        return;
      }
      if (!directoryResult) {
        toast.error(t("settings.userSettings.directoryError"));
        return;
      }

      // Emit custom event when username is updated
      window.dispatchEvent(new CustomEvent("usernameUpdated"));

      toast.success(t("settings.userSettings.saveSuccess"));
      setIsOpen(false);
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error(t("common.error"));
    }
  };

  const handleDirectorySelect = useCallback(async () => {
    try {
      const newDirectory = await window.electron.openDirectoryDialog();
      if (newDirectory) {
        const canCreate = await window.electron.canCreateFiles(newDirectory);
        setCanCreateFiles(canCreate);

        if (!canCreate) {
          toast.error(t("settings.userSettings.directoryPermissionError"));
          return;
        }

        setDirectory(newDirectory);
      }
    } catch (error) {
      console.error("Error selecting directory:", error);
      toast.error(t("common.error"));
    }
  }, [t]);

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9">
          <Pencil className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="sm:max-w-[425px]">
        <AlertDialogHeader>
          <div className="fixed right-4 top-4 items-center justify-center">
            <X
              className="h-5 w-5 cursor-pointer text-foreground"
              onClick={() => setIsOpen(false)}
            />
          </div>
          <AlertDialogTitle className="text-2xl font-bold text-foreground">
            {t("settings.userSettings.title")}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            {t("settings.userSettings.description")}&nbsp;
            <a
              onClick={() =>
                window.electron.openURL(
                  "https://ascendara.app/docs/features/overview#username-customization"
                )
              }
              className="cursor-pointer text-sm text-muted-foreground hover:text-primary"
            >
              {t("common.learnMore")}{" "}
              <ExternalLink className="mb-1 inline-block h-3 w-3" />
            </a>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label className="text-muted-foreground" htmlFor="username">
              {t("settings.userSettings.username")}
            </Label>
            <Input
              id="username"
              value={username}
              className="text-foreground"
              onChange={e => setUsername(e.target.value)}
              placeholder={t("settings.userSettings.usernamePlaceholder")}
            />
          </div>

          <div className="grid gap-2">
            <Label className="text-muted-foreground" htmlFor="directory">
              {t("settings.userSettings.directory")}
            </Label>
            <div className="flex gap-2">
              <Input
                id="directory"
                value={directory}
                onChange={e => setDirectory(e.target.value)}
                placeholder={t("settings.userSettings.directoryDescription")}
                className="flex-1 text-foreground"
              />
              <Button className="text-secondary" onClick={handleDirectorySelect}>
                {t("settings.userSettings.browseDirectory")}
              </Button>
            </div>
            {!canCreateFiles && (
              <p className="text-sm text-muted-foreground">
                {t("settings.userSettings.directoryPermissionError")}
              </p>
            )}
          </div>
        </div>

        <AlertDialogFooter>
          <Button
            className="text-secondary"
            onClick={handleSave}
            disabled={!canCreateFiles}
          >
            {t("settings.userSettings.saveChanges")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default UserSettingsDialog;
