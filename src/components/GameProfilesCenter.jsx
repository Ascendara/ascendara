import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  FolderOpen,
  Gamepad2,
  History,
  RefreshCw,
  Save,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import GamesBackupDialog from "@/components/GamesBackupDialog";
import {
  FeatureCenterDialog,
  FeatureSection,
  FeatureState,
} from "@/components/feature-centers/FeatureCenterPrimitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/context/LanguageContext";
import { useFeatureCenterDialog } from "@/hooks/useFeatureCenterDialog";
import { FEATURE_CENTER_EVENTS } from "@/lib/featureCenterEvents";
import {
  getGameName,
  loadGameProfile,
  loadGameProfileCatalog,
  saveGameProfile,
} from "@/services/gameProfileService";

const EMPTY_PROFILE = {
  launchCommands: "",
  autoBackup: false,
  umuId: "",
  savePaths: [],
};

function profilesMatch(left, right) {
  return JSON.stringify(left || EMPTY_PROFILE) === JSON.stringify(right || EMPTY_PROFILE);
}

const GameProfilesCenter = () => {
  const { t } = useLanguage();
  const requestedGameRef = useRef(null);
  const profileRequestRef = useRef(0);
  const [games, setGames] = useState([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [loadingGames, setLoadingGames] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [profileError, setProfileError] = useState("");
  const [backupOpen, setBackupOpen] = useState(false);
  const [isLinux, setIsLinux] = useState(false);
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [savedProfile, setSavedProfile] = useState(EMPTY_PROFILE);

  const handleOpenEvent = useCallback(detail => {
    requestedGameRef.current = detail?.game || null;
  }, []);
  const [open, setOpen] = useFeatureCenterDialog(
    FEATURE_CENTER_EVENTS.profiles,
    handleOpenEvent
  );

  const isDirty = useMemo(
    () => !profilesMatch(profile, savedProfile),
    [profile, savedProfile]
  );

  const loadGames = useCallback(async () => {
    setLoadingGames(true);
    setLoadError("");
    try {
      const catalog = await loadGameProfileCatalog();
      setGames(catalog.games);
      setIsLinux(catalog.isLinux);
      setSelectedKey(current => {
        const requested = requestedGameRef.current;
        requestedGameRef.current = null;
        if (requested) {
          const requestedName =
            typeof requested === "string" ? requested : getGameName(requested);
          const match = catalog.games.find(game => getGameName(game) === requestedName);
          if (match) return match.__profileKey;
        }
        if (catalog.games.some(game => game.__profileKey === current)) return current;
        return catalog.games[0]?.__profileKey || "";
      });
    } catch (error) {
      console.error("[GameProfiles] Failed to load games:", error);
      setGames([]);
      setSelectedKey("");
      setLoadError(error.message || t("featureCenters.profiles.loadGamesError"));
    } finally {
      setLoadingGames(false);
    }
  }, [t]);

  useEffect(() => {
    if (open) loadGames();
  }, [open, loadGames]);

  const selectedGame = useMemo(
    () => games.find(game => game.__profileKey === selectedKey) || null,
    [games, selectedKey]
  );

  const loadProfile = useCallback(
    async game => {
      const requestId = ++profileRequestRef.current;
      setProfileError("");

      if (!game) {
        setProfile(EMPTY_PROFILE);
        setSavedProfile(EMPTY_PROFILE);
        setLoadingProfile(false);
        return;
      }

      // Clear the previous game immediately so a failed or slow request can never
      // leave another game's profile visible under the newly selected title.
      setProfile(EMPTY_PROFILE);
      setSavedProfile(EMPTY_PROFILE);
      setLoadingProfile(true);

      try {
        const nextProfile = await loadGameProfile(game, isLinux);
        if (profileRequestRef.current !== requestId) return;
        setProfile(nextProfile);
        setSavedProfile(nextProfile);
      } catch (error) {
        if (profileRequestRef.current !== requestId) return;
        console.error("[GameProfiles] Failed to load profile:", error);
        setProfileError(error.message || t("featureCenters.profiles.loadProfileError"));
        toast.error(t("featureCenters.profiles.loadProfileError"), {
          description: error.message,
        });
      } finally {
        if (profileRequestRef.current === requestId) {
          setLoadingProfile(false);
        }
      }
    },
    [isLinux, t]
  );

  useEffect(() => {
    if (!open || !selectedGame) {
      profileRequestRef.current += 1;
      setLoadingProfile(false);
      setProfileError("");
      setProfile(EMPTY_PROFILE);
      setSavedProfile(EMPTY_PROFILE);
      return undefined;
    }

    loadProfile(selectedGame);
    return () => {
      // Ignore a result that belongs to a game or dialog state that is no longer active.
      profileRequestRef.current += 1;
    };
  }, [open, selectedGame, loadProfile]);

  const confirmDiscard = useCallback(
    gameName => {
      if (!isDirty) return true;
      return window.confirm(
        t("featureCenters.profiles.discardConfirm", {
          game: gameName || getGameName(selectedGame),
        })
      );
    },
    [isDirty, selectedGame, t]
  );

  const selectGame = nextKey => {
    if (nextKey === selectedKey) return;
    if (!confirmDiscard(getGameName(selectedGame))) return;
    setSelectedKey(nextKey);
  };

  const handleOpenChange = nextOpen => {
    if (!nextOpen && isDirty) {
      if (!window.confirm(t("featureCenters.profiles.closeConfirm"))) return;
    }
    setOpen(nextOpen);
  };

  const refreshCatalog = () => {
    if (!confirmDiscard(getGameName(selectedGame))) return;
    loadGames();
  };

  const saveProfile = async () => {
    if (!selectedGame || !isDirty) return;
    const gameName = getGameName(selectedGame);
    const savingKey = selectedGame.__profileKey;
    setSaving(true);

    try {
      const normalized = await saveGameProfile(selectedGame, profile, isLinux);
      if (selectedKey !== savingKey) return;
      setProfile(normalized);
      setSavedProfile(normalized);
      toast.success(t("featureCenters.profiles.saved"), {
        description: t("featureCenters.profiles.savedDescription", { game: gameName }),
      });
    } catch (error) {
      console.error("[GameProfiles] Failed to save profile:", error);
      toast.error(t("featureCenters.profiles.saveError"), {
        description: error.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const browseSavePath = async index => {
    try {
      const result = await window.electron.openFolderDialog();
      if (!result?.path) return;
      setProfile(current => ({
        ...current,
        savePaths: current.savePaths.map((value, itemIndex) =>
          itemIndex === index ? result.path : value
        ),
      }));
    } catch (error) {
      toast.error(t("featureCenters.profiles.pickerError"), {
        description: error.message,
      });
    }
  };

  return (
    <>
      <FeatureCenterDialog
        open={open}
        onOpenChange={handleOpenChange}
        title={t("featureCenters.profiles.title")}
        description={t("featureCenters.profiles.description")}
        icon={Gamepad2}
        maxWidth="max-w-4xl"
      >
        <div className="h-full overflow-y-auto p-4 sm:p-6">
          <div className="space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <select
                  value={selectedKey}
                  onChange={event => selectGame(event.target.value)}
                  disabled={loadingGames || loadingProfile || saving || games.length === 0}
                  aria-label={t("featureCenters.profiles.title")}
                  className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {games.map(game => (
                    <option key={game.__profileKey} value={game.__profileKey}>
                      {getGameName(game)}
                      {game.isCustom
                        ? ` (${t("featureCenters.profiles.customSuffix")})`
                        : ""}
                    </option>
                  ))}
                </select>
                {isDirty && (
                  <Badge variant="outline" className="hidden shrink-0 sm:inline-flex">
                    {t("featureCenters.profiles.unsaved")}
                  </Badge>
                )}
              </div>
              <Button
                variant="outline"
                onClick={refreshCatalog}
                disabled={loadingGames || loadingProfile || saving}
              >
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${loadingGames ? "animate-spin" : ""}`}
                />
                {t("featureCenters.profiles.refresh")}
              </Button>
            </div>

            {isDirty && (
              <div className="flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
                <div>
                  <p className="font-medium text-foreground">
                    {t("featureCenters.profiles.unsaved")}
                  </p>
                  <p className="text-muted-foreground">
                    {t("featureCenters.profiles.unsavedDescription")}
                  </p>
                </div>
              </div>
            )}

            {loadError ? (
              <FeatureState
                icon={AlertTriangle}
                title={t("featureCenters.profiles.loadGamesError")}
                description={loadError}
                action={{
                  label: t("featureCenters.common.retry"),
                  onClick: loadGames,
                }}
              />
            ) : loadingGames && games.length === 0 ? (
              <FeatureState
                icon={RefreshCw}
                title={t("featureCenters.common.loading")}
              />
            ) : !selectedGame ? (
              <FeatureState
                icon={Gamepad2}
                title={t("featureCenters.profiles.noGames")}
              />
            ) : loadingProfile ? (
              <FeatureState
                icon={RefreshCw}
                title={t("featureCenters.profiles.loading")}
              />
            ) : profileError ? (
              <FeatureState
                icon={AlertTriangle}
                title={t("featureCenters.profiles.loadProfileError")}
                description={profileError}
                action={{
                  label: t("featureCenters.common.retry"),
                  onClick: () => loadProfile(selectedGame),
                }}
              />
            ) : (
              <>
                <FeatureSection
                  title={t("featureCenters.profiles.launchCommands")}
                  description={t("featureCenters.profiles.launchCommandsDescription")}
                >
                  <Label htmlFor="profile-launch-commands" className="sr-only">
                    {t("featureCenters.profiles.launchCommands")}
                  </Label>
                  <Input
                    id="profile-launch-commands"
                    className="font-mono"
                    value={profile.launchCommands}
                    onChange={event =>
                      setProfile(current => ({
                        ...current,
                        launchCommands: event.target.value,
                      }))
                    }
                    placeholder={t("featureCenters.profiles.launchCommandsPlaceholder")}
                  />
                </FeatureSection>

                <FeatureSection
                  title={t("featureCenters.profiles.autoBackup")}
                  description={t("featureCenters.profiles.autoBackupDescription")}
                  actions={
                    <Switch
                      checked={profile.autoBackup}
                      onCheckedChange={value =>
                        setProfile(current => ({
                          ...current,
                          autoBackup: Boolean(value),
                        }))
                      }
                      aria-label={t("featureCenters.profiles.autoBackup")}
                    />
                  }
                />

                {isLinux && (
                  <FeatureSection
                    title={t("featureCenters.profiles.umuId")}
                    description={t("featureCenters.profiles.umuIdDescription")}
                  >
                    <Label htmlFor="profile-umu-id" className="sr-only">
                      {t("featureCenters.profiles.umuId")}
                    </Label>
                    <Input
                      id="profile-umu-id"
                      className="font-mono"
                      value={profile.umuId}
                      onChange={event =>
                        setProfile(current => ({ ...current, umuId: event.target.value }))
                      }
                      placeholder={t("featureCenters.profiles.optional")}
                    />
                  </FeatureSection>
                )}

                <FeatureSection
                  title={t("featureCenters.profiles.savePaths")}
                  description={t("featureCenters.profiles.savePathsDescription")}
                  actions={
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setProfile(current => ({
                          ...current,
                          savePaths: [...current.savePaths, ""],
                        }))
                      }
                    >
                      {t("featureCenters.common.addPath")}
                    </Button>
                  }
                >
                  <div className="space-y-2">
                    {profile.savePaths.map((path, index) => (
                      <div
                        key={index}
                        className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
                      >
                        <Input
                          className="font-mono text-xs"
                          value={path}
                          onChange={event =>
                            setProfile(current => ({
                              ...current,
                              savePaths: current.savePaths.map((value, itemIndex) =>
                                itemIndex === index ? event.target.value : value
                              ),
                            }))
                          }
                          placeholder={t("featureCenters.profiles.saveDirectory")}
                        />
                        <Button
                          variant="outline"
                          onClick={() => browseSavePath(index)}
                          aria-label={t("featureCenters.common.browse")}
                        >
                          <FolderOpen className="mr-2 h-4 w-4 sm:mr-0" />
                          <span className="sm:sr-only">
                            {t("featureCenters.common.browse")}
                          </span>
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() =>
                            setProfile(current => ({
                              ...current,
                              savePaths: current.savePaths.filter(
                                (_, itemIndex) => itemIndex !== index
                              ),
                            }))
                          }
                        >
                          {t("featureCenters.common.remove")}
                        </Button>
                      </div>
                    ))}
                    {profile.savePaths.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        {t("featureCenters.profiles.noSavePaths")}
                      </p>
                    )}
                  </div>
                </FeatureSection>

                <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{t("featureCenters.profiles.compatibilityNote")}</span>
                  </div>
                  <div className="grid gap-2 sm:flex">
                    <Button variant="outline" onClick={() => setBackupOpen(true)}>
                      <History className="mr-2 h-4 w-4" />
                      {t("featureCenters.profiles.backupTimeline")}
                    </Button>
                    <Button onClick={saveProfile} disabled={saving || !isDirty}>
                      <Save className="mr-2 h-4 w-4" />
                      {t(
                        saving
                          ? "featureCenters.profiles.saving"
                          : "featureCenters.profiles.saveProfile"
                      )}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </FeatureCenterDialog>

      {selectedGame && (
        <GamesBackupDialog
          game={selectedGame}
          open={backupOpen}
          onOpenChange={setBackupOpen}
        />
      )}
    </>
  );
};

export default GameProfilesCenter;
