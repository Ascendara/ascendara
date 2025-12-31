import React, {
  useEffect as UseEffect,
  useMemo as UseMemo,
  useRef as UseRef,
  useState as UseState,
} from "react";
import { useLanguage as UseLanguage } from "@/context/LanguageContext";
import { useAuth as UseAuth } from "@/context/AuthContext";

import UsernameDialog from "@/components/UsernameDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

import { cn as Cn } from "@/lib/utils";
import {
  getUserStatus as GetUserStatus,
  updateUserStatus as UpdateUserStatus,
} from "@/services/firebaseService";
import {
  Archive,
  Clock,
  Cpu,
  FileDown,
  Gamepad2,
  HardDrive,
  Monitor,
  Music2,
  Smile,
  Sparkles,
  Trophy,
  Upload,
} from "lucide-react";

const VUS = ["online", "away", "busy", "invisible"];

const LevelXpBase = 1000;
const MaxProfileLevel = 999;

const XpRules = {
  basePerGame: 25,
  perHourPlayed: 10,
  perLaunch: 2,
  launchBonusCap: 50,
  completedBonus: 100,
  playtimeMilestones: [
    { hours: 10, bonus: 50 },
    { hours: 25, bonus: 100 },
    { hours: 50, bonus: 250 },
    { hours: 100, bonus: 500 },
  ],
};

