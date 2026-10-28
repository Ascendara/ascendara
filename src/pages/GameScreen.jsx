import { dialogTitleClassName } from "@/components/ui/dialog-styles";
import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  Play,
  FolderOpen,
  Tag,
  Trash2,
  Pencil,
  Loader,
  Check,
  AlertTriangle,
  Info,
  Star,
  Clock,
  ExternalLink,
  Download,
  Search,
  Edit3,
  ThumbsUp,
  Music2,
  Trophy,
  BookX,
  ImageUp,
  ImageIcon,
  Bolt,
  Plus,
  GripVertical,
  X,
  Puzzle,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import gameUpdateService from "@/services/library/gameUpdateService";
import { SEAMLESS_PROVIDERS } from "@/config/providers";
import { loadFolders, saveFolders } from "@/lib/folderManager";
import { cn, sanitizeText } from "@/lib/utils";
import { useSettings } from "@/context/SettingsContext";
import {
  useAudioPlayer,
  killAudioAndMiniplayer,
} from "@/services/app/audioPlayerService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { getGameSoundtrack } from "@/services/integrations/khinsiderService";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import VerifyingGameDialog from "@/components/VerifyingGameDialog";
import SteamNotRunningDialog from "@/components/SteamNotRunningDialog";
import recentGamesService from "@/services/library/recentGamesService";
import GamesBackupDialog from "@/components/GamesBackupDialog";
import imageCacheService from "@/services/images/imageCacheService";
import "@/components/GameMetadata";
import steamService from "@/services/games/gameInfoService";
import { gameImageCache, heroImageCache, logoImageCache } from "@/lib/gameImageCache";
import GameRate from "@/components/GameRate";
import { GameAssetSearchDialog } from "@/components/GameAssetSearchDialog";
import nexusModsService from "@/services/integrations/nexusModsService";
import flingTrainerService from "@/services/integrations/flingTrainerService";
import { useAuth } from "@/context/AuthContext";
import { getCloudLibrary, verifyAscendAccess } from "@/services/firebase/firebaseService";
import gameService from "@/services/games/gameService";
import { pullCloudGameDataBeforeLaunch } from "@/services/cloud/gameLaunchCloudSync";
import pendingLibrarySwapService from "@/services/downloads/pendingLibrarySwapService";
import GameHero from "@/components/gamescreen/GameHero";
import StoreGameScreen from "@/components/gamescreen/StoreGameScreen";
import GameActions from "@/components/gamescreen/GameActions";
import GameOverviewTab from "@/components/gamescreen/GameOverviewTab";
import AchievementsTab from "@/components/gamescreen/AchievementsTab";
import SoundtrackTab from "@/components/gamescreen/SoundtrackTab";
import ModsTrainersTab from "@/components/gamescreen/ModsTrainersTab";
import { useGameRunning } from "@/hooks/useGameRunning";
import { API_URL } from "@/config/api";

