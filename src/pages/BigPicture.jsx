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
import { HomeSidebar } from "./big-picture/HomeSidebar";
import { GameCard } from "./big-picture/GameCard";
import { ActiveDownloadsBar } from "./big-picture/ActiveDownloadsBar";
import { StoreSearchBar } from "./big-picture/StoreSearchBar";
import { StoreGameCard } from "./big-picture/StoreGameCard";
import { FloatingContextMenu } from "./big-picture/FloatingContextMenu";
import { BigPictureDownloadCard } from "./big-picture/BigPictureDownloadCard";
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
            setShowControllerSettings(true);
          } else if (idx === 5) {
            setShowExitBigPictureDialog(true);
          } else if (idx === 6) {
            if (window.electron && window.electron.closeApp) {
              window.electron.closeApp();
            } else {
              window.close();
            }
          }
        }}
      />

      {view !== "details" && !installedGameView && (
        <div
          className={`absolute left-24 top-16 z-20 transition-all duration-200 ${isMenuOpen || isKeyboardOpen ? "opacity-50 blur-sm" : ""}`}
        >
          <h1 className="flex items-center gap-4 text-3xl font-light uppercase tracking-[0.2em] text-primary">
            <span className="h-1 w-12 rounded-full bg-primary shadow-[0_0_15px_hsl(var(--primary)/0.8)]"></span>
            {view === "library"
              ? t("bigPicture.library")
              : view === "store"
                ? t("bigPicture.catalog")
                : view === "downloads"
                  ? t("bigPicture.downloads")
                  : t("bigPicture.home")}
          </h1>
        </div>
      )}

      <div
        className={`relative flex w-full flex-1 items-center pb-16 transition-all duration-200 ${isMenuOpen ? "scale-95 opacity-50 blur-sm" : ""}`}
      >
        {view === "carousel" && (
          <div
            className={`absolute inset-0 flex w-full flex-1 items-center pb-16 transition-all duration-300 ease-out ${
              isTransitioning
                ? "opacity-0 translate-x-[-50px]"
                : "opacity-100 translate-x-0"
            }`}
          >
            {/* Home screen sidebar navigation */}
            <HomeSidebar
              selectedIndex={isHomeSidebarActive ? homeSidebarIndex : -1}
              t={t}
              onItemClick={idx => {
                if (idx === 0) {
                  changeView("carousel");
                } else if (idx === 1) {
                  changeView("library");
                } else if (idx === 2) {
                  changeView("store");
                } else if (idx === 3) {
                  changeView("downloads");
                } else if (idx === 4) {
                  // Exit Big Picture - always show exit confirmation dialog
                  setShowExitBigPictureDialog(true);
                }
                setIsHomeSidebarActive(false);
                setHomeSidebarIndex(-1);
              }}
              isVisible={!isKeyboardOpen && !isMenuOpen}
              buttons={buttons}
              controllerType={settings.controllerType || "xbox"}
            />

            <div
              id="big-picture-scroll-container"
              className="no-scrollbar flex h-[65vh] w-screen max-w-[100vw] items-center overflow-x-auto overflow-y-visible scroll-smooth px-24"
            >
              <div className="flex h-[42vh] items-center gap-4 pl-6 pt-12">
                {carouselGames.map((game, index) => (
                  <GameCard
                    key={index}
                    game={game}
                    index={index}
                    isSelected={index === carouselIndex && !isMenuOpen}
                    onClick={() => setCarouselIndex(index)}
                    isGridMode={false}
                    t={t}
                  />
                ))}
                <div className="w-[60vw] flex-shrink-0"></div>
              </div>
            </div>
            {/* Show active downloads in carousel view */}
            <ActiveDownloadsBar downloads={downloadingGames} t={t} />
          </div>
        )}

        {view === "library" && (
          <div
            className={`absolute inset-0 no-scrollbar h-full w-full overflow-y-auto scroll-smooth px-24 pb-8 pt-32 transition-all duration-300 ease-out ${
              isTransitioning
                ? "opacity-0 translate-x-[50px]"
                : "opacity-100 translate-x-0"
            }`}
          >
            <div className="grid grid-cols-6 gap-6">
              {allGames.map((game, index) => (
                <GameCard
                  key={index}
                  game={game}
                  index={index}
                  isSelected={index === libraryIndex && !isMenuOpen}
                  onClick={() => setLibraryIndex(index)}
                  isGridMode={true}
                  t={t}
                />
              ))}
            </div>
          </div>
        )}

        {view === "store" && (
          <div
            className={`absolute inset-0 no-scrollbar flex h-full w-full flex-col overflow-y-auto scroll-smooth px-24 pt-28 transition-all duration-300 ease-out ${
              isTransitioning
                ? "opacity-0 translate-x-[50px]"
                : "opacity-100 translate-x-0"
            }`}
          >
            <div className="mb-4 flex-shrink-0">
              <StoreSearchBar
                isSelected={isSearchBarSelected && !isMenuOpen && !isKeyboardOpen}
                searchQuery={storeSearchQuery}
                onClick={() => {
                  setIsSearchBarSelected(true);
                  setIsKeyboardOpen(true);
                }}
                t={t}
                buttons={buttons}
              />
              {storeSearchQuery && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {filteredStoreGames.length}{" "}
                  {filteredStoreGames.length > 1
                    ? t("bigPicture.resultsForPlural")
                    : t("bigPicture.resultsFor")}{" "}
                  "{storeSearchQuery}"
                </p>
              )}
            </div>

            {storeLoading ? (
              <div className="flex flex-1 items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                  <div className="h-16 w-16 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
                  <p className="text-xl text-muted-foreground">
                    {t("bigPicture.loadingCatalog")}
                  </p>
                </div>
              </div>
            ) : filteredStoreGames.length === 0 ? (
              <div className="flex flex-1 items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                  <Search className="h-16 w-16 text-primary" />
                  <p className="text-xl text-muted-foreground">
                    {storeSearchQuery
                      ? t("bigPicture.noGameFound")
                      : t("bigPicture.noGameAvailable")}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-6 gap-6 pb-4">
                  {displayedStoreGames.map((game, index) => (
                    <div
                      key={game.imgID || `store-${index}`}
                      data-store-card
                      className={
                        index === storeIndex && !isSearchBarSelected && !isMenuOpen
                          ? "relative z-10"
                          : undefined
                      }
                    >
                      <StoreGameCard
                        game={game}
                        isSelected={
                          index === storeIndex && !isSearchBarSelected && !isMenuOpen
                        }
                        onClick={() => handleSelectStoreGame(game, index)}
                      />
                    </div>
                  ))}
                </div>
                <div ref={loaderRef} className="flex w-full justify-center py-10">
                  {hasMore && (
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary"></div>
                  )}
                </div>
              </>
            )}

            {/* Floating Context Menu - Shows after 1 second of selection */}
            {contextMenuGame &&
              contextMenuPosition &&
              !isSearchBarSelected &&
              !isMenuOpen && (
                <FloatingContextMenu
                  game={contextMenuGame}
                  position={contextMenuPosition}
                  t={t}
                />
              )}
          </div>
        )}

        {view === "downloads" && (
          <div
            className={`absolute inset-0 no-scrollbar h-full w-full overflow-y-auto scroll-smooth px-24 pb-8 pt-32 transition-all duration-300 ease-out ${
              isTransitioning
                ? "opacity-0 translate-x-[50px]"
                : "opacity-100 translate-x-0"
            } ${downloadingGames.length === 0 ? "flex items-center justify-center" : ""}`}
          >
            {downloadingGames.length === 0 ? (
              <div className="relative">
                <div className="relative">
                  {/* Glowing background effect */}
                  <div className="absolute inset-0 -z-10 animate-pulse">
                    <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl" />
                  </div>

                  <div className="flex flex-col items-center gap-8 text-center">
                    {/* Coffee icon with animated steam */}
                    <div className="relative">
                      <div className="flex h-24 w-24 items-center justify-center rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5 shadow-lg shadow-primary/20">
                        <Coffee className="h-12 w-12 text-primary" />
                      </div>
                      {/* Animated steam effect */}
                      <div className="absolute -top-2 left-1/2 flex -translate-x-1/2 gap-1">
                        <div
                          className="h-6 w-1 animate-pulse rounded-full bg-primary/30 blur-sm"
                          style={{ animationDelay: "0s", animationDuration: "2s" }}
                        />
                        <div
                          className="h-8 w-1 animate-pulse rounded-full bg-primary/40 blur-sm"
                          style={{ animationDelay: "0.3s", animationDuration: "2.2s" }}
                        />
                        <div
                          className="h-6 w-1 animate-pulse rounded-full bg-primary/30 blur-sm"
                          style={{ animationDelay: "0.6s", animationDuration: "2s" }}
                        />
                      </div>
                    </div>

                    {/* Text content */}
                    <div className="space-y-4">
                      <h2 className="text-4xl font-light uppercase tracking-[0.2em] text-primary">
                        {t("downloads.noDownloads")}
                      </h2>
                      <p className="mx-auto max-w-md text-base text-muted-foreground/80">
                        {t("downloads.noDownloadsMessage")}
                      </p>
                    </div>

                    {/* Decorative line with dots */}
                    <div className="flex items-center gap-3">
                      <div className="h-px w-16 bg-gradient-to-r from-transparent to-primary/30" />
                      <div className="flex gap-2">
                        <span className="h-2 w-2 rounded-full bg-primary/50 shadow-sm shadow-primary/50" />
                        <span className="h-2 w-2 rounded-full bg-primary/70 shadow-md shadow-primary/70" />
                        <span className="h-2 w-2 rounded-full bg-primary/50 shadow-sm shadow-primary/50" />
                      </div>
                      <div className="h-px w-16 bg-gradient-to-l from-transparent to-primary/30" />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-8 pb-8">
                {/* Active Downloads Section */}
                <div>
                  <h2 className="mb-4 text-2xl font-bold text-primary">
                    {t("downloads.activeDownloads")}
                  </h2>
                  <div className="grid grid-cols-1 gap-6">
                    {downloadingGames.map((game, index) => (
                      <BigPictureDownloadCard
                        key={game.game}
                        game={game}
                        isSelected={index === downloadsIndex && !isMenuOpen}
                        torboxState={
                          game.torboxWebdownloadId
                            ? torboxStates[game.torboxWebdownloadId]
                            : undefined
                        }
                        onPause={() => handlePauseDownload(game)}
                        onResume={() => handleResumeDownload(game)}
                        onKill={() => handleKillDownload(game)}
                        onOpenFolder={() => handleOpenFolder(game)}
                        isStopping={stoppingDownloads.has(game.game)}
                        isResuming={resumingDownloads.has(game.game)}
                        t={t}
                        buttons={buttons}
                      />
                    ))}
                  </div>
                </div>

                {/* Queued Downloads Section - Only show for Ascend users */}
                {isAuthenticated && queuedDownloads.length > 0 && (
                  <div className="mt-8">
                    <div className="mb-4 flex items-center gap-3">
                      <ListEnd className="h-6 w-6 text-primary" />
                      <h2 className="text-2xl font-bold text-primary">
                        {t("downloads.queuedDownloads")} ({queuedDownloads.length})
                      </h2>
                    </div>
                    <div className="space-y-3">
                      {queuedDownloads.map((item, index) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-4 rounded-xl border-2 border-border/50 bg-card/50 p-4 transition-all duration-200 hover:border-primary/30"
                        >
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-lg font-bold text-primary">
                            {index + 1}
                          </div>
                          <div className="flex-1">
                            <h3 className="font-bold text-foreground">{item.gameName}</h3>
                            <p className="text-sm text-muted-foreground">{item.size}</p>
                          </div>
                          <button
                            onClick={() => {
                              removeFromQueue(item.id);
                              toast.success(t("downloads.removedFromQueue"));
                            }}
                            className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/20 text-red-500 transition-all hover:bg-red-500/30"
                          >
                            <X className="h-5 w-5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

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

      {view !== "details" && !isKeyboardOpen && !installedGameView && (
        <div
          className={`fixed bottom-0 left-0 right-0 z-[100] flex h-16 items-center justify-between border-t border-white/5 bg-card/90 px-16 shadow-[0_-5px_20px_rgba(0,0,0,0.5)] transition-all duration-200 ${isMenuOpen ? "translate-y-full opacity-0" : "translate-y-0 opacity-100"}`}
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
