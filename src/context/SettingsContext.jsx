import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";

export const SettingsContext = createContext();

export function SettingsProvider({ children }) {
  const [settings, setSettingsState] = useState({
    downloadDirectory: "",
    additionalDirectories: [],
    watchingFolders: [],
    showOldDownloadLinks: false,
    defaultOpenPage: "home",
    behaviorAfterDownload: "none",
    rpcEnabled: true,
    seeInappropriateContent: false,
    hideOnGameLaunch: true,
    earlyReleasePreview: false,
    viewWorkshopPage: false,
    notifications: true,
    downloadHandler: false,
    torrentEnabled: false,
    gameSource: "steamrip",
    autoCreateShortcuts: true,
    smoothTransitions: true,
    sendAnalytics: true,
    autoUpdate: true,
    endOnClose: false,
    language: "en",
    theme: "purple",
    customTheme: [],
    threadCount: 12,
    singleStream: true,
    downloadLimit: 0,
    excludeFolders: false,
    sideScrollBar: false,
    prioritizeTorboxOverSeamless: false,
    crackDirectory: "",
    twitchSecret: "",
    twitchClientId: "",
    torboxApiKey: "",
    localIndex: "",
    blacklistIDs: ["ABSXUc", "AWBgqf", "ATaHuq"],
    usingLocalIndex: false,
    shareLocalIndex: true,
    fetchPageCount: 50,
    localRefreshWorkers: 8,
    homeSearch: true,
    indexReminder: "7",
    bigPictureKeyboardLayout: "qwerty",
    controllerType: "xbox",
    ludusavi: {
      backupLocation: "",
      backupFormat: "zip",
      enabled: false,
      backupOptions: {
        backupsToKeep: 5,
        skipManifestCheck: false,
        compressionLevel: "default",
      },
    },
    wine: {
      wineBin: "wine",
      winePrefix: "",
    },
    proton: {
      enabled: false,
      protonBin: "",
      steamCompatDataPath: "",
    },
  });
  const settingsRef = useRef(settings);

  // Keep ref in sync with state
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const setSettings = useCallback(
    async newSettings => {
      // If newSettings is a function, call it with current settings from ref
      const updatedSettings =
        typeof newSettings === "function"
          ? newSettings(settingsRef.current)
          : newSettings; // Don't merge - use newSettings directly to avoid losing values

      // Update local state
      setSettingsState(updatedSettings);

      // Save to electron
      try {
        await window.electron.saveSettings(updatedSettings);
      } catch (error) {
        console.error("Error saving settings:", error);
      }
    },
    [] // No dependencies - uses ref
  );

  // Update local state only without saving to electron
  const setSettingsLocal = useCallback(
    newSettings => {
      const updatedSettings =
        typeof newSettings === "function"
          ? newSettings(settingsRef.current)
          : { ...settingsRef.current, ...newSettings };
      setSettingsState(updatedSettings);
    },
    [] // No dependencies - uses ref
  );

  const updateSetting = useCallback(
    async (key, value) => {
      const updatedSettings = { ...settingsRef.current, [key]: value };
      setSettingsState(updatedSettings);
      try {
        await window.electron.updateSetting(key, value);
      } catch (error) {
        console.error("Error updating setting:", error);
      }
    },
    [] // No dependencies - uses ref
  );

  // Memoize context value to prevent unnecessary rerenders
  const contextValue = useMemo(
    () => ({
      settings,
      setSettings,
      setSettingsLocal,
      updateSetting,
    }),
    [settings, setSettings, setSettingsLocal, updateSetting]
  );

  // Effect to toggle Discord RPC when rpcEnabled setting changes
  useEffect(() => {
    const toggleDiscordRPC = async () => {
      try {
        await window.electron.toggleDiscordRPC(settings.rpcEnabled);
      } catch (error) {
        console.error("Error toggling Discord RPC:", error);
      }
    };

    // Only run after initial settings load (when downloadDirectory exists)
    if (settings.downloadDirectory) {
      toggleDiscordRPC();
    }
  }, [settings.rpcEnabled]);

  useEffect(() => {
    // Load settings on mount
    const loadSettings = async () => {
      try {
        const savedSettings = await window.electron.getSettings();
        if (savedSettings) {
          setSettingsState(savedSettings);
        }
      } catch (error) {
        console.error("Error loading settings:", error);
      }
    };
    loadSettings();

    // Listen for settings changes from other parts of the app
    const handleSettingsChange = (event, newSettings) => {
      setSettingsState(prevSettings => ({
        ...prevSettings,
        ...newSettings,
      }));
    };

    window.electron.ipcRenderer.on("settings-updated", handleSettingsChange);

    return () => {
      window.electron.ipcRenderer.off("settings-updated", handleSettingsChange);
    };
  }, []);

  return (
    <SettingsContext.Provider value={contextValue}>{children}</SettingsContext.Provider>
  );
}

// Default settings to use when context is not available
const defaultSettings = {
  downloadDirectory: "",
  additionalDirectories: [],
  watchingFolders: [],
  showOldDownloadLinks: false,
  defaultOpenPage: "home",
  behaviorAfterDownload: "none",
  rpcEnabled: true,
  seeInappropriateContent: false,
  hideOnGameLaunch: true,
  earlyReleasePreview: false,
  viewWorkshopPage: false,
  notifications: true,
  downloadHandler: false,
  torrentEnabled: false,
  gameSource: "steamrip",
  autoCreateShortcuts: true,
  smoothTransitions: true,
  sendAnalytics: true,
  autoUpdate: true,
  endOnClose: false,
  language: "en",
  theme: "purple",
  customTheme: [],
  threadCount: 12,
  singleStream: true,
  downloadLimit: 0,
  excludeFolders: false,
  sideScrollBar: false,
  prioritizeTorboxOverSeamless: false,
  crackDirectory: "",
  twitchSecret: "",
  twitchClientId: "",
  torboxApiKey: "",
  localIndex: "",
  blacklistIDs: ["ABSXUc", "AWBgqf", "ATaHuq"],
  usingLocalIndex: false,
  shareLocalIndex: true,
  fetchPageCount: 50,
  localRefreshWorkers: 8,
  homeSearch: true,
  indexReminder: "7",
  bigPictureKeyboardLayout: "qwerty",
  controllerType: "xbox",
  ludusavi: {
    backupLocation: "",
    backupFormat: "zip",
    enabled: false,
    backupOptions: {
      backupsToKeep: 5,
      skipManifestCheck: false,
      compressionLevel: "default",
    },
  },
  wine: {
    wineBin: "wine",
    winePrefix: "",
  },
  proton: {
    enabled: false,
    protonBin: "",
    steamCompatDataPath: "",
  },
};

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    // Return default values instead of throwing to prevent crashes
    console.warn("useSettings called outside of SettingsProvider, using defaults");
    return {
      settings: defaultSettings,
      setSettings: () => {},
      setSettingsLocal: () => {},
      updateSetting: () => {},
    };
  }
  return context;
}