const ReadJsonFromLocalStorage = (StorageKey, FallbackValue) => {
  try {
    const RawValue = localStorage.getItem(StorageKey);

    if (!RawValue) {
      return FallbackValue;
    }

    return JSON.parse(RawValue);
  } catch (Error) {
    console.warn(
      `[Profile]couldnt read ${StorageKey} in localstorage using defaults`,
      Error
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

const Profile = () => {
  const { t: T } = UseLanguage();
  const { user: User } = UseAuth();

  const [JoinDate, SetJoinDate] = UseState("");
  const [Username, SetUsername] = UseState("");
  const [IsUsingGoldbergName, SetIsUsingGoldbergName] = UseState(true);
  const [GeneralUsername, SetGeneralUsername] = UseState("");
  const [PrivateNotes, SetPrivateNotes] = UseState(() => {
    const UserPrefs = ReadJsonFromLocalStorage("userProfile", {});

    return UserPrefs.privateNotes || UserPrefs.bio || "";
  });
  const [IsTypingNotes, SetIsTypingNotes] = UseState(false);
  const TypingNotesTTTPtr = UseRef(null);
  const LastSyncedProfileStatsPtr = UseRef(null);

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
  const [Games, SetGames] = UseState([]);
  const [IsLoading, SetIsLoading] = UseState(true);
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
    gaming: (
      <Gamepad2 className="h-4 w-4 transition-transform duration-300 ease-out group-hover:-rotate-6 group-hover:scale-110" />
    ),
    faces: (
      <Smile className="h-4 w-4 transition-transform duration-300 ease-out group-hover:-rotate-6 group-hover:scale-110" />
    ),
    tech: (
      <Cpu className="h-4 w-4 transition-transform duration-300 ease-out group-hover:-rotate-6 group-hover:scale-110" />
    ),
    space: (
      <Sparkles className="h-4 w-4 transition-transform duration-300 ease-out group-hover:rotate-6 group-hover:scale-110" />
    ),
    audio: (
      <Music2 className="h-4 w-4 transition-transform duration-300 ease-out group-hover:rotate-6 group-hover:scale-110" />
    ),
  };
  const [GameImages, SetGameImages] = UseState({});
  const [DownloadHistory, SetDownloadHistory] = UseState([]);

  const [UserStatus, SetUserStatus] = UseState("online");

  const [ActiveEmojiCategoryId, SetActiveEmojiCategoryId] = UseState(
    EmojiCategories[0].id
  );

  UseEffect(() => {
    localStorage.setItem("selectedEmoji", SelectedEmoji);
  }, [SelectedEmoji]);

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
            `[Profile] Unexpected user status from backend; defaulting to online.`,
            { FetchedStatus }
          );
        }
      } catch (Error) {
        console.error(
          `[Profile] Failed to load user status — check Firestore rules / network.`,
          Error
        );
      }
    };

    LoadStatus();

    return () => {
      DidCancel = true;
    };
  }, [User?.uid]);

  const handleUserStatusChange = async NextStatus => {
    if (!VUS.includes(NextStatus)) {
      console.warn(`[Profile] Ignore`, {
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
          Error: Result?.error,
        });
        SetUserStatus(PreviousStatus);

        const Refreshed = await GetUserStatus(User.uid);
        const BackendStatus = Refreshed?.data?.status;

        if (BackendStatus && VUS.includes(BackendStatus)) {
          SetUserStatus(BackendStatus);
        }
      }
    } catch (Error) {
      console.error(`[Profile] Failed to update user status check firestore`, Error);
      SetUserStatus(PreviousStatus);
    }
  };

  const calculateLevelProgressFromXP = TotalXp => {
    const NormalizedXp = typeof TotalXp === "number" ? TotalXp : 0;

    const RawLevel = 1 + Math.sqrt(NormalizedXp / LevelXpBase) * 1.5;
    let Level = Math.max(1, Math.floor(RawLevel));
    Level = Math.min(Level, MaxProfileLevel);

    if (Level >= MaxProfileLevel) {
      return {
        level: MaxProfileLevel,
        xp: NormalizedXp,
        currentXP: 100,
        nextLevelXp: 100,
      };
    }

    const XpForCurrentLevel = Level <= 1 ? 0 : LevelXpBase * Math.pow(Level, 2);
    const XpForNextLevel = LevelXpBase * Math.pow(Level + 1, 2);
    const XpNeededForNextLevel = XpForNextLevel - XpForCurrentLevel;
    const CurrentLevelProgress = Math.max(0, NormalizedXp - XpForCurrentLevel);

    return {
      level: Level,
      xp: NormalizedXp,
      currentXP: CurrentLevelProgress,
      nextLevelXp: XpNeededForNextLevel,
    };
  };

  const buildProfileStatsFromGames = (InstalledGames, CustomGames) => {
    const AllGames = [...(InstalledGames || []), ...(CustomGames || [])];

    let TotalXp = 0;
    let TotalPlaytimeSeconds = 0;
    let GamesPlayedCount = 0;

    for (const Game of AllGames) {
      const PlaytimeSeconds = typeof Game?.playTime === "number" ? Game.playTime : 0;
      const PlaytimeHours = PlaytimeSeconds / 3600;
      const LaunchCount = typeof Game?.launchCount === "number" ? Game.launchCount : 0;
      const IsCompleted = !!Game?.completed;

      if (PlaytimeSeconds > 0) {
        GamesPlayedCount += 1;
      }

      let XpFromThisGame = XpRules.basePerGame;

      XpFromThisGame += Math.floor(PlaytimeHours * XpRules.perHourPlayed);
      const LaunchBonus = Math.min(
        LaunchCount * XpRules.perLaunch,
        XpRules.launchBonusCap
      );
      XpFromThisGame += LaunchBonus;

      if (IsCompleted) {
        XpFromThisGame += XpRules.completedBonus;
      }

      TotalXp += XpFromThisGame;
      TotalPlaytimeSeconds += PlaytimeSeconds;
    }

    const TotalPlaytimeHours = TotalPlaytimeSeconds / 3600;
    for (const Milestone of XpRules.playtimeMilestones) {
      if (TotalPlaytimeHours >= Milestone.hours) {
        TotalXp += Milestone.bonus;
      }
    }

    const LevelProgress = calculateLevelProgressFromXP(TotalXp);

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

  const GetDisplayUsername = () => {
    return GeneralUsername || "Guest";
  };

  UseEffect(() => {
    LoadProfile();
    LoadProfileImage();

    const handleProfileUpdate = () => {
      LoadProfile();
    };

    window.addEventListener("storage", handleProfileUpdate);

    window.addEventListener("username-updated", handleProfileUpdate);

    return () => {
      window.removeEventListener("storage", handleProfileUpdate);
      window.removeEventListener("username-updated", handleProfileUpdate);
    };
  }, []);

  UseEffect(() => {
    let DidCancel = false;

    const loadAchievementsLeaderboard = async () => {
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
          g => !g?.downloadingData?.downloading && !g?.downloadingData?.extracting
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

        const results = await Promise.all(
          EligibleGames.map(async Game => {
            try {
              const GameName = Game.game || Game.name;
              const IsCustom = Game.isCustom || Game.custom || false;

              if (!GameName) return null;

              const achievementData = await window.electron.readGameAchievements(
                GameName,
                IsCustom
              );

              const AchievementList = achievementData?.achievements;
              if (!Array.isArray(AchievementList) || AchievementList.length === 0) {
                return null;
              }

              const UnlockedCount = AchievementList.filter(
                a => !!(a?.achieved || a?.unlocked || a?.isUnlocked)
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

        const Top6 = results.filter(Boolean).sort(CompareAchievementEntries).slice(0, 6);

        SetAchievementsLeaderboard(Top6);
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

    loadAchievementsLeaderboard();

    return () => {
      DidCancel = true;
    };
  }, [Games]);

  const LoadProfile = async () => {
    try {
      SetIsLoading(true);

      if (!window.electron) {
        throw new Error("window.electron is not available (preload/IPC not initialized)");
      }

      const JoinDateString = await window.electron.timestampTime();
      SetJoinDate(JoinDateString);

      const InstalledAndCustomGames = await LoadGamesData();

      const DownloadHistory = await window.electron.getDownloadHistory();
      SetDownloadHistory(DownloadHistory);

      let CalculatedStats = buildProfileStatsFromGames(InstalledAndCustomGames, []);

      let persistedProfileStats = null;
      try {
        persistedProfileStats =
          await window.electron?.getTimestampValue?.("profileStats");
      } catch (e) {
        persistedProfileStats = null;
      }

      if (!InstalledAndCustomGames || InstalledAndCustomGames.length === 0) {
        const PersistedXp = persistedProfileStats?.xp;

        if (typeof PersistedXp === "number") {
          const Progress = calculateLevelProgressFromXP(PersistedXp);

          CalculatedStats = {
            ...CalculatedStats,
            ...Progress,
            totalPlaytime:
              typeof persistedProfileStats?.totalPlaytime === "number"
                ? persistedProfileStats.totalPlaytime
                : CalculatedStats.totalPlaytime,
            gamesPlayed:
              typeof persistedProfileStats?.gamesPlayed === "number"
                ? persistedProfileStats.gamesPlayed
                : CalculatedStats.gamesPlayed,
            totalGames:
              typeof persistedProfileStats?.totalGames === "number"
                ? persistedProfileStats.totalGames
                : CalculatedStats.totalGames,
          };
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

      SetGames(InstalledAndCustomGames);
      if (window.electron?.setTimestampValue) {
        const Payload = {
          level: CalculatedStats.level || 1,
          xp: CalculatedStats.xp || 0,
          totalPlaytime: CalculatedStats.totalPlaytime || 0,
          gamesPlayed: CalculatedStats.gamesPlayed || 0,
          totalGames: CalculatedStats.totalGames || 0,
          joinDate: JoinDateString || null,
        };

        const Fingerprint = JSON.stringify(Payload);

        if (LastSyncedProfileStatsPtr.current !== Fingerprint) {
          LastSyncedProfileStatsPtr.current = Fingerprint;
          try {
            await window.electron.setTimestampValue("profileStats", Payload);
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

      SetUsername(UserPrefs.username || "");
      SetGeneralUsername(UserPrefs.profileName || "");
      SetIsUsingGoldbergName(UserPrefs.useForGoldberg ?? true);
      SetPrivateNotes(UserPrefs.privateNotes || UserPrefs.bio || "");

      SetIsLoading(false);
    } catch (error) {
      console.error(
        `[Profile] Error loading profile — if this is a fresh install, double-check preload/IPC wiring.`,
        error
      );
      SetIsLoading(false);
    }
  };

  UseEffect(() => {
    let cancelled = false;

    const loadDeviceInfo = async () => {
      try {
        const platform =
          window.electron?.getPlatform?.() ||
          navigator.userAgentData?.platform ||
          navigator.platform ||
          "Unknown";

        const specs = await window.electron?.fetchSystemSpecs?.();
        if (cancelled) return;

        SetDeviceInfo(Prev => ({
          ...Prev,
          platform,
          ...(specs || {}),
        }));
      } catch (error) {
        console.error(`[Profile] device info load failed`, error);
      }
    };

    loadDeviceInfo();

    return () => {
      cancelled = true;
    };
  }, []);

  const LoadGamesData = async () => {
    try {
      const Settings = await window.electron.getSettings();

      if (!Settings || !Settings.downloadDirectory) {
        return [];
      }

      const InstalledGames = await window.electron.getGames();
      let customGames = [];
      try {
        customGames = await window.electron.getCustomGames();
      } catch (error) {
        console.error(
          `[Profile] Failed to load custom games — continuing with installed games only.`,
          error
        );
      }
      return [...InstalledGames, ...customGames];
    } catch (error) {
      console.error(
        `[Profile] Error loading games data — check permissions / download folder path.`,
        error
      );
      return [];
    }
  };

  UseEffect(() => {
    const LoadGameImages = async () => {
      const Images = {};

      for (const Game of Games) {
        try {
          const GameId = Game.game || Game.name;
          const LocalStorageKey = `game-cover-${GameId}`;
          const CachedImage = localStorage.getItem(LocalStorageKey);

          if (CachedImage) {
            Images[GameId] = CachedImage;
            continue;
          }

          const ImageBase64 = await window.electron.getGameImage(GameId);
          if (ImageBase64) {
            const DataUrl = `data:image/jpeg;base64,${ImageBase64}`;
            Images[GameId] = DataUrl;
            try {
              localStorage.setItem(LocalStorageKey, DataUrl);
            } catch (Error) {
              console.warn(`[Profile] couldnt cache game cover`, Error);
            }
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
      if (!Games.some(g => (g.game || g.name) === GameName)) return;

      console.log(`[Profile] got cover update for ${GameName}`);
      SetGameImages(PrevImages => {
        const NewImages = { ...PrevImages, [GameName]: DataUrl };

        try {
          const LocalStorageKey = `game-cover-${GameName}`;
          localStorage.setItem(LocalStorageKey, DataUrl);
        } catch (Error) {
          console.warn(`[Profile] couldnt cache cover`, Error);
        }

        return NewImages;
      });
    };

    window.addEventListener("game-cover-updated", HandleCoverUpdate);

    if (Games.length > 0) {
      LoadGameImages();
    }

    return () => {
      window.removeEventListener("game-cover-updated", HandleCoverUpdate);
    };
  }, [Games]);

  const HandleImageUpload = async E => {
    const File = E.target.files[0];
    if (File) {
      try {
        const Reader = new FileReader();
        Reader.onload = async Event => {
          const Base64 = Event.target.result;
          const Result = await window.electron.uploadProfileImage(Base64);
          if (Result.success) {
            SetProfileImage(Base64);
            localStorage.setItem("profileImage", Base64);
            localStorage.setItem("useEmoji", "false");
          }
        };
        Reader.readAsDataURL(File);
      } catch (error) {
        console.error(`[Profile] profile image upload failed`, error);
      }
    }
  };

  const SwitchToEmoji = Emoji => {
    SetSelectedEmoji(Emoji);
    SetProfileImage(null);
    localStorage.removeItem("profileImage");
    localStorage.setItem("useEmoji", "true");
  };

  const LoadProfileImage = async () => {
    try {
      const UseEmoji = localStorage.getItem("useEmoji") !== "false";
      if (UseEmoji) {
        SetProfileImage(null);
        return;
      }

      const SavedImage = localStorage.getItem("profileImage");
      if (SavedImage) {
        SetProfileImage(SavedImage);
      } else {
        const Image = await window.electron.getProfileImage();
        if (Image) {
          const Base64 = `data:image/png;base64,${Image}`;
          SetProfileImage(Base64);
          localStorage.setItem("profileImage", Base64);
        }
      }
    } catch (error) {
      console.error(`[Profile] profile image load failed`, error);
    }
  };

  const renderProfileSection = () => {
    const IsUsingEmoji = !ProfileImage;

    return (
      <div className="relative">
        <div className="flex items-center justify-start gap-4 p-4 text-left">
          <Popover>
            <PopoverTrigger asChild>
              <div
                className={Cn(
                  "group/avatar relative flex h-32 w-32 cursor-pointer items-center justify-center rounded-full bg-card text-4xl shadow-sm ring-0 transition-all duration-300 ease-out hover:scale-105 hover:shadow-lg active:scale-95",
                  UserStatus === "online" && "hover:ring-4 hover:ring-green-500",
                  UserStatus === "away" && "hover:ring-4 hover:ring-yellow-400",
                  UserStatus === "busy" && "hover:ring-4 hover:ring-red-500",
                  UserStatus === "invisible" && "hover:ring-4 hover:ring-gray-400"
                )}
                style={
                  ProfileImage
                    ? {
                        backgroundImage: `url(${ProfileImage})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }
                    : {}
                }
              >
                {!ProfileImage && SelectedEmoji}
                <div className="absolute -bottom-1 -right-1 flex items-center justify-center rounded-full bg-primary/90 p-1 shadow-sm transition-transform duration-300 ease-out group-hover/avatar:scale-110">
                  <Smile className="spin-bounce h-6 w-6 text-secondary" />
                </div>
              </div>
            </PopoverTrigger>
            <PopoverContent
              className={Cn(
                "group relative overflow-hidden",
                "animate-fade-in w-[360px] rounded-2xl",
                "border border-dashed border-border/60",
                "bg-background/80 p-6 shadow-sm backdrop-blur-md",
                "transition-all duration-300 ease-out",
                "hover:border-primary/40 hover:shadow-lg hover:shadow-primary/15 hover:ring-1 hover:ring-primary/15"
              )}
              align="start"
              sideOffset={8}
            >
              <div className="space-y-6">
                {/* Current Display */}
                <div
                  className={Cn(
                    "group relative overflow-hidden",
                    "animate-fade-in flex items-center justify-between rounded-xl",
                    "border border-dashed border-border/60",
                    "bg-transparent p-4 shadow-sm backdrop-blur-md",
                    "transition-all duration-300 ease-out",
                    "hover:border-primary/40 hover:shadow-lg hover:shadow-primary/15 hover:ring-1 hover:ring-primary/15"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-background/60 shadow-sm ring-1 ring-border/60 transition-all duration-300 ease-out active:scale-95">
                      {ProfileImage ? (
                        <img
                          src={ProfileImage}
                          alt="Profile"
                          className="h-full w-full object-cover transition-all duration-300 ease-out"
                        />
                      ) : (
                        <span className="text-3xl">{SelectedEmoji}</span>
                      )}
                    </div>
                    <div>
                      <p className="text-base font-semibold text-foreground">
                        {ProfileImage
                          ? "Currently Using Custom Image"
                          : "Currently Using Emoji"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {ProfileImage
                          ? "Why not express yourself with emojis?"
                          : "Be stylish with a custom image!"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* User Status Dropdown */}
                <div className="animate-fade-in mb-2 flex justify-center">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        className={Cn(
                          "group flex items-center gap-2 rounded-full",
                          "border border-dashed border-border/60 bg-transparent",
                          "px-4 py-2 text-xs font-semibold shadow-sm backdrop-blur-md",
                          "transition-all duration-300 focus:outline-none",
                          "hover:border-primary/40 hover:shadow-lg hover:shadow-primary/15 hover:ring-1 hover:ring-primary/15",
                          UserStatus === "online" && "ring-green-500",
                          UserStatus === "away" && "ring-yellow-400",
                          UserStatus === "busy" && "ring-red-500",
                          UserStatus === "invisible" && "ring-gray-400",
                          "active:scale-95"
                        )}
                      >
                        <span
                          className={Cn(
                            "transition-transform duration-300",
                            "group-hover:scale-125 group-active:scale-90"
                          )}
                        >
                          {UserStatus === "online" && (
                            <span className="text-green-500">🟢</span>
                          )}
                          {UserStatus === "away" && (
                            <span className="text-yellow-400">🟡</span>
                          )}
                          {UserStatus === "busy" && (
                            <span className="text-red-500">🔴</span>
                          )}
                          {UserStatus === "invisible" && (
                            <span className="text-gray-400">⚪</span>
                          )}
                        </span>
                        <span className="capitalize">{UserStatus}</span>
                        <svg
                          className="ml-1 h-3 w-3 text-muted-foreground transition-transform duration-300 group-data-[state=open]:-rotate-180"
                          fill="none"
                          viewBox="0 0 20 20"
                        >
                          <path
                            d="M6 8l4 4 4-4"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="center"
                      sideOffset={8}
                      className={Cn(
                        "group relative overflow-hidden",
                        "animate-dropdown-in w-44 rounded-xl",
                        "border border-dashed border-border/60",
                        "bg-background/80 p-2 shadow-sm backdrop-blur-md",
                        "transition-all duration-300",
                        "hover:border-primary/40 hover:shadow-lg hover:shadow-primary/15 hover:ring-1 hover:ring-primary/15"
                      )}
                    >
                      {[
                        {
                          id: "online",
                          label: "Online",
                          icon: "🟢",
                          color: "text-green-500",
                        },
                        {
                          id: "away",
                          label: "Away",
                          icon: "🟡",
                          color: "text-yellow-400",
                        },
                        { id: "busy", label: "Busy", icon: "🔴", color: "text-red-500" },
                      ].map(status => (
                        <button
                          key={status.id}
                          className={Cn(
                            "flex w-full items-center gap-2 rounded-lg",
                            "border border-transparent px-3 py-2 text-xs font-semibold",
                            "transition-all duration-200",
                            "hover:scale-[1.02] hover:border-primary/20 hover:bg-accent/20 active:scale-95",
                            UserStatus === status.id
                              ? "border-primary/30 bg-accent/25 text-primary"
                              : "text-foreground"
                          )}
                          onClick={() => handleUserStatusChange(status.id)}
                          type="button"
                        >
                          <span className={status.color}>{status.icon}</span>
                          <span className="capitalize">{status.label}</span>
                        </button>
                      ))}
                    </PopoverContent>
                  </Popover>
                </div>

                <Separator className="transition-all duration-300 ease-out" />

                {/* Upload Image */}
                <div className="animate-fade-in flex flex-col items-center gap-3 rounded-xl border border-dashed border-accent bg-accent/10 p-4 transition-all duration-300 ease-out hover:bg-accent/20">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={HandleImageUpload}
                    className="hidden"
                    id="profile-image-upload"
                  />
                  <Button
                    variant="outline"
                    className="animate-pop-bounce flex h-10 w-full items-center justify-center gap-2 rounded-lg font-semibold transition-all duration-300 ease-out hover:bg-accent/60 active:scale-95"
                    onClick={() =>
                      document.getElementById("profile-image-upload").click()
                    }
                  >
                    <Upload className="h-5 w-5 transition-all duration-300 ease-out" />
                    <span>Upload a profile image</span>
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    PNG, JPG, .GIF, ETC, up to 50MB
                  </span>
                </div>
              </div>

              <div className="my-6">
                <Separator className="transition-all duration-300 ease-out" />
              </div>

              {/* Emoji Selection */}
              <div className="animate-fade-in space-y-4">
                {/* Icon Tabs */}
                <div className="mb-2 flex items-center justify-center gap-2">
                  {EmojiCategories.map(category => (
                    <button
                      key={category.id}
                      className={Cn(
                        "group grid h-8 min-h-8 w-8 min-w-8 place-items-center rounded-full bg-transparent shadow-sm transition-all duration-300 ease-out focus:outline-none",
                        ActiveEmojiCategoryId === category.id
                          ? "animate-pop-bounce scale-110 ring-2 ring-primary"
                          : "hover:scale-105 hover:bg-accent/20"
                      )}
                      onClick={() => SetActiveEmojiCategoryId(category.id)}
                      type="button"
                      aria-label={category.title}
                    >
                      {EmojiTabIcons[category.id]}
                    </button>
                  ))}
                </div>

                {/* Emoji Grid */}
                <div className="animate-fade-in">
                  {EmojiCategories.filter(
                    category => category.id === ActiveEmojiCategoryId
                  ).map(category => (
                    <div key={category.id} className="space-y-2">
                      <div className="grid grid-cols-6 gap-2">
                        {category.emojis.map((emoji, index) => (
                          <Button
                            key={`${category.id}-${emoji}-${index}`}
                            variant={
                              SelectedEmoji === emoji && !ProfileImage
                                ? "secondary"
                                : "ghost"
                            }
                            className={Cn(
                              "h-10 w-10 rounded-lg text-2xl shadow-sm transition-all duration-300 ease-out",
                              "hover:scale-110 hover:bg-accent/80 active:scale-95",
                              SelectedEmoji === emoji &&
                                !ProfileImage &&
                                "animate-pop-bounce ring-2 ring-primary"
                            )}
                            onClick={() => SwitchToEmoji(emoji)}
                          >
                            {emoji}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <div className="flex-1">
            <div className="mt-4 flex flex-col items-start gap-2 px-2">
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold leading-none text-primary">
                  {GetDisplayUsername()}
                </h2>
                <UsernameDialog />
              </div>
              <span className="mt-2 inline-block rounded-full bg-primary/80 px-4 py-1 text-xs font-semibold text-secondary shadow transition-all">
                {T("profile.memberSince", { date: JoinDate })}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const FormatPlayTime = seconds => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours === 0) {
      return `${minutes}m`;
    }
    return `${hours}h ${minutes}m`;
  };

  const SortedGames = UseMemo(() => {
    return [...Games]
      .filter(game => game.playTime && game.playTime >= 60)
      .sort((a, b) => (b.playTime || 0) - (a.playTime || 0));
  }, [Games]);

  const PlaytimeStats = UseMemo(() => {
    if (!SortedGames.length) return null;

    const totalPlaytime = SortedGames.reduce(
      (sum, game) => sum + (game.playTime || 0),
      0
    );
    const avgPlaytime = totalPlaytime / SortedGames.length;
    const mostPlayed = SortedGames[0];
    const recentGames = SortedGames.slice(0, 5).map(game => ({
      name: game.game || game.name,
      playTime: game.playTime || 0,
      percentage: ((game.playTime || 0) / totalPlaytime) * 100,
    }));

    return {
      totalPlaytime,
      avgPlaytime,
      mostPlayed,
      recentGames,
    };
  }, [SortedGames]);

  const LevelProgressPercent = UseMemo(() => {
    const denom = Stats.nextLevelXp || 0;
    if (!denom) return 0;
    const raw = (Stats.currentXP / denom) * 100;
    return Math.max(0, Math.min(100, raw));
  }, [Stats.currentXP, Stats.nextLevelXp]);

  const SaveUserPreferences = data => {
    try {
      const currentPrefs = JSON.parse(localStorage.getItem("userProfile") || "{}");
      const updatedPrefs = { ...currentPrefs, ...data };
      localStorage.setItem("userProfile", JSON.stringify(updatedPrefs));
      return true;
    } catch (error) {
      console.error("Error saving user preferences:", error);
      return false;
    }
  };

  UseEffect(() => {
    SaveUserPreferences({ privateNotes: PrivateNotes });
  }, [PrivateNotes]);

  UseEffect(() => {
    return () => {
      if (TypingNotesTTTPtr.current) {
        clearTimeout(TypingNotesTTTPtr.current);
      }
    };
  }, []);

  const formatDate = dateString => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="container mx-auto space-y-6 p-4">
      {/* Profile Header */}
      <div
        className={Cn(
          "group relative mt-8 overflow-hidden rounded-2xl border border-primary/30",
          "bg-gradient-to-br from-primary/10 via-primary/5 to-violet-500/5",
          "p-6 transition-all",
          "animate-fade-in motion-reduce:animate-none",
          "hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10"
        )}
      >
        <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/20 blur-2xl transition-all group-hover:bg-primary/30" />
        <div className="relative min-h-[13rem]">
          <div className="absolute inset-0 flex items-center justify-start">
            {renderProfileSection()}
          </div>
        </div>
      </div>

      {/* Widget Card Layout */}
      {/* TODO: Make a proper widget system with draggable UI Interfaces */}
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card
          style={{ animationDelay: "60ms" }}
          className={Cn(
            "group relative overflow-hidden rounded-xl border border-dashed border-border/60",
            "bg-transparent",
            "p-1 transition-all",
            "animate-fade-in motion-reduce:animate-none",
            "transition-all duration-300 ease-out",
            "shadow-sm",
            "hover:border-primary/40 hover:shadow-lg hover:shadow-primary/15 hover:ring-1 hover:ring-primary/15",
            "h-full"
          )}
        >
          <CardHeader className="relative pb-3">
            <CardTitle className="group flex w-full items-center justify-start gap-2 text-left">
              <Sparkles className="h-5 w-5 text-primary transition-transform duration-300 ease-out group-hover:rotate-6 group-hover:scale-110" />
              <span className="transition-colors duration-300 ease-out group-hover:text-primary">
                {T("profile.stats") || "Stats"}
              </span>
            </CardTitle>
          </CardHeader>

          <CardContent className="relative flex h-full flex-col">
            <div className="flex flex-1 flex-col gap-4">
              <div
                className={Cn(
                  "group rounded-lg border-2 border-border bg-background/5 p-4 backdrop-blur-md",
                  "transition-all duration-300 ease-out",
                  "hover:bg-background/10"
                )}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Sparkles className="h-4 w-4 text-primary transition-transform duration-300 ease-out group-hover:rotate-6 group-hover:scale-110" />
                      <span className="transition-colors duration-300 ease-out group-hover:text-primary">
                        {T("profile.level") || "Level"}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-primary">{Stats.level}</div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {Math.min(Stats.currentXP, Stats.nextLevelXp)} /{" "}
                        {Stats.nextLevelXp} XP
                      </span>
                      <span>{Math.round(LevelProgressPercent)}%</span>
                    </div>
                    <Progress value={LevelProgressPercent} className="h-2 bg-muted/40" />
                  </div>

                  <Separator />

                  <div className="grid gap-2 text-left text-xs">
                    <div className="flex items-center justify-between">
                      <span className="group flex items-center gap-2 text-muted-foreground">
                        <Clock className="h-3 w-3 transition-transform duration-300 ease-out group-hover:-rotate-6 group-hover:scale-110" />{" "}
                        {T("profile.totalPlaytime")}
                      </span>
                      <span className="font-semibold text-foreground">
                        {PlaytimeStats
                          ? FormatPlayTime(PlaytimeStats.totalPlaytime)
                          : "0h"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="group flex items-center gap-2 text-muted-foreground">
                        <Trophy className="h-3 w-3 transition-transform duration-300 ease-out group-hover:rotate-6 group-hover:scale-110" />{" "}
                        {T("profile.gamesPlayed")}
                      </span>
                      <span className="font-semibold text-foreground">
                        {Stats.gamesPlayed}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        {T("profile.mostPlayed")}
                      </span>
                      <span className="max-w-[160px] truncate text-left font-semibold text-foreground">
                        {PlaytimeStats?.mostPlayed
                          ? PlaytimeStats.mostPlayed.game || PlaytimeStats.mostPlayed.name
                          : "-"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="group flex items-center gap-2 text-muted-foreground">
                        <Cpu className="h-3 w-3 transition-transform duration-300 ease-out group-hover:-rotate-6 group-hover:scale-110" />
                        XP
                      </span>
                      <span className="font-semibold text-foreground">{Stats.xp}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div
                className={Cn(
                  "group rounded-lg border-2 border-border bg-background/5 p-4 backdrop-blur-md",
                  "transition-all duration-300 ease-out",
                  "hover:bg-background/10"
                )}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-start gap-2 text-left text-sm font-semibold">
                    <Smile className="h-4 w-4 text-primary transition-transform duration-300 ease-out group-hover:-rotate-6 group-hover:scale-110" />
                    <span>{T("profile.privateNotes") || "Private Notes"}</span>
                  </div>

                  <div
                    className={Cn(
                      "relative overflow-hidden rounded-md",
                      "transition-all duration-300 ease-out",
                      "hover:ring-1 hover:ring-primary/15",
                      "focus-within:ring-2 focus-within:ring-primary/30",
                      IsTypingNotes && "ring-2 ring-primary/30"
                    )}
                  >
                    <div
                      className={Cn(
                        "pointer-events-none absolute inset-0 z-20 opacity-0 transition-opacity duration-300 ease-out",
                        IsTypingNotes && "opacity-100"
                      )}
                    >
                      <div className="via-primary/12 absolute inset-0 animate-shine bg-gradient-to-r from-primary/0 to-primary/0 bg-[length:200%_100%] mix-blend-soft-light motion-reduce:animate-none" />
                    </div>

                    <Textarea
                      value={PrivateNotes}
                      onChange={e => {
                        const nextValue = e.target.value;
                        SetPrivateNotes(nextValue);

                        SetIsTypingNotes(true);
                        if (TypingNotesTTTPtr.current) {
                          clearTimeout(TypingNotesTTTPtr.current);
                        }
                        TypingNotesTTTPtr.current = setTimeout(() => {
                          SetIsTypingNotes(false);
                        }, 350);
                      }}
                      placeholder={
                        T("profile.privateNotesPlaceholder") ||
                        "Notes for this device (private)..."
                      }
                      className={Cn(
                        "relative z-10 min-h-[110px] resize-none",
                        "bg-background/50 backdrop-blur",
                        "cursor-text caret-primary selection:bg-primary/20",
                        "transition-colors duration-200 ease-out",
                        "focus-visible:outline-none"
                      )}
                    />
                  </div>
                  <div className="text-center text-xs text-muted-foreground">
                    {T("profile.savedLocally") || "Saved locally"}
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <div className="flex items-center justify-start gap-2 text-left text-sm font-semibold">
                      <Monitor className="h-4 w-4 text-primary transition-transform duration-300 ease-out group-hover:-rotate-6 group-hover:scale-110" />
                      <span className="transition-colors duration-300 ease-out group-hover:text-primary">
                        {T("profile.device") || "Device"}
                      </span>
                    </div>

                    <div className="grid gap-2 text-left text-xs">
                      <div className="flex items-center justify-between">
                        <span className="group flex items-center gap-2 text-muted-foreground">
                          <Monitor className="h-3 w-3 transition-transform duration-300 ease-out group-hover:-rotate-6 group-hover:scale-110" />{" "}
                          {T("profile.platform") || "Platform"}
                        </span>
                        <span className="max-w-[180px] truncate text-right font-semibold text-foreground">
                          {DeviceInfo.platform || "Unknown"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="group flex items-center gap-2 text-muted-foreground">
                          <HardDrive className="h-3 w-3 transition-transform duration-300 ease-out group-hover:rotate-6 group-hover:scale-110" />{" "}
                          {T("profile.os") || "OS"}
                        </span>
                        <span className="max-w-[180px] truncate text-right font-semibold text-foreground">
                          {DeviceInfo.os || "Unknown"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="group flex items-center gap-2 text-muted-foreground">
                          <Cpu className="h-3 w-3 transition-transform duration-300 ease-out group-hover:-rotate-6 group-hover:scale-110" />{" "}
                          {T("profile.cpu") || "CPU"}
                        </span>
                        <span className="max-w-[180px] truncate text-right font-semibold text-foreground">
                          {DeviceInfo.cpu || "Unknown"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="group flex items-center gap-2 text-muted-foreground">
                          <HardDrive className="h-3 w-3 transition-transform duration-300 ease-out group-hover:rotate-6 group-hover:scale-110" />{" "}
                          {T("profile.ram") || "RAM"}
                        </span>
                        <span className="max-w-[180px] truncate text-right font-semibold text-foreground">
                          {DeviceInfo.ram || "Unknown"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="group flex items-center gap-2 text-muted-foreground">
                          <Monitor className="h-3 w-3 transition-transform duration-300 ease-out group-hover:-rotate-6 group-hover:scale-110" />{" "}
                          {T("profile.gpu") || "GPU"}
                        </span>
                        <span className="max-w-[180px] truncate text-right font-semibold text-foreground">
                          {DeviceInfo.gpu || "Unknown"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="group flex items-center gap-2 text-muted-foreground">
                          <Sparkles className="h-3 w-3 transition-transform duration-300 ease-out group-hover:rotate-6 group-hover:scale-110" />{" "}
                          {T("profile.directX") || "DirectX"}
                        </span>
                        <span className="max-w-[180px] truncate text-right font-semibold text-foreground">
                          {DeviceInfo.directx || "Unknown"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div
                className={Cn(
                  "group flex flex-col rounded-lg border-2 border-border bg-background/5 p-4 backdrop-blur-md",
                  "transition-all duration-300 ease-out",
                  "hover:bg-background/10"
                )}
              >
                <div className="flex flex-col">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Trophy className="h-4 w-4 text-primary transition-transform duration-300 ease-out group-hover:rotate-6 group-hover:scale-110" />
                      <span className="transition-colors duration-300 ease-out group-hover:text-primary">
                        {T("profile.achievements") || "Achievements"}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {IsLoadingAchievementsLeaderboard
                        ? T("profile.loading") || "Loading..."
                        : AchievementsLeaderboard.length > 0
                          ? T("profile.topN", {
                              count: Math.min(AchievementsLeaderboard.length, 6),
                            }) || `Top ${Math.min(AchievementsLeaderboard.length, 6)}`
                          : T("profile.none") || "None"}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-3 items-end gap-3">
                    {(() => {
                      const second = AchievementsLeaderboard[1] || null;
                      const first = AchievementsLeaderboard[0] || null;
                      const third = AchievementsLeaderboard[2] || null;

                      const runner4 = AchievementsLeaderboard[3] || null;
                      const runner5 = AchievementsLeaderboard[4] || null;
                      const runner6 = AchievementsLeaderboard[5] || null;

                      const Column = ({
                        FirstPlace,
                        topEntry,
                        runnerRank,
                        runnerEntry,
                        emphasize,
                      }) => {
                        const showRunner = true;

                        return (
                          <div
                            className={Cn(
                              "flex flex-col overflow-hidden rounded-lg border border-dashed border-border/70",
                              "bg-transparent",
                              "transition-all duration-300 ease-out",
                              "hover:border-primary/30 hover:ring-1 hover:ring-primary/10"
                            )}
                          >
                            <div
                              className={Cn(
                                "flex flex-col items-center justify-end px-2 py-2 text-center",
                                emphasize ? "min-h-[92px]" : "min-h-[76px]"
                              )}
                            >
                              <div
                                className={Cn(
                                  "text-xs font-semibold text-muted-foreground",
                                  emphasize && "text-sm"
                                )}
                              >
                                #{FirstPlace}
                              </div>
                              <div
                                className={Cn(
                                  "mt-1 w-full truncate font-semibold text-foreground",
                                  emphasize ? "text-sm" : "text-xs"
                                )}
                                title={topEntry?.gameName || ""}
                              >
                                {topEntry?.gameName || "—"}
                              </div>
                              <div
                                className={Cn(
                                  "mt-1 text-xs text-muted-foreground",
                                  emphasize && "text-[0.7rem]"
                                )}
                              >
                                {topEntry
                                  ? `${topEntry.unlocked}/${topEntry.total}`
                                  : " "}
                              </div>
                            </div>

                            {showRunner ? (
                              <div className="border-t border-dashed border-border/70 px-2 py-2">
                                <div className="text-[0.7rem] font-semibold text-muted-foreground">
                                  #{runnerRank}
                                </div>
                                <div
                                  className="mt-1 truncate text-xs font-semibold text-foreground"
                                  title={runnerEntry?.gameName || ""}
                                >
                                  {runnerEntry?.gameName || "—"}
                                </div>
                                <div className="mt-1 text-[0.7rem] text-muted-foreground">
                                  {runnerEntry
                                    ? `${runnerEntry.unlocked}/${runnerEntry.total}`
                                    : " "}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      };

                      return (
                        <>
                          <Column
                            FirstPlace={2}
                            topEntry={second}
                            runnerRank={4}
                            runnerEntry={runner4}
                            emphasize={false}
                          />
                          <Column
                            FirstPlace={1}
                            topEntry={first}
                            runnerRank={5}
                            runnerEntry={runner5}
                            emphasize={true}
                          />
                          <Column
                            FirstPlace={3}
                            topEntry={third}
                            runnerRank={6}
                            runnerEntry={runner6}
                            emphasize={false}
                          />
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Widget Style Cards I guess */}
        <div className="grid gap-6">
          <Card
            style={{ animationDelay: "110ms" }}
            className={Cn(
              "group relative overflow-hidden rounded-xl border border-dashed border-border/60",
              "bg-transparent",
              "p-1 transition-all",
              "animate-fade-in motion-reduce:animate-none",
              "transition-all duration-300 ease-out",
              "shadow-sm",
              "hover:border-primary/40 hover:shadow-lg hover:shadow-primary/15 hover:ring-1 hover:ring-primary/15"
            )}
          >
            <CardHeader className="relative pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="group flex items-center justify-start gap-2 text-left">
                  <Gamepad2 className="h-5 w-5 text-primary transition-transform duration-300 ease-out group-hover:-rotate-6 group-hover:scale-110" />
                  <span className="transition-colors duration-300 ease-out group-hover:text-primary">
                    {T("profile.games")}
                  </span>
                </CardTitle>
                <span className="text-sm text-muted-foreground">
                  {SortedGames.length} {T("profile.gamesPlayed")}
                </span>
              </div>
            </CardHeader>
            <CardContent className="relative">
              <ScrollArea className="h-[360px] pr-4">
                {SortedGames.length > 0 ? (
                  <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {SortedGames.map(game => {
                      const gameId = game.game || game.name;
                      return (
                        <div
                          key={gameId}
                          className={Cn(
                            "group flex items-center gap-3 rounded-lg border border-border bg-card/50 p-3",
                            "backdrop-blur",
                            "transition-all duration-300 ease-out",
                            "hover:border-primary/20 hover:bg-accent/40 hover:shadow-sm"
                          )}
                        >
                          <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-muted/30">
                            {GameImages[gameId] ? (
                              <img
                                src={GameImages[gameId]}
                                alt={gameId}
                                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                              />
                            ) : null}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate text-left font-medium text-foreground transition-colors duration-300 ease-out group-hover:text-primary">
                              {gameId}
                            </h3>
                            <div className="flex items-center justify-start gap-2 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3 transition-transform duration-300 ease-out group-hover:-rotate-6 group-hover:scale-110" />
                              <span>
                                {game.playTime !== undefined
                                  ? game.playTime < 120
                                    ? `1 ${T("library.minute")}`
                                    : game.playTime < 3600
                                      ? `${Math.floor(game.playTime / 60)} ${T("library.minutes")}`
                                      : game.playTime < 7200
                                        ? `1 ${T("library.hour")}`
                                        : `${Math.floor(game.playTime / 3600)} ${T("library.hours")}`
                                  : T("library.neverPlayed")}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="group flex min-h-[360px] flex-col items-center justify-center text-center">
                    <Gamepad2 className="relative z-10 mb-2 h-10 w-10 text-muted-foreground/50 transition-transform duration-300 ease-out group-hover:-rotate-6 group-hover:scale-110" />
                    <h3 className="relative z-10 text-lg font-semibold">
                      <span className="relative inline-block">
                        <span className="transition-opacity duration-200 ease-out group-hover:opacity-0">
                          {T("profile.noGames") || "No Games"}
                        </span>
                        <span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100">
                          <span className="block bg-gradient-to-r from-primary via-primary/70 to-foreground bg-[length:200%_100%] bg-clip-text text-transparent group-hover:animate-shine">
                            {T("profile.noGames") || "No Games"}
                          </span>
                        </span>
                      </span>
                    </h3>
                    <p className="relative z-10 text-sm text-muted-foreground">
                      {T("profile.noGamesDesc") || "Play a game to see it here"}
                    </p>
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          <Card
            style={{ animationDelay: "160ms" }}
            className={Cn(
              "group relative overflow-hidden rounded-xl border border-dashed border-border/60",
              "bg-transparent",
              "p-1 transition-all",
              "animate-fade-in motion-reduce:animate-none",
              "transition-all duration-300 ease-out",
              "shadow-sm",
              "hover:border-primary/40 hover:shadow-lg hover:shadow-primary/15 hover:ring-1 hover:ring-primary/15"
            )}
          >
            <CardHeader className="relative pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="group flex items-center justify-start gap-2 text-left">
                  <FileDown className="h-5 w-5 text-primary transition-transform duration-300 ease-out group-hover:rotate-6 group-hover:scale-110" />
                  <span className="transition-colors duration-300 ease-out group-hover:text-primary">
                    {T("profile.downloadHistory") || "Download History"}
                  </span>
                </CardTitle>
                <span className="text-sm text-muted-foreground">
                  {DownloadHistory.length}
                </span>
              </div>
            </CardHeader>
            <CardContent className="relative">
              <ScrollArea className="h-[360px] pr-4">
                <div className="mx-auto w-full max-w-6xl space-y-3">
                  {DownloadHistory.length > 0 ? (
                    DownloadHistory.map((item, index) => (
                      <div
                        key={`${item.game}-${index}`}
                        className={Cn(
                          "group flex items-center gap-3 rounded-lg border border-border bg-card/50 p-3",
                          "backdrop-blur",
                          "transition-all duration-300 ease-out",
                          "hover:border-primary/20 hover:bg-accent/40 hover:shadow-sm"
                        )}
                      >
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
                          <FileDown className="h-5 w-5 text-primary transition-transform duration-300 ease-out group-hover:rotate-6 group-hover:scale-110" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-left font-medium text-foreground transition-colors duration-300 ease-out group-hover:text-primary">
                            {item.game}
                          </h3>
                          <div className="text-left text-xs text-muted-foreground">
                            {formatDate(item.timestamp)}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="group flex min-h-[360px] flex-col items-center justify-center text-center">
                      <Archive className="relative z-10 mb-2 h-10 w-10 text-muted-foreground/50 transition-transform duration-300 ease-out group-hover:rotate-6 group-hover:scale-110" />
                      <h3 className="relative z-10 text-lg font-semibold">
                        <span className="relative inline-block">
                          <span className="transition-opacity duration-200 ease-out group-hover:opacity-0">
                            {T("profile.noDownloadHistory") || "No download history yet"}
                          </span>
                          <span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100">
                            <span className="block bg-gradient-to-r from-primary via-primary/70 to-foreground bg-[length:200%_100%] bg-clip-text text-transparent group-hover:animate-shine">
                              {T("profile.noDownloadHistory") ||
                                "No download history yet"}
                            </span>
                          </span>
                        </span>
                      </h3>
                      <p className="relative z-10 text-sm text-muted-foreground">
                        {T("profile.noDownloadHistoryDesc") ||
                          "Your game download history will appear here"}
                      </p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Profile;
