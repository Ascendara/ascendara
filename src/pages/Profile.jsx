import { setUserOnlineStatus as UpdateUserStatus } from "@/services/ascend/ascendStatusService";
import {
  useEffect as UseEffect,
  useMemo as UseMemo,
  useRef as UseRef,
  useState as UseState,
} from "react";
import { useLanguage as UseLanguage } from "@/context/LanguageContext";
import { useAuth as UseAuth } from "@/context/AuthContext";
import {
  calculateLevelFromXP,
  getLevelConstants,
} from "@/services/ascend/levelCalculationService";

import { useNavigate as UseNavigate } from "react-router-dom";
import { toast } from "sonner";

import UsernameDialog from "@/components/UsernameDialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, Panel, StatStrip } from "@/pages/ascend/primitives";

import { cn as Cn } from "@/lib/utils";
import {
  getUserStatus as GetUserStatus,
  syncProfileToAscend as SyncProfileToAscend,
  getProfileStats as GetProfileStats,
  recomputeProfileStats as RecomputeProfileStats,
} from "@/services/firebase/firebaseService";
import {
  Archive,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  Clock,
  Cpu,
  FileDown,
  Gamepad2,
  Lock,
  LogIn,
  Monitor,
  Music2,
  NotebookPen,
  Pencil,
  Smile,
  Sparkles,
  Star,
  Trash2,
  Trophy,
  Upload,
} from "lucide-react";
import EarnedBadges from "@/components/EarnedBadges";

const VUS = ["online", "away", "busy", "invisible"];

const StatusOptions = [
  { id: "online", dot: "bg-green-500" },
  { id: "away", dot: "bg-yellow-500" },
  { id: "busy", dot: "bg-red-500" },
  { id: "invisible", dot: "bg-gray-400" },
];

const AvatarModes = ["emoji", "image", "ascend"];

const MaxProfileImageBytes = 8 * 1024 * 1024;

const PanelHeader = ({ icon: Icon, title, meta }) => (
  <div className="flex items-center justify-between gap-3 border-b border-border/50 px-5 py-4">
    <h2 className="mb-0 flex items-center gap-2 font-semibold">
      <Icon className="h-4 w-4 text-primary" />
      {title}
    </h2>
    {meta != null && <span className="text-sm text-muted-foreground">{meta}</span>}
  </div>
);

const { XP_RULES: XpRules } = getLevelConstants();

const ReadJsonFromLocalStorage = (StorageKey, FallbackValue) => {
  try {
    const RawValue = localStorage.getItem(StorageKey);

    if (!RawValue) {
      return FallbackValue;
    }

    return JSON.parse(RawValue);
  } catch (error) {
    console.warn(
      `[Profile] couldn't read ${StorageKey} from localStorage, using defaults`,
      error
    );

    return FallbackValue;
  }
};

const CompareAchievementEntries = (Left, Right) => {
  if (!Left && !Right) return 0;
  if (!Left) return 1;
  if (!Right) return -1;

  if (Right.unlocked !== Left.unlocked) {
    return Right.unlocked - Left.unlocked;
  }

  if (Right.percentage !== Left.percentage) {
    return Right.percentage - Left.percentage;
  }

  if (Right.total !== Left.total) {
    return Right.total - Left.total;
  }

  return String(Left.gameName).localeCompare(String(Right.gameName));
};

const UnknownDeviceInfo = Value => !Value || Value === "Unknown";

const FormatGPU = Renderer => {
  if (!Renderer) {
    return null;
  }

  const AngleMatch = Renderer.match(
    /^ANGLE \([^,]+,\s*(.+),\s*(OpenGL|Vulkan|Metal|Direct3D|D3D11).*\)$/i
  );

  if (AngleMatch?.[1]) {
    return AngleMatch[1].trim();
  }

  return Renderer.trim();
};

const LinuxSystem = () => {
  try {
    const Canvas = document.createElement("canvas");
    const Context = Canvas.getContext("webgl") || Canvas.getContext("experimental-webgl");

    if (!Context) {
      return null;
    }

    const DebugInfo = Context.getExtension("WEBGL_debug_renderer_info");

    if (!DebugInfo) {
      return null;
    }

    const Renderer = Context.getParameter(DebugInfo.UNMASKED_RENDERER_WEBGL);

    return FormatGPU(Renderer) || null;
  } catch (error) {
    console.warn(`[Profile] Couldn't detect Linux GPU.`, error);
    return null;
  }
};

