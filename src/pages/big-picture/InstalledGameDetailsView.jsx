import {
  Info,
  Clock,
  Download,
  Wifi,
  Trophy,
  Bolt,
  Loader,
  StopCircle,
  Play,
  FileSearch,
  FolderOpen,
  Settings,
  Image as ImageIcon,
  ChevronDown,
  FolderSync,
  Monitor,
  Pencil,
  AlertTriangle,
  Trash2,
  Award,
  Check,
  ChevronLeft,
  ChevronRight,
  Save,
  RotateCcw,
  X,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import GamepadFileBrowser from "@/components/GamepadFileBrowser";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { AnimatePresence } from "framer-motion";
import LaunchOverlay from "@/components/LaunchOverlay";
import { useInstalledGameDetails } from "./useInstalledGameDetails";
import { getButtonWidthClass, getButtonBadgeClass } from "./controller";
import { ExecutableManagerDialog } from "./ExecutableManagerDialog";

function InstalledGameDetailsView({
  game,
  onBack,
  t,
  controllerType,
  onChangeAssets,
  assetSearchOpen,
}) {
  const {
    hasHeroImage,
    bgImage,
    showMedia,
    gameName,
    logoSrc,
    playTime,
    formatPlayTime,
    gameDescription,
    loadingMedia,
    achievements,
    setShowAchievements,
    achievementsToggleFocused,
    trainerExists,
    trainerToggleFocused,
    launchWithTrainerEnabled,
    setLaunchWithTrainerEnabled,
    canLaunchGame,
    handlePlayGame,
    isLaunching,
    isRunning,
    selectedButton,
    setShowBrowseExeWarning,
    handleOpenDirectory,
    setShowManagementMenu,
    setSelectedMenuItem,
    hasScreenshots,
    steamData,
    showManagementMenu,
    setBackupDialogOpen,
    selectedMenuItem,
    setShowExecutableManager,
    executableExists,
    handleDeleteGame,
    setIsDeleteDialogOpen,
    showAchievements,
    achievementsLoading,
    paginatedAchievements,
    achievementsPage,
    achievementsPerPage,
    totalAchievementsPages,
    setAchievementsPage,
    showDirectoryBrowser,
    setShowDirectoryBrowser,
    directoryBrowserPath,
    buttons,
    handleInput,
    backupDialogOpen,
    dialogButtonIndex,
    showVrWarning,
    setShowVrWarning,
    showOnlineFixWarning,
    setShowOnlineFixWarning,
    showSteamNotRunningWarning,
    setShowSteamNotRunningWarning,
    showBrowseExeWarning,
    setExecutableExists,
    isDeleteDialogOpen,
    isUninstalling,
    showExecutableSelect,
    setShowExecutableSelect,
    availableExecutables,
    showExecutableManager,
    gridSrc,
  } = useInstalledGameDetails({
    game,
    onBack,
    t,
    controllerType,
    onChangeAssets,
    assetSearchOpen,
  });
  return (
    <div className="fixed inset-0 z-[9998] flex flex-col overflow-hidden bg-background text-primary">
      {hasHeroImage ? (
        // New layout: Full-screen hero background
        <>
          <div
            className="absolute inset-0 z-0 transition-opacity duration-1000"
            style={{
              backgroundImage: bgImage ? `url(${bgImage})` : "none",
              backgroundColor: bgImage ? "transparent" : "#1e293b",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
          <div className="absolute inset-0 z-0 bg-gradient-to-r from-black via-black/70 to-transparent" />
        </>
      ) : (
        // Old layout: Blurred background + card-style image on the right
        <>
          <div
            className="absolute inset-0 z-0 opacity-30 transition-opacity duration-1000"
            style={{
              backgroundImage: bgImage ? `url(${bgImage})` : "none",
              backgroundColor: bgImage ? "transparent" : "#1e293b",
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "blur(60px) saturate(150%)",
            }}
          />
          <div className="absolute inset-0 z-0 bg-gradient-to-r from-[#0e0e10] via-[#0e0e10]/70 to-transparent" />
          <div
            className={`absolute right-0 top-0 z-10 flex h-full w-[55%] items-center justify-center p-12 transition-all duration-500 ease-in-out ${
              showMedia
                ? "pointer-events-none translate-y-[-10%] scale-95 opacity-0"
                : "translate-y-0 scale-100 opacity-100"
            }`}
          >
            <div className="group relative">
              <div className="absolute inset-0 -z-10 translate-y-10 scale-90 rounded-full bg-primary/20 blur-3xl transition-colors duration-500 group-hover:bg-primary/40"></div>
              {bgImage ? (
                <img
                  src={bgImage}
                  alt={gameName}
                  className="max-h-[75vh] max-w-full rotate-2 rounded-2xl border-4 border-white/10 object-cover shadow-2xl transition-all duration-500 ease-out group-hover:rotate-0 group-hover:scale-105"
                />
              ) : (
                <div className="flex h-[60vh] w-[40vw] items-center justify-center rounded-2xl border-4 border-white/10 bg-muted">
                  <span className="text-2xl text-muted-foreground">{gameName}</span>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <div
        className={`relative z-20 h-full w-full transition-transform duration-500 ease-smooth-out ${
          showMedia ? "-translate-y-full" : "translate-y-0"
        }`}
      >
        {/* VIEW 1: DETAILS */}
        <div className="relative h-full w-full flex-shrink-0">
          <div className="flex h-full w-[45%] flex-col justify-center p-16 pl-24">
            {logoSrc ? (
              <div className="mb-6">
                <img
                  src={logoSrc}
                  alt={gameName}
                  className="max-h-80 max-w-full object-contain object-left drop-shadow-2xl"
                />
              </div>
            ) : (
              <h1 className="mb-6 text-6xl font-black leading-tight tracking-tight text-white drop-shadow-lg">
                {gameName}
              </h1>
            )}

            {game.category && game.category.length > 0 && (
              <div className="mb-6 flex flex-wrap gap-3">
                {game.category.slice(0, 4).map((cat, idx) => (
                  <span
                    key={idx}
                    className="rounded-lg border border-white/10 bg-white/10 px-4 py-1.5 text-sm font-bold uppercase tracking-wider text-white backdrop-blur-sm"
                  >
                    {cat}
                  </span>
                ))}
              </div>
            )}

            <div className="mb-8 flex gap-6 text-white/80">
              {game.version && (
                <div className="flex items-center gap-2">
                  <Info className="h-5 w-5" />
                  <span className="font-medium">v{game.version}</span>
                </div>
              )}
              {playTime > 0 && (
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  <span className="font-medium">{formatPlayTime(playTime)}</span>
                </div>
              )}
            </div>

            {gameDescription ? (
              <p className="mb-8 max-w-2xl text-lg leading-relaxed text-white/90">
                {gameDescription}
              </p>
            ) : (
              <p className="mb-8 max-w-2xl text-sm italic text-secondary">
                {loadingMedia
                  ? t("bigPicture.loadingDescription")
                  : t("bigPicture.noDescriptionAvailable")}
              </p>
            )}

            {(game.dlc || game.online) && (
              <div className="mb-8 flex gap-4">
                {game.dlc && (
                  <div className="flex items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/20 px-4 py-2 text-sm font-medium text-purple-300">
                    <Download className="h-4 w-4" />
                    <span>{t("bigPicture.includesDlc")}</span>
                  </div>
                )}
                {game.online && (
                  <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/20 px-4 py-2 text-sm font-medium text-green-300">
                    <Wifi className="h-4 w-4" />
                    <span>{t("bigPicture.onlineFix")}</span>
                  </div>
                )}
              </div>
            )}

            {achievements &&
              achievements.achievements &&
              achievements.achievements.length > 0 && (
                <div
                  onClick={() => setShowAchievements(true)}
                  className={`mb-6 cursor-pointer rounded-xl border-2 p-4 backdrop-blur-sm transition-all duration-200 ${
                    achievementsToggleFocused
                      ? "scale-105 border-primary bg-primary/30 shadow-lg shadow-primary/30 ring-4 ring-primary/50"
                      : "border-white/20 bg-white/10 hover:scale-[1.02] hover:border-primary/40 hover:bg-white/15"
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Trophy className="h-5 w-5 text-primary" />
                      <span className="text-sm font-semibold text-white">
                        {t("gameScreen.achievements")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-bold text-primary">
                        {achievements.achievements.filter(a => a.achieved).length}
                      </span>
                      <span className="text-sm font-medium text-white/70">
                        / {achievements.achievements.length}
                      </span>
                    </div>
                  </div>
                  <div className="relative h-2.5 overflow-hidden rounded-full bg-black/30">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary via-primary to-primary/90 shadow-lg shadow-primary/20 transition-all duration-500"
                      style={{
                        width: `${(achievements.achievements.filter(a => a.achieved).length / achievements.achievements.length) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="mt-2 text-center text-xs font-medium text-white/60">
                    {Math.round(
                      (achievements.achievements.filter(a => a.achieved).length /
                        achievements.achievements.length) *
                        100
                    )}
                    % {t("gameScreen.achievementsUnlocked") || "Complete"}
                  </div>
                </div>
              )}

            {trainerExists && (
              <div
                className={`mb-6 flex items-center justify-between rounded-lg border p-3 backdrop-blur-sm transition-all duration-200 ${
                  trainerToggleFocused
                    ? "scale-105 border-primary bg-primary/20 shadow-lg shadow-primary/30 ring-4 ring-primary/50"
                    : "border-border bg-card/50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Bolt className="h-5 w-5 text-primary" />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-white">
                      {t("gameScreen.launchWithTrainer")}
                    </span>
                    <span className="text-xs text-white/60">
                      {t("gameScreen.launchWithTrainerDescription")}
                    </span>
                  </div>
                </div>
                <Switch
                  checked={launchWithTrainerEnabled}
                  onCheckedChange={enabled => {
                    setLaunchWithTrainerEnabled(enabled);
                    localStorage.setItem(
                      `launch-with-trainer-${gameName}`,
                      enabled.toString()
                    );
                    toast.success(
                      enabled
                        ? t("gameScreen.trainerEnabledToast")
                        : t("gameScreen.trainerDisabledToast")
                    );
                  }}
                />
              </div>
            )}

            <div className="flex gap-4">
              {canLaunchGame ? (
                <button
                  onClick={handlePlayGame}
                  disabled={isLaunching || isRunning}
                  className={`group flex items-center gap-4 rounded-2xl px-10 py-5 text-2xl font-black shadow-xl transition-all duration-200 disabled:opacity-50 disabled:hover:scale-100 ${
                    selectedButton === "play"
                      ? "scale-110 bg-primary text-secondary shadow-primary/50 ring-4 ring-primary/50"
                      : "bg-white text-primary shadow-black/30 hover:scale-105 hover:bg-primary hover:text-secondary"
                  }`}
                >
                  {isLaunching ? (
                    <>
                      <Loader className="h-7 w-7 animate-spin" />
                      <span>{t("bigPicture.launching")}</span>
                    </>
                  ) : isRunning ? (
                    <>
                      <StopCircle className="h-7 w-7" />
                      <span>{t("bigPicture.running")}</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-7 w-7 fill-current" />
                      <span>{t("bigPicture.play")}</span>
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={() => setShowBrowseExeWarning(true)}
                  className={`group flex items-center gap-4 rounded-2xl px-10 py-5 text-2xl font-black shadow-xl transition-all duration-200 ${
                    selectedButton === "play"
                      ? "scale-110 bg-yellow-500 text-secondary shadow-yellow-500/50 ring-4 ring-yellow-500/50"
                      : "bg-yellow-500/80 text-secondary shadow-black/30 hover:scale-105 hover:bg-yellow-500"
                  }`}
                >
                  <FileSearch className="h-7 w-7" />
                  <span>{t("library.setExecutable")}</span>
                </button>
              )}

              <button
                onClick={handleOpenDirectory}
                className={`flex items-center gap-3 rounded-2xl border-2 px-8 py-5 text-xl font-bold backdrop-blur-sm transition-all duration-200 ${
                  selectedButton === "folder"
                    ? "scale-110 border-primary bg-primary/30 text-secondary shadow-lg shadow-primary/30 ring-4 ring-primary/50"
                    : "border-white/20 bg-white/10 text-secondary hover:scale-105 hover:border-white/40 hover:bg-white/20"
                }`}
              >
                <FolderOpen className="h-6 w-6" />
              </button>

              <button
                onClick={() => {
                  setShowManagementMenu(true);
                  setSelectedMenuItem(0);
                }}
                className={`flex items-center gap-3 rounded-2xl border-2 px-8 py-5 text-xl font-bold backdrop-blur-sm transition-all duration-200 ${
                  selectedButton === "manage"
                    ? "scale-110 border-primary bg-primary/30 text-secondary shadow-lg shadow-primary/30 ring-4 ring-primary/50"
                    : "border-white/20 bg-white/10 text-secondary hover:scale-105 hover:border-white/40 hover:bg-white/20"
                }`}
              >
                <Settings className="h-6 w-6" />
              </button>

              <button
                onClick={() => onChangeAssets?.()}
                className={`flex items-center gap-3 rounded-2xl border-2 px-8 py-5 text-xl font-bold backdrop-blur-sm transition-all duration-200 ${
                  selectedButton === "assets"
                    ? "scale-110 border-primary bg-primary/30 text-secondary shadow-lg shadow-primary/30 ring-4 ring-primary/50"
                    : "border-white/20 bg-white/10 text-secondary hover:scale-105 hover:border-white/40 hover:bg-white/20"
                }`}
              >
                <ImageIcon className="h-6 w-6" />
              </button>
            </div>
          </div>

          {hasScreenshots && (
            <div className="absolute bottom-20 left-1/2 z-20 flex -translate-x-1/2 animate-bounce flex-col items-center gap-2 opacity-60">
              <span className="text-xs font-bold uppercase tracking-widest text-secondary">
                {t("bigPicture.screenshots")}
              </span>
              <ChevronDown className="h-6 w-6 text-secondary" />
            </div>
          )}
        </div>

        {/* VIEW 2: MEDIA */}
        <div className="relative flex h-full w-full flex-shrink-0 flex-col">
          <div className="absolute inset-0 -z-10 bg-background/90 backdrop-blur-md" />
          <div className="z-20 flex items-center gap-4 border-b border-white/5 px-24 py-12">
            <ImageIcon className="h-8 w-8 text-primary" />
            <h2 className="text-4xl font-light tracking-wider text-primary">
              {t("bigPicture.screenshots").toUpperCase()}
            </h2>
          </div>

          <div className="no-scrollbar flex-1 overflow-y-auto p-12 px-24 pb-32">
            {steamData?.formatted_screenshots &&
            steamData.formatted_screenshots.length > 0 ? (
              <div className="grid grid-cols-2 gap-6 lg:grid-cols-3">
                {steamData.formatted_screenshots.map((screen, idx) => {
                  const imageUrl =
                    typeof screen === "string"
                      ? screen
                      : screen.path_full || screen.path_thumbnail || screen.url;
                  return (
                    <div
                      key={idx}
                      className="group relative aspect-video overflow-hidden rounded-xl border-2 border-transparent bg-muted transition-all hover:scale-[1.02] hover:border-primary"
                    >
                      <img
                        src={imageUrl}
                        alt={`Screenshot ${idx + 1}`}
                        className="h-full w-full object-cover"
                        loading="lazy"
                        onError={e => {
                          console.log("[Screenshot] Failed to load:", imageUrl);
                          e.target.style.display = "none";
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            ) : loadingMedia ? (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <Loader className="h-8 w-8 animate-spin" />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <p>{t("bigPicture.noScreenshotsAvailable")}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Management Menu Overlay */}
      {showManagementMenu && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="w-[600px] rounded-2xl border-2 border-primary/50 bg-background/95 p-8 shadow-2xl">
            <h2 className="mb-6 text-3xl font-bold text-primary">
              {t("bigPicture.gameManagement") || "Game Management"}
            </h2>
            <div className="space-y-3">
              <button
                onClick={() => {
                  setBackupDialogOpen(true);
                  setShowManagementMenu(false);
                }}
                className={`flex w-full items-center gap-4 rounded-xl p-4 text-left transition-all ${
                  selectedMenuItem === 0
                    ? "bg-primary text-secondary shadow-lg"
                    : "bg-muted hover:bg-muted/80"
                }`}
              >
                <FolderSync className="h-6 w-6" />
                <span className="text-lg font-semibold">
                  {t("gameScreen.backupSaves")}
                </span>
              </button>
              <button
                onClick={() => {
                  window.electron.createGameShortcut(game).then(success => {
                    if (success) toast.success(t("library.shortcutCreated"));
                    else toast.error(t("library.shortcutError"));
                  });
                  setShowManagementMenu(false);
                }}
                className={`flex w-full items-center gap-4 rounded-xl p-4 text-left transition-all ${
                  selectedMenuItem === 1
                    ? "bg-primary text-secondary shadow-lg"
                    : "bg-muted hover:bg-muted/80"
                }`}
              >
                <Monitor className="h-6 w-6" />
                <span className="text-lg font-semibold">
                  {t("library.createShortcut")}
                </span>
              </button>
              <button
                onClick={() => {
                  setShowExecutableManager(true);
                  setShowManagementMenu(false);
                }}
                className={`flex w-full items-center gap-4 rounded-xl p-4 text-left transition-all ${
                  selectedMenuItem === 2
                    ? "bg-primary text-secondary shadow-lg"
                    : "bg-muted hover:bg-muted/80"
                }`}
              >
                <Pencil className="h-6 w-6" />
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold">
                    {t("library.changeExecutable")}
                  </span>
                  {!executableExists && (
                    <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  )}
                </div>
              </button>
              <button
                onClick={() => {
                  if (game.isCustom) {
                    handleDeleteGame();
                  } else {
                    setIsDeleteDialogOpen(true);
                  }
                  setShowManagementMenu(false);
                }}
                className={`flex w-full items-center gap-4 rounded-xl p-4 text-left transition-all ${
                  selectedMenuItem === 3
                    ? "bg-red-500 text-white shadow-lg"
                    : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                }`}
              >
                <Trash2 className="h-6 w-6" />
                <span className="text-lg font-semibold">
                  {game.isCustom
                    ? t("library.removeGameFromLibrary")
                    : t("library.deleteGame")}
                </span>
              </button>
            </div>
            <div className="mt-6 text-center text-sm text-muted-foreground">
              {t("bigPicture.pressBackToClose") || "Press B to close"}
            </div>
          </div>
        </div>
      )}

      {/* Achievements View Overlay */}
      {showAchievements && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md">
          <div className="flex h-[92vh] w-[95vw] flex-col rounded-3xl border-2 border-white/10 bg-gradient-to-br from-background via-background to-background/90 p-10 shadow-2xl">
            <div className="mb-8 flex items-center justify-between border-b border-white/10 pb-6">
              <div className="flex items-center gap-4">
                <div className="rounded-2xl border-2 border-primary/30 bg-primary/10 p-3">
                  <Trophy className="h-10 w-10 text-primary" />
                </div>
                <div>
                  <h2 className="text-5xl font-black text-primary">
                    {t("gameScreen.achievements")}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">{gameName}</p>
                </div>
              </div>
              {achievements && achievements.achievements && (
                <div className="flex flex-col items-end gap-2">
                  <div className="text-3xl">
                    <span className="font-black text-primary">
                      {achievements.achievements.filter(a => a.achieved).length}
                    </span>
                    <span className="mx-2 text-muted-foreground/50">/</span>
                    <span className="font-bold text-muted-foreground">
                      {achievements.achievements.length}
                    </span>
                  </div>
                  <div className="relative h-2 w-48 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-primary/80 shadow-lg shadow-primary/30 transition-all duration-500"
                      style={{
                        width: `${(achievements.achievements.filter(a => a.achieved).length / achievements.achievements.length) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="no-scrollbar flex-1 overflow-y-auto px-2">
              {achievementsLoading ? (
                <div className="flex h-full flex-col items-center justify-center gap-6">
                  <div className="rounded-full border-4 border-primary/20 border-t-primary p-4">
                    <Award className="h-20 w-20 animate-pulse text-primary" />
                  </div>
                  <p className="text-2xl font-bold text-primary">
                    {t("gameScreen.loadingAchievements")}
                  </p>
                </div>
              ) : paginatedAchievements.length > 0 ? (
                <div className="grid grid-cols-2 gap-5 lg:grid-cols-3 xl:grid-cols-4">
                  {paginatedAchievements.map((ach, idx) => {
                    const unlocked = ach.achieved;
                    return (
                      <div
                        key={ach.achID || idx + achievementsPage * achievementsPerPage}
                        className={`group relative flex flex-col items-center rounded-2xl border-2 p-6 shadow-xl transition-all duration-300 hover:scale-[1.02] ${
                          unlocked
                            ? "border-primary/40 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent shadow-primary/20"
                            : "border-white/10 bg-white/5 hover:border-white/20"
                        } min-h-[260px]`}
                      >
                        <div
                          className={`mb-5 flex h-28 w-28 items-center justify-center rounded-xl border-2 p-2 ${
                            unlocked
                              ? "border-primary/30 bg-primary/10"
                              : "border-white/10 bg-white/5"
                          }`}
                        >
                          {ach.icon ? (
                            <img
                              src={ach.icon}
                              alt={ach.message}
                              className={`h-full w-full rounded-lg object-cover transition-all duration-300 ${
                                unlocked
                                  ? ""
                                  : "grayscale opacity-30 group-hover:opacity-50"
                              }`}
                            />
                          ) : (
                            <Award
                              className={`h-16 w-16 ${
                                unlocked ? "text-primary" : "text-white/30"
                              }`}
                            />
                          )}
                        </div>
                        <h3
                          className={`mb-2 text-center text-base font-bold leading-tight ${
                            unlocked ? "text-primary" : "text-muted-foreground"
                          }`}
                        >
                          {ach.message || "Achievement"}
                        </h3>
                        {ach.description && (
                          <p
                            className={`text-center text-xs leading-relaxed ${
                              unlocked ? "text-foreground/80" : "text-muted-foreground/70"
                            }`}
                          >
                            {ach.description}
                          </p>
                        )}
                        {unlocked && (
                          <div className="absolute right-4 top-4 rounded-full bg-primary p-1.5 shadow-lg shadow-primary/50">
                            <Check className="h-5 w-5 text-secondary" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-6">
                  <div className="rounded-full border-2 border-white/10 bg-white/5 p-8">
                    <Trophy className="h-20 w-20 text-white/30" />
                  </div>
                  <p className="text-2xl font-bold text-muted-foreground">
                    {t("gameScreen.noAchievementsFound")}
                  </p>
                </div>
              )}
            </div>

            {totalAchievementsPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-8 border-t border-white/10 pt-6">
                <button
                  onClick={() => setAchievementsPage(prev => Math.max(0, prev - 1))}
                  disabled={achievementsPage === 0}
                  className="flex h-14 w-14 items-center justify-center rounded-xl border-2 border-primary bg-primary/10 text-primary transition-all hover:scale-110 hover:bg-primary hover:text-secondary hover:shadow-lg hover:shadow-primary/30 disabled:cursor-not-allowed disabled:opacity-20 disabled:hover:scale-100"
                >
                  <ChevronLeft className="h-7 w-7" />
                </button>
                <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-white/10 bg-white/5 px-8 py-3">
                  <span className="text-3xl font-black text-primary">
                    {achievementsPage + 1}
                    <span className="mx-2 text-muted-foreground/50">/</span>
                    {totalAchievementsPages}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("common.page")}
                  </span>
                </div>
                <button
                  onClick={() =>
                    setAchievementsPage(prev =>
                      Math.min(totalAchievementsPages - 1, prev + 1)
                    )
                  }
                  disabled={achievementsPage === totalAchievementsPages - 1}
                  className="flex h-14 w-14 items-center justify-center rounded-xl border-2 border-primary bg-primary/10 text-primary transition-all hover:scale-110 hover:bg-primary hover:text-secondary hover:shadow-lg hover:shadow-primary/30 disabled:cursor-not-allowed disabled:opacity-20 disabled:hover:scale-100"
                >
                  <ChevronRight className="h-7 w-7" />
                </button>
              </div>
            )}

            <div className="mt-6 text-center text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {t("bigPicture.pressBackToClose") || "Press B to close"}
            </div>
          </div>
        </div>
      )}

      {/* Directory Browser */}
      {showDirectoryBrowser && (
        <GamepadFileBrowser
          isOpen={showDirectoryBrowser}
          onClose={() => {
            setShowDirectoryBrowser(false);
            window.__bReleasedAt = Date.now();
          }}
          onSelect={undefined}
          initialPath={directoryBrowserPath}
          title={gameName}
          filterExe={false}
          controllerType={controllerType}
          t={t}
        />
      )}

      {/* Footer Controls */}
      <div className="fixed bottom-12 right-16 z-50 flex gap-10 text-sm font-bold tracking-widest text-primary">
        {!showMedia && !isLaunching && !isRunning && (
          <div className="flex items-center gap-3">
            <span
              className={`flex h-10 ${getButtonWidthClass(buttons.confirm, "w-10")} items-center justify-center ${getButtonBadgeClass(controllerType)} bg-primary text-sm font-black text-secondary shadow-lg`}
            >
              {buttons.confirm}
            </span>
            {t("bigPicture.play")}
          </div>
        )}
        {!showMedia && (
          <div className="flex items-center gap-3">
            <span
              className={`flex h-10 ${getButtonWidthClass(buttons.delete, "w-10")} items-center justify-center ${getButtonBadgeClass(controllerType)} border border-border bg-muted text-sm font-black text-muted-foreground`}
            >
              {buttons.delete}
            </span>
            {t("bigPicture.openFolder")}
          </div>
        )}
        <div
          className="flex cursor-pointer items-center gap-3 transition-colors hover:text-primary/80"
          onClick={() => handleInput("BACK")}
        >
          <span
            className={`flex h-10 ${getButtonWidthClass(buttons.cancel, "w-10")} items-center justify-center ${getButtonBadgeClass(controllerType)} border border-border bg-muted text-sm text-muted-foreground`}
          >
            {buttons.cancel}
          </span>{" "}
          {showMedia ? t("bigPicture.upBack") : t("bigPicture.back")}
        </div>
      </div>

      {/* Warning and Management Dialogs */}
      {/* Simplified Backup Dialog for BigPicture */}
      <AlertDialog open={backupDialogOpen} onOpenChange={setBackupDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <FolderSync className="h-5 w-5 text-primary" />
              {t("gameScreen.backupSaves")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("library.backups.bigPictureMessage") ||
                "Use UP/DOWN to navigate, A to select, B to cancel"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            <button
              className={`flex w-full items-center gap-4 rounded-xl p-4 text-left transition-all duration-200 ${
                dialogButtonIndex === 0
                  ? "scale-105 bg-primary text-secondary shadow-lg shadow-primary/30 ring-4 ring-primary/50"
                  : "bg-muted hover:bg-muted/80"
              }`}
            >
              <Save className="h-6 w-6" />
              <span className="text-lg font-semibold">
                {t("library.backups.backupNow", { game: gameName })}
              </span>
            </button>
            <button
              className={`flex w-full items-center gap-4 rounded-xl p-4 text-left transition-all duration-200 ${
                dialogButtonIndex === 1
                  ? "scale-105 bg-primary text-secondary shadow-lg shadow-primary/30 ring-4 ring-primary/50"
                  : "bg-muted hover:bg-muted/80"
              }`}
            >
              <RotateCcw className="h-6 w-6" />
              <span className="text-lg font-semibold">
                {t("library.backups.restoreLatest")}
              </span>
            </button>
            <button
              className={`flex w-full items-center gap-4 rounded-xl p-4 text-left transition-all duration-200 ${
                dialogButtonIndex === 2
                  ? "scale-105 bg-primary text-secondary shadow-lg shadow-primary/30 ring-4 ring-primary/50"
                  : "bg-muted hover:bg-muted/80"
              }`}
            >
              <X className="h-6 w-6" />
              <span className="text-lg font-semibold">{t("common.close")}</span>
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* VR Warning Dialog */}
      <AlertDialog open={showVrWarning} onOpenChange={setShowVrWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("library.vrWarning.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("library.vrWarning.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setShowVrWarning(false)}>
              {t("common.cancel")}
            </Button>
            <Button
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
      <AlertDialog open={showOnlineFixWarning} onOpenChange={setShowOnlineFixWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("download.onlineFixWarningTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("download.onlineFixWarningDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              onClick={() => {
                setShowOnlineFixWarning(false);
                handlePlayGame(true);
              }}
            >
              {t("common.ok")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Steam Not Running Dialog */}
      <AlertDialog
        open={showSteamNotRunningWarning}
        onOpenChange={setShowSteamNotRunningWarning}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("library.steamNotRunning")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("library.steamNotRunningDescription") ||
                "Steam needs to be running to play online-fix games. Please start Steam and try again."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button onClick={() => setShowSteamNotRunningWarning(false)}>
              {t("common.ok")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Browse Executable - GamepadFileBrowser direct */}
      <ExecutableManagerDialog
        open={showBrowseExeWarning}
        onClose={() => {
          setShowBrowseExeWarning(false);
          window.__bReleasedAt = Date.now();
        }}
        gameName={gameName}
        isCustom={game.isCustom}
        t={t}
        bigPictureMode={true}
        onSave={exeList => {
          if (exeList && exeList.length > 0) {
            setExecutableExists(true);
            toast.success(
              t("library.executableUpdated") || "Executable updated successfully"
            );
          }
        }}
      />

      {/* Delete Confirmation Dialog - BigPicture Style */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-2xl">
              <AlertTriangle className="h-6 w-6 text-red-500" />
              {t("library.deleteGameConfirm", { game: gameName })}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              {t("library.deleteGameDescription", { game: gameName })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-4 py-4">
            <button
              onClick={undefined}
              disabled={isUninstalling}
              className={`flex flex-1 items-center justify-center gap-3 rounded-xl p-4 text-lg font-semibold transition-all duration-200 ${
                dialogButtonIndex === 0
                  ? "scale-105 bg-primary text-secondary shadow-lg shadow-primary/30 ring-4 ring-primary/50"
                  : "bg-muted hover:bg-muted/80"
              } ${isUninstalling ? "cursor-not-allowed opacity-50" : ""}`}
            >
              <X className="h-6 w-6" />
              <span>{t("common.cancel")}</span>
            </button>
            <button
              onClick={undefined}
              disabled={isUninstalling}
              className={`flex flex-1 items-center justify-center gap-3 rounded-xl p-4 text-lg font-semibold transition-all duration-200 ${
                dialogButtonIndex === 1
                  ? "scale-105 bg-red-500 text-white shadow-lg shadow-red-500/30 ring-4 ring-red-500/50"
                  : "bg-red-500/80 text-white hover:bg-red-500"
              } ${isUninstalling ? "cursor-not-allowed opacity-50" : ""}`}
            >
              {isUninstalling ? (
                <>
                  <Loader className="h-6 w-6 animate-spin" />
                  <span>{t("library.deleting")}</span>
                </>
              ) : (
                <>
                  <Trash2 className="h-6 w-6" />
                  <span>{t("library.delete")}</span>
                </>
              )}
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Executable Selection Dialog - BigPicture Style */}
      <AlertDialog open={showExecutableSelect} onOpenChange={setShowExecutableSelect}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-2xl">
              <FileSearch className="h-6 w-6 text-primary" />
              {t("library.selectExecutable")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("library.selectExecutableDescription") ||
                "Multiple executables found. Please select which one to launch."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-4">
            {availableExecutables.map((exe, index) => (
              <button
                key={index}
                onClick={undefined}
                className={`flex w-full items-center gap-4 rounded-xl p-4 text-left transition-all duration-200 ${
                  dialogButtonIndex === index
                    ? "scale-105 bg-primary text-secondary shadow-lg shadow-primary/30 ring-4 ring-primary/50"
                    : "bg-muted hover:bg-muted/80"
                }`}
              >
                <FileSearch className="h-6 w-6" />
                <div className="flex-1">
                  <div className="text-lg font-semibold">{exe.split(/[/\\]/).pop()}</div>
                  <div className="truncate text-sm text-muted-foreground">{exe}</div>
                </div>
                {index === 0 && (
                  <span className="shrink-0 rounded bg-primary/20 px-2 py-1 text-xs font-medium">
                    {t("library.executableManager.primary")}
                  </span>
                )}
              </button>
            ))}
            <button
              onClick={undefined}
              className={`flex w-full items-center gap-4 rounded-xl p-4 text-left transition-all duration-200 ${
                dialogButtonIndex === availableExecutables.length
                  ? "scale-105 bg-primary text-secondary shadow-lg shadow-primary/30 ring-4 ring-primary/50"
                  : "bg-muted hover:bg-muted/80"
              }`}
            >
              <X className="h-6 w-6" />
              <span className="text-lg font-semibold">{t("common.cancel")}</span>
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Executable Manager Dialog */}
      <ExecutableManagerDialog
        open={showExecutableManager}
        onClose={() => setShowExecutableManager(false)}
        gameName={gameName}
        isCustom={game.isCustom}
        t={t}
        bigPictureMode={true}
        onSave={async executables => {
          // Update executable existence check
          if (executables && executables.length > 0) {
            const exists = await window.electron.checkFileExists(executables[0]);
            setExecutableExists(exists);
          }
        }}
      />

      <AnimatePresence>
        {isLaunching && (
          <LaunchOverlay
            isVisible={true}
            gameName={gameName}
            logoSrc={logoSrc}
            gridSrc={gridSrc}
            bgSrc={bgImage}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export { InstalledGameDetailsView };
