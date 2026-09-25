import { PageNavigationContext } from "./big-picture/PageHeader";
import { Toaster, toast } from "sonner";
import { Search, Coffee, ListEnd, X, Menu, Gamepad2 } from "lucide-react";
import { removeFromQueue, addToQueue } from "@/services/downloadQueueService";
import { GameAssetSearchDialog } from "@/components/GameAssetSearchDialog";
import { useBigPicturePage } from "./big-picture/useBigPicturePage";
import { VirtualKeyboard } from "./big-picture/VirtualKeyboard";
import { ExitDialog } from "./big-picture/ExitDialog";
import { ExitBigPictureDialog } from "./big-picture/ExitBigPictureDialog";
import { BigPictureSettingsDialog } from "./big-picture/BigPictureSettingsDialog";
import { SidebarMenu } from "./big-picture/SidebarMenu";
import { PowerSurface } from "./big-picture/PowerSurface";
import { HomeDashboard } from "./big-picture/HomeDashboard";
import { LibrarySurface } from "./big-picture/LibrarySurface";
import { RetroSurface } from "./big-picture/RetroSurface";
import { PreferencesSurface } from "./big-picture/PreferencesSurface";
import "./big-picture/big-picture.css";
import "./big-picture/design-system.css";
import { StoreSearchBar } from "./big-picture/StoreSearchBar";
import { StoreGameCard } from "./big-picture/StoreGameCard";
import { FloatingContextMenu } from "./big-picture/FloatingContextMenu";
import { BrowseSurface } from "./big-picture/BrowseSurface";
import { DownloadsSurface } from "./big-picture/DownloadsSurface";
import { GameDetailsView } from "./big-picture/GameDetailsView";
import { InstalledGameDetailsView } from "./big-picture/InstalledGameDetailsView";
import { KillDownloadDialog } from "./big-picture/KillDownloadDialog";
import { ProviderSelectionDialog } from "./big-picture/ProviderSelectionDialog";
import { QueuePromptDialog } from "./big-picture/QueuePromptDialog";
import { getButtonWidthClass, getButtonBadgeClass } from "./big-picture/controller";
import "@/components/ui/input";
import "@/components/GamesBackupDialog";

