import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Bolt,
  ChevronDown,
  FileCheck2,
  FileSearch,
  FolderOpen,
  FolderSync,
  Heart,
  LayoutGrid,
  Loader,
  Monitor,
  Pencil,
  Play,
  Settings2,
  StopCircle,
  Trash2,
} from "lucide-react";

const isOnMac = window.electron?.getPlatform?.() === "darwin";

const formatBytes = bytes =>
  bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} KB`
    : bytes < 1024 * 1024 * 1024
      ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
      : `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;

/** Primary play controls plus a single menu for everything that manages the install. */
export default function GameActions({
  game,
  canLaunchGame,
  executableExists,
  isLaunching,
  isRunning,
  isUninstalling,
  onPlay,
  onSetExecutable,
  trainerExists,
  launchWithTrainerEnabled,
  onToggleTrainer,
  isFavorite,
  onToggleFavorite,
  onOpenDirectory,
  backupEnabled,
  onBackupSaves,
  onVerifyFiles,
  onLaunchOptions,
  onCreateShortcut,
  onCreateStartMenuShortcut,
  showEditEntry,
  onEditEntry,
  isOnLinux,
  prefixSize,
  onResetPrefix,
  onDelete,
}) {
  const { t } = useLanguage();

  return (
    <TooltipProvider>
      {canLaunchGame ? (
        <Button
          size="lg"
          className="h-12 min-w-[11rem] gap-2 px-8 text-base text-secondary"
          onClick={() => onPlay()}
          disabled={isLaunching || isRunning}
        >
          {isLaunching ? (
            <>
              <Loader className="h-5 w-5 animate-spin" />
              {t("library.launching")}
            </>
          ) : isRunning ? (
            <>
              <StopCircle className="h-5 w-5" />
              {t("library.running")}
            </>
          ) : (
            <>
              <Play className="h-5 w-5 fill-current" />
              {t("library.play")}
            </>
          )}
        </Button>
      ) : (
        <Button
          size="lg"
          className="h-12 gap-2 px-8 text-base text-secondary"
          onClick={onSetExecutable}
        >
          <FileSearch className="h-5 w-5" />
          {t("library.setExecutable")}
        </Button>
      )}

      {canLaunchGame && trainerExists && (
        <Tooltip>
          <TooltipTrigger asChild>
            <label className="flex h-12 cursor-pointer items-center gap-3 rounded-md border border-input px-4 text-sm font-medium">
              <Bolt className="h-4 w-4 text-primary" />
              {t("gameScreen.launchWithTrainer")}
              <Switch
                checked={launchWithTrainerEnabled}
                onCheckedChange={onToggleTrainer}
              />
            </label>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="max-w-[300px] text-secondary">
              {t("gameScreen.launchWithTrainerDescription")}
            </p>
          </TooltipContent>
        </Tooltip>
      )}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              className="h-12 w-12 p-0 text-muted-foreground hover:text-primary"
              onClick={onToggleFavorite}
              aria-pressed={isFavorite}
            >
              <Heart
                className={cn(
                  "h-5 w-5",
                  isFavorite ? "fill-primary text-primary" : "fill-none"
                )}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-secondary">
              {isFavorite
                ? t("library.removeFromFavorites")
                : t("library.addToFavorites")}
            </p>
          </TooltipContent>
        </Tooltip>

        <Button variant="outline" className="h-12 gap-2" onClick={onOpenDirectory}>
          <FolderOpen className="h-4 w-4" />
          {t("library.openGameDirectory")}
        </Button>

        {/* Non-modal so the dialogs these items open keep working pointer events */}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-12 gap-2">
              <Settings2 className="h-4 w-4" />
              {t("library.manage")}
              {!executableExists && <AlertTriangle className="h-4 w-4 text-yellow-500" />}
              <ChevronDown className="h-4 w-4 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuItem className="gap-2" onSelect={onLaunchOptions}>
              <Bolt className="h-4 w-4" />
              {t("gameScreen.launchOptions")}
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2" onSelect={onSetExecutable}>
              <Pencil className="h-4 w-4" />
              {t("library.changeExecutable")}
              {!executableExists && (
                <AlertTriangle
                  className="ml-auto h-4 w-4 text-yellow-500"
                  title={t("library.executableNotFound")}
                />
              )}
            </DropdownMenuItem>
            {showEditEntry && (
              <DropdownMenuItem className="gap-2" onSelect={onEditEntry}>
                <Settings2 className="h-4 w-4" />
                {t("gameScreen.editGameEntry")}
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />

            <DropdownMenuItem
              className="items-start gap-2"
              disabled={!backupEnabled}
              onSelect={onBackupSaves}
            >
              <FolderSync className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                {t("gameScreen.backupSaves")}
                {!backupEnabled && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("gameScreen.backupSavesDisabledTooltip")}
                  </p>
                )}
              </div>
            </DropdownMenuItem>
            {!game.isCustom && (
              <DropdownMenuItem className="gap-2" onSelect={onVerifyFiles}>
                <FileCheck2 className="h-4 w-4" />
                {t("library.verifyGameFiles")}
              </DropdownMenuItem>
            )}
            {isOnLinux && (
              <DropdownMenuItem className="gap-2" onSelect={onResetPrefix}>
                <FolderSync className="h-4 w-4" />
                {t("gameScreen.resetPrefix")}
                {prefixSize > 0 && (
                  <span className="ml-auto text-xs opacity-60">
                    {formatBytes(prefixSize)}
                  </span>
                )}
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />

            <DropdownMenuItem className="gap-2" onSelect={onCreateShortcut}>
              <Monitor className="h-4 w-4" />
              {t("library.createShortcut")}
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2" onSelect={onCreateStartMenuShortcut}>
              <LayoutGrid className="h-4 w-4" />
              {isOnMac
                ? t("library.addToApplications")
                : t("library.createStartMenuShortcut")}
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              className="gap-2 text-red-500 focus:bg-red-500/10 focus:text-red-500"
              disabled={isUninstalling}
              onSelect={onDelete}
            >
              <Trash2 className="h-4 w-4" />
              {game.isCustom
                ? t("library.removeGameFromLibrary")
                : t("library.deleteGame")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </TooltipProvider>
  );
}