const Profile = () => {
  const { t: T } = UseLanguage();
  const { user: User, userData: UserData } = UseAuth();
  const Navigate = UseNavigate();

  const [JoinDate, SetJoinDate] = UseState("");
  const [GeneralUsername, SetGeneralUsername] = UseState("");
  const [PrivateNotes, SetPrivateNotes] = UseState(() => {
    const UserPrefs = ReadJsonFromLocalStorage("userProfile", {});

    return UserPrefs.privateNotes || UserPrefs.bio || "";
  });
  const LastSyncedProfileStatsPtr = UseRef(null);
  const FileInputPtr = UseRef(null);

  const [DeviceInfo, SetDeviceInfo] = UseState({
    platform: "Unknown",
    os: "Unknown",
    cpu: "Unknown",
    ram: "Unknown",
    gpu: "Unknown",
    directx: "Unknown",
  });
  const [SelectedEmoji, SetSelectedEmoji] = UseState(() => {
    return localStorage.getItem("selectedEmoji") || "😊";
  });
  const [ProfileImage, SetProfileImage] = UseState(null);
  // null means "pick for me": the Ascend photo when signed in, otherwise the emoji.
  const [AvatarMode, SetAvatarMode] = UseState(() => {
    const SavedMode = localStorage.getItem("avatarMode");
    if (AvatarModes.includes(SavedMode)) return SavedMode;
    return localStorage.getItem("useEmoji") === "false" ? "image" : null;
  });
  const [Games, SetGames] = UseState([]);
  const [AchievementsLeaderboard, SetAchievementsLeaderboard] = UseState([]);
  const [IsLoadingAchievementsLeaderboard, SetIsLoadingAchievementsLeaderboard] =
    UseState(false);
  const [Stats, SetStats] = UseState({
    gamesPlayed: 0,
    totalPlayTime: 0,
    favoriteGames: [],
    totalPlaytime: 0,
    totalGames: 0,
    level: 1,
    xp: 0,
    currentXP: 0,
    nextLevelXp: 100,
    gamesCompleted: 0,
    totalDownloads: 0,
    achievements: [],
    recentActivity: [],
    favoriteGenres: [],
    genreDistribution: {},
  });
  const EmojiCategories = [
    {
      id: "gaming",
      title: "Gaming",
      emojis: ["🎮", "🕹️", "👾", "🎲", "🎯", "⚔️", "🛡️", "🏆", "🎨", "🎭", "🔥", "💎"],
    },
    {
      id: "faces",
      title: "Expressions",
      emojis: [
        "😊",
        "😎",
        "🤔",
        "😄",
        "😂",
        "🥹",
        "🥰",
        "😇",
        "🤩",
        "🤗",
        "🫡",
        "🤭",
        "😌",
        "😏",
      ],
    },
    {
      id: "tech",
      title: "Tech",
      emojis: [
        "💻",
        "⌨️",
        "🖥️",
        "🖱️",
        "📱",
        "⚡",
        "💡",
        "🔧",
        "⚙️",
        "💾",
        "📡",
        "🔌",
        "🖨️",
        "📺",
      ],
    },
    {
      id: "space",
      title: "Space & Magic",
      emojis: [
        "⭐",
        "✨",
        "💫",
        "☄️",
        "🌙",
        "🌍",
        "🪐",
        "🌠",
        "🌌",
        "🔮",
        "🎇",
        "🌈",
        "🌟",
      ],
    },
    {
      id: "audio",
      title: "Audio",
      emojis: [
        "🎵",
        "🎶",
        "🎼",
        "🎹",
        "🥁",
        "🎸",
        "🎺",
        "🎻",
        "🎧",
        "🔊",
        "📻",
        "🎙️",
        "🎚️",
      ],
    },
  ];
  const EmojiTabIcons = {
    gaming: Gamepad2,
    faces: Smile,
    tech: Cpu,
    space: Sparkles,
    audio: Music2,
  };
  const [GameImages, SetGameImages] = UseState({});
  const [DownloadHistory, SetDownloadHistory] = UseState([]);
  const [RemovingDownloadHistoryIndex, SetRemovingDownloadHistoryIndex] = UseState(null);

  const [UserStatus, SetUserStatus] = UseState("online");

  const [ActiveEmojiCategoryId, SetActiveEmojiCategoryId] = UseState(
    EmojiCategories[0].id
  );
  const AmILinux = UseMemo(() => {
    const Platform = String(DeviceInfo.platform || "").toLowerCase();
    const OS = String(DeviceInfo.os || "").toLowerCase();

    return Platform.includes("linux") || OS.includes("linux");
  }, [DeviceInfo.os, DeviceInfo.platform]);

  const IsAscendUser = !!User?.uid;
  const AscendPhoto = User?.photoURL || UserData?.photoURL || null;

  const AvatarSource = UseMemo(() => {
    if (!IsAscendUser || AvatarMode === "emoji") return "emoji";
    if (AvatarMode === "image" && ProfileImage) return "image";
    if (AscendPhoto) return "ascend";
    return "emoji";
  }, [IsAscendUser, AvatarMode, ProfileImage, AscendPhoto]);

  const AvatarSrc =
    AvatarSource === "image"
      ? ProfileImage
      : AvatarSource === "ascend"
        ? AscendPhoto
        : null;

  const DisplayName =
    (IsAscendUser && (UserData?.displayName || User?.displayName)) ||
    GeneralUsername ||
    "Guest";

  UseEffect(() => {
    localStorage.setItem("selectedEmoji", SelectedEmoji);
  }, [SelectedEmoji]);

  UseEffect(() => {
    if (AvatarMode) localStorage.setItem("avatarMode", AvatarMode);
  }, [AvatarMode]);

  UseEffect(() => {
    let DidCancel = false;

    const LoadStatus = async () => {
      if (!User?.uid) return;

      try {
        const Result = await GetUserStatus(User.uid);

        if (DidCancel) return;

        const FetchedStatus = Result?.data?.status;

        if (FetchedStatus && VUS.includes(FetchedStatus)) {
          SetUserStatus(FetchedStatus);
          return;
        }

        if (FetchedStatus === "offline") {
          SetUserStatus("online");
          return;
        }

        if (FetchedStatus != null) {
          console.warn(
            `[Profile] Unexpected User status from backend; defaulting to online.`,
            { FetchedStatus }
          );
        }
      } catch (error) {
        console.error(
          `[Profile] Failed to load User status — check Firestore rules / network.`,
          error
        );
      }
    };

    LoadStatus();

    return () => {
      DidCancel = true;
    };
  }, [User?.uid]);

  const HandleUserStatusChange = async NextStatus => {
    if (!VUS.includes(NextStatus)) {
      console.warn(`[Profile] Ignoring invalid status change`, {
        NextStatus,
      });
      return;
    }

    const PreviousStatus = UserStatus;

    SetUserStatus(NextStatus);

    if (!User?.uid) return;

    try {
      const Result = await UpdateUserStatus(NextStatus);

      if (!Result?.success) {
        console.error(`[Profile] Failed to update status`, {
          NextStatus,
          error: Result?.error,
        });
        SetUserStatus(PreviousStatus);

        const Refreshed = await GetUserStatus(User.uid);
        const BackendStatus = Refreshed?.data?.status;

        if (BackendStatus && VUS.includes(BackendStatus)) {
          SetUserStatus(BackendStatus);
        }
      }
    } catch (error) {
      console.error(`[Profile] Failed to update User status`, error);
      SetUserStatus(PreviousStatus);
    }
  };

  const CalculateLevelProgressFromXP = TotalXP => {
    return calculateLevelFromXP(TotalXP);
  };

  const BuildProfileStatsFromGames = (InstalledGames, CustomGames) => {
    const AllGames = [...(InstalledGames || []), ...(CustomGames || [])];

    let TotalXP = 0;
    let TotalPlaytimeSeconds = 0;
    let GamesPlayedCount = 0;

    for (const Game of AllGames) {
      const PlaytimeSeconds = typeof Game?.playTime === "number" ? Game.playTime : 0;
      const PlaytimeHours = PlaytimeSeconds / 3600;
      const LaunchCount = typeof Game?.launchCount === "number" ? Game.launchCount : 0;
      const IsCompleted = !!Game?.completed;
      const HasEngagement = PlaytimeSeconds > 0 || LaunchCount > 0 || IsCompleted;

      if (PlaytimeSeconds > 0) {
        GamesPlayedCount += 1;
      }

      TotalPlaytimeSeconds += PlaytimeSeconds;

      if (!HasEngagement) {
        continue;
      }

      let XPFromThisGame = XpRules.basePerGame;

      XPFromThisGame += Math.floor(PlaytimeHours * XpRules.perHourPlayed);
      const LaunchBonus = Math.min(
        LaunchCount * XpRules.perLaunch,
        XpRules.launchBonusCap
      );
      XPFromThisGame += LaunchBonus;

      if (IsCompleted) {
        XPFromThisGame += XpRules.completedBonus;
      }

      TotalXP += XPFromThisGame;
    }

    const TotalPlaytimeHours = TotalPlaytimeSeconds / 3600;
    for (const Milestone of XpRules.playtimeMilestones) {
      if (TotalPlaytimeHours >= Milestone.hours) {
        TotalXP += Milestone.bonus;
      }
    }

    const LevelProgress = CalculateLevelProgressFromXP(TotalXP);

    return {
      totalPlaytime: TotalPlaytimeSeconds,
      gamesPlayed: GamesPlayedCount,
      totalGames: AllGames.length,
      level: LevelProgress.level,
      xp: LevelProgress.xp,
      currentXP: LevelProgress.currentXP,
      nextLevelXp: LevelProgress.nextLevelXp,
      allGames: AllGames,
    };
  };

  UseEffect(() => {
    LoadProfile();
    LoadProfileImage();

    const HandleProfileUpdate = () => {
      LoadProfile();
    };

    window.addEventListener("storage", HandleProfileUpdate);

    window.addEventListener("username-updated", HandleProfileUpdate);

    return () => {
      window.removeEventListener("storage", HandleProfileUpdate);
      window.removeEventListener("username-updated", HandleProfileUpdate);
    };
  }, []);

  UseEffect(() => {
    let DidCancel = false;

    const LoadAchievementsLeaderboard = async () => {
      try {
        if (!Array.isArray(Games) || Games.length === 0) {
          SetAchievementsLeaderboard([]);
          return;
        }

        if (
          !window.electron?.readGameAchievements &&
          !window.electron?.getAchievementsLeaderboard
        ) {
          SetAchievementsLeaderboard([]);
          return;
        }

        SetIsLoadingAchievementsLeaderboard(true);

        const EligibleGames = Games.filter(
          Game =>
            !Game?.downloadingData?.downloading && !Game?.downloadingData?.extracting
        ).slice(0, 75);

        if (DidCancel) return;

        if (window.electron?.getAchievementsLeaderboard) {
          const Leaderboard = await window.electron.getAchievementsLeaderboard(
            EligibleGames.map(Game => ({
              gameName: Game.game || Game.name,
              isCustom: Game.isCustom || Game.custom || false,
            })),
            { limit: 6 }
          );

          if (!DidCancel) {
            SetAchievementsLeaderboard(Array.isArray(Leaderboard) ? Leaderboard : []);
          }
          return;
        }

        const Results = await Promise.all(
          EligibleGames.map(async Game => {
            try {
              const GameName = Game.game || Game.name;
              const IsCustom = Game.isCustom || Game.custom || false;

              if (!GameName) return null;

              const AchievementData = await window.electron.readGameAchievements(
                GameName,
                IsCustom
              );

              const AchievementList = AchievementData?.achievements;
              if (!Array.isArray(AchievementList) || AchievementList.length === 0) {
                return null;
              }

              const UnlockedCount = AchievementList.filter(
                Achievement =>
                  !!(
                    Achievement?.achieved ||
                    Achievement?.unlocked ||
                    Achievement?.isUnlocked
                  )
              ).length;
              const TotalCount = AchievementList.length;

              let Percentage = 0;
              if (TotalCount > 0) {
                Percentage = Math.round((UnlockedCount / TotalCount) * 100);
              }

              return {
                gameName: GameName,
                unlocked: UnlockedCount,
                total: TotalCount,
                percentage: Percentage,
              };
            } catch {
              return null;
            }
          })
        );

        if (DidCancel) return;

        const TopSix = Results.filter(Boolean)
          .sort(CompareAchievementEntries)
          .slice(0, 6);

        SetAchievementsLeaderboard(TopSix);
      } catch (e) {
        console.warn(
          `[Profile] Failed to load achievements leaderboard — check IPC or achievements files.`,
          e
        );
        SetAchievementsLeaderboard([]);
      } finally {
        if (!DidCancel) SetIsLoadingAchievementsLeaderboard(false);
      }
    };

    LoadAchievementsLeaderboard();

    return () => {
      DidCancel = true;
    };
  }, [Games]);

  const LoadProfile = async () => {
    try {
      if (!window.electron) {
        throw new Error("window.electron is not available (preload/IPC not initialized)");
      }

      const JoinDateString = await window.electron.timestampTime();
      SetJoinDate(JoinDateString);

      const LoadedGames = await LoadGamesData();
      console.log("[Profile] Loaded Games:", LoadedGames?.length, "Games");

      const LatestDownloadHistory = await window.electron.getDownloadHistory();
      SetDownloadHistory(LatestDownloadHistory);

      let CalculatedStats = BuildProfileStatsFromGames(LoadedGames, []);
      console.log("[Profile] Calculated Stats:", {
        totalGames: CalculatedStats.totalGames,
        gamesPlayed: CalculatedStats.gamesPlayed,
        xp: CalculatedStats.xp,
        level: CalculatedStats.level,
        totalPlaytime: CalculatedStats.totalPlaytime,
      });

      let PersistedProfileStats = null;
      try {
        PersistedProfileStats =
          await window.electron?.getTimestampValue?.("profileStats");
      } catch (e) {
        PersistedProfileStats = null;
      }

      // Level/XP must never decrease (e.g. after uninstalling a game or
      // discarding saved game data). Always take the higher of the
      // freshly-computed XP vs. the last persisted value.
      const PersistedXP = PersistedProfileStats?.xp;

      if (typeof PersistedXP === "number" && PersistedXP > CalculatedStats.xp) {
        const Progress = CalculateLevelProgressFromXP(PersistedXP);

        CalculatedStats = {
          ...CalculatedStats,
          ...Progress,
          totalPlaytime: Math.max(
            CalculatedStats.totalPlaytime || 0,
            PersistedProfileStats?.totalPlaytime || 0
          ),
          gamesPlayed: Math.max(
            CalculatedStats.gamesPlayed || 0,
            PersistedProfileStats?.gamesPlayed || 0
          ),
          totalGames: Math.max(
            CalculatedStats.totalGames || 0,
            PersistedProfileStats?.totalGames || 0
          ),
        };
      }

      // Cloud-first override: when the user is signed in, the server at
      // api.ascendara.app is the source of truth for level / XP / totals.
      // We fetch the persisted profileStats and, if present, use those values
      // for display instead of the freshly computed local ones. The local
      // `BuildProfileStatsFromGames` call above remains as an offline fallback
      // and to build `allGames` / downloadHistory-adjacent UI state.
      if (User?.uid) {
        // Fire-and-forget recompute so the server reconciles against the
        // latest cloudLibrary (important after a fresh sign-in or cloud
        // library sync on a new device).
        RecomputeProfileStats().catch(() => {});
        try {
          const CloudProfile = await GetProfileStats();
          const CloudStats = CloudProfile?.data;
          if (CloudStats && typeof CloudStats.xp === "number") {
            // Never let a lower cloud value pull the displayed level/XP down.
            const BestXP = Math.max(CloudStats.xp || 0, CalculatedStats.xp || 0);
            const Progress = CalculateLevelProgressFromXP(BestXP);

            CalculatedStats = {
              ...CalculatedStats,
              ...Progress,
              totalPlaytime: Math.max(
                CloudStats.totalPlaytime || 0,
                CalculatedStats.totalPlaytime || 0
              ),
              gamesPlayed: Math.max(
                CloudStats.gamesPlayed || 0,
                CalculatedStats.gamesPlayed || 0
              ),
              totalGames: Math.max(
                CloudStats.totalGames || 0,
                CalculatedStats.totalGames || 0
              ),
            };
          }
        } catch (e) {
          console.warn(
            "[Profile] Cloud-authoritative stats unavailable, using local:",
            e?.message || e
          );
        }
      }

      SetStats({
        ...CalculatedStats,
        totalPlayTime: CalculatedStats.totalPlaytime || 0,
        xp: CalculatedStats.xp || 0,
        currentXP: CalculatedStats.currentXP || 0,
        nextLevelXp: CalculatedStats.nextLevelXp || 100,
        level: CalculatedStats.level || 1,
        gamesPlayed: CalculatedStats.gamesPlayed || 0,
        totalGames: CalculatedStats.totalGames || 0,
      });

      SetGames(LoadedGames);
      if (window.electron?.setTimestampValue) {
        const Payload = {
          level: CalculatedStats.level || 1,
          xp: CalculatedStats.xp || 0,
          totalPlaytime: CalculatedStats.totalPlaytime || 0,
          gamesPlayed: CalculatedStats.gamesPlayed || 0,
          totalGames: CalculatedStats.totalGames || 0,
          JoinDate: JoinDateString || null,
        };

        const Fingerprint = JSON.stringify(Payload);

        if (LastSyncedProfileStatsPtr.current !== Fingerprint) {
          LastSyncedProfileStatsPtr.current = Fingerprint;
          try {
            await window.electron.setTimestampValue("profileStats", Payload);
            if (User?.uid) {
              try {
                await SyncProfileToAscend({ joinDate: Payload.JoinDate });
              } catch (cloudErr) {
                console.warn(
                  `[Profile] Failed to auto-sync profileStats to cloud — will retry on next change.`,
                  cloudErr
                );
              }
            }
          } catch (e) {
            console.warn(
              `[Profile] Failed to persist profileStats locally — check write permissions / disk.`,
              e
            );
          }
        }
      }
      const UserPrefs = ReadJsonFromLocalStorage("userProfile", {});

      if (!UserPrefs.profileName) {
        try {
          const CrackedUsername = await window.electron.getLocalCrackUsername();

          if (CrackedUsername) {
            UserPrefs.profileName = CrackedUsername;
            localStorage.setItem("userProfile", JSON.stringify(UserPrefs));
            window.dispatchEvent(new Event("username-updated"));
          }
        } catch (error) {
          console.error(
            `[Profile] Something went wrong fetching the cracked username — check the crack helper.`,
            error
          );
        }
      }

      SetGeneralUsername(UserPrefs.profileName || "");
      SetPrivateNotes(UserPrefs.privateNotes || UserPrefs.bio || "");
    } catch (error) {
      console.error(
        `[Profile] Error loading profile — if this is a fresh install, double-check preload/IPC wiring.`,
        error
      );
    }
  };

  UseEffect(() => {
    let Cancelled = false;

    const LoadDeviceInfo = async () => {
      try {
        const Platform =
          window.electron?.getPlatform?.() ||
          navigator.userAgentData?.platform ||
          navigator.platform ||
          "Unknown";

        const Specs = await window.electron?.fetchSystemSpecs?.();
        if (Cancelled) return;

        const AmILinux =
          String(Platform).toLowerCase().includes("linux") ||
          String(Specs?.os || "")
            .toLowerCase()
            .includes("linux");
        const LinuxGPURenderer =
          AmILinux && UnknownDeviceInfo(Specs?.gpu) ? LinuxSystem() : null;
        const LinuxRunner = AmILinux
          ? await window.electron?.resolveRunner?.("auto")
          : null;

        SetDeviceInfo(Prev => ({
          ...Prev,
          platform: Platform,
          ...(Specs || {}),
          gpu: LinuxGPURenderer || Specs?.gpu || Prev.gpu,
          directx: AmILinux
            ? LinuxRunner?.name ||
              (LinuxRunner?.type === "proton"
                ? "Proton"
                : LinuxRunner?.type === "wine"
                  ? "Wine"
                  : "Wine / Proton")
            : Specs?.directx || Prev.directx,
        }));
      } catch (error) {
        console.error(`[Profile] Device Loading Failed`, error);
      }
    };

    LoadDeviceInfo();

    return () => {
      Cancelled = true;
    };
  }, []);

  const LoadGamesData = async () => {
    try {
      const Settings = await window.electron.getSettings();

      if (!Settings || !Settings.downloadDirectory) {
        return [];
      }

      const InstalledGames = await window.electron.getGames();
      let CustomGames = [];
      try {
        CustomGames = await window.electron.getCustomGames();
      } catch (error) {
        console.error(
          `[Profile] Failed to load custom Games — continuing with installed Games only.`,
          error
        );
      }
      return [...InstalledGames, ...CustomGames];
    } catch (error) {
      console.error(
        `[Profile] Error loading Games data — check permissions / download folder path.`,
        error
      );
      return [];
    }
  };

  UseEffect(() => {
    const LoadGameImages = async () => {
      const Images = {};

      // Image data URLs are not cached in localStorage (per-origin quota is
      // tiny relative to base64 image sizes); IPC reads from disk are fast.
      for (const Game of Games) {
        try {
          const GameId = Game.game || Game.name;
          const ImageBase64 = await window.electron.getGameImage(GameId);
          if (ImageBase64) {
            Images[GameId] = `data:image/jpeg;base64,${ImageBase64}`;
          }
        } catch (Error) {
          console.error(`[Profile] game cover load failed`, Error);
        }
      }

      SetGameImages(Images);
    };

    const HandleCoverUpdate = Event => {
      const { gameName: GameName, dataUrl: DataUrl } = Event.detail;

      if (!GameName || !DataUrl) return;
      if (!Games.some(Game => (Game.game || Game.name) === GameName)) return;

      console.log(`[Profile] got cover update for ${GameName}`);
      SetGameImages(PrevImages => ({ ...PrevImages, [GameName]: DataUrl }));
    };

    window.addEventListener("game-cover-updated", HandleCoverUpdate);

    if (Games.length > 0) {
      LoadGameImages();
    }

    return () => {
      window.removeEventListener("game-cover-updated", HandleCoverUpdate);
    };
  }, [Games]);

  const HandleImageUpload = async Event => {
    const File = Event.target.files[0];
    Event.target.value = "";

    if (!File || !IsAscendUser) return;

    if (File.size > MaxProfileImageBytes) {
      toast.error(T("profile.avatar.tooLarge"));
      return;
    }

    try {
      const Reader = new FileReader();
      Reader.onload = async LoadEvent => {
        const Base64 = LoadEvent.target.result;
        const Result = await window.electron.uploadProfileImage(Base64);
        if (Result.success) {
          SetProfileImage(Base64);
          SetAvatarMode("image");
          try {
            localStorage.setItem("profileImage", Base64);
          } catch {
            // Too big to cache; it gets read back from disk next time.
          }
        }
      };
      Reader.readAsDataURL(File);
    } catch (error) {
      console.error(`[Profile] profile image upload failed`, error);
    }
  };

  const SwitchToEmoji = Emoji => {
    SetSelectedEmoji(Emoji);
    SetAvatarMode("emoji");
  };

  const LoadProfileImage = async () => {
    try {
      const SavedImage = localStorage.getItem("profileImage");
      if (SavedImage) {
        SetProfileImage(SavedImage);
        return;
      }

      const Image = await window.electron.getProfileImage();
      if (Image) {
        SetProfileImage(`data:image/png;base64,${Image}`);
      }
    } catch (error) {
      console.error(`[Profile] profile image load failed`, error);
    }
  };

  const OpenAscend = Section => {
    Navigate("/ascend", Section ? { state: { section: Section } } : undefined);
  };

  const RenderAvatar = (SizeClass, EmojiClass) => (
    <div
      className={Cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted",
        SizeClass
      )}
    >
      {AvatarSrc ? (
        <img
          src={AvatarSrc}
          alt={DisplayName}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className={EmojiClass}>{SelectedEmoji}</span>
      )}
    </div>
  );

  const RenderAvatarPicker = () => (
    <PopoverContent align="start" sideOffset={8} className="w-80 p-0">
      <div className="border-b border-border/50 px-4 py-3">
        <p className="text-sm font-medium">{T("profile.avatar.title")}</p>
      </div>

      <div className="space-y-2 p-3">
        {IsAscendUser && AscendPhoto && (
          <button
            type="button"
            onClick={() => SetAvatarMode("ascend")}
            className={Cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
              AvatarSource === "ascend"
                ? "border-primary/50 bg-primary/5"
                : "border-border/50 hover:bg-accent/50"
            )}
          >
            <img
              src={AscendPhoto}
              alt=""
              className="h-8 w-8 rounded-lg object-cover"
              referrerPolicy="no-referrer"
            />
            <span className="flex-1">{T("profile.avatar.useAscendPhoto")}</span>
            {AvatarSource === "ascend" && <Check className="h-4 w-4 text-primary" />}
          </button>
        )}

        {IsAscendUser && ProfileImage && (
          <button
            type="button"
            onClick={() => SetAvatarMode("image")}
            className={Cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
              AvatarSource === "image"
                ? "border-primary/50 bg-primary/5"
                : "border-border/50 hover:bg-accent/50"
            )}
          >
            <img src={ProfileImage} alt="" className="h-8 w-8 rounded-lg object-cover" />
            <span className="flex-1">{T("profile.avatar.useUploaded")}</span>
            {AvatarSource === "image" && <Check className="h-4 w-4 text-primary" />}
          </button>
        )}

        <input
          ref={FileInputPtr}
          type="file"
          accept="image/*"
          onChange={HandleImageUpload}
          className="hidden"
        />
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          disabled={!IsAscendUser}
          onClick={() => FileInputPtr.current?.click()}
        >
          {IsAscendUser ? <Upload className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          {T("profile.avatar.upload")}
        </Button>

        {IsAscendUser ? (
          <p className="text-xs text-muted-foreground">
            {T("profile.avatar.uploadHint")}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {T("profile.avatar.signInToUpload")}{" "}
            <button
              type="button"
              onClick={() => OpenAscend()}
              className="font-medium text-primary hover:underline"
            >
              {T("profile.signIn")}
            </button>
          </p>
        )}
      </div>

      <div className="border-t border-border/50 p-3">
        <div className="mb-2 flex items-center gap-1">
          {EmojiCategories.map(Category => {
            const Icon = EmojiTabIcons[Category.id];
            return (
              <button
                key={Category.id}
                type="button"
                onClick={() => SetActiveEmojiCategoryId(Category.id)}
                aria-label={Category.title}
                title={Category.title}
                className={Cn(
                  "grid h-8 w-8 place-items-center rounded-md transition-colors",
                  ActiveEmojiCategoryId === Category.id
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {EmojiCategories.find(
            Category => Category.id === ActiveEmojiCategoryId
          )?.emojis.map((Emoji, Index) => (
            <button
              key={`${ActiveEmojiCategoryId}-${Emoji}-${Index}`}
              type="button"
              onClick={() => SwitchToEmoji(Emoji)}
              className={Cn(
                "grid h-9 w-9 place-items-center rounded-md text-xl transition-colors hover:bg-accent/60",
                AvatarSource === "emoji" &&
                  SelectedEmoji === Emoji &&
                  "bg-primary/10 ring-1 ring-primary/50"
              )}
            >
              {Emoji}
            </button>
          ))}
        </div>
      </div>
    </PopoverContent>
  );

  const RenderStatusMenu = () => {
    const Current = StatusOptions.find(Status => Status.id === UserStatus);

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-full border border-border/50 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent/50"
          >
            <span className={Cn("h-2 w-2 rounded-full", Current?.dot)} />
            {T(`profile.status.${UserStatus}`)}
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40">
          <DropdownMenuRadioGroup
            value={UserStatus}
            onValueChange={HandleUserStatusChange}
          >
            {StatusOptions.map(Status => (
              <DropdownMenuRadioItem key={Status.id} value={Status.id} className="gap-2">
                <span className={Cn("h-2 w-2 rounded-full", Status.dot)} />
                {T(`profile.status.${Status.id}`)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const RenderProfileHeader = () => {
    const CurrentStatus = StatusOptions.find(Status => Status.id === UserStatus);

    return (
      <Panel data-tour="profile-header" className="overflow-hidden">
        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="group relative shrink-0 self-start rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={T("profile.avatar.title")}
              >
                {RenderAvatar("h-24 w-24", "text-5xl")}
                <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                  <Camera className="h-6 w-6 text-white" />
                </span>
                {IsAscendUser && (
                  <span
                    className={Cn(
                      "absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-4 border-card",
                      CurrentStatus?.dot
                    )}
                  />
                )}
              </button>
            </PopoverTrigger>
            {RenderAvatarPicker()}
          </Popover>

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <h1 className="mb-0 truncate text-2xl font-semibold leading-tight tracking-tight">
                {DisplayName}
              </h1>
              {IsAscendUser ? (
                <>
                  <EarnedBadges user={UserData} className="h-5 w-5" />
                </>
              ) : (
                <UsernameDialog />
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {IsAscendUser ? (
                <>
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                    {T("profile.ascendAccount")}
                  </span>
                  {RenderStatusMenu()}
                </>
              ) : (
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  {T("profile.localProfile")}
                </span>
              )}
            </div>

            {IsAscendUser && UserData?.bio && (
              <p className="line-clamp-2 max-w-xl text-sm text-foreground/80">
                {UserData.bio}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {JoinDate && (
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {T("profile.memberSince", { date: JoinDate })}
                </span>
              )}
              {IsAscendUser && (
                <span className="flex items-center gap-1">
                  <Gamepad2 className="h-3.5 w-3.5" />
                  {T("profile.inGameName")}:{" "}
                  <span className="text-foreground">
                    {GeneralUsername || T("profile.notSet")}
                  </span>
                  <UsernameDialog />
                </span>
              )}
            </div>
          </div>

          {IsAscendUser && (
            <Button
              variant="outline"
              className="shrink-0 gap-2 self-start sm:self-center"
              onClick={() => OpenAscend("settings")}
            >
              <Pencil className="h-4 w-4" />
              {T("profile.editAscendProfile")}
            </Button>
          )}
        </div>

        {!IsAscendUser && (
          <div className="flex flex-col gap-3 border-t border-border/50 bg-muted/30 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">{T("profile.signInPrompt")}</p>
            <Button
              size="sm"
              className="shrink-0 gap-2 text-secondary"
              onClick={() => OpenAscend()}
            >
              <LogIn className="h-4 w-4" />
              {T("profile.signInToAscend")}
            </Button>
          </div>
        )}
      </Panel>
    );
  };

  const FormatPlayTime = Seconds => {
    const Hours = Math.floor(Seconds / 3600);
    const Minutes = Math.floor((Seconds % 3600) / 60);

    if (Hours === 0) {
      return `${Minutes}m`;
    }
    return `${Hours}h ${Minutes}m`;
  };

  const SortedGames = UseMemo(() => {
    return [...Games]
      .filter(Game => Game.playTime && Game.playTime >= 60)
      .sort(
        (LeftGame, RightGame) => (RightGame.playTime || 0) - (LeftGame.playTime || 0)
      );
  }, [Games]);

  const PlaytimeStats = UseMemo(() => {
    if (!SortedGames.length) return null;

    const TotalPlaytime = SortedGames.reduce(
      (Sum, Game) => Sum + (Game.playTime || 0),
      0
    );
    const AvgPlaytime = TotalPlaytime / SortedGames.length;
    const MostPlayed = SortedGames[0];
    const RecentGames = SortedGames.slice(0, 5).map(Game => ({
      name: Game.game || Game.name,
      playTime: Game.playTime || 0,
      percentage: ((Game.playTime || 0) / TotalPlaytime) * 100,
    }));

    return {
      totalPlaytime: TotalPlaytime,
      avgPlaytime: AvgPlaytime,
      mostPlayed: MostPlayed,
      recentGames: RecentGames,
    };
  }, [SortedGames]);

  const LevelProgressPercent = UseMemo(() => {
    const Denominator = Stats.nextLevelXp || 0;
    if (!Denominator) return 0;
    const RawPercent = (Stats.currentXP / Denominator) * 100;
    return Math.max(0, Math.min(100, RawPercent));
  }, [Stats.currentXP, Stats.nextLevelXp]);

  const SortedDownloadHistory = UseMemo(() => {
    return DownloadHistory.map((Item, HistoryIndex) => ({
      ...Item,
      historyIndex: HistoryIndex,
    })).sort(
      (LeftItem, RightItem) =>
        new Date(RightItem.timestamp) - new Date(LeftItem.timestamp)
    );
  }, [DownloadHistory]);

  const SaveUserPreferences = Data => {
    try {
      const CurrentPrefs = JSON.parse(localStorage.getItem("userProfile") || "{}");
      const UpdatedPrefs = { ...CurrentPrefs, ...Data };
      localStorage.setItem("userProfile", JSON.stringify(UpdatedPrefs));
      return true;
    } catch (error) {
      console.error("Error saving User preferences:", error);
      return false;
    }
  };

  UseEffect(() => {
    SaveUserPreferences({ privateNotes: PrivateNotes });
  }, [PrivateNotes]);

  const FormatDate = DateString => {
    const DateValue = new Date(DateString);
    return DateValue.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const HandleRemoveDownloadHistoryItem = async HistoryIndex => {
    if (RemovingDownloadHistoryIndex !== null) {
      return;
    }

    const NextHistory = DownloadHistory.filter(
      (_, CurrentIndex) => CurrentIndex !== HistoryIndex
    );

    try {
      SetRemovingDownloadHistoryIndex(HistoryIndex);
      if (window.electron?.setTimestampValue) {
        await window.electron.setTimestampValue("downloadedHistory", NextHistory);
      }

      const Result = {
        success: true,
        history: NextHistory,
      };

      if (Result?.success === false) {
        throw new Error(Result.error || "Failed to remove download history item");
      }

      if (Array.isArray(Result?.history)) {
        SetDownloadHistory(Result.history);
      } else {
        SetDownloadHistory(PrevHistory =>
          PrevHistory.filter((_, CurrentIndex) => CurrentIndex !== HistoryIndex)
        );
      }
    } catch (Error) {
      console.error(`[Profile] Failed to remove download history item.`, Error);
    } finally {
      SetRemovingDownloadHistoryIndex(null);
    }
  };

  const DeviceRows = [
    { label: T("profile.platform"), value: DeviceInfo.platform },
    { label: T("profile.os"), value: DeviceInfo.os },
    { label: T("profile.cpu"), value: DeviceInfo.cpu },
    { label: T("profile.ram"), value: DeviceInfo.ram },
    { label: T("profile.gpu"), value: DeviceInfo.gpu },
    {
      label: AmILinux ? "Renderer" : T("profile.directX"),
      value: DeviceInfo.directx,
    },
  ];

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 pb-8 !pt-10">
      {RenderProfileHeader()}

      <StatStrip
        stats={[
          {
            icon: Star,
            label: T("profile.level"),
            value: Stats.level,
            footer: (
              <div className="mt-2 space-y-1">
                <Progress value={LevelProgressPercent} className="h-1.5 bg-muted/60" />
                <p className="text-[11px] tabular-nums text-muted-foreground">
                  {Math.round(
                    Math.min(Stats.currentXP, Stats.nextLevelXp)
                  ).toLocaleString()}{" "}
                  / {Math.round(Stats.nextLevelXp).toLocaleString()} XP
                </p>
              </div>
            ),
          },
          {
            icon: Clock,
            label: T("profile.totalPlaytime"),
            value: PlaytimeStats ? FormatPlayTime(PlaytimeStats.totalPlaytime) : "0m",
          },
          {
            icon: Gamepad2,
            label: T("profile.gamesPlayed"),
            value: Stats.gamesPlayed,
          },
          {
            icon: Sparkles,
            label: "XP",
            value: Stats.xp.toLocaleString(),
          },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          <Panel data-tour="profile-games" className="overflow-hidden">
            <PanelHeader
              icon={Gamepad2}
              title={T("profile.games")}
              meta={SortedGames.length}
            />
            {SortedGames.length > 0 ? (
              <ScrollArea className="h-[340px]">
                <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2 xl:grid-cols-3">
                  {SortedGames.map(Game => {
                    const GameId = Game.game || Game.name;
                    return (
                      <div
                        key={GameId}
                        className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/40 p-2.5 transition-colors hover:bg-accent/40"
                      >
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                          {GameImages[GameId] && (
                            <img
                              src={GameImages[GameId]}
                              alt={GameId}
                              className="h-full w-full object-cover"
                            />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{GameId}</p>
                          <p className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {FormatPlayTime(Game.playTime || 0)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            ) : (
              <div className="p-4">
                <EmptyState
                  icon={Gamepad2}
                  title={T("profile.noGames")}
                  description={T("profile.noGamesDesc")}
                  className="py-12"
                />
              </div>
            )}
          </Panel>

          <Panel data-tour="profile-history" className="overflow-hidden">
            <PanelHeader
              icon={FileDown}
              title={T("profile.downloadHistory")}
              meta={DownloadHistory.length}
            />
            {DownloadHistory.length > 0 ? (
              <ScrollArea className="h-[340px]">
                <ul className="divide-y divide-border/50">
                  {SortedDownloadHistory.map(Item => (
                    <li
                      key={`${Item.game}-${Item.timestamp}-${Item.historyIndex}`}
                      className="group flex items-center gap-3 px-5 py-3"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <FileDown className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{Item.game}</p>
                        <p className="text-xs text-muted-foreground">
                          {FormatDate(Item.timestamp)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => HandleRemoveDownloadHistoryItem(Item.historyIndex)}
                        disabled={RemovingDownloadHistoryIndex === Item.historyIndex}
                        className="hover:text-destructive h-8 w-8 shrink-0 text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                        title={`Clear ${Item.game} from history`}
                        aria-label={`Clear ${Item.game} from history`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            ) : (
              <div className="p-4">
                <EmptyState
                  icon={Archive}
                  title={T("profile.noDownloadHistory")}
                  description={T("profile.noDownloadHistoryDesc")}
                  className="py-12"
                />
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel data-tour="profile-achievements" className="overflow-hidden">
            <PanelHeader
              icon={Trophy}
              title={T("profile.achievements")}
              meta={
                IsLoadingAchievementsLeaderboard
                  ? T("profile.loading")
                  : AchievementsLeaderboard.length > 0
                    ? T("profile.topN", { count: AchievementsLeaderboard.length })
                    : null
              }
            />
            {AchievementsLeaderboard.length > 0 ? (
              <ol className="space-y-3 p-5">
                {AchievementsLeaderboard.map((Entry, Index) => (
                  <li key={Entry.gameName} className="space-y-1.5">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="w-5 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                        {Index + 1}
                      </span>
                      <span
                        className="min-w-0 flex-1 truncate font-medium"
                        title={Entry.gameName}
                      >
                        {Entry.gameName}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {Entry.unlocked}/{Entry.total}
                      </span>
                    </div>
                    <Progress
                      value={Entry.percentage}
                      className="ml-7 h-1 w-auto bg-muted/60"
                    />
                  </li>
                ))}
              </ol>
            ) : (
              <p className="px-5 py-6 text-center text-sm text-muted-foreground">
                {IsLoadingAchievementsLeaderboard
                  ? T("profile.loading")
                  : T("profile.noAchievements")}
              </p>
            )}
          </Panel>

          <Panel className="overflow-hidden">
            <PanelHeader icon={Monitor} title={T("profile.device")} />
            <dl className="space-y-2.5 p-5 text-sm">
              {DeviceRows.map(Row => (
                <div key={Row.label} className="flex items-center justify-between gap-4">
                  <dt className="shrink-0 text-muted-foreground">{Row.label}</dt>
                  <dd className="truncate text-right font-medium" title={Row.value}>
                    {UnknownDeviceInfo(Row.value) ? "—" : Row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </Panel>

          <Panel data-tour="profile-notes" className="overflow-hidden">
            <PanelHeader
              icon={NotebookPen}
              title={T("profile.privateNotes")}
              meta={<span className="text-xs">{T("profile.savedLocally")}</span>}
            />
            <div className="p-4">
              <Textarea
                value={PrivateNotes}
                onChange={Event => SetPrivateNotes(Event.target.value)}
                placeholder={T("profile.privateNotesPlaceholder")}
                className="min-h-[120px] resize-none bg-background/50"
              />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
};

export default Profile;