function BigPicture() {
  const {
    selectedSort,
    setSelectedSort,
    refreshStore,
    surfaceNavigation,
    handleShowInstalledGameDetails,
    refreshLibrary,
    showKillDialog,
    showProviderDialog,
    isKeyboardOpen,
    storeSearchQuery,
    setStoreSearchQuery,
    setIsKeyboardOpen,
    handleConfirmSearch,
    searchSuggestions,
    handleSelectSuggestion,
    keyboardLayout,
    t,
    settings,
    showExitDialog,
    setShowExitDialog,
    downloadingGame,
    navigate,
    showExitBigPictureDialog,
    setShowExitBigPictureDialog,
    showControllerSettings,
    setShowControllerSettings,
    updateSetting,
    setKeyboardLayout,
    isMenuOpen,
    menuIndex,
    buttons,
    setIsMenuOpen,
    changeView,
    view,
    installedGameView,
    isTransitioning,
    isHomeSidebarActive,
    homeSidebarIndex,
    setIsHomeSidebarActive,
    setHomeSidebarIndex,
    carouselGames,
    carouselIndex,
    setCarouselIndex,
    downloadingGames,
    allGames,
    libraryIndex,
    setLibraryIndex,
    isSearchBarSelected,
    setIsSearchBarSelected,
    filteredStoreGames,
    storeLoading,
    displayedStoreGames,
    storeIndex,
    handleSelectStoreGame,
    loaderRef,
    hasMore,
    contextMenuGame,
    contextMenuPosition,
    downloadsIndex,
    torboxStates,
    handlePauseDownload,
    handleResumeDownload,
    handleKillDownload,
    handleOpenFolder,
    stoppingDownloads,
    resumingDownloads,
    isAuthenticated,
    queuedDownloads,
    selectedStoreGame,
    setIsTransitioning,
    setView,
    setSelectedStoreGame,
    handleStartDownload,
    setProviderDialogGame,
    setProviderDialogProviders,
    setShowProviderDialog,
    providerDialogJustClosed,
    selectedInstalledGame,
    handleCloseInstalledGameDetails,
    setAssetSearchGame,
    setAssetSearchOpen,
    assetSearchOpen,
    gameToKill,
    setShowKillDialog,
    setGameToKill,
    executeKillDownload,
    providerDialogGame,
    providerDialogProviders,
    showQueuePrompt,
    pendingDownloadData,
    setShowQueuePrompt,
    setPendingDownloadData,
    controllerType,
    assetSearchGame,
    showWelcomeAnimation,
  } = useBigPicturePage();
  return (
    <div
      className={`fixed inset-0 z-[9999] flex h-screen w-screen flex-col overflow-hidden bg-background text-primary ${showKillDialog || showProviderDialog ? "pointer-events-none" : ""}`}
    >
      <Toaster
        position="top-center"
        richColors
        toastOptions={{
          style: {
            zIndex: 999999,
            background: "rgba(0, 0, 0, 0.95)",
            border: "2px solid rgba(59, 130, 246, 0.5)",
            color: "white",
            fontSize: "18px",
            fontWeight: "bold",
            padding: "20px 30px",
            borderRadius: "16px",
            boxShadow: "0 10px 40px rgba(0, 0, 0, 0.8), 0 0 20px rgba(59, 130, 246, 0.3)",
            backdropFilter: "blur(10px)",
            minWidth: "400px",
          },
          className: "big-picture-toast",
        }}
      />

      {isKeyboardOpen && (
        <VirtualKeyboard
          value={storeSearchQuery}
          onChange={setStoreSearchQuery}
          onClose={() => setIsKeyboardOpen(false)}
          onConfirm={handleConfirmSearch}
          suggestions={searchSuggestions}
          onSelectSuggestion={handleSelectSuggestion}
          layout={keyboardLayout}
          t={t}
          controllerType={settings.controllerType || "xbox"}
        />
      )}

      {showExitDialog && (
        <ExitDialog
          isOpen={showExitDialog}
          onClose={() => setShowExitDialog(false)}
          onConfirm={() => {
            setShowExitDialog(false);
            if (downloadingGame) {
              navigate("/download", {
                state: {
                  gameData: downloadingGame,
                },
              });
            } else {
              navigate("/");
            }
          }}
          t={t}
          controllerType={settings.controllerType || "xbox"}
        />
      )}

      {showExitBigPictureDialog && (
        <ExitBigPictureDialog
          isOpen={showExitBigPictureDialog}
          onClose={() => setShowExitBigPictureDialog(false)}
          onConfirm={async () => {
            setShowExitBigPictureDialog(false);
            // Exit fullscreen before navigating
            if (document.fullscreenElement) {
              try {
                await document.exitFullscreen();
              } catch (err) {
                console.error("Error exiting fullscreen:", err);
              }
            }
            navigate("/");
          }}
          t={t}
          controllerType={settings.controllerType || "xbox"}
        />
      )}

      {showControllerSettings && (
        <BigPictureSettingsDialog
          isOpen={showControllerSettings}
          onClose={() => setShowControllerSettings(false)}
          t={t}
          currentType={settings.controllerType || "xbox"}
          currentKeyboardLayout={keyboardLayout}
          controllerType={settings.controllerType || "xbox"}
          onTypeChange={newType => {
            updateSetting("controllerType", newType);
            toast.success(`Controller type set to ${newType}`);
          }}
          onKeyboardLayoutChange={newLayout => {
            setKeyboardLayout(newLayout);
            updateSetting("bigPictureKeyboardLayout", newLayout);
            toast.success(`Keyboard layout set to ${newLayout.toUpperCase()}`);
          }}
        />
      )}

      <div
        className={`absolute inset-0 z-[9000] bg-background/60 transition-opacity duration-200 ${isMenuOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <SidebarMenu
        isOpen={isMenuOpen}
        selectedIndex={menuIndex}
        t={t}
        buttons={buttons}
        onItemClick={idx => {
          setIsMenuOpen(false);
          // Menu items: 0=HOME, 1=LIBRARY, 2=CATALOG, 3=DOWNLOADS, 4=SETTINGS, 5=EXIT BIG PICTURE, 6=CLOSE ASCENDARA
          if (idx === 0) {
            changeView("carousel");
          } else if (idx === 1) {
            changeView("library");
          } else if (idx === 2) {
            changeView("store");
          } else if (idx === 3) {
            changeView("downloads");
          } else if (idx === 4) {
            changeView("preferences");
          } else if (idx === 5) {
            setShowExitBigPictureDialog(true);
          } else if (idx === 6) {
            changeView("power");
          } else if (idx === 7) {
            changeView("retro");
          } else if (idx === 8) {
            changeView("profile");
          }

        }}
      />

      <div
        className={`relative flex w-full flex-1 items-center pb-16 transition-all duration-200 ${isMenuOpen ? "scale-95 opacity-50 blur-sm" : ""}`}
      >
        <PageNavigationContext.Provider value={{view, changeView, search: () => setIsKeyboardOpen(true), downloadCount: downloadingGames.length + queuedDownloads.length}}>
        {view === "power" && <PowerSurface navigation={surfaceNavigation} active={!isMenuOpen} onBack={() => changeView("carousel")} onDesktop={() => navigate("/")} />}
        {view === "carousel" && <HomeDashboard navigation={surfaceNavigation} active={!isMenuOpen && !installedGameView && !showControllerSettings && !isKeyboardOpen && !showExitBigPictureDialog} search={() => setIsKeyboardOpen(true)} openMenu={() => setIsMenuOpen(true)} buttons={buttons} pause={handlePauseDownload} resume={handleResumeDownload} stopping={stoppingDownloads} resuming={resumingDownloads} playGame={game => handleShowInstalledGameDetails(game, true)} games={allGames} downloads={downloadingGames} queue={queuedDownloads} discover={filteredStoreGames} openGame={handleShowInstalledGameDetails} openStore={game => handleSelectStoreGame(game, 0)} changeView={changeView} openSettings={() => changeView("preferences")} />}
        {view === "library" && <LibrarySurface navigation={surfaceNavigation} active={!isMenuOpen && !installedGameView} games={allGames} openGame={handleShowInstalledGameDetails} refresh={refreshLibrary} onBack={() => changeView("carousel")} t={t} controllerType={controllerType} keyboardLayout={keyboardLayout} />}
        {view === "retro" && <RetroSurface navigation={surfaceNavigation} active={!isMenuOpen} onBack={() => changeView("carousel")} />}
        {["preferences", "profile"].includes(view) && <PreferencesSurface key={view} navigation={surfaceNavigation} active={!isMenuOpen && !showControllerSettings} profile={view === "profile"} onBack={() => changeView("carousel")} openController={() => setShowControllerSettings(true)} />}

        {view === "store" && <BrowseSurface navigation={surfaceNavigation} active={!isMenuOpen && !isKeyboardOpen} games={filteredStoreGames} loading={storeLoading} query={storeSearchQuery} search={() => setIsKeyboardOpen(true)} clearSearch={() => setStoreSearchQuery("")} sort={selectedSort} setSort={setSelectedSort} openGame={handleSelectStoreGame} onBack={() => changeView("carousel")} retry={refreshStore} />}

        {view === "downloads" && <DownloadsSurface navigation={surfaceNavigation} active={!isMenuOpen && !showKillDialog && !showExitBigPictureDialog} downloads={downloadingGames} queue={queuedDownloads} torboxStates={torboxStates} stopping={stoppingDownloads} resuming={resumingDownloads} pause={handlePauseDownload} resume={handleResumeDownload} cancel={handleKillDownload} openFolder={handleOpenFolder} onBack={() => changeView("carousel")} browse={() => changeView("store")} t={t} buttons={buttons} />}

        </PageNavigationContext.Provider>

        {view === "details" && selectedStoreGame && (
          <div
            className={`absolute inset-0 transition-all duration-300 ease-out ${
              isTransitioning ? "opacity-0 scale-95" : "opacity-100 scale-100"
            }`}
          >
            <GameDetailsView
              game={selectedStoreGame}
              onBack={() => {
                if (isTransitioning) return;
                setIsTransitioning(true);
                setTimeout(() => {
                  setView("store");
                  setSelectedStoreGame(null);
                  setTimeout(() => {
                    setIsTransitioning(false);
                  }, 50);
                }, 200);
              }}
              onDownload={handleStartDownload}
              onShowProviderDialog={(game, providers) => {
                setProviderDialogGame(game);
                setProviderDialogProviders(providers);
                setShowProviderDialog(true);
              }}
              t={t}
              controllerType={settings.controllerType || "xbox"}
              dialogOpen={
                showExitDialog ||
                showProviderDialog ||
                showKillDialog ||
                providerDialogJustClosed.current
              }
            />
          </div>
        )}

        {installedGameView && selectedInstalledGame && (
          <div
            className={`absolute inset-0 transition-all duration-300 ease-out ${
              isTransitioning ? "opacity-0 scale-95" : "opacity-100 scale-100"
            }`}
          >
            <InstalledGameDetailsView
              game={selectedInstalledGame}
              autoLaunch={selectedInstalledGame.bigPictureAutoLaunch}
              onBack={handleCloseInstalledGameDetails}
              t={t}
              controllerType={settings.controllerType || "xbox"}
              onChangeAssets={() => {
                setAssetSearchGame(
                  selectedInstalledGame.game || selectedInstalledGame.name
                );
                setAssetSearchOpen(true);
              }}
              assetSearchOpen={assetSearchOpen}
            />
          </div>
        )}
      </div>

      {/* Kill Download Confirmation Dialog */}
      {showKillDialog && gameToKill && (
        <KillDownloadDialog
          isOpen={showKillDialog}
          game={gameToKill}
          onClose={() => {
            setShowKillDialog(false);
            setGameToKill(null);
          }}
          onConfirm={executeKillDownload}
          t={t}
          controllerType={settings.controllerType || "xbox"}
          isLoading={gameToKill && stoppingDownloads.has(gameToKill.game)}
        />
      )}

      {/* Provider Selection Dialog */}
      {showProviderDialog && providerDialogGame && (
        <ProviderSelectionDialog
          isOpen={showProviderDialog}
          game={providerDialogGame}
          providers={providerDialogProviders}
          onClose={() => {
            setShowProviderDialog(false);
            setProviderDialogGame(null);
            setProviderDialogProviders([]);
            providerDialogJustClosed.current = true;
            setTimeout(() => {
              providerDialogJustClosed.current = false;
            }, 500);
          }}
          onConfirm={provider => {
            setShowProviderDialog(false);
            setProviderDialogGame(null);
            setProviderDialogProviders([]);
            providerDialogJustClosed.current = true;
            setTimeout(() => {
              providerDialogJustClosed.current = false;
            }, 500);
            handleStartDownload(providerDialogGame, provider);
          }}
          t={t}
          controllerType={settings.controllerType || "xbox"}
        />
      )}

      {/* Queue Prompt Dialog */}
      {showQueuePrompt && pendingDownloadData && (
        <QueuePromptDialog
          isOpen={showQueuePrompt}
          onClose={() => {
            setShowQueuePrompt(false);
            setPendingDownloadData(null);
          }}
          onStartNow={async () => {
            setShowQueuePrompt(false);
            if (pendingDownloadData) {
              try {
                await window.electron.downloadFile(
                  pendingDownloadData.url,
                  pendingDownloadData.gameName,
                  pendingDownloadData.online,
                  pendingDownloadData.dlc,
                  pendingDownloadData.isVr,
                  pendingDownloadData.updateFlow,
                  pendingDownloadData.version,
                  pendingDownloadData.imgID,
                  pendingDownloadData.size,
                  pendingDownloadData.additionalDirIndex,
                  pendingDownloadData.gameID
                );
                toast.success(t("bigPicture.downloadStarted"));
                changeView("downloads");
              } catch (error) {
                console.error("Error starting download:", error);
                toast.error(t("bigPicture.downloadError"));
              }
            }
            setPendingDownloadData(null);
          }}
          onAddToQueue={() => {
            if (pendingDownloadData) {
              addToQueue(pendingDownloadData);
              toast.success(t("download.toast.downloadQueued"));
            }
            setShowQueuePrompt(false);
            setPendingDownloadData(null);
          }}
          t={t}
          controllerType={settings.controllerType || "xbox"}
          isAuthenticated={isAuthenticated}
        />
      )}

      {view !== "details" && view !== "carousel" && !isKeyboardOpen && !installedGameView && (
        <div
          className={`bp-footer fixed bottom-0 left-0 right-0 z-[100] flex h-16 items-center justify-between border-t border-white/5 bg-card/90 px-16 shadow-[0_-5px_20px_rgba(0,0,0,0.5)] transition-all duration-200 ${isMenuOpen ? "translate-y-full opacity-0" : "translate-y-0 opacity-100"}`}
        >
          <div
            className="flex cursor-pointer items-center gap-3 font-bold tracking-widest text-primary transition-colors hover:text-primary/80"
            onClick={() => setIsMenuOpen(true)}
          >
            <Menu className="h-6 w-6" />
            <span>{t("bigPicture.menu")}</span>
            <span className="rounded bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              {buttons.menu}
            </span>
          </div>
          <div className="flex gap-12 text-sm font-bold tracking-widest text-primary">
            <div className="flex items-center gap-3">
              <span
                className={`flex h-8 ${getButtonWidthClass(buttons.confirm, "w-8")} items-center justify-center ${getButtonBadgeClass(controllerType)} bg-primary text-xs font-black text-secondary shadow-lg`}
              >
                {buttons.confirm}
              </span>
              {view === "store" && isSearchBarSelected
                ? t("bigPicture.search")
                : view === "store"
                  ? t("bigPicture.select")
                  : t("bigPicture.play")}
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`flex h-8 ${getButtonWidthClass(buttons.cancel, "w-8")} items-center justify-center ${getButtonBadgeClass(controllerType)} border border-border bg-muted text-xs font-black text-muted-foreground`}
              >
                {buttons.cancel}
              </span>
              {view === "carousel" ? t("bigPicture.exit") : t("bigPicture.back")}
            </div>
          </div>
        </div>
      )}

      {/* Game Asset Search Dialog */}
      <GameAssetSearchDialog
        open={assetSearchOpen}
        onOpenChange={setAssetSearchOpen}
        gameName={assetSearchGame}
        isControllerMode={true}
      />

      {/* Welcome Animation Overlay */}
      {showWelcomeAnimation && (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-background"
          style={{
            animation: "fadeOut 0.5s ease-out 1.5s forwards",
          }}
        >
          <style>{`
            @keyframes fadeOut {
              to {
                opacity: 0;
                pointer-events: none;
              }
            }
            @keyframes slideUp {
              from {
                opacity: 0;
                transform: translateY(30px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
            @keyframes scaleIn {
              from {
                opacity: 0;
                transform: scale(0.8);
              }
              to {
                opacity: 1;
                transform: scale(1);
              }
            }
            @keyframes glow {
              0%, 100% {
                box-shadow: 0 0 20px rgba(59, 130, 246, 0.5);
              }
              50% {
                box-shadow: 0 0 40px rgba(59, 130, 246, 0.8);
              }
            }
          `}</style>

          <div className="flex flex-col items-center gap-8">
            {/* Logo/Icon with scale animation */}
            <div
              className="flex h-32 w-32 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/20 to-primary/5 border-2 border-primary/30"
              style={{
                animation: "scaleIn 0.6s ease-out, glow 2s ease-in-out infinite",
              }}
            >
              <Gamepad2 className="h-16 w-16 text-primary" />
            </div>

            {/* Welcome text with slide up animation */}
            <div
              className="flex flex-col items-center gap-4"
              style={{
                animation: "slideUp 0.6s ease-out 0.2s both",
              }}
            >
              <h1 className="text-6xl font-light uppercase tracking-[0.3em] text-primary">
                {t("bigPicture.welcome") || "Welcome"}
              </h1>
              <div className="flex items-center gap-3">
                <div className="h-px w-24 bg-gradient-to-r from-transparent to-primary/50" />
                <p className="text-xl text-muted-foreground uppercase tracking-widest">
                  {t("bigPicture.bigPictureMode") || "Big Picture Mode"}
                </p>
                <div className="h-px w-24 bg-gradient-to-l from-transparent to-primary/50" />
              </div>
            </div>

            {/* Loading indicator */}
            <div
              className="flex gap-2"
              style={{
                animation: "slideUp 0.6s ease-out 0.4s both",
              }}
            >
              <span
                className="h-2 w-2 rounded-full bg-primary/70"
                style={{
                  animation: "pulse 1.5s ease-in-out infinite",
                }}
              />
              <span
                className="h-2 w-2 rounded-full bg-primary/70"
                style={{
                  animation: "pulse 1.5s ease-in-out 0.2s infinite",
                }}
              />
              <span
                className="h-2 w-2 rounded-full bg-primary/70"
                style={{
                  animation: "pulse 1.5s ease-in-out 0.4s infinite",
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BigPicture;