const ExecutableManagerDialog = ({ open, onClose, gameName, isCustom, t, onSave }) => {
  const [executables, setExecutables] = useState([]);
  const [exeExists, setExeExists] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && gameName) {
      setLoading(true);
      gameUpdateService.getGameExecutables(gameName, isCustom).then(async exes => {
        const exeList = exes.length > 0 ? exes : [""];
        setExecutables(exeList);
        // Check which executables exist
        const existsMap = {};
        for (const exe of exeList) {
          if (exe) {
            existsMap[exe] = await window.electron.checkFileExists(exe);
          }
        }
        setExeExists(existsMap);
        setLoading(false);
      });
    }
  }, [open, gameName, isCustom]);

  // Update existence check when executables change
  useEffect(() => {
    const checkExists = async () => {
      const newExistsMap = { ...exeExists };
      let hasChanges = false;
      for (const exe of executables) {
        if (exe && !(exe in newExistsMap)) {
          newExistsMap[exe] = await window.electron.checkFileExists(exe);
          hasChanges = true;
        }
      }
      if (hasChanges) {
        setExeExists(newExistsMap);
      }
    };
    if (!loading && executables.length > 0) {
      checkExists();
    }
  }, [executables, loading]);

  const handleAddExecutable = async () => {
    // Open dialog in the same directory as the first executable
    const startPath = executables.length > 0 && executables[0] ? executables[0] : null;
    const exePath = await window.electron.openFileDialog(startPath);
    if (exePath) {
      setExecutables(prev => [...prev, exePath]);
      // Immediately check if the new exe exists
      const exists = await window.electron.checkFileExists(exePath);
      setExeExists(prev => ({ ...prev, [exePath]: exists }));
    }
  };

  const handleChangeExecutable = async index => {
    // Pass current executable path to open dialog in that directory
    const currentExe = executables[index];
    const exePath = await window.electron.openFileDialog(currentExe || null);
    if (exePath) {
      setExecutables(prev => {
        const updated = [...prev];
        updated[index] = exePath;
        return updated;
      });
      // Immediately check if the new exe exists
      const exists = await window.electron.checkFileExists(exePath);
      setExeExists(prev => ({ ...prev, [exePath]: exists }));
    }
  };

  const handleRemoveExecutable = index => {
    if (executables.length <= 1) return;
    setExecutables(prev => prev.filter((_, i) => i !== index));
  };

  const handleMakePrimary = index => {
    if (index === 0) return;
    setExecutables(prev => {
      const updated = [...prev];
      const [item] = updated.splice(index, 1);
      updated.unshift(item);
      return updated;
    });
  };

  const handleSave = async () => {
    const validExecutables = executables.filter(exe => exe && exe.trim() !== "");
    if (validExecutables.length === 0) {
      toast.error(t("library.executableManager.atLeastOne"));
      return;
    }
    setSaving(true);
    const success = await gameUpdateService.updateGameExecutables(
      gameName,
      validExecutables,
      isCustom
    );
    setSaving(false);
    if (success) {
      toast.success(t("library.executableManager.saved"));
      if (onSave) {
        onSave(validExecutables);
      }
      onClose();
    } else {
      toast.error(t("library.executableManager.saveFailed"));
    }
  };

  const getFileName = path => {
    if (!path) return "";
    return path.split(/[/\\]/).pop();
  };

  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-2xl font-bold text-foreground">
            {t("library.executableManager.title")}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            {t("library.executableManager.description")}

            {executables.some(exe => exe && exeExists[exe] === false) && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-muted/50 p-3">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">
                    {t("library.executableManager.exeLocationHint")}
                  </span>
                  <button
                    onClick={() =>
                      window.electron.openURL(
                        "https://ascendara.app/docs/troubleshooting/common-issues#executable-not-found-launch-error"
                      )
                    }
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    {t("library.executableManager.learnMore")}
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="my-2 max-h-64 space-y-2 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            executables.map((exe, index) => (
              <div
                key={index}
                className="flex items-center gap-2 rounded-lg border border-border bg-card p-2"
              >
                <div className="flex flex-1 flex-col overflow-hidden">
                  <div className="flex items-center gap-2">
                    {exe && exeExists[exe] === false && (
                      <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-500" />
                    )}
                    {index === 0 && (
                      <span className="shrink-0 rounded bg-primary px-1.5 py-0.5 text-xs font-medium text-secondary">
                        {t("library.executableManager.primary")}
                      </span>
                    )}
                    <span className="truncate text-sm font-medium text-foreground">
                      {getFileName(exe) || t("library.executableManager.noFile")}
                    </span>
                  </div>
                  <span className="truncate text-xs text-muted-foreground">{exe}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {index !== 0 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleMakePrimary(index)}
                      title={t("library.executableManager.makePrimary")}
                    >
                      <GripVertical className="h-4 w-4 text-primary" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleChangeExecutable(index)}
                    title={t("library.executableManager.change")}
                  >
                    <Pencil className="h-4 w-4 text-primary" />
                  </Button>
                  {executables.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive h-8 w-8"
                      onClick={() => handleRemoveExecutable(index)}
                      title={t("library.executableManager.remove")}
                    >
                      <X className="h-4 w-4 text-primary" />
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <Button
          variant="outline"
          className="w-full text-primary"
          onClick={handleAddExecutable}
        >
          <Plus className="mr-2 h-4 w-4" />
          {t("library.executableManager.addExecutable")}
        </Button>

        <AlertDialogFooter className="mt-4 flex gap-2">
          <Button variant="outline" className="text-primary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            className="bg-primary text-secondary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader className="mr-2 h-4 w-4 animate-spin" />
                {t("common.saving")}
              </>
            ) : (
              t("common.save")
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const ExecutableSelectDialog = ({ open, onClose, executables, onSelect, t }) => {
  const getFileName = path => {
    if (!path) return "";
    return path.split(/[/\\]/).pop();
  };

  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-2xl font-bold text-foreground">
            {t("library.executableSelect.title")}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            {t("library.executableSelect.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="my-4 max-h-64 space-y-2 overflow-y-auto">
          {executables.map((exe, index) => (
            <button
              key={index}
              onClick={() => onSelect(exe)}
              className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent"
            >
              <Play className="h-5 w-5 shrink-0 text-primary" />
              <div className="flex flex-1 flex-col overflow-hidden">
                <div className="flex items-center gap-2">
                  {index === 0 && (
                    <span className="shrink-0 rounded bg-primary px-1.5 py-0.5 text-xs font-medium text-secondary">
                      {t("library.executableManager.primary")}
                    </span>
                  )}
                  <span className="truncate text-sm font-medium text-foreground">
                    {getFileName(exe)}
                  </span>
                </div>
                <span className="truncate text-xs text-muted-foreground">{exe}</span>
              </div>
            </button>
          ))}
        </div>

        <AlertDialogFooter>
          <Button variant="outline" className="text-primary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const ErrorDialog = ({
  open,
  onClose,
  errorGame,
  errorMessage,
  t,
  onManageExecutables,
}) => (
  <AlertDialog open={open} onOpenChange={onClose}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle className="text-2xl font-bold text-foreground">
          {t("library.launchError")}
        </AlertDialogTitle>
        <AlertDialogDescription className="space-y-4 text-muted-foreground">
          {t("library.launchErrorMessage", { game: errorGame })}&nbsp;
          <span
            onClick={() => {
              window.electron.openURL(
                "https://ascendara.app/docs/troubleshooting/common-issues#executable-not-found-launch-error"
              );
            }}
            className="cursor-pointer hover:underline"
          >
            {t("common.learnMore")} <ExternalLink className="mb-1 inline-block h-3 w-3" />
          </span>
          <br />
          <br />
          {errorMessage}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter className="flex gap-2">
        <Button variant="outline" className="text-primary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          className="bg-primary text-secondary"
          onClick={() => {
            onClose();
            onManageExecutables();
          }}
        >
          {t("library.changeExecutable")}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

const UninstallConfirmationDialog = ({
  open,
  onClose,
  onConfirm,
  gameName,
  isUninstalling,
  t,
}) => (
  <AlertDialog open={open} onOpenChange={onClose}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle className="text-2xl font-bold text-foreground">
          {t("library.confirmDelete")}
        </AlertDialogTitle>
        <AlertDialogDescription className="space-y-4 text-muted-foreground">
          {t("library.deleteConfirmMessage", { game: gameName })}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter className="flex gap-2">
        <Button variant="outline" className="text-primary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button className="text-secondary" onClick={onConfirm} disabled={isUninstalling}>
          {isUninstalling ? (
            <>
              <Loader className="mr-2 h-4 w-4 animate-spin" />
              {t("library.deleting")}
            </>
          ) : (
            t("library.delete", { game: gameName })
          )}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

const AudioDownloadConfirmDialog = ({
  open,
  onClose,
  onConfirm,
  onCancel,
  trackCount,
  t,
}) => (
  <AlertDialog open={open} onOpenChange={onClose}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle className="text-2xl font-bold text-foreground">
          {t("gameScreen.audioFetchConfirmTitle")}
        </AlertDialogTitle>
        <AlertDialogDescription className="space-y-4 text-muted-foreground">
          {t("gameScreen.audioFetchConfirmMessage", { count: trackCount })}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter className="flex gap-2">
        <Button
          variant="outline"
          className="text-primary"
          onClick={() => {
            onCancel();
            onClose();
          }}
        >
          {t("common.cancel")}
        </Button>
        <Button
          className="text-secondary"
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {t("gameScreen.continueFetch")}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

const PurchasePromptDialog = ({ open, onClose, gameName, appId, t }) => {
  const handleOpenStore = () => {
    if (appId) {
      window.electron.openURL(`https://store.steampowered.com/app/${appId}`);
    }
    onClose();
  };

  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-2xl font-bold text-foreground">
            {t("gameScreen.purchasePromptTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-4 text-muted-foreground">
            {t("gameScreen.purchasePromptMessage", { game: gameName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex gap-2">
          <Button variant="outline" className="text-primary" onClick={onClose}>
            {t("common.dismiss")}
          </Button>
          {appId && (
            <Button className="gap-2 text-secondary" onClick={handleOpenStore}>
              <ExternalLink className="h-4 w-4" />
              {t("gameScreen.openSteamStore")}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const FIELD_META = {
  game: { type: "text", readonly: true },
  version: { type: "text" },
  size: { type: "text" },
  executable: { type: "text" },
  launchCommands: { type: "text" },
  online: { type: "bool" },
  dlc: { type: "bool" },
  isVr: { type: "bool" },
  favorite: { type: "bool" },
  backups: { type: "bool" },
  isRunning: { type: "bool", readonly: true },
  hasRated: { type: "bool", readonly: true, leaderboard: true },
  launchCount: { type: "number", readonly: true, leaderboard: true },
  playTime: { type: "number", readonly: true, leaderboard: true },
  lastPlayed: { type: "text", readonly: true },
  executables: { type: "array" },
};

// Only ask for a rating once the user has actually played the game, and never
// right after a session that crashed or closed almost immediately.
const RATE_PROMPT_MIN_LAUNCHES = 2;
const RATE_PROMPT_MIN_PLAYTIME = 30 * 60;
const RATE_PROMPT_MIN_LAST_SESSION = 5 * 60;

const shouldPromptRating = game => {
  if (!game || game.hasRated || game.isRunning) return false;
  if ((game.launchCount || 0) < RATE_PROMPT_MIN_LAUNCHES) return false;
  if ((game.playTime || 0) < RATE_PROMPT_MIN_PLAYTIME) return false;
  const last = game.lastSession;
  if (last && (last.crashed || (last.seconds || 0) < RATE_PROMPT_MIN_LAST_SESSION)) {
    return false;
  }
  return true;
};

const LEADERBOARD_KEYS = Object.entries(FIELD_META)
  .filter(([, m]) => m.leaderboard)
  .map(([k]) => k);

const EditGameEntryDialog = ({
  open,
  onClose,
  gameName,
  isCustom,
  t,
  onSaved,
  isAuthenticated,
}) => {
  const [fields, setFields] = useState({});
  const [originalFields, setOriginalFields] = useState({});
  const [rawTab, setRawTab] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState(null);
  const [rawWarnKeys, setRawWarnKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && gameName) {
      setLoading(true);
      setJsonError(null);
      setRawTab(false);
      setRawWarnKeys([]);
      window.electron.readGameEntry(gameName, isCustom).then(result => {
        if (result.success) {
          setFields(result.data);
          setOriginalFields(result.data);
          setJsonText(JSON.stringify(result.data, null, 2));
        } else {
          setJsonError(result.error || t("gameScreen.editGameEntryLoadError"));
        }
        setLoading(false);
      });
    }
  }, [open, gameName, isCustom]);

  const handleFieldChange = (key, value) => {
    const updated = { ...fields, [key]: value };
    setFields(updated);
    setJsonText(JSON.stringify(updated, null, 2));
    setJsonError(null);
  };

  const handleRawChange = value => {
    setJsonText(value);
    try {
      const parsed = JSON.parse(value);
      // Detect if any leaderboard-sensitive keys were changed
      if (isAuthenticated) {
        const tampered = LEADERBOARD_KEYS.filter(
          k =>
            k in originalFields &&
            JSON.stringify(parsed[k]) !== JSON.stringify(originalFields[k])
        );
        if (tampered.length > 0) {
          // Revert those keys back to original values
          tampered.forEach(k => {
            parsed[k] = originalFields[k];
          });
          const reverted = JSON.stringify(parsed, null, 2);
          setJsonText(reverted);
          setFields(parsed);
          setRawWarnKeys(tampered);
        } else {
          setFields(parsed);
          setRawWarnKeys([]);
        }
      } else {
        setFields(parsed);
        setRawWarnKeys([]);
      }
      setJsonError(null);
    } catch (e) {
      setJsonError(e.message);
    }
  };

  const handleSave = async () => {
    const data = rawTab
      ? (() => {
          try {
            return JSON.parse(jsonText);
          } catch {
            return null;
          }
        })()
      : fields;
    if (!data) {
      toast.error(t("gameScreen.editGameEntryInvalidJson"));
      return;
    }
    setSaving(true);
    const result = await window.electron.writeGameEntry(gameName, data, isCustom);
    setSaving(false);
    if (result.success) {
      toast.success(t("gameScreen.editGameEntrySuccess"));
      if (onSaved) onSaved(data);
      onClose();
    } else {
      toast.error(t("gameScreen.editGameEntryError"));
    }
  };

  const knownKeys = Object.keys(FIELD_META);
  const extraKeys = Object.keys(fields).filter(k => !knownKeys.includes(k));

  const renderField = key => {
    const meta = FIELD_META[key];
    const value = fields[key];
    const isDisabled = !!meta.readonly;

    const wrapperClass = `rounded-lg border px-4 py-3 ${
      isDisabled ? "border-border bg-muted/10 opacity-60" : "border-border bg-muted/20"
    }`;

    if (meta.type === "bool") {
      return (
        <div key={key} className={`flex items-center justify-between ${wrapperClass}`}>
          <div className="flex-1 pr-4">
            <p
              className={`text-sm font-medium ${isDisabled ? "text-muted-foreground" : "text-foreground"}`}
            >
              {t(`gameScreen.entryFields.${key}.label`)}
            </p>
            <p className="text-xs text-muted-foreground">
              {t(`gameScreen.entryFields.${key}.description`)}
            </p>
          </div>
          <Switch
            checked={!!value}
            disabled={isDisabled}
            onCheckedChange={v => handleFieldChange(key, v)}
          />
        </div>
      );
    }

    if (meta.type === "number") {
      return (
        <div key={key} className={wrapperClass}>
          <p
            className={`text-sm font-medium ${isDisabled ? "text-muted-foreground" : "text-foreground"}`}
          >
            {t(`gameScreen.entryFields.${key}.label`)}
          </p>
          <p className="mb-2 text-xs text-muted-foreground">
            {t(`gameScreen.entryFields.${key}.description`)}
          </p>
          <Input
            type="number"
            value={value ?? ""}
            disabled={isDisabled}
            onChange={e => handleFieldChange(key, Number(e.target.value))}
            className="h-8 w-40 text-sm"
          />
        </div>
      );
    }

    if (meta.type === "array") {
      const arr = Array.isArray(value) ? value : [];
      return (
        <div key={key} className={wrapperClass}>
          <p className="text-sm font-medium text-foreground">
            {t(`gameScreen.entryFields.${key}.label`)}
          </p>
          <p className="mb-2 text-xs text-muted-foreground">
            {t(`gameScreen.entryFields.${key}.description`)}
          </p>
          <div className="space-y-1">
            {arr.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs text-primary">
                  {i === 0 ? t("gameScreen.entryPrimary") : `#${i + 1}`}
                </span>
                <span className="truncate font-mono text-xs text-foreground">{item}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div key={key} className={wrapperClass}>
        <p
          className={`text-sm font-medium ${isDisabled ? "text-muted-foreground" : "text-foreground"}`}
        >
          {t(`gameScreen.entryFields.${key}.label`)}
        </p>
        <p className="mb-2 text-xs text-muted-foreground">
          {t(`gameScreen.entryFields.${key}.description`)}
        </p>
        <Input
          value={value ?? ""}
          disabled={isDisabled}
          onChange={e => handleFieldChange(key, e.target.value)}
          className="h-8 font-mono text-sm"
        />
      </div>
    );
  };

  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-2xl font-bold text-foreground">
            {t("gameScreen.editGameEntry")}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            {t("gameScreen.editGameEntryDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Tab bar */}
        <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1">
          <button
            onClick={() => {
              setRawTab(false);
              setRawWarnKeys([]);
            }}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${!rawTab ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t("gameScreen.entryFieldsTab")}
          </button>
          <button
            onClick={() => setRawTab(true)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${rawTab ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t("gameScreen.entryRawJsonTab")}
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto pr-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : rawTab ? (
            <div className="flex flex-col gap-2">
              {/* Raw tab leaderboard revert warning */}
              {rawWarnKeys.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                  <p className="text-xs text-red-600 dark:text-red-400">
                    <span className="font-semibold">
                      {t("gameScreen.entryRevertedFieldsTitle")}{" "}
                    </span>
                    {t("gameScreen.entryRevertedFieldsWarning", {
                      fields: rawWarnKeys
                        .map(key => t(`gameScreen.entryFields.${key}.label`))
                        .join(", "),
                    })}
                  </p>
                </div>
              )}
              <textarea
                value={jsonText}
                onChange={e => handleRawChange(e.target.value)}
                className={`h-80 w-full rounded-lg border bg-muted/30 p-3 font-mono text-xs leading-relaxed text-foreground outline-none transition-colors focus:ring-2 focus:ring-primary/50 ${
                  jsonError ? "border-red-500" : "border-border"
                }`}
                spellCheck={false}
              />
              {jsonError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                  <p className="font-mono text-xs text-red-500">{jsonError}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {/* Combined info notice */}
              <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-yellow-500" />
                  <span>{t("gameScreen.entryReadOnlyNotice")}</span>
                </div>
                {isAuthenticated && (
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                    <span>
                      <span className="font-semibold text-red-500">
                        {t("gameScreen.entryLeaderboardTitle")}{" "}
                      </span>
                      {t("gameScreen.entryLeaderboardWarning", {
                        hasRated: t("gameScreen.entryFields.hasRated.label"),
                        launchCount: t("gameScreen.entryFields.launchCount.label"),
                        playTime: t("gameScreen.entryFields.playTime.label"),
                      })}
                    </span>
                  </div>
                )}
              </div>

              {/* Known fields */}
              {knownKeys.filter(k => k in fields).map(renderField)}

              {/* Unknown extra fields */}
              {extraKeys.length > 0 && (
                <>
                  <p className="mt-2 text-xs font-medium text-muted-foreground">
                    {t("gameScreen.entryAdditionalFields")}
                  </p>
                  {extraKeys.map(key => (
                    <div
                      key={key}
                      className="rounded-lg border border-border bg-muted/20 px-4 py-3"
                    >
                      <p className="font-mono text-sm font-medium text-foreground">
                        {key}
                      </p>
                      <Input
                        value={
                          typeof fields[key] === "object"
                            ? JSON.stringify(fields[key])
                            : String(fields[key] ?? "")
                        }
                        onChange={e => {
                          let val = e.target.value;
                          try {
                            val = JSON.parse(val);
                          } catch {}
                          handleFieldChange(key, val);
                        }}
                        className="mt-2 h-8 font-mono text-sm"
                      />
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        <AlertDialogFooter className="mt-2 flex gap-2">
          <Button variant="outline" className="text-primary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            className="bg-primary text-secondary"
            onClick={handleSave}
            disabled={saving || loading || (rawTab && !!jsonError)}
          >
            {saving ? (
              <>
                <Loader className="mr-2 h-4 w-4 animate-spin" />
                {t("common.saving")}
              </>
            ) : (
              t("common.save")
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

// Dialog to edit game info (Steam match and assets)
const EditGameInfoDialog = ({
  open,
  onClose,
  gameName,
  currentAppId,
  steamData,
  t,
  onSave,
  setAssetSearchOpen,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedGame, setSelectedGame] = useState(null);
  const [manualAppId, setManualAppId] = useState(currentAppId || "");
  const [activeTab, setActiveTab] = useState("search"); // "search" or "manual"

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSearchQuery(gameName || "");
      setSearchResults([]);
      setSelectedGame(null);
      setManualAppId(currentAppId || "");
      setActiveTab("search");
    }
  }, [open, gameName, currentAppId]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const searchUrl = `${API_URL}/api/proxy/steam/search?term=${encodeURIComponent(searchQuery)}`;
      const response = await fetch(searchUrl);
      if (response.ok) {
        const data = await response.json();
        if (data.items) {
          // Fetch details for first few results to show more info
          const resultsWithDetails = await Promise.all(
            data.items.slice(0, 5).map(async item => {
              try {
                const detailsUrl = `${API_URL}/api/proxy/steam/appdetails?appids=${item.id}&lang=${encodeURIComponent(steamService.getDetailsLanguage())}`;
                const detailsRes = await fetch(detailsUrl);
                if (detailsRes.ok) {
                  const detailsData = await detailsRes.json();
                  const gameData = detailsData[item.id]?.data;
                  return {
                    ...item,
                    header_image: gameData?.header_image,
                    short_description: gameData?.short_description,
                  };
                }
              } catch (e) {
                console.warn("Could not fetch details for", item.name);
              }
              return item;
            })
          );
          setSearchResults(resultsWithDetails);
        }
      }
    } catch (error) {
      console.error("Error searching Steam:", error);
    }
    setIsSearching(false);
  };

  const handleSelectGame = game => {
    setSelectedGame(game);
    setManualAppId(game.id.toString());
  };

  const handleSave = () => {
    if (!manualAppId) {
      toast.error(t("gameScreen.steamAppIdRequired"));
      return;
    }
    onSave(manualAppId, selectedGame?.name || gameName);
    onClose();
  };

  const handleClear = () => {
    onSave(null, null); // Clear the steam app id
    onClose();
  };

  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-2xl font-bold text-foreground">
            {t("gameScreen.editGameInfo")}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            {t("gameScreen.editGameInfoDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="mt-4 space-y-4">
          {/* Current match info */}
          {steamData && (
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm font-medium text-foreground">
                {t("gameScreen.currentlyMatched")}
              </p>
              <div className="mt-2 flex items-center gap-3">
                {steamData.cover?.url && (
                  <img
                    src={steamData.cover.url}
                    alt={steamData.name}
                    className="h-16 w-32 rounded object-cover"
                  />
                )}
                <div>
                  <p className="font-semibold text-foreground">{steamData.name}</p>
                  <p className="text-xs text-muted-foreground">
                    App ID: {steamData.appid}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant={activeTab === "search" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("search")}
              className={
                activeTab === "search" ? "bg-primary text-secondary" : "text-foreground"
              }
            >
              <Search className="mr-2 h-4 w-4" />
              {t("gameScreen.searchSteam")}
            </Button>
            <Button
              variant={activeTab === "manual" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("manual")}
              className={
                activeTab === "manual" ? "bg-primary text-secondary" : "text-foreground"
              }
            >
              <Edit3 className="mr-2 h-4 w-4" />
              {t("gameScreen.manualEntry")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onClose();
                setAssetSearchOpen(true);
              }}
              className="text-foreground"
            >
              <ImageUp className="mr-2 h-4 w-4" />
              {t("gameScreen.editAssets")}
            </Button>
          </div>

          {activeTab === "search" ? (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={t("gameScreen.searchSteamPlaceholder")}
                  onKeyDown={e => e.key === "Enter" && handleSearch()}
                  className="text-foreground"
                />
                <Button
                  onClick={handleSearch}
                  disabled={isSearching || !searchQuery.trim()}
                  className="bg-primary text-secondary"
                >
                  {isSearching ? (
                    <Loader className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {/* Search Results */}
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {searchResults.map(game => (
                  <div
                    key={game.id}
                    onClick={() => handleSelectGame(game)}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all",
                      selectedGame?.id === game.id
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    {game.header_image ? (
                      <img
                        src={game.header_image}
                        alt={game.name}
                        className="h-12 w-24 rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-24 items-center justify-center rounded bg-muted">
                        <ImageIcon className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">{game.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("gameScreen.steamAppIdLabel", { id: game.id })}
                      </p>
                      {game.short_description && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {game.short_description}
                        </p>
                      )}
                    </div>
                    {selectedGame?.id === game.id && (
                      <Check className="h-5 w-5 text-primary" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="mb-2 text-sm text-muted-foreground">
                  {t("gameScreen.manualAppIdHelp")}
                </p>
                <Input
                  value={manualAppId}
                  className="text-foreground"
                  onChange={e => setManualAppId(e.target.value)}
                  placeholder={t("gameScreen.steamAppIdPlaceholder")}
                />
              </div>
            </div>
          )}
        </div>

        <AlertDialogFooter className="mt-4 flex gap-2">
          {currentAppId && (
            <Button variant="outline" className="text-red-500" onClick={handleClear}>
              {t("gameScreen.clearMatch")}
            </Button>
          )}
          <Button variant="outline" className="text-primary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            className="bg-primary text-secondary"
            onClick={handleSave}
            disabled={!manualAppId}
          >
            {t("common.save")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

// Steam store details by App ID, kept for the session so reopening a game
// doesn't refetch them over the network
const steamAppDataCache = new Map();

export default function GameScreen() {
  const location = useLocation();
  const game = location.state?.gameData;
  if (game?._isStoreOwned)
    return <StoreGameScreen key={`${game.store}:${game.id}`} game={game} />;
  return <InstalledGameScreen />;
}

function InstalledGameScreen() {
  const showError = (game, error) => {
    setErrorGame(game);
    setErrorMessage(error);
    setShowErrorDialog(true);
  };

  const handleGameLaunchError = (_, { game, error }) => {
    showError(game, error);
  };

  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { gameData, libraryPage, returnToFolder } = location.state || {};
  const { settings } = useSettings();
  const { isAuthenticated, user } = useAuth();
  const [game, setGame] = useState(gameData || null);
  const [ascendAccess, setAscendAccess] = useState({
    hasAccess: false,
    isSubscribed: false,
    isVerified: false,
    verified: false,
  });
  const loading = !gameData;
  const initialGameId = gameData?.game || gameData?.name;
  const [imageData, setImageData] = useState(
    () => (initialGameId && gameImageCache.get(initialGameId)) || ""
  );
  const [executableExists, setExecutableExists] = useState(true);
  const canLaunchGame = executableExists;
  const [favorites, setFavorites] = useState(() => {
    const savedFavorites = localStorage.getItem("game-favorites");
    return savedFavorites ? JSON.parse(savedFavorites) : [];
  });
  const [isFavorite, setIsFavorite] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isShiftKeyPressed, setIsShiftKeyPressed] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const liveIsRunning = useGameRunning(game?.game || game?.name);
  const [playtimeJustUpdated, setPlaytimeJustUpdated] = useState(false);
  const [isUninstalling, setIsUninstalling] = useState(false);
  const [isDeleteTransitioning, setIsDeleteTransitioning] = useState(false);
  const [isVerifyingOpen, setIsVerifyingOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSaveDataDialogOpen, setIsSaveDataDialogOpen] = useState(false);
  const [isRestorePromptOpen, setIsRestorePromptOpen] = useState(false);
  const [pendingRestoreStub, setPendingRestoreStub] = useState(null);
  const [backupDialogOpen, setBackupDialogOpen] = useState(false);
  const [showVrWarning, setShowVrWarning] = useState(false);
  const [showOnlineFixWarning, setShowOnlineFixWarning] = useState(false);
  const [showSteamNotRunningWarning, setShowSteamNotRunningWarning] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [soundtrack, setSoundtrack] = useState([]);
  const [soundtrackError, setSoundtrackError] = useState(null);
  const [loadingSoundtrack, setLoadingSoundtrack] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasRated, setHasRated] = useState(true);
  const [showRateDialog, setShowRateDialog] = useState(false);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [errorGame, setErrorGame] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [showExecutableManager, setShowExecutableManager] = useState(false);
  const [showEditGameEntry, setShowEditGameEntry] = useState(false);
  const [showEditGameInfo, setShowEditGameInfo] = useState(false);
  const [showExecutableSelect, setShowExecutableSelect] = useState(false);
  const [availableExecutables, setAvailableExecutables] = useState([]);
  const [pendingLaunchOptions, setPendingLaunchOptions] = useState(null);
  const [steamData, setSteamData] = useState(null);
  const [steamLoading, setSteamLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [assetSearchOpen, setAssetSearchOpen] = useState(false);
  const [launchOptionsDialogOpen, setLaunchOptionsDialogOpen] = useState(false);
  const [launchCommand, setLaunchCommand] = useState("");
  const { setTrack, play } = useAudioPlayer();
  const [isOnLinux, setIsOnLinux] = useState(false);
  const [prefixSize, setPrefixSize] = useState(null);
  const [showResetPrefixDialog, setShowResetPrefixDialog] = useState(false);
  const [isResettingPrefix, setIsResettingPrefix] = useState(false);
  const [umuId, setUmuId] = useState("");
  const [umuIdInput, setUmuIdInput] = useState("");
  const [umuIdSaving, setUmuIdSaving] = useState(false);
  const [umuInstalled, setUmuInstalled] = useState(true); // true by default for other OS

  // Detect Linux platform and load prefix info
  useEffect(() => {
    const platform = window.electron.getPlatform();
    if (platform === "linux") {
      setIsOnLinux(true);
      const gameName = game?.game || game?.name;
      if (gameName) {
        window.electron
          .getPrefixSize(gameName)
          .then(size => {
            setPrefixSize(size);
          })
          .catch(() => {});
      }
      window.electron
        .isUmuInstalled()
        .then(installed => {
          setUmuInstalled(installed);
        })
        .catch(() => {});
    }
  }, [game?.game, game?.name]);

  useEffect(() => {
    if (!isOnLinux || !game) return;
    const gameDir = game.executable
      ? game.executable.substring(0, game.executable.lastIndexOf("/"))
      : null;
    if (!gameDir) return;

    window.electron.umuGetGameId(game.game || game.name).then(id => {
      setUmuId(id || "");
      setUmuIdInput(id || "");
    });

    // Auto-detect if none set
    window.electron.umuAutoDetect(game.game || game.name).then(found => {
      if (found && !umuId) {
        setUmuId(found);
        setUmuIdInput(found);
      }
    });
  }, [isOnLinux, game?.game, game?.name, game?.executable]);

  // Nexus Mods state
  const [supportsModManaging, setSupportsModManaging] = useState(false);
  const [nexusGameData, setNexusGameData] = useState(null);
  const [popularMods, setPopularMods] = useState([]);
  const [modsLoading, setModsLoading] = useState(false);
  const [allMods, setAllMods] = useState([]);
  const [modsTotalCount, setModsTotalCount] = useState(0);
  const [modsPage, setModsPage] = useState(0);
  const [modsSearchQuery, setModsSearchQuery] = useState("");
  const [modsSortBy, setModsSortBy] = useState("endorsements");
  const [selectedMod, setSelectedMod] = useState(null);
  const [modFiles, setModFiles] = useState([]);
  const [modFilesLoading, setModFilesLoading] = useState(false);
  const [showModDetails, setShowModDetails] = useState(false);
  const [showOldVersions, setShowOldVersions] = useState(false);
  const modsPerPage = 12;

  // FLiNG Trainer state
  const [supportsFlingTrainer, setSupportsFlingTrainer] = useState(false);
  const [flingTrainerData, setFlingTrainerData] = useState(null);
  const [isDownloadingTrainer, setIsDownloadingTrainer] = useState(false);
  const [trainerExists, setTrainerExists] = useState(false);
  const [launchWithTrainerEnabled, setLaunchWithTrainerEnabled] = useState(() => {
    const saved = localStorage.getItem(`launch-with-trainer-${game?.game || game?.name}`);
    return saved === "true";
  });

  // Cloud library state
  const [isInCloudLibrary, setIsInCloudLibrary] = useState(false);
  const [cloudLibraryLoading, setCloudLibraryLoading] = useState(true);

  // Achievements state
  const [achievements, setAchievements] = useState(null);
  const [achievementsLoading, setAchievementsLoading] = useState(true);
  const [refreshingAchievements, setRefreshingAchievements] = useState(false);

  // Game update state
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updateCheckLoading, setUpdateCheckLoading] = useState(false);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [isStartingUpdate, setIsStartingUpdate] = useState(false);
  const pendingBrowserUpdate = useRef(null);
  const [importCatalogMatch, setImportCatalogMatch] = useState(null);

  useEffect(() => {
    if (!showUpdateDialog) return;

    const handleInterceptedUpdate = async (_event, url) => {
      if (!pendingBrowserUpdate.current || !url?.startsWith("ascendara://")) return;

      const startUpdate = pendingBrowserUpdate.current;
      pendingBrowserUpdate.current = null;
      try {
        const downloadUrl = decodeURIComponent(url.slice("ascendara://".length));
        if (!["https:", "http:"].includes(new URL(downloadUrl).protocol)) {
          throw new Error("Invalid intercepted update URL");
        }
        await startUpdate(downloadUrl);
      } catch (error) {
        console.error("[GameScreen] Error handling intercepted update:", error);
        toast.error(t("gameScreen.updateFailed"));
      }
    };

    const unsubscribe = window.electron.onInterceptedDownloadUrl(handleInterceptedUpdate);
    return () => {
      pendingBrowserUpdate.current = null;
      unsubscribe();
    };
  }, [showUpdateDialog, game?.game, game?.name, t]);

  // Logo state
  const [logoData, setLogoData] = useState(
    () => (initialGameId && logoImageCache.get(initialGameId)) || null
  );
  const [showLogo, setShowLogo] = useState(() => {
    const saved = localStorage.getItem(`game-show-logo-${game?.game || game?.name}`);
    return saved !== "false";
  });

  // Audio download confirmation state
  const [showAudioDownloadDialog, setShowAudioDownloadDialog] = useState(false);
  const [pendingAudioDownloads, setPendingAudioDownloads] = useState(null);

  // Hero image state for header background
  const [heroImageData, setHeroImageData] = useState(null);
  const [hasGridImage, setHasGridImage] = useState(true);

  // 3-hour purchase prompt state
  const [showPurchasePrompt, setShowPurchasePrompt] = useState(false);
  const [hasShownPurchasePrompt, setHasShownPurchasePrompt] = useState(() => {
    const gameName = game?.game || game?.name;
    return gameName
      ? localStorage.getItem(`purchase-prompt-shown-${gameName}`) === "true"
      : false;
  });

  // GO BACK!

  const BackLibrary = () => {
    if (typeof returnToFolder === "string" && returnToFolder.startsWith("/folderview/")) {
      navigate(returnToFolder, { replace: true });
      return;
    }
    const page = Number(libraryPage);

    if (Number.isInteger(page) && page >= 1) {
      navigate("/library", { replace: true, state: { libraryPage: page } });
      return;
    }

    navigate("/library");
  };

  // Achievements pagination state
  const [achievementsPage, setAchievementsPage] = useState(0);
  const perPage = 12; // 6 rows x 2 columns
  useEffect(() => {
    setAchievementsPage(0);
  }, [achievements]);

  useEffect(() => {
    const handleKeyDown = e => {
      if (e.key === "Shift") {
        setIsShiftKeyPressed(true);
      }
    };

    const handleKeyUp = e => {
      if (e.key === "Shift") {
        setIsShiftKeyPressed(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    // Cleanup
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  useEffect(() => {
    const fetchAchievements = async () => {
      if (!game) {
        setAchievements(null);
        setAchievementsLoading(false);
        return;
      }
      setAchievementsLoading(true);
      try {
        const result = await window.electron.readGameAchievements(
          game.game || game.name,
          game.isCustom
        );
        setAchievements(result);
      } catch (e) {
        setAchievements(null);
      }
      setAchievementsLoading(false);
    };
    fetchAchievements();
  }, [game?.game, game?.name, game?.isCustom]);

  const handleRefreshAchievements = async () => {
    if (!game || refreshingAchievements) return;

    setRefreshingAchievements(true);
    try {
      const oldAchievements = achievements;
      const result = await window.electron.readGameAchievements(
        game.game || game.name,
        game.isCustom
      );

      // Check for newly unlocked achievements
      if (oldAchievements && result && result.achievements) {
        const oldUnlocked = new Set(
          oldAchievements.achievements
            .filter(a => a.achieved)
            .map(a => a.achID || a.message)
        );

        const newUnlocked = result.achievements.filter(
          a => a.achieved && !oldUnlocked.has(a.achID || a.message)
        );

        if (newUnlocked.length > 0) {
          toast.success(
            t("gameScreen.newAchievementsFound", { count: newUnlocked.length }),
            {
              description: newUnlocked.map(a => a.message).join(", "),
            }
          );
        } else {
          toast.success(t("gameScreen.achievementsRefreshed"));
        }
      } else {
        toast.success(t("gameScreen.achievementsRefreshed"));
      }

      setAchievements(result);
    } catch (e) {
      console.error("Error refreshing achievements:", e);
      toast.error(t("gameScreen.refreshAchievementsError"));
    }
    setRefreshingAchievements(false);
  };

  useEffect(() => {
    const init = async () => {
      setIsInitialized(true);
    };
    init();
  }, []);

  // Load game data when component mounts
  useEffect(() => {
    const initializeGameScreen = async () => {
      try {
        // If we don't have game data from location state, navigate back to library
        if (!game) {
          navigate("/library");
          return;
        }
        // The page already has the game from the library, so render it right
        // away and run these checks in the background instead of swapping the
        // whole screen for a spinner while they finish.
        const gameName = game.game || game.name;
        const [exists, running] = await Promise.all([
          game.executable
            ? window.electron.checkFileExists(game.executable).catch(() => true)
            : Promise.resolve(false),
          window.electron.isGameRunning(gameName).catch(() => false),
        ]);
        if (cancelled) return;
        setExecutableExists(exists);
        setIsRunning(running);
      } catch (error) {
        console.error("Error loading game:", error);
      }
    };

    let cancelled = false;
    initializeGameScreen();
    return () => {
      cancelled = true;
    };
  }, [game?.game, game?.name, game?.executable, navigate]);

  // Non-critical work deferred until after the first paint: downloading missing
  // artwork and checking games.json for a deleted-game stub to restore.
  useEffect(() => {
    const gameName = game?.game || game?.name;
    if (!gameName) return;
    let cancelled = false;
    const idle = window.requestIdleCallback || (cb => setTimeout(cb, 200));
    const cancelIdle = window.cancelIdleCallback || clearTimeout;

    const handle = idle(async () => {
      window.electron.ensureGameAssets(gameName);

      try {
        const customGames = await window.electron.getCustomGames();
        if (cancelled) return;
        const stub = (customGames || []).find(g => g._isDeleted && g.game === gameName);
        if (stub) {
          console.log("[GameScreen] Found deleted stub, showing restore prompt:", stub);
          setPendingRestoreStub(stub);
          setIsRestorePromptOpen(true);
        }
      } catch (e) {
        console.warn("[GameScreen] Could not check for deleted stub:", e);
      }
    });

    return () => {
      cancelled = true;
      cancelIdle(handle);
    };
  }, [game?.game, game?.name]);

  // Follow launch/close events instead of polling the main process
  useEffect(() => {
    setIsRunning(liveIsRunning);
  }, [liveIsRunning]);

  // Check for game updates
  useEffect(() => {
    const checkForUpdates = async () => {
      console.log(
        "[GameScreen] checkForUpdates called, game:",
        game?.game,
        "gameID:",
        game?.gameID,
        "version:",
        game?.version,
        "isCustom:",
        game?.isCustom
      );

      if (!game || game.isCustom || !game.gameID) {
        console.log(
          "[GameScreen] Skipping update check - no game, custom game, or no gameID"
        );
        setUpdateInfo(null);
        return;
      }

      setUpdateCheckLoading(true);
      try {
        console.log(
          `[GameScreen] Checking update for ${game.game} (${game.gameID}), version: ${game.version}`
        );
        const result = await gameService.checkGameUpdate(game.gameID, game.version);
        console.log("[GameScreen] Update check result:", result);
        setUpdateInfo(result);
        if (result?.updateAvailable) {
          console.log(
            "[GameScreen] UPDATE AVAILABLE! Latest:",
            result.latestVersion,
            "Local:",
            result.localVersion
          );
        }
      } catch (error) {
        console.error("[GameScreen] Error checking for game update:", error);
        setUpdateInfo(null);
      }
      setUpdateCheckLoading(false);
    };

    checkForUpdates();
  }, [game?.game, game?.gameID, game?.version, game?.isCustom]);

  // Imported (launcher-tied) games don't have version tracking or update checks.
  // Look up a matching Ascendara catalog entry so we can offer switching to a
  // fully managed download instead.
  useEffect(() => {
    let cancelled = false;
    setImportCatalogMatch(null);
    if (!game?.launcher) return;
    gameService
      .findCatalogMatch(game.game)
      .then(match => {
        if (!cancelled) setImportCatalogMatch(match);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [game?.launcher, game?.game]);

  const handleSwitchToAscendaraManaged = () => {
    if (!importCatalogMatch) return;
    pendingLibrarySwapService.add(sanitizeText(importCatalogMatch.game), game.game);
    navigate("/download", { state: { gameData: importCatalogMatch } });
  };

  // Re-fetch Steam data when game changes
  // Steam API is always available (hardcoded), so we always fetch
  // Prefer the saved steamAppId (user-matched/edited) over a name search,
  // otherwise an edited match gets immediately overwritten by a name search.
  useEffect(() => {
    if (!game) return;
    if (game.steamAppId) {
      fetchSteamDataByAppId(game.steamAppId);
    } else {
      fetchSteamData(game.game || game.name);
    }
  }, [game?.steamAppId, game?.game, game?.name]);

  // Set up event listeners
  useEffect(() => {
    if (!isInitialized) return; // Don't set up listeners until initialized

    // Handle cover image updates from the main process
    const handleCoverImageUpdated = (_, data) => {
      if (data && data.game === (game.game || game.name) && data.success) {
        console.log(
          `[GameScreen] Received cover-image-updated IPC event for ${data.game}`
        );
        // Reload the game image with cache busting
        const gameId = game.game || game.name;
        window.electron.getGameImage(gameId, "grid").then(imageBase64 => {
          if (imageBase64) {
            const timestamp = new Date().getTime();
            setImageData(`data:image/jpeg;base64,${imageBase64}?t=${timestamp}`);
          }
        });
      }
    };

    // Handle game assets updates (grid, hero, logo) from SteamGrid
    const handleGameAssetsUpdated = async (_, data) => {
      if (data && data.game === (game.game || game.name) && data.success) {
        console.log(
          `[GameScreen] Received game-assets-updated IPC event for ${data.game}`
        );
        const gameId = game.game || game.name;

        // Fetch the new grid image (no localStorage caching - data URLs blow
        // out the per-origin localStorage quota; IPC reads from disk are fast)
        try {
          const gridBase64 = await window.electron.getGameImage(gameId, "grid");
          if (gridBase64) {
            const dataUrl = `data:image/jpeg;base64,${gridBase64}`;
            setImageData(dataUrl);
          }
        } catch (e) {
          console.error("[GameScreen] Error loading new grid image:", e);
        }

        // Also reload the logo image
        try {
          const logoBase64 = await window.electron.getGameImage(gameId, "logo");
          if (logoBase64) {
            setLogoData(`data:image/png;base64,${logoBase64}`);
          }
        } catch (e) {
          console.error("[GameScreen] Error loading logo:", e);
        }
      }
    };

    const handleGameClosed = async (_, data) => {
      const gameName = game?.game || game?.name;
      if (data?.game !== gameName) return;

      // Pull the freshly-written playTime/launchCount/isRunning/lastPlayed off
      // disk now that the GameHandler has finished updating the game's JSON,
      // so the stats on screen reflect the session that just ended.
      try {
        const freshList = game?.isCustom
          ? await window.electron.getCustomGames()
          : await window.electron.getGames();
        const freshGame = (freshList || []).find(
          g =>
            (g.game || g.name) === gameName &&
            (!game._sourceDir ||
              (g._sourceDir === game._sourceDir && g.executable === game.executable))
        );
        if (freshGame) {
          setGame(prev => (prev ? { ...prev, ...freshGame } : freshGame));
          setPlaytimeJustUpdated(true);
          setTimeout(() => setPlaytimeJustUpdated(false), 1500);
        }
      } catch (e) {
        console.error("[GameScreen] Failed to refresh game stats after close:", e);
      }
    };

    const unsubLaunchError = window.electron.onGameLaunchError(handleGameLaunchError);
    const unsubCoverUpdated = window.electron.onCoverImageUpdated(
      handleCoverImageUpdated
    );
    const unsubAssetsUpdated = window.electron.onGameAssetsUpdated(data =>
      handleGameAssetsUpdated(null, data)
    );
    const unsubGameClosed = window.electron.onGameClosed(handleGameClosed);

    return () => {
      unsubLaunchError();
      unsubCoverUpdated();
      unsubAssetsUpdated();
      unsubGameClosed();
    };
  }, [isInitialized, setShowRateDialog, game]); // Add required dependencies

  // Update favorite status when game or favorites change
  useEffect(() => {
    if (game && favorites) {
      const gameName = game.game || game.name;
      setIsFavorite(favorites.includes(gameName));
    }
  }, [game, favorites]);

  // Check playtime and show purchase prompt after 3 hours (10800 seconds)
  useEffect(() => {
    if (!game || !settings.promptPurchaseAfter3Hours || hasShownPurchasePrompt) return;

    const gameName = game.game || game.name;
    const playTime = game.playTime || 0;

    // Check if playtime is at least 3 hours (10800 seconds)
    if (playTime >= 10800) {
      setShowPurchasePrompt(true);
      // Mark as shown so it doesn't appear again
      localStorage.setItem(`purchase-prompt-shown-${gameName}`, "true");
      setHasShownPurchasePrompt(true);
    }
  }, [game, settings.promptPurchaseAfter3Hours, hasShownPurchasePrompt]);

  // Save favorites when they change
  useEffect(() => {
    localStorage.setItem("game-favorites", JSON.stringify(favorites));
  }, [favorites]);

  // Pick up favorites changed elsewhere (other screens, cloud sync)
  useEffect(() => {
    const handleFavoritesUpdated = () => {
      const saved = localStorage.getItem("game-favorites");
      setFavorites(saved ? JSON.parse(saved) : []);
    };
    window.addEventListener("favorites-updated", handleFavoritesUpdated);
    return () => window.removeEventListener("favorites-updated", handleFavoritesUpdated);
  }, []);

  // Load logo image
  useEffect(() => {
    if (!game) return;
    const gameId = game.game || game.name;

    let isMounted = true;
    const loadLogo = async () => {
      try {
        const logoBase64 = await window.electron.getGameImage(gameId, "logo");
        if (!isMounted) return;
        const dataUrl = logoBase64 ? `data:image/png;base64,${logoBase64}` : null;
        logoImageCache.set(gameId, dataUrl);
        setLogoData(dataUrl);
      } catch (e) {
        if (isMounted) setLogoData(null);
      }
    };

    loadLogo();
    return () => {
      isMounted = false;
    };
  }, [game?.game, game?.name]);

  // Save logo preference
  useEffect(() => {
    if (game) {
      const gameId = game.game || game.name;
      localStorage.setItem(`game-show-logo-${gameId}`, showLogo.toString());
    }
  }, [showLogo, game]);

  // Toggle logo/text display
  const toggleLogoDisplay = () => {
    setShowLogo(prev => !prev);
  };

  // Fetch Khinsider soundtrack when user clicks on soundtrack tab
  const fetchSoundtrack = () => {
    if (!game || soundtrack.length > 0 || loadingSoundtrack) return;
    setSoundtrackError(null);
    const gameName = game.game || game.name;
    const storageKey = `khinsider-soundtrack-${gameName}`;
    const cached = localStorage.getItem(storageKey);
    if (cached) {
      setSoundtrack(JSON.parse(cached));
      setLoadingSoundtrack(false);
    } else {
      setLoadingSoundtrack(true);

      // Create confirmation callback for when >10 tracks need to be fetched
      const confirmFetch = trackCount => {
        return new Promise(resolve => {
          setPendingAudioDownloads({ count: trackCount, resolve });
          setShowAudioDownloadDialog(true);
        });
      };

      getGameSoundtrack(gameName, confirmFetch)
        .then(tracks => {
          setSoundtrack(tracks);
          if (tracks.length > 0) {
            localStorage.setItem(storageKey, JSON.stringify(tracks));
          }
        })
        .catch(error => {
          const status = error.status || error.response?.status;
          setSoundtrackError(
            [403, 429].includes(status) ? "soundtrackBlocked" : "soundtrackFailed"
          );
        })
        .finally(() => setLoadingSoundtrack(false));
    }
  };

  // Load game image with localStorage cache (similar to Library.jsx)
  useEffect(() => {
    // The screen re-renders without a game while it animates out
    if (!game) return;
    let isMounted = true;
    const gameId = game.game || game.name;

    // Image data URLs are NOT cached in localStorage (quota issues). The
    // backend stores cover/grid images on disk and IPC reads are fast.

    const loadGameImage = async () => {
      // 1. Try fetching Grid image from backend first (Priority)
      try {
        const gridBase64 = await window.electron.getGameImage(gameId, "grid");

        if (gridBase64 && isMounted) {
          const dataUrl = `data:image/jpeg;base64,${gridBase64}`;
          gameImageCache.set(gameId, dataUrl);
          setImageData(dataUrl);
          setHasGridImage(true);
          return;
        }
      } catch (e) {}
      if (!isMounted) return;

      // Grid image failed, mark as not available
      setHasGridImage(false);

      // 2. Fallback (Header) - Steam cover URL
      if (steamData?.cover?.url) {
        const coverUrl = steamService.formatImageUrl(steamData.cover.url, "cover_big");
        if (coverUrl && isMounted) {
          setImageData(coverUrl);
          setHasGridImage(true);
          return;
        }
      }

      // 3. Otherwise, fetch from Electron (cover image on disk)
      try {
        const imageBase64 = await window.electron.getGameImage(gameId);
        if (imageBase64 && isMounted) {
          const dataUrl = `data:image/jpeg;base64,${imageBase64}`;
          setImageData(dataUrl);
          setHasGridImage(true);
        }
      } catch (error) {
        console.error("Error loading game image:", error);
      }
    };

    // Listen for game cover update events
    const handleCoverUpdate = event => {
      const { gameName, dataUrl } = event.detail;
      if (gameName === gameId && dataUrl && isMounted) {
        console.log(`[GameScreen] Received cover update for ${gameName}`);
        setImageData(dataUrl);
      }
    };

    // Add event listener for cover updates
    window.addEventListener("game-cover-updated", handleCoverUpdate);

    // Initial load
    loadGameImage();

    return () => {
      isMounted = false;
      // Clean up event listener
      window.removeEventListener("game-cover-updated", handleCoverUpdate);
    };
  }, [game?.game, game?.name, steamData?.cover?.url]); // Add steamData.cover.url as dependency

  // Load hero image when grid image fails
  useEffect(() => {
    if (hasGridImage || !game) return;
    const gameId = game.game || game.name;
    if (heroImageCache.get(gameId)) {
      setHeroImageData(heroImageCache.get(gameId));
      return;
    }
    let isMounted = true;
    const loadHeroImage = async () => {
      try {
        const heroBase64 = await window.electron.getGameImage(gameId, "hero");
        if (heroBase64 && isMounted) {
          const dataUrl = `data:image/jpeg;base64,${heroBase64}`;
          heroImageCache.set(gameId, dataUrl);
          setHeroImageData(dataUrl);
        }
      } catch (e) {
        console.error("Error loading hero image:", e);
      }
    };
    loadHeroImage();
    return () => {
      isMounted = false;
    };
  }, [hasGridImage, game?.game, game?.name]);

  // Keep the prompt in sync with the game's persisted review status.
  useEffect(() => {
    setHasRated(!shouldPromptRating(game));
  }, [
    game?.hasRated,
    game?.isRunning,
    game?.launchCount,
    game?.playTime,
    game?.lastSession?.seconds,
    game?.lastSession?.crashed,
    game?.game,
    game?.name,
  ]);

  // Check Nexus Mods support for the game
  useEffect(() => {
    const checkNexusModSupport = async () => {
      if (game?.game || game?.name) {
        const gameName = game.game || game.name;
        try {
          const result = await nexusModsService.checkModSupport(gameName);
          setSupportsModManaging(result.supported);
          setNexusGameData(result.gameData);

          // If supported and user has Ascend access, fetch mods with pagination
          if (
            result.supported &&
            result.gameData?.domainName &&
            isAuthenticated &&
            ascendAccess.hasAccess
          ) {
            setModsLoading(true);
            const modsResult = await nexusModsService.getMods(
              result.gameData.domainName,
              {
                count: modsPerPage,
                offset: 0,
                sortBy: "endorsements",
              }
            );
            setAllMods(modsResult.mods);
            setModsTotalCount(modsResult.totalCount);
            setModsLoading(false);
          }
        } catch (error) {
          console.error("Error checking Nexus Mods support:", error);
          setSupportsModManaging(false);
        }
      }
    };

    checkNexusModSupport();
  }, [game?.game, game?.name, isAuthenticated, ascendAccess.hasAccess]);

  // Check FLiNG Trainer support for the game
  useEffect(() => {
    let cancelled = false;
    setSupportsFlingTrainer(false);
    setFlingTrainerData(null);
    setTrainerExists(false);
    const checkFlingTrainerSupport = async () => {
      if (game?.game || game?.name) {
        const gameName = game.game || game.name;
        try {
          const result = await flingTrainerService.checkTrainerSupport(gameName);
          if (cancelled) return;
          setSupportsFlingTrainer(result.supported);
          setFlingTrainerData(result.trainerData);

          // Check if trainer file exists in game directory
          const exists = await window.electron.checkTrainerExists(
            gameName,
            game?.isCustom || false
          );
          if (!cancelled) setTrainerExists(exists);
        } catch (error) {
          if (cancelled) return;
          console.error("Error checking FLiNG Trainer support:", error);
          setSupportsFlingTrainer(false);
        }
      }
    };

    checkFlingTrainerSupport();
    return () => {
      cancelled = true;
    };
  }, [game?.game, game?.name, game?.isCustom]);

  // Verify Ascend access
  useEffect(() => {
    const checkAscendAccess = async () => {
      if (!isAuthenticated || !user) {
        setAscendAccess({
          hasAccess: false,
          isSubscribed: false,
          isVerified: false,
          verified: false,
        });
        return;
      }

      try {
        const result = await verifyAscendAccess();
        setAscendAccess({
          hasAccess: result.hasAccess,
          isSubscribed: result.isSubscribed,
          isVerified: result.isVerified,
          verified: result.verified || result.isVerified,
        });
      } catch (error) {
        console.error("Error verifying Ascend access:", error);
        setAscendAccess({
          hasAccess: false,
          isSubscribed: false,
          isVerified: false,
          verified: false,
        });
      }
    };

    checkAscendAccess();
  }, [isAuthenticated, user]);

  // Check if game is in cloud library
  useEffect(() => {
    const checkCloudLibrary = async () => {
      if (!isAuthenticated) {
        setCloudLibraryLoading(false);
        setIsInCloudLibrary(false);
        return;
      }

      const gameName = game?.game || game?.name;
      if (!gameName) {
        setCloudLibraryLoading(false);
        return;
      }

      try {
        const result = await getCloudLibrary();
        if (result.data?.games) {
          const isInCloud = result.data.games.some(
            g => g.name?.toLowerCase() === gameName.toLowerCase()
          );
          setIsInCloudLibrary(isInCloud);
        }
      } catch (error) {
        console.error("Error checking cloud library:", error);
      }
      setCloudLibraryLoading(false);
    };

    checkCloudLibrary();
  }, [game?.game, game?.name, isAuthenticated]);

  // Fetch mods with pagination and search
  const fetchMods = async (page = 0, search = "", sort = "endorsements") => {
    if (!nexusGameData?.domainName) return;

    setModsLoading(true);
    try {
      const result = await nexusModsService.getMods(nexusGameData.domainName, {
        count: modsPerPage,
        offset: page * modsPerPage,
        sortBy: sort,
        searchQuery: search || null,
      });
      setAllMods(result.mods);
      setModsTotalCount(result.totalCount);
    } catch (error) {
      console.error("Error fetching mods:", error);
    }
    setModsLoading(false);
  };

  // Fetch mod files when a mod is selected
  const fetchModFiles = async mod => {
    if (!nexusGameData?.id || !mod?.modId) return;

    setModFilesLoading(true);
    setSelectedMod(mod);
    setShowModDetails(true);
    try {
      const files = await nexusModsService.getModFiles(nexusGameData.id, mod.modId);
      setModFiles(files);
    } catch (error) {
      console.error("Error fetching mod files:", error);
      setModFiles([]);
    }
    setModFilesLoading(false);
  };

  // Handle mod search
  const handleModSearch = e => {
    e.preventDefault();
    setModsPage(0);
    fetchMods(0, modsSearchQuery, modsSortBy);
  };

  // Handle sort change
  const handleSortChange = newSort => {
    setModsSortBy(newSort);
    setModsPage(0);
    fetchMods(0, modsSearchQuery, newSort);
  };

  // Handle page change
  const handleModsPageChange = newPage => {
    setModsPage(newPage);
    fetchMods(newPage, modsSearchQuery, modsSortBy);
  };

  // Download mod file - opens in browser since Nexus requires auth
  const handleDownloadMod = (mod, fileId = null) => {
    const url = nexusModsService.getModDownloadUrl(
      nexusGameData?.domainName,
      mod.modId,
      fileId
    );
    window.electron.openURL(url);
  };

  // Toggle favorite status
  const toggleFavorite = async () => {
    try {
      const gameName = game.game || game.name;

      const updated = isFavorite
        ? favorites.filter(fav => fav !== gameName)
        : [...favorites, gameName];

      // Write through immediately so listeners (library, cloud sync) see it
      localStorage.setItem("game-favorites", JSON.stringify(updated));
      setFavorites(updated);
      window.dispatchEvent(new CustomEvent("favorites-updated"));

      // Update isFavorite state (this will be handled by the useEffect)
    } catch (error) {
      console.error("Error toggling favorite:", error);
    }
  };

  // Format playtime
  const formatPlaytime = playTime => {
    if (playTime === undefined) return t("library.neverPlayed2");

    if (playTime < 60) return t("library.lessThanMinute2");
    if (playTime < 120) return `1 ${t("library.minute")}`;
    if (playTime < 3600) return `${Math.floor(playTime / 60)} ${t("library.minutes")}`;
    if (playTime < 7200) return `1 ${t("library.hour")}`;
    return `${Math.floor(playTime / 3600)} ${t("library.hours")}`;
  };

  // Handle play game
  const handlePlayGame = async (forcePlay = false, specificExecutable = null) => {
    const gameName = game.game || game.name;
    setIsLaunching(true);

    try {
      // First check if game is already running
      const isRunning = await window.electron.isGameRunning(gameName);
      if (isRunning) {
        toast.error(t("library.alreadyRunning", { game: gameName }));
        setIsLaunching(false);
        return;
      }

      // Check if Steam is running for onlinefix
      if (game.online && (await window.electron.isOnWindows())) {
        const hideSteamWarning = localStorage.getItem("hideSteamWarning");
        if (!hideSteamWarning) {
          if (!(await window.electron.isSteamRunning())) {
            toast.error(t("library.steamNotRunning"));
            setIsLaunching(false);
            setShowSteamNotRunningWarning(true);
            return;
          }
        }
      }

      // Check if game is VR and show warning
      if (game.isVr && !forcePlay) {
        setShowVrWarning(true);
        setIsLaunching(false);
        return;
      }

      if (game.online && (game.launchCount < 1 || !game.launchCount)) {
        // Check if warning has been shown before
        const onlineFixWarningShown = localStorage.getItem("onlineFixWarningShown");
        if (!onlineFixWarningShown) {
          setShowOnlineFixWarning(true);
          // Save that warning has been shown
          localStorage.setItem("onlineFixWarningShown", "true");
          setIsLaunching(false);
          return;
        }
      }

      // Check for multiple executables if no specific one was provided
      if (!specificExecutable) {
        const executables = game._sourceDir
          ? game.executables || (game.executable ? [game.executable] : [])
          : await gameUpdateService.getGameExecutables(gameName, game.isCustom);
        if (executables.length > 1) {
          // Store launch options and show selection dialog
          setPendingLaunchOptions({
            forcePlay,
            adminLaunch: isShiftKeyPressed,
          });
          setAvailableExecutables(executables);
          setShowExecutableSelect(true);
          setIsLaunching(false);
          return;
        }
      }

      console.log("Launching game: ", gameName);
      // Cloud-first pre-launch merge: pull the authoritative cloud counters
      // for this game (if any) into the local JSON before the GameHandler
      // starts incrementing. Silent / best-effort — never blocks launch.
      await pullCloudGameDataBeforeLaunch(gameName);

      // Launch the game
      killAudioAndMiniplayer();
      // Use the tracked shift key state for admin privileges
      if (isShiftKeyPressed) {
        console.log("Launching game with admin privileges");
      }
      const result = await window.electron.playGame(
        gameName,
        game.isCustom,
        game.backups ?? false,
        isShiftKeyPressed,
        specificExecutable,
        trainerExists && launchWithTrainerEnabled,
        game._sourceDir
          ? { _sourceDir: game._sourceDir, executable: game.executable }
          : null
      );

      if (result === false || result?.success === false) {
        if (result?.error) showError(gameName, result.error);
        setIsLaunching(false);
        return;
      }

      // Get and cache the game image before saving to recently played
      const imageBase64 = await window.electron.getGameImage(gameName);
      if (imageBase64) {
        await imageCacheService.getImage(game.imgID);
      }

      // Save to recently played games
      recentGamesService.addRecentGame({
        game: gameName,
        name: game.name,
        imgID: game.imgID,
        version: game.version,
        isCustom: game.isCustom,
        online: game.online,
        dlc: game.dlc,
      });

      setIsLaunching(false);
    } catch (error) {
      console.error("Error launching game:", error);
      showError(gameName, error.message);
      setIsLaunching(false);
    }
  };

  // Handle executable selection from dialog
  const handleExecutableSelect = async selectedExecutable => {
    setShowExecutableSelect(false);
    if (selectedExecutable && pendingLaunchOptions) {
      await handlePlayGame(pendingLaunchOptions.forcePlay, selectedExecutable);
    }
    setPendingLaunchOptions(null);
    setAvailableExecutables([]);
  };

  // Handle open directory
  const handleOpenDirectory = async () => {
    if (!game) return;
    await window.electron.openGameDirectory(game.game || game.name, game.isCustom, game);
  };

  // Handle delete game — step 1: confirm delete, then ask about saving data
  const handleDeleteGame = () => {
    setIsDeleteDialogOpen(false);
    if (!game.isCustom) {
      setIsSaveDataDialogOpen(true);
    } else {
      performDeleteGame(false);
    }
  };

  // Step 2: perform the actual deletion (optionally saving data first)
  const performDeleteGame = async saveData => {
    try {
      setIsUninstalling(true);
      const gameId = game.game || game.name;

      if (saveData) {
        await window.electron.saveDeletedGameData(gameId, game);
      }

      // Remove the game from all folders
      const folders = loadFolders();
      const updatedFolders = folders.map(folder => ({
        ...folder,
        items: (folder.items || []).filter(item => (item.game || item.name) !== gameId),
      }));
      saveFolders(updatedFolders);

      // Clean up folder-specific favorites
      try {
        const favoritesObj = JSON.parse(localStorage.getItem("folder-favorites") || "{}");
        let favoritesUpdated = false;

        Object.keys(favoritesObj).forEach(folderKey => {
          if (favoritesObj[folderKey].includes(gameId)) {
            favoritesObj[folderKey] = favoritesObj[folderKey].filter(id => id !== gameId);
            favoritesUpdated = true;
          }
        });

        if (favoritesUpdated) {
          localStorage.setItem("folder-favorites", JSON.stringify(favoritesObj));
        }
      } catch (error) {
        console.error("Error updating folder favorites:", error);
      }

      // Delete the game from the main library
      if (game.isCustom) {
        await window.electron.removeCustomGame(gameId, game);
      } else {
        await window.electron.deleteGame(gameId, game);
      }

      setIsUninstalling(false);
      setIsSaveDataDialogOpen(false);
      setIsDeleteTransitioning(true);
      setTimeout(() => navigate("/library"), 650);
    } catch (error) {
      console.error("Error deleting game:", error);
      setIsUninstalling(false);
    }
  };

  // Handle saving edited Steam info
  const handleEditSteamInfoSave = async (appId, gameName) => {
    const currentGameName = game?.game || game?.name;
    if (!currentGameName) return;

    try {
      // Read current game entry
      const result = await window.electron.readGameEntry(currentGameName, game?.isCustom);
      if (result.success) {
        // Update steamAppId field
        const updatedData = { ...result.data };
        if (appId) {
          updatedData.steamAppId = appId;
        } else {
          delete updatedData.steamAppId;
        }

        // Save updated entry
        const saveResult = await window.electron.writeGameEntry(
          currentGameName,
          updatedData,
          game?.isCustom
        );
        if (saveResult.success) {
          toast.success(t("gameScreen.steamInfoUpdated"));
          // Update local game state
          setGame(prev => ({ ...prev, steamAppId: appId }));
          // Clear current steam data and re-fetch
          setSteamData(null);
          if (appId) {
            // Fetch new data by app ID
            fetchSteamDataByAppId(appId);
          }
        } else {
          toast.error(t("gameScreen.steamInfoUpdateError"));
        }
      }
    } catch (error) {
      console.error("Error saving Steam info:", error);
      toast.error(t("gameScreen.steamInfoUpdateError"));
    }
  };

  // Fetch Steam data by specific App ID
  const fetchSteamDataByAppId = async appId => {
    const cached = steamAppDataCache.get(`${steamService.getDetailsLanguage()}:${appId}`);
    if (cached) {
      setSteamData(cached);
      return;
    }
    try {
      setSteamLoading(true);
      console.log("Fetching Steam data by App ID:", appId);

      const gameDetails = await steamService.getGameDetailByIdSteam(appId);
      if (gameDetails) {
        const formattedData = steamService.formatSteamData(gameDetails);
        if (formattedData.screenshots && formattedData.screenshots.length > 0) {
          formattedData.formatted_screenshots = formattedData.screenshots.map(
            screenshot => ({
              ...screenshot,
              formatted_url: steamService.formatImageUrl(
                screenshot.url,
                "screenshot_huge"
              ),
            })
          );
        }
        console.log("Steam data fetched by App ID:", formattedData.appid);
        steamAppDataCache.set(
          `${steamService.getDetailsLanguage()}:${appId}`,
          formattedData
        );
        setSteamData(formattedData);
      } else {
        console.log("No game data found for App ID:", appId);
        toast.error(t("gameScreen.steamDataNotFound"));
      }
      setSteamLoading(false);
    } catch (error) {
      console.error("Error fetching Steam data by App ID:", error);
      setSteamLoading(false);
    }
  };

  const handleResetPrefix = async () => {
    const gameName = game?.game || game?.name;
    if (!gameName) return;
    setIsResettingPrefix(true);
    try {
      const result = await window.electron.deleteGamePrefix(gameName);
      if (result.success) {
        setPrefixSize(0);
      }
    } catch (e) {
      console.error("Failed to reset prefix:", e);
    }
    setIsResettingPrefix(false);
    setShowResetPrefixDialog(false);
  };

  // Handle close error dialog
  const handleCloseErrorDialog = () => {
    setShowErrorDialog(false);
    setErrorGame("");
    setErrorMessage("");
  };

  // Fetch Steam API data
  const fetchSteamData = async gameName => {
    try {
      setSteamLoading(true);

      // Steam API is always available (hardcoded)
      console.log("Fetching game data from Steam API");

      const data = await steamService.getGameDetails(gameName);

      if (data) {
        if (data.screenshots && data.screenshots.length > 0) {
          data.formatted_screenshots = data.screenshots.map(screenshot => ({
            ...screenshot,
            formatted_url: steamService.formatImageUrl(screenshot.url, "screenshot_huge"),
          }));
        }
        console.log("Steam data fetched, appid:", data.appid);
        setSteamData(data);
      } else {
        console.log("No game data found for:", gameName);
      }

      setSteamLoading(false);
    } catch (error) {
      console.error("Error fetching game data:", error);
      setSteamLoading(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="space-y-4 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  // Game not found
  if (!game) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background">
        <div className="space-y-4 text-center">
          <h1 className="text-2xl font-bold">{t("gameScreen.gameNotFound")}</h1>
          <Button onClick={() => navigate("/library")}>
            {t("gameScreen.backToLibrary")}
          </Button>
        </div>
      </div>
    );
  }

  // Prepare screenshots data from Steam API if available
  const screenshots = steamData?.formatted_screenshots || [];
  const bannerImage = heroImageData || screenshots[0]?.formatted_url || imageData;
  const coverImage = !hasGridImage && heroImageData ? null : imageData;

  const achievementList = achievements?.achievements || [];
  const sections = [
    { id: "overview", label: t("gameScreen.overview"), icon: Info },
    {
      id: "achievements",
      label: t("gameScreen.achievements"),
      icon: Trophy,
      badge:
        achievementList.length > 0
          ? `${achievementList.filter(a => a.achieved).length}/${achievementList.length}`
          : null,
    },
    { id: "soundtrack", label: t("gameScreen.soundtrack"), icon: Music2 },
    // Mods and trainers share one section so the bar stays short
    (supportsModManaging || supportsFlingTrainer) && {
      id: "extras",
      label: [
        supportsModManaging && t("gameScreen.mods"),
        supportsFlingTrainer && t("gameScreen.trainers"),
      ]
        .filter(Boolean)
        .join(" & "),
      icon: supportsModManaging ? Puzzle : Bolt,
    },
  ].filter(Boolean);
  const currentSection = sections.some(section => section.id === activeTab)
    ? activeTab
    : "overview";

  return (
    <div className="mx-auto w-full max-w-7xl pb-24 pt-4 fade-in">
      {/* Toolbar */}
      <div className="mb-4 flex items-center">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-muted-foreground hover:text-foreground"
          onClick={BackLibrary}
        >
          <ChevronLeft className="h-4 w-4" />
          {t("common.back")}
        </Button>
      </div>

      <div className="space-y-4">
        <GameHero
          game={game}
          bannerImage={bannerImage}
          bannerIsCover={bannerImage === imageData}
          coverImage={coverImage}
          logoImage={logoData}
          showLogo={showLogo}
          onToggleLogo={toggleLogoDisplay}
          updateInfo={updateInfo}
          onShowUpdate={() => setShowUpdateDialog(true)}
          playtime={formatPlaytime(game.playTime)}
          playtimeJustUpdated={playtimeJustUpdated}
          executableExists={executableExists}
          isUninstalling={isUninstalling}
          isAuthenticated={isAuthenticated}
          cloudLibraryLoading={cloudLibraryLoading}
          isInCloudLibrary={isInCloudLibrary}
          canSwitchToManaged={!!importCatalogMatch}
          onSwitchToManaged={handleSwitchToAscendaraManaged}
        >
          <GameActions
            game={game}
            canLaunchGame={canLaunchGame}
            executableExists={executableExists}
            isLaunching={isLaunching}
            isRunning={isRunning}
            isUninstalling={isUninstalling}
            onPlay={() => handlePlayGame()}
            onSetExecutable={() => setShowExecutableManager(true)}
            trainerExists={trainerExists}
            launchWithTrainerEnabled={launchWithTrainerEnabled}
            onToggleTrainer={enabled => {
              setLaunchWithTrainerEnabled(enabled);
              localStorage.setItem(
                `launch-with-trainer-${game?.game || game?.name}`,
                enabled.toString()
              );
              toast.success(
                enabled
                  ? t("gameScreen.trainerEnabledToast")
                  : t("gameScreen.trainerDisabledToast")
              );
            }}
            isFavorite={isFavorite}
            onToggleFavorite={toggleFavorite}
            onOpenDirectory={handleOpenDirectory}
            backupEnabled={settings.ludusavi.enabled}
            onBackupSaves={() => setBackupDialogOpen(true)}
            onVerifyFiles={() => setIsVerifyingOpen(true)}
            onLaunchOptions={async () => {
              const commands = await window.electron.getLaunchCommands(
                game.game || game.name,
                game.isCustom
              );
              setLaunchCommand(commands || "");
              setLaunchOptionsDialogOpen(true);
            }}
            onCreateShortcut={async () => {
              const success = await window.electron.createGameShortcut(game);
              if (success) {
                toast.success(t("library.shortcutCreated"));
              } else {
                toast.error(t("library.shortcutError"));
              }
            }}
            onCreateStartMenuShortcut={async () => {
              const success = await window.electron.createStartMenuShortcut(game);
              if (success) {
                toast.success(
                  window.electron.getPlatform?.() === "darwin"
                    ? t("library.addedToApplications")
                    : t("library.startMenuShortcutCreated")
                );
              } else {
                toast.error(t("library.startMenuShortcutError"));
              }
            }}
            showEditEntry={settings.extraGameOptions}
            onEditEntry={() => setShowEditGameEntry(true)}
            isOnLinux={isOnLinux}
            prefixSize={prefixSize}
            onResetPrefix={() => setShowResetPrefixDialog(true)}
            onDelete={() =>
              game.isCustom ? handleDeleteGame() : setIsDeleteDialogOpen(true)
            }
          />
        </GameHero>

        {/* Notices */}
        {isOnLinux && !umuInstalled && (
          <div className="flex items-center gap-3 rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-yellow-500" />
            <p className="text-sm text-yellow-600 dark:text-yellow-400">
              {t("gameScreen.umuLauncherNotInstalled")}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto shrink-0 border-yellow-500/50 text-yellow-600"
              onClick={() => navigate("/settings")}
            >
              {t("gameScreen.installInSettings")}
            </Button>
          </div>
        )}

        {!hasRated && settings.usingLocalIndex && game.gameID && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3">
            <Star className="h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                {t("gameScreen.rateThisGame")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("gameScreen.helpOthers")}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => {
                window.electron.gameRated(game.game || game.name, game.isCustom);
                setHasRated(true);
              }}
            >
              {t("gameScreen.dismiss")}
            </Button>
            <Button
              size="sm"
              className="gap-2 text-secondary"
              onClick={() => setShowRateDialog(true)}
            >
              <ThumbsUp className="h-4 w-4" />
              {t("gameScreen.rateNow")}
            </Button>
          </div>
        )}

        {/* Section navigation */}
        <div
          role="tablist"
          className="flex flex-wrap items-center gap-1 border-b border-border/40"
        >
          {sections.map(section => (
            <button
              key={section.id}
              type="button"
              role="tab"
              aria-selected={currentSection === section.id}
              onClick={() => {
                setActiveTab(section.id);
                if (section.id === "soundtrack") fetchSoundtrack();
              }}
              className={cn(
                "-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                currentSection === section.id
                  ? "rounded-t-md border-primary bg-primary/10 text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <section.icon className="h-4 w-4" />
              {section.label}
              {section.badge && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                  {section.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        <div key={currentSection} className="animate-section-in">
          {currentSection === "overview" && (
            <GameOverviewTab
              game={game}
              steamData={steamData}
              steamLoading={steamLoading}
              screenshots={screenshots}
              onEditGameInfo={() => setShowEditGameInfo(true)}
              isAuthenticated={isAuthenticated}
              onGetAscend={() => navigate("/ascend")}
              isOnLinux={isOnLinux}
              umuId={umuId}
              umuIdInput={umuIdInput}
              onUmuIdInputChange={setUmuIdInput}
              umuIdSaving={umuIdSaving}
              onSaveUmuId={async () => {
                if (!game.executable) return;
                setUmuIdSaving(true);
                const result = await window.electron.umuSetGameId(
                  game.game || game.name,
                  umuIdInput
                );
                if (result.success) {
                  setUmuId(umuIdInput);
                  toast.success(t("gameScreen.umuIdSaved"));
                } else {
                  toast.error(t("gameScreen.umuIdSaveFailed"));
                }
                setUmuIdSaving(false);
              }}
            />
          )}

          {currentSection === "achievements" && (
            <AchievementsTab
              achievements={achievements}
              loading={achievementsLoading}
              refreshing={refreshingAchievements}
              onRefresh={handleRefreshAchievements}
              page={achievementsPage}
              perPage={perPage}
              onPageChange={setAchievementsPage}
            />
          )}

          {currentSection === "soundtrack" && (
            <SoundtrackTab
              gameName={game.game}
              soundtrack={soundtrack}
              loading={loadingSoundtrack}
              error={soundtrackError}
              onRetry={fetchSoundtrack}
              page={currentPage}
              onPageChange={setCurrentPage}
              onPlayTrack={track => {
                // Use the direct URL for audio playback
                setTrack({
                  ...track,
                  url: track.url.replace(
                    "/api/khinsider",
                    "https://downloads.khinsider.com"
                  ),
                });
                play();
              }}
            />
          )}

          {currentSection === "extras" && (
            <ModsTrainersTab
              hasAscendAccess={isAuthenticated && ascendAccess.hasAccess}
              isAuthenticated={isAuthenticated}
              onGetAscend={() => navigate("/ascend")}
              showTrainer={supportsFlingTrainer}
              trainerProps={{
                trainer: flingTrainerData,
                trainerExists,
                isInstalling: isDownloadingTrainer,
                onInstall: async () => {
                  setIsDownloadingTrainer(true);
                  try {
                    const result = await flingTrainerService.downloadTrainerToGame(
                      flingTrainerData,
                      game?.game || game?.name,
                      game?.isCustom || false
                    );
                    if (result.success) {
                      toast.success(t("gameScreen.trainerInstalledSuccess"), {
                        description: t("gameScreen.trainerInstalledDescription"),
                      });
                      // Check if trainer now exists
                      const exists = await window.electron.checkTrainerExists(
                        game?.game || game?.name,
                        game?.isCustom || false
                      );
                      setTrainerExists(exists);
                    } else {
                      toast.error(t("gameScreen.trainerInstallFailed"), {
                        description:
                          result.error || t("gameScreen.trainerInstallFailedDescription"),
                      });
                    }
                  } catch (error) {
                    toast.error(t("gameScreen.trainerInstallFailed"), {
                      description: t("gameScreen.trainerInstallFailedDescription"),
                    });
                  } finally {
                    setIsDownloadingTrainer(false);
                  }
                },
                onDownloadStandalone: async () => {
                  const success = await flingTrainerService.downloadTrainer(
                    flingTrainerData,
                    game?.game || game?.name
                  );
                  if (success) {
                    toast.success(t("gameScreen.trainerDownloadStarted"), {
                      description: t("gameScreen.trainerDownloadStartedDescription"),
                    });
                  } else {
                    toast.error(t("gameScreen.trainerDownloadFailed"));
                  }
                },
                onOpenPage: () => flingTrainerService.openTrainerPage(flingTrainerData),
              }}
              showMods={supportsModManaging}
              modsProps={{
                nexusGameData,
                loading: modsLoading,
                mods: allMods,
                popularMods,
                totalCount: modsTotalCount,
                page: modsPage,
                perPage: modsPerPage,
                searchQuery: modsSearchQuery,
                onSearchQueryChange: setModsSearchQuery,
                onSearch: handleModSearch,
                sortBy: modsSortBy,
                onSortChange: handleSortChange,
                onPageChange: handleModsPageChange,
                onSelectMod: fetchModFiles,
                onBrowse: () => fetchMods(0, "", "endorsements"),
              }}
            />
          )}
        </div>
      </div>

      {/* Mod Details Dialog */}
      <AlertDialog open={showModDetails} onOpenChange={setShowModDetails}>
        <AlertDialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>{selectedMod?.name}</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              {selectedMod?.uploader?.name
                ? `${t("gameScreen.modBy")} ${selectedMod.uploader.name}`
                : t("gameScreen.modDetails")}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4">
            {selectedMod?.pictureUrl && (
              <div className="aspect-video overflow-hidden rounded-lg bg-muted">
                <img
                  src={selectedMod.pictureUrl}
                  alt={selectedMod.name}
                  className="h-full w-full object-cover"
                />
              </div>
            )}

            {selectedMod?.summary && (
              <p className="text-sm text-muted-foreground">{selectedMod.summary}</p>
            )}

            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              {selectedMod?.version && (
                <span className="flex items-center gap-1">
                  <Tag className="h-4 w-4" />v{selectedMod.version}
                </span>
              )}
              {selectedMod?.modCategory?.name && (
                <span className="rounded bg-muted px-2 py-0.5">
                  {selectedMod.modCategory.name}
                </span>
              )}
            </div>

            <Separator />

            {/* Mod Files Section */}
            <div>
              <h3 className="mb-3 font-semibold text-primary">
                {t("gameScreen.modFiles")}
              </h3>
              {modFilesLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : modFiles.length > 0 ? (
                <div className="space-y-2">
                  {/* Current/Main files */}
                  {[...modFiles]
                    .filter(
                      file =>
                        !["OLD_VERSION", "REMOVED", "ARCHIVED"].includes(file.category)
                    )
                    .sort((a, b) => (b.primary || 0) - (a.primary || 0))
                    .map((file, index) => (
                      <div
                        key={file.fileId || index}
                        className={`flex items-center justify-between rounded-lg border p-3 ${
                          file.primary === 1
                            ? "border-primary/50 bg-primary/10"
                            : "bg-card"
                        }`}
                      >
                        <div className="flex-1 overflow-hidden">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-medium text-foreground">
                              {file.name}
                            </p>
                            {file.primary === 1 && (
                              <span className="shrink-0 rounded bg-primary px-1.5 py-0.5 text-xs font-medium text-secondary">
                                {t("gameScreen.mainFile")}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                            {file.version && <span>v{file.version}</span>}
                            {file.sizeInBytes && (
                              <span>
                                {nexusModsService.formatFileSize(file.sizeInBytes)}
                              </span>
                            )}
                            {file.category && <span>{file.category}</span>}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          className="ml-3 gap-1 text-secondary"
                          onClick={() => handleDownloadMod(selectedMod, file.fileId)}
                        >
                          <Download className="h-4 w-4" />
                          {t("gameScreen.downloadFile")}
                        </Button>
                      </div>
                    ))}

                  {/* Hidden categories collapsible sections */}
                  {["OLD_VERSION", "ARCHIVED", "REMOVED"].map(category => {
                    const filesInCategory = modFiles.filter(
                      file => file.category === category
                    );
                    if (filesInCategory.length === 0) return null;

                    const isExpanded = showOldVersions;
                    const categoryLabels = {
                      OLD_VERSION: { key: "oldVersions", icon: Clock },
                      ARCHIVED: { key: "archivedFiles", icon: BookX },
                      REMOVED: { key: "removedFiles", icon: Trash2 },
                    };
                    const { key, icon: Icon } = categoryLabels[category];

                    return (
                      <div key={category} className="mt-4">
                        <button
                          onClick={() => setShowOldVersions(!showOldVersions)}
                          className="flex w-full items-center justify-between rounded-lg border border-dashed bg-muted/30 px-4 py-3 text-sm text-muted-foreground transition-colors hover:bg-muted/50"
                        >
                          <span className="flex items-center gap-2">
                            <Icon className="h-4 w-4" />
                            {t(`gameScreen.${key}`, { count: filesInCategory.length })}
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </button>

                        {isExpanded && (
                          <div className="mt-2 space-y-2">
                            {filesInCategory.map((file, index) => (
                              <div
                                key={file.fileId || index}
                                className="flex items-center justify-between rounded-lg border bg-card/50 p-3 opacity-75"
                              >
                                <div className="flex-1 overflow-hidden">
                                  <div className="flex items-center gap-2">
                                    <p className="truncate font-medium text-foreground">
                                      {file.name}
                                    </p>
                                  </div>
                                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                                    {file.version && <span>v{file.version}</span>}
                                    {file.sizeInBytes && (
                                      <span>
                                        {nexusModsService.formatFileSize(
                                          file.sizeInBytes
                                        )}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="ml-3 gap-1 text-primary"
                                  onClick={() =>
                                    handleDownloadMod(selectedMod, file.fileId)
                                  }
                                >
                                  <Download className="h-4 w-4" />
                                  {t("gameScreen.downloadFile")}
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    {t("gameScreen.noFilesFound")}
                  </p>
                  <Button
                    variant="outline"
                    className="mt-3 gap-2"
                    onClick={() => handleDownloadMod(selectedMod)}
                  >
                    <ExternalLink className="h-4 w-4" />
                    {t("gameScreen.viewOnNexus")}
                  </Button>
                </div>
              )}
            </div>
          </div>

          <AlertDialogFooter className="mt-4">
            <Button
              className="text-primary"
              variant="outline"
              onClick={() => {
                setShowModDetails(false);
                setSelectedMod(null);
                setModFiles([]);
              }}
            >
              {t("common.close")}
            </Button>
            <Button
              className="gap-2 text-secondary"
              onClick={() => handleDownloadMod(selectedMod)}
            >
              <ExternalLink className="h-4 w-4" />
              {t("gameScreen.viewOnNexus")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialogs */}
      <VerifyingGameDialog
        game={game}
        open={isVerifyingOpen}
        onOpenChange={setIsVerifyingOpen}
      />

      <GamesBackupDialog
        game={game}
        open={backupDialogOpen}
        onOpenChange={setBackupDialogOpen}
      />

      {/* Rate game dialog */}
      <GameRate
        game={game}
        isOpen={showRateDialog}
        onRated={() => {
          setHasRated(true);
          setGame(prev => (prev ? { ...prev, hasRated: true } : prev));
        }}
        onClose={() => {
          setShowRateDialog(false);
        }}
      />

      {/* VR Warning Dialog */}
      <AlertDialog
        open={showVrWarning}
        onOpenChange={open => {
          setShowVrWarning(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold text-foreground">
              {t("library.vrWarning.title")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {t("library.vrWarning.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              className="text-xs text-primary"
              onClick={() => {
                setShowVrWarning(false);
                window.electron.openURL(
                  "https://ascendara.app/docs/troubleshooting/vr-games"
                );
              }}
            >
              {t("library.vrWarning.learnMore")}
            </Button>
            <Button
              className="text-secondary"
              onClick={() => {
                setShowVrWarning(false);
                handlePlayGame(true);
              }}
            >
              {t("library.vrWarning.confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Online Fix Warning Dialog */}
      <AlertDialog open={showOnlineFixWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold text-foreground">
              {t("download.onlineFixWarningTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {t("download.onlineFixWarningDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowOnlineFixWarning(false);
                handlePlayGame(true);
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              {t("common.ok")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <GamesBackupDialog
        open={backupDialogOpen}
        onOpenChange={setBackupDialogOpen}
        game={game}
      />

      <ErrorDialog
        open={showErrorDialog}
        onClose={() => setShowErrorDialog(false)}
        errorGame={errorGame}
        errorMessage={errorMessage}
        t={t}
        onManageExecutables={() => setShowExecutableManager(true)}
      />

      <ExecutableManagerDialog
        open={showExecutableManager}
        onSave={async newExecutables => {
          if (newExecutables.length > 0) {
            setGame(prev => ({
              ...prev,
              executable: newExecutables[0],
              executables: newExecutables,
            }));
            const exists = await window.electron.checkFileExists(newExecutables[0]);
            setExecutableExists(exists);
          }
        }}
        onClose={() => setShowExecutableManager(false)}
        gameName={game?.game || game?.name}
        isCustom={game?.isCustom}
        t={t}
      />

      <ExecutableSelectDialog
        open={showExecutableSelect}
        onClose={() => {
          setShowExecutableSelect(false);
          setPendingLaunchOptions(null);
          setAvailableExecutables([]);
        }}
        executables={availableExecutables}
        onSelect={handleExecutableSelect}
        t={t}
      />

      {/* Game Asset Search Dialog */}
      <GameAssetSearchDialog
        open={assetSearchOpen}
        onOpenChange={setAssetSearchOpen}
        gameName={game?.game || game?.name}
        isControllerMode={false}
      />

      {/* Reset Prefix Confirmation Dialog - Linux only */}
      {showResetPrefixDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 max-w-md space-y-4 rounded-xl border border-border bg-background p-6">
            <h3 className={dialogTitleClassName}>{t("gameScreen.resetPrefixTitle")}</h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                {t("gameScreen.resetPrefixDescription", {
                  game: game?.game || game?.name,
                })}
              </p>
              <p>{t("gameScreen.resetPrefixContents")}</p>
              <p className="font-medium text-yellow-500">
                {t("gameScreen.resetPrefixSaveWarning")}
              </p>
              {prefixSize > 0 && (
                <p>
                  {t("gameScreen.resetPrefixDiskSpace", {
                    size:
                      prefixSize < 1024 * 1024 * 1024
                        ? `${(prefixSize / (1024 * 1024)).toFixed(1)} MB`
                        : `${(prefixSize / (1024 * 1024 * 1024)).toFixed(2)} GB`,
                  })}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowResetPrefixDialog(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="destructive"
                onClick={handleResetPrefix}
                disabled={isResettingPrefix}
              >
                {isResettingPrefix
                  ? t("gameScreen.resettingPrefix")
                  : t("gameScreen.deletePrefix")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Uninstall Confirmation Dialog */}
      <UninstallConfirmationDialog
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDeleteGame}
        gameName={game.game}
        open={isDeleteDialogOpen}
        isUninstalling={isUninstalling}
        t={t}
      />

      {/* Delete/Remove transition overlay - eases the trip back to the library */}
      {isDeleteTransitioning && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-md duration-200 animate-in fade-in">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 duration-300 animate-in zoom-in-50">
            <CheckCircle2 className="h-8 w-8 text-primary" />
          </div>
          <p className="text-sm font-medium text-muted-foreground duration-300 animate-in fade-in slide-in-from-bottom-1">
            {game.isCustom ? t("library.removeGameFromLibrary") : t("library.deleteGame")}{" "}
            {(game.game || game.name) && `\u2022 ${game.game || game.name}`}
          </p>
        </div>
      )}

      {/* Restore Game Data Dialog */}
      <AlertDialog open={isRestorePromptOpen} onOpenChange={() => {}}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold text-foreground">
              {t("library.restoreGameDataTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-1">
                <p className="text-sm text-muted-foreground">
                  {t("library.restoreGameDataDescription", {
                    game: game.game || game.name,
                  })}
                </p>
                {pendingRestoreStub?.playTime > 60 &&
                  (() => {
                    const secs = pendingRestoreStub.playTime;
                    const h = Math.floor(secs / 3600);
                    const m = Math.floor((secs % 3600) / 60);
                    const label = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
                    return (
                      <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                        <span className="text-foreground/80">
                          {t("gameScreen.restorePlaytimeSaved", { time: label })}
                        </span>
                      </div>
                    );
                  })()}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2">
            <Button
              variant="outline"
              className="text-primary"
              onClick={async () => {
                try {
                  await window.electron.discardDeletedGameData(game.game || game.name);
                } catch (e) {}
                setIsRestorePromptOpen(false);
                setPendingRestoreStub(null);
              }}
            >
              {t("library.restoreGameDataNo")}
            </Button>
            <Button
              className="text-secondary"
              onClick={async () => {
                try {
                  await window.electron.restoreDeletedGameData(game.game || game.name);
                } catch (e) {}
                setIsRestorePromptOpen(false);
                setPendingRestoreStub(null);
              }}
            >
              {t("library.restoreGameDataYes")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Save Game Data Dialog */}
      <AlertDialog open={isSaveDataDialogOpen} onOpenChange={setIsSaveDataDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold text-foreground">
              {t("library.saveGameDataTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4 text-muted-foreground">
              {t("library.saveGameDataDescription", { game: game.game })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2">
            <Button
              variant="outline"
              className="text-primary"
              onClick={() => performDeleteGame(false)}
              disabled={isUninstalling}
            >
              {t("library.saveGameDataNo")}
            </Button>
            <Button
              className="text-secondary"
              onClick={() => performDeleteGame(true)}
              disabled={isUninstalling}
            >
              {isUninstalling ? (
                <>
                  <Loader className="mr-2 h-4 w-4 animate-spin" />
                  {t("library.deleting")}
                </>
              ) : (
                t("library.saveGameDataYes")
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Steam Not Running Dialog */}
      <SteamNotRunningDialog
        open={showSteamNotRunningWarning}
        onClose={() => setShowSteamNotRunningWarning(false)}
        t={t}
      />

      {/* Audio Fetch Confirmation Dialog */}
      <AudioDownloadConfirmDialog
        open={showAudioDownloadDialog}
        onClose={() => {
          if (pendingAudioDownloads?.resolve) {
            pendingAudioDownloads.resolve(false);
          }
          setShowAudioDownloadDialog(false);
          setPendingAudioDownloads(null);
        }}
        onConfirm={() => {
          if (pendingAudioDownloads?.resolve) {
            pendingAudioDownloads.resolve(true);
          }
          setShowAudioDownloadDialog(false);
          setPendingAudioDownloads(null);
        }}
        onCancel={() => {
          if (pendingAudioDownloads?.resolve) {
            pendingAudioDownloads.resolve(false);
          }
          setShowAudioDownloadDialog(false);
          setPendingAudioDownloads(null);
        }}
        trackCount={pendingAudioDownloads?.count || 0}
        t={t}
      />

      {/* Purchase Prompt Dialog */}
      <PurchasePromptDialog
        open={showPurchasePrompt}
        onClose={() => setShowPurchasePrompt(false)}
        gameName={game?.game || game?.name}
        appId={steamData?.appid}
        t={t}
      />

      {/* Game Update Available Dialog */}
      <AlertDialog open={showUpdateDialog} onOpenChange={setShowUpdateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-bold text-foreground">
              {t("gameScreen.updateAvailable")}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 text-muted-foreground">
                <p>
                  {isAuthenticated && ascendAccess.hasAccess
                    ? t("gameScreen.updateAvailableDescription")
                    : t("gameScreen.updateAvailableDescriptionNoAuth")}
                </p>
                <div className="rounded-lg border bg-muted/50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{t("gameScreen.currentVersion")}</span>
                    <span className="font-mono text-sm font-medium text-foreground">
                      {updateInfo?.localVersion || game?.version || "-"}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-sm">{t("gameScreen.latestVersion")}</span>
                    <span className="font-mono text-sm font-medium text-primary">
                      {updateInfo?.latestVersion || "-"}
                    </span>
                  </div>
                </div>
                {(!isAuthenticated || !ascendAccess.hasAccess) && (
                  <p className="text-xs text-muted-foreground/80">
                    {t("gameScreen.updateManualHint")}
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2">
            <Button
              variant="outline"
              className="text-primary"
              onClick={() => setShowUpdateDialog(false)}
            >
              {t("common.later")}
            </Button>
            <Button
              className="text-secondary"
              disabled={isStartingUpdate}
              onClick={async () => {
                // Check if user has Ascend access - if not, promote Ascend
                if (!isAuthenticated || !ascendAccess.hasAccess) {
                  setShowUpdateDialog(false);
                  navigate("/ascend");
                  return;
                }

                const browserProviders = ["buzzheavier", "megadb"];
                const downloadLinks = updateInfo?.downloadLinks || {};
                const hasBrowserUpdate = browserProviders.some(
                  provider =>
                    Array.isArray(downloadLinks[provider]) &&
                    downloadLinks[provider].some(link => typeof link === "string" && link)
                );

                if (!updateInfo?.autoUpdateSupported && !hasBrowserUpdate) {
                  // No seamless provider, navigate to download page
                  setShowUpdateDialog(false);
                  navigate("/download", {
                    state: {
                      gameData: {
                        game: updateInfo?.gameName || game?.game,
                        gameID: updateInfo?.gameID || game?.gameID,
                        version: updateInfo?.latestVersion,
                        download_links: updateInfo?.downloadLinks,
                        imgID: game?.imgID,
                        isUpdate: true,
                      },
                    },
                  });
                  return;
                }

                // Try seamless providers in priority order from central config
                const seamlessProviders = [...SEAMLESS_PROVIDERS, ...browserProviders];

                let downloadUrl = null;
                let downloadProvider = null;
                for (const provider of seamlessProviders) {
                  const links = downloadLinks[provider];
                  if (Array.isArray(links) && links.length > 0) {
                    const validLink = links.find(
                      link => link && typeof link === "string"
                    );
                    if (validLink) {
                      downloadUrl = validLink.replace(/^(?:https?:)?\/\//, "https://");
                      downloadProvider = provider;
                      console.log(
                        `[GameScreen] Found seamless link from ${provider}:`,
                        downloadUrl
                      );
                      break;
                    }
                  }
                }

                if (!downloadUrl) {
                  // Fallback to download page if no seamless link found
                  setShowUpdateDialog(false);
                  navigate("/download", {
                    state: {
                      gameData: {
                        game: updateInfo?.gameName || game?.game,
                        gameID: updateInfo?.gameID || game?.gameID,
                        version: updateInfo?.latestVersion,
                        download_links: updateInfo?.downloadLinks,
                        imgID: game?.imgID,
                        isUpdate: true,
                      },
                    },
                  });
                  return;
                }

                // Preserve update metadata when a browser provider returns its direct URL.
                const startUpdate = async resolvedUrl => {
                  setIsStartingUpdate(true);
                  try {
                    const gameName = game?.game || game?.name;
                    const dir = await window.electron.getDownloadDirectory();

                    console.log(`[GameScreen] Starting update download for ${gameName}`);
                    await window.electron.downloadFile(
                      resolvedUrl,
                      gameName,
                      game?.online || false,
                      game?.dlc || false,
                      game?.isVr || false,
                      true, // isUpdating
                      updateInfo?.latestVersion || "",
                      game?.imgID,
                      updateInfo?.size || "",
                      dir,
                      game?.gameID || ""
                    );

                    toast.success(t("gameScreen.updateStarted"));
                    setShowUpdateDialog(false);
                    navigate("/downloads");
                  } catch (error) {
                    console.error("[GameScreen] Error starting update:", error);
                    toast.error(t("gameScreen.updateFailed"));
                  } finally {
                    setIsStartingUpdate(false);
                  }
                };

                if (browserProviders.includes(downloadProvider)) {
                  pendingBrowserUpdate.current = startUpdate;
                  try {
                    await window.electron.openURL(downloadUrl, {
                      referrer: "https://steamrip.com/",
                    });
                  } catch (error) {
                    pendingBrowserUpdate.current = null;
                    console.error("[GameScreen] Error opening update provider:", error);
                    toast.error(t("gameScreen.updateFailed"));
                  }
                  return;
                }

                await startUpdate(downloadUrl);
              }}
            >
              {isStartingUpdate ? (
                <Loader className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {isAuthenticated && ascendAccess.hasAccess
                ? isStartingUpdate
                  ? t("gameScreen.startingUpdate")
                  : t("gameScreen.downloadUpdate")
                : t("gameScreen.getAscendToUpdate")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Game Entry Dialog */}
      <EditGameEntryDialog
        open={showEditGameEntry}
        onClose={() => setShowEditGameEntry(false)}
        gameName={game?.game || game?.name}
        isCustom={game?.isCustom}
        t={t}
        isAuthenticated={isAuthenticated}
        onSaved={updatedData => {
          setGame(prev => ({ ...prev, ...updatedData }));
        }}
      />

      {/* Edit Game Info Dialog */}
      <EditGameInfoDialog
        open={showEditGameInfo}
        onClose={() => setShowEditGameInfo(false)}
        gameName={game?.game || game?.name}
        currentAppId={game?.steamAppId || steamData?.appid}
        steamData={steamData}
        t={t}
        onSave={handleEditSteamInfoSave}
        setAssetSearchOpen={setAssetSearchOpen}
      />

      {/* Launch Options Dialog */}
      <AlertDialog
        open={launchOptionsDialogOpen}
        onOpenChange={setLaunchOptionsDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("gameScreen.launchOptions")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("gameScreen.launchOptionsDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={launchCommand}
            className="text-foreground"
            onChange={e => setLaunchCommand(e.target.value)}
            placeholder={t("gameScreen.launchCommandPlaceholder")}
          />
          <AlertDialogFooter>
            <Button
              variant="outline"
              className="text-primary"
              onClick={() => setLaunchOptionsDialogOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              className="text-secondary"
              onClick={async () => {
                const success = await window.electron.saveLaunchCommands(
                  game.game || game.name,
                  launchCommand,
                  game.isCustom
                );
                if (success) {
                  setGame({ ...game, launchCommands: launchCommand });
                  toast.success(t("gameScreen.launchOptionsSaved"));
                } else {
                  toast.error(t("common.error"));
                }
                setLaunchOptionsDialogOpen(false);
              }}
            >
              {t("common.save")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
