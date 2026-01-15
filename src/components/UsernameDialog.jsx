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
import { Checkbox } from "@/components/ui/checkbox";
import { ExternalLink, Pencil, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { toast } from "sonner";

const UsernameDialog = () => {
  const [username, setUsername] = useState("");
  const [directory, setDirectory] = useState("");
  const [canCreateFiles, setCanCreateFiles] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [isWindows, setIsWindows] = useState(false);
  const [useForGoldberg, setUseForGoldberg] = useState(true);
  const { t } = useLanguage();

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    try {
      // Check if running on Windows
      const isOnWindows = await window.electron.isOnWindows();
      setIsWindows(isOnWindows);

      // Load profile name from localStorage
      const profileData = JSON.parse(localStorage.getItem("userProfile") || "{}");
      setUsername(profileData.profileName || "");
      setUseForGoldberg(profileData.useForGoldberg !== false);

      // Always load Goldberg directory on Windows
      if (isOnWindows) {
        const savedDirectory = await window.electron.getLocalCrackDirectory();
        if (savedDirectory) {
          setDirectory(savedDirectory);
          const canCreate = await window.electron.canCreateFiles(savedDirectory);
          setCanCreateFiles(canCreate);
        }
      }
    } catch (error) {
      console.error("Error loading settings:", error);
    }
  };

  const handleSave = async () => {
    try {
      // Always save profile name to localStorage
      const profileData = JSON.parse(localStorage.getItem("userProfile") || "{}");
      const updatedProfile = {
        ...profileData,
        profileName: username,
        useForGoldberg: useForGoldberg,
      };

      // Save to localStorage
      localStorage.setItem("userProfile", JSON.stringify(updatedProfile));

      // If on Windows and using for Goldberg, save Goldberg settings
      if (isWindows && useForGoldberg) {
        if (!canCreateFiles) {
          toast.error(t("settings.userSettings.directoryError"));
          return;
        }

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
      }

      // Dispatch event to notify other components
      window.dispatchEvent(new CustomEvent("username-updated"));

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
        <Button
          variant="ghost"
          size="icon"
          className="transition-transform duration-200 hover:scale-110 hover:bg-transparent"
        >
          <Pencil className="mb-2 h-4 w-4" />
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
          {/* Username field */}
          <div className="grid gap-2">
            <Label className="text-muted-foreground" htmlFor="username">
              {t("settings.userSettings.generalUsername")}
            </Label>
            <Input
              id="username"
              value={username}
              className="text-foreground"
              onChange={e => setUsername(e.target.value)}
              placeholder={t("settings.userSettings.generalUsernamePlaceholder")}
            />
          </div>

          {/* Use for Goldberg checkbox (disabled on non-Windows) */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="useForGoldberg"
              checked={isWindows && useForGoldberg}
              onCheckedChange={checked => {
                if (isWindows) {
                  setUseForGoldberg(checked);
                }
              }}
              disabled={!isWindows}
            />
            <Label
              htmlFor="useForGoldberg"
              className={`text-sm ${!isWindows ? "text-muted-foreground/50" : "text-muted-foreground"}`}
            >
              {t("settings.userSettings.useForGoldberg")}
            </Label>
          </div>

          {/* Goldberg directory (only shown on Windows and when useForGoldberg is true) */}
          {isWindows && useForGoldberg && (
            <div className="grid gap-2">
              <Label className="text-muted-foreground" htmlFor="directory">
                {t("settings.userSettings.goldbergSettingsDir")}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="directory"
                  value={directory}
                  onChange={e => setDirectory(e.target.value)}
                  placeholder={t("settings.userSettings.goldbergSettingsDir")}
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
          )}
        </div>

        <AlertDialogFooter>
          <Button
            variant="outline"
            className="text-primary"
            onClick={() => setIsOpen(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button className="text-secondary" onClick={handleSave}>
            {t("settings.userSettings.saveChanges")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default UsernameDialog;
