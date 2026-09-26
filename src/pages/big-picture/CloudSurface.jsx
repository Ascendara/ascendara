import { useEffect, useRef, useState } from "react";
import {
  Cloud,
  HardDrive,
  RefreshCw,
  Search,
  Upload,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useSettings } from "@/context/SettingsContext";
import useAscendPage from "../ascend/useAscendPage";
import { listBackups, deleteBackup } from "@/services/firebaseService";
import { uploadBackupToCloud } from "@/services/cloudBackupService";
import { restoreCloudSave } from "@/services/restoreCloudSave";
import { SurfaceButton, useSurface } from "./Surface";
import {
  BigPictureShell,
  BigPictureToolbar,
  BigPictureEmptyState,
} from "./BigPictureShell";
import { VirtualKeyboard } from "./VirtualKeyboard";
import { CloudConfirmation } from "./CloudConfirmation";
import { gameEntries, gameName } from "./surfaceNavigation";

const tabs = [
  ["library", "Cloud Library"],
  ["backups", "Save Backups"],
  ["local", "Local Saves"],
];
const sortModes = ["name", "playtime", "recent", "achievements"];
const dateLabel = value =>
  value ? new Date(value).toLocaleString() : "Unknown date";

export function CloudSurface({
  navigation,
  inputLock,
  active,
  games,
  refreshLibrary,
  onBack,
  onAccount,
  t,
  controllerType,
  keyboardLayout,
}) {
  const cloud = useAscendPage({ cloudOnly: true });
  const { settings, updateSetting } = useSettings();
  const [tab, setTab] = useState("library");
  const [query, setQuery] = useState("");
  const [keyboard, setKeyboard] = useState(false);
  const [page, setPage] = useState(0);
  const [backups, setBackups] = useState([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [backupError, setBackupError] = useState("");
  const [selectedGame, setSelectedGame] = useState(null);
  const [localBackups, setLocalBackups] = useState([]);
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState("");
  const [autoLocal, setAutoLocal] = useState(false);
  const [autoCloud, setAutoCloud] = useState(false);
  const [paths, setPaths] = useState([]);
  const [confirmation, setConfirmation] = useState(null);
  const [busy, setBusy] = useState(false);
  const operation = useRef(false);
  const backupRequest = useRef(0);
  const localRequest = useRef(0);
  const verifiedEmail =
    !cloud.user ||
    cloud.user.emailVerified ||
    cloud.user.providerData?.[0]?.providerId !== "password";
  const libraryAllowed =
    !!cloud.user &&
    verifiedEmail &&
    !cloud.checkingVersion &&
    !cloud.isOutdated &&
    !cloud.verifyingAccess &&
    cloud.ascendAccess.verified &&
    cloud.ascendAccess.hasAccess;
  const savesAllowed =
    libraryAllowed &&
    (cloud.ascendAccess.isSubscribed || cloud.ascendAccess.isVerified);
  const localReady =
    !!settings.ludusavi?.enabled && !!settings.ludusavi?.backupLocation;
  const locked = keyboard || !!confirmation || busy;

  useEffect(() => {
    inputLock.current = locked;
    return () => {
      inputLock.current = false;
    };
  }, [inputLock, locked]);

  const loadBackups = async () => {
    const request = ++backupRequest.current;
    setLoadingBackups(true);
    setBackupError("");
    try {
      const result = await listBackups();
      if (result.error) throw new Error(result.error);
      if (request === backupRequest.current) setBackups(result.backups || []);
    } catch (error) {
      if (request === backupRequest.current) setBackupError(error.message);
    } finally {
      if (request === backupRequest.current) setLoadingBackups(false);
    }
  };
  useEffect(() => {
    const requests = backupRequest;
    setBackups([]);
    if (savesAllowed) loadBackups();
    return () => {
      requests.current++;
    };
  }, [cloud.user?.uid, savesAllowed]);

  const loadLocal = async game => {
    const request = ++localRequest.current;
    setLocalLoading(true);
    setLocalError("");
    setLocalBackups([]);
    setPaths([]);
    try {
      const name = gameName(game);
      const [result, auto, customPaths] = await Promise.all([
        window.electron.ludusavi("list-backups", name),
        window.electron.isGameAutoBackupsEnabled(name, !!game.isCustom),
        window.electron.getCustomSavePaths(name, !!game.isCustom),
      ]);
      if (customPaths?.success === false)
        throw new Error(
          customPaths.error || "Unable to load custom save paths"
        );
      if (request !== localRequest.current) return;
      const data = Object.values(result?.data?.games || {})[0];
      setLocalBackups(data?.backups || []);
      setAutoLocal(!!auto);
      setAutoCloud(localStorage.getItem(`cloudBackup_${name}`) === "true");
      setPaths(customPaths?.paths || []);
      if (!result?.success)
        setLocalError(result?.error || "Unable to load local backups");
    } catch (error) {
      if (request === localRequest.current) setLocalError(error.message);
    } finally {
      if (request === localRequest.current) setLocalLoading(false);
    }
  };
  useEffect(() => {
    const requests = localRequest;
    if (selectedGame && localReady) loadLocal(selectedGame);
    return () => {
      requests.current++;
    };
  }, [selectedGame, localReady]);

  const perform = async (callback, message) => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    try {
      await callback();
      if (message) toast.success(message);
    } catch (error) {
      toast.error(error.message || "The operation failed. Please try again.");
    } finally {
      operation.current = false;
      setBusy(false);
      setConfirmation(null);
    }
  };
  const confirm = (title, description, callback, label = "Confirm") =>
    setConfirmation({ title, description, callback, label });
  const restore = (name, callback) =>
    confirm(
      `Restore ${name}?`,
      "This replaces current save files. Close the game and back up your current saves before continuing.",
      () => perform(callback, "Saves restored"),
      "Restore saves"
    );
  const back = () => {
    if (busy) return;
    if (selectedGame) setSelectedGame(null);
    else onBack();
  };
  const switchTab = value => {
    setTab(value);
    setPage(0);
    setSelectedGame(null);
    setQuery("");
    cloud.setLibrarySearchQuery("");
  };
  const setFilter = value => {
    setQuery(value);
    cloud.setLibrarySearchQuery(value);
    setPage(0);
  };
  const matches = name =>
    name.toLocaleLowerCase().includes(query.toLocaleLowerCase());
  const items =
    tab === "library"
      ? cloud.getFilteredLibraryGames()
      : tab === "backups"
        ? backups
            .filter(item => matches(item.gameName))
            .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        : gameEntries(
            games
              .filter(
                game =>
                  !game.isFolder &&
                  !game.downloadingData?.downloading &&
                  !game.downloadingData?.extracting &&
                  matches(gameName(game))
              )
              .sort((a, b) => gameName(a).localeCompare(gameName(b)))
          );
  const pages = Math.max(1, Math.ceil(items.length / 12));
  const currentPage = Math.min(page, pages - 1);
  const displayed = items.slice(currentPage * 12, (currentPage + 1) * 12);
  const allowed =
    tab === "local" || (tab === "library" ? libraryAllowed : savesAllowed);
  const loading =
    tab === "library"
      ? cloud.loadingCloudLibrary
      : tab === "backups"
        ? loadingBackups
        : localLoading;
  const rows = [tabs.map(([id]) => `tab-${id}`)];
  if (!allowed) rows.push(["account", "retry-access"]);
  else if (selectedGame) {
    rows.push(
      ["local-back", "local-refresh"],
      [
        "backup",
        ...(savesAllowed ? ["upload", "auto-cloud"] : []),
        "auto-local",
      ],
      ["add-path"],
      ...paths.map((_, i) => [`path-${i}`]),
      ...localBackups.map((_, i) => [`local-restore-${i}`])
    );
  } else {
    rows.push([
      "search",
      "clear",
      "refresh",
      ...(tab === "library" ? ["sort", "sync", "restore-library"] : []),
    ]);
    if (tab === "local") rows.push(["enable-backups", "backup-location"]);
    displayed.forEach((item, index) => {
      rows.push(
        tab === "backups"
          ? [`restore-${index}`, `delete-${index}`]
          : tab === "library"
            ? [`game-${index}`, `delete-${index}`]
            : [`local-${index}`]
      );
      if (tab === "library" && cloud.expandedGame === item.name) {
        rows.push(
          ...(cloud.gameAchievements?.achievements || []).map((_, i) => [
            `achievement-${index}-${i}`,
          ])
        );
      }
    });
    rows.push(["previous", "next"]);
  }
  const { root, focus: surfaceFocus } = useSurface(
    navigation,
    rows,
    back,
    active && !locked
  );
  const focus = id => ({
    ...surfaceFocus(id),
    ...(locked ? { disabled: true, tabIndex: -1 } : {}),
  });
  // A modal/keyboard owns input while open; busy operations cannot be repeated.
  useEffect(() => {
    if ((keyboard || busy) && !confirmation) navigation.current = () => {};
  }, [keyboard, busy, confirmation, navigation]);
  const button = (id, label, onClick, disabled = false, icon = null) => (
    <SurfaceButton
      key={id}
      {...focus(id)}
      disabled={disabled || locked}
      onClick={onClick}
    >
      {icon}
      {label}
    </SurfaceButton>
  );
  const refresh = () =>
    tab === "library"
      ? cloud.loadCloudLibrary()
      : tab === "backups"
        ? loadBackups()
        : refreshLibrary();
  const savePaths = async next => {
    const result = await window.electron.setCustomSavePaths(
      gameName(selectedGame),
      !!selectedGame.isCustom,
      next
    );
    if (!result?.success)
      throw new Error(result?.error || "Unable to save paths");
    setPaths(result.paths || next);
  };

  return (
    <BigPictureShell
      ref={root}
      className="bp-cloud"
      title="Cloud"
      focus={focus}
    >
      <header className="bp-cloud-heading">
        <Cloud />
        <div>
          <h1>Cloud & saves</h1>
          <p className="bp-muted">
            Keep your library, achievements and game saves backed up.
          </p>
        </div>
      </header>
      <BigPictureToolbar label="Cloud sections">
        {tabs.map(([id, label]) => (
          <SurfaceButton
            key={id}
            {...focus(`tab-${id}`)}
            aria-pressed={tab === id}
            disabled={locked}
            onClick={() => switchTab(id)}
          >
            {label}
          </SurfaceButton>
        ))}
      </BigPictureToolbar>
      {!allowed ? (
        <BigPictureEmptyState
          title={
            cloud.authLoading ||
            cloud.checkingVersion ||
            (cloud.user && cloud.verifyingAccess)
              ? "Checking cloud access…"
              : !cloud.user
                ? "Sign in to Ascend"
                : cloud.isOutdated
                  ? "Update Ascendara to use cloud features"
                  : !verifiedEmail
                    ? "Verify your email to continue"
                    : tab === "backups"
                      ? "Save backups require an Ascend subscription"
                      : "Ascend access is required"
          }
        >
          <p>
            Manage your account in desktop Ascend. Local Saves are available
            without a subscription.
          </p>
          <div className="bp-actions">
            {button("account", "Open Ascend account", onAccount)}
            {button(
              "retry-access",
              "Check again",
              () => perform(cloud.verifyAccess),
              !cloud.user
            )}
          </div>
        </BigPictureEmptyState>
      ) : selectedGame ? (
        <>
          <h2>{gameName(selectedGame)}</h2>
          <BigPictureToolbar>
            {button("local-back", "All local games", () =>
              setSelectedGame(null)
            )}
            {button(
              "local-refresh",
              "Refresh",
              () => loadLocal(selectedGame),
              localLoading,
              <RefreshCw />
            )}
          </BigPictureToolbar>
          {localError && <p role="alert">{localError}</p>}
          {localLoading ? (
            <p role="status">Loading local saves…</p>
          ) : (
            <>
              <div className="bp-actions">
                {button(
                  "backup",
                  "Back up now",
                  () =>
                    perform(async () => {
                      const result = await window.electron.ludusavi(
                        "backup",
                        gameName(selectedGame)
                      );
                      if (!result?.success)
                        throw new Error(result?.error || "Backup failed");
                      await loadLocal(selectedGame);
                    }, "Local backup created"),
                  !localReady,
                  <HardDrive />
                )}
                {savesAllowed &&
                  button(
                    "upload",
                    "Upload latest backup",
                    () =>
                      perform(async () => {
                        const result = await uploadBackupToCloud(
                          gameName(selectedGame),
                          settings,
                          cloud.user,
                          cloud.userData
                        );
                        if (!result.success)
                          throw new Error(result.error || "Upload failed");
                        await loadBackups();
                      }, "Backup uploaded"),
                    !localReady || !localBackups.length,
                    <Upload />
                  )}
                {button(
                  "auto-local",
                  `Automatic local backups: ${autoLocal ? "On" : "Off"}`,
                  () =>
                    perform(async () => {
                      const api = autoLocal
                        ? "disableGameAutoBackups"
                        : "enableGameAutoBackups";
                      if (
                        !(await window.electron[api](
                          gameName(selectedGame),
                          !!selectedGame.isCustom
                        ))
                      )
                        throw new Error("Unable to change automatic backups");
                      if (autoLocal) {
                        localStorage.setItem(
                          `cloudBackup_${gameName(selectedGame)}`,
                          "false"
                        );
                        setAutoCloud(false);
                      }
                      setAutoLocal(!autoLocal);
                    }),
                  !localReady || !!localError
                )}
                {savesAllowed &&
                  button(
                    "auto-cloud",
                    `Automatic cloud upload: ${autoCloud ? "On" : "Off"}`,
                    () =>
                      perform(async () => {
                        if (!autoCloud && !autoLocal) {
                          if (
                            !(await window.electron.enableGameAutoBackups(
                              gameName(selectedGame),
                              !!selectedGame.isCustom
                            ))
                          )
                            throw new Error(
                              "Unable to enable automatic local backups"
                            );
                          setAutoLocal(true);
                        }
                        localStorage.setItem(
                          `cloudBackup_${gameName(selectedGame)}`,
                          String(!autoCloud)
                        );
                        setAutoCloud(!autoCloud);
                      }),
                    !localReady || !!localError
                  )}
              </div>
              <section className="bp-panel">
                <h3>Custom save folders</h3>
                <p className="bp-muted">
                  Automatic game detection is used when no custom folders are
                  set.
                </p>
                {button("add-path", "Add save folder", () =>
                  perform(async () => {
                    const result = await window.electron.openFolderDialog();
                    if (result?.path)
                      await savePaths([...new Set([...paths, result.path])]);
                  })
                )}
                {paths.map((path, index) => (
                  <div className="bp-cloud-row" key={path}>
                    <span>{path}</span>
                    {button(`path-${index}`, "Remove folder", () =>
                      perform(() =>
                        savePaths(paths.filter((_, i) => i !== index))
                      )
                    )}
                  </div>
                ))}
              </section>
              <h3>Local backups ({localBackups.length})</h3>
              {!localBackups.length && !localError && (
                <p className="bp-muted">
                  No local backups yet. Create one with Back up now.
                </p>
              )}
              {localBackups.map((backup, index) => (
                <article className="bp-cloud-row" key={backup.name}>
                  <div>
                    <h3>{backup.name}</h3>
                    <p>{dateLabel(backup.when)}</p>
                  </div>
                  {button(
                    `local-restore-${index}`,
                    "Restore",
                    () =>
                      restore(gameName(selectedGame), async () => {
                        const result = await window.electron.ludusavi(
                          "restore",
                          gameName(selectedGame),
                          backup.name
                        );
                        if (!result?.success)
                          throw new Error(result?.error || "Restore failed");
                      }),
                    !localReady,
                    <RotateCcw />
                  )}
                </article>
              ))}
            </>
          )}
        </>
      ) : (
        <>
          <BigPictureToolbar>
            {button(
              "search",
              query ? `Filter: ${query}` : "Filter games",
              () => setKeyboard(true),
              false,
              <Search />
            )}
            {button("clear", "Clear filter", () => setFilter(""), !query)}
            {button(
              "refresh",
              "Refresh",
              () => perform(refresh),
              loading,
              <RefreshCw />
            )}
            {tab === "library" && (
              <>
                {button("sort", `Sort: ${cloud.librarySortBy}`, () => {
                  cloud.setLibrarySortBy(
                    sortModes[
                      (sortModes.indexOf(cloud.librarySortBy) + 1) %
                        sortModes.length
                    ]
                  );
                  setPage(0);
                })}
                {button(
                  "sync",
                  "Sync library",
                  () => perform(cloud.handleSyncLibrary),
                  loading || cloud.isSyncingLibrary
                )}
                {button(
                  "restore-library",
                  "Restore library data",
                  () =>
                    confirm(
                      "Restore library data?",
                      "Restore profile statistics, playtime, favorites and achievements for installed games. Game installations and save files are managed separately.",
                      () =>
                        perform(async () => {
                          await cloud.handleRestoreFromCloud();
                          await refreshLibrary();
                        }),
                      "Restore"
                    ),
                  loading || cloud.isRestoringFromCloud
                )}
              </>
            )}
          </BigPictureToolbar>
          {tab === "local" && (
            <section className="bp-panel">
              <div className="bp-actions">
                {button(
                  "enable-backups",
                  `Save backups: ${settings.ludusavi?.enabled ? "On" : "Off"}`,
                  () =>
                    perform(() =>
                      updateSetting("ludusavi", {
                        ...settings.ludusavi,
                        enabled: !settings.ludusavi?.enabled,
                      })
                    )
                )}
                {button("backup-location", "Choose backup location", () =>
                  perform(async () => {
                    const result = await window.electron.openFolderDialog();
                    if (result?.path)
                      await updateSetting("ludusavi", {
                        ...settings.ludusavi,
                        backupLocation: result.path,
                      });
                  })
                )}
              </div>
              <p className="bp-muted">
                {settings.ludusavi?.backupLocation ||
                  "Choose a backup location to get started."}
              </p>
              {!localReady && (
                <p>
                  Enable save backups and choose a location before selecting a
                  game.
                </p>
              )}
            </section>
          )}
          {tab === "library" && cloud.cloudLibrary && (
            <p className="bp-muted">
              {cloud.cloudLibrary.games?.length || 0} games ·{" "}
              {cloud.formatPlaytime(cloud.cloudLibrary.totalPlaytime || 0)}{" "}
              played · {cloud.cloudLibrary.unlockedAchievements || 0}{" "}
              achievements unlocked
            </p>
          )}
          {tab === "backups" && backupError && (
            <p role="alert">{backupError} Use Refresh to try again.</p>
          )}
          {tab === "library" && cloud.cloudLibraryError && (
            <p role="alert">
              {cloud.cloudLibraryError} Use Refresh to try again.
            </p>
          )}
          {loading ? (
            <p role="status">Loading…</p>
          ) : !items.length ? (
            <BigPictureEmptyState
              title={
                query
                  ? "No matching games"
                  : tab === "backups"
                    ? "No cloud save backups yet"
                    : tab === "local"
                      ? "No installed games"
                      : "Your cloud library is empty"
              }
            >
              <p>
                {tab === "backups"
                  ? "Open Local Saves to create a backup and upload it."
                  : tab === "library"
                    ? "Sync your library to back up playtime and achievements."
                    : "Installed games will appear here."}
              </p>
            </BigPictureEmptyState>
          ) : (
            displayed.map((item, index) =>
              tab === "backups" ? (
                <article className="bp-cloud-row" key={item.backupId}>
                  <div>
                    <h3>{item.gameName}</h3>
                    <p>{item.backupName}</p>
                    <small>
                      {dateLabel(item.createdAt)} ·{" "}
                      {((item.size || 0) / 1024 / 1024).toFixed(2)} MB · Cloud
                    </small>
                  </div>
                  <div className="bp-actions">
                    {button(
                      `restore-${index}`,
                      "Restore saves",
                      () =>
                        restore(item.gameName, () =>
                          restoreCloudSave(item, settings)
                        ),
                      false,
                      <RotateCcw />
                    )}
                    {button(
                      `delete-${index}`,
                      "Delete",
                      () =>
                        confirm(
                          "Delete cloud backup?",
                          `${item.gameName} — ${item.backupName}. This permanently deletes this cloud backup. Local saves are kept.`,
                          () =>
                            perform(async () => {
                              const result = await deleteBackup(item.backupId);
                              if (!result.success)
                                throw new Error(
                                  result.error || "Delete failed"
                                );
                              setBackups(previous =>
                                previous.filter(
                                  backup => backup.backupId !== item.backupId
                                )
                              );
                            }, "Cloud backup deleted"),
                          "Delete backup"
                        ),
                      false,
                      <Trash2 />
                    )}
                  </div>
                </article>
              ) : tab === "local" ? (
                <article className="bp-cloud-row" key={item.key}>
                  <div>
                    <h3>{gameName(item.game)}</h3>
                    <p>
                      {item.game.isCustom ? "Custom game" : "Installed game"}
                    </p>
                  </div>
                  {button(
                    `local-${index}`,
                    "Manage saves",
                    () => setSelectedGame(item.game),
                    !localReady
                  )}
                </article>
              ) : (
                <article className="bp-panel" key={`${item.name}-${index}`}>
                  <div className="bp-cloud-row">
                    <div>
                      <h3>{item.name}</h3>
                      <p>
                        {cloud.formatPlaytime(item.playTime || 0)} played ·{" "}
                        {item.launchCount || 0} launches ·{" "}
                        {cloud.isGameInstalledLocally(item.name)
                          ? "Installed"
                          : "Cloud only"}
                      </p>
                      <small>Last played: {dateLabel(item.lastPlayed)}</small>
                    </div>
                    <div className="bp-actions">
                      {button(
                        `game-${index}`,
                        cloud.expandedGame === item.name
                          ? "Hide achievements"
                          : "Achievements",
                        () => cloud.handleExpandGame(item.name)
                      )}
                      {button(`delete-${index}`, "Remove from cloud", () =>
                        confirm(
                          "Remove game from cloud?",
                          `Remove ${item.name} and its synced game data from your cloud library. Your installed game and save backups are kept.`,
                          () =>
                            perform(() =>
                              cloud.handleDeleteCloudGame(item.name)
                            ),
                          "Remove"
                        )
                      )}
                    </div>
                  </div>
                  {cloud.expandedGame === item.name && (
                    <div className="bp-cloud-achievements">
                      {cloud.loadingGameAchievements ? (
                        <p role="status">Loading achievements…</p>
                      ) : cloud.gameAchievements?.achievements?.length ? (
                        cloud.gameAchievements.achievements.map(
                          (achievement, i) => (
                            <p
                              {...focus(`achievement-${index}-${i}`)}
                              key={achievement.achID || i}
                            >
                              <strong>{achievement.name}</strong>
                              <span>
                                {achievement.achieved ? "Unlocked" : "Locked"}
                              </span>
                            </p>
                          )
                        )
                      ) : (
                        <p>
                          No achievement details synced. Sync the library from
                          the PC where you played.
                        </p>
                      )}
                    </div>
                  )}
                </article>
              )
            )
          )}
          <div className="bp-pagination">
            {button(
              "previous",
              "Previous page",
              () => setPage(currentPage - 1),
              currentPage === 0
            )}
            <span>
              {currentPage + 1} / {pages}
            </span>
            {button(
              "next",
              "Next page",
              () => setPage(currentPage + 1),
              currentPage + 1 >= pages
            )}
          </div>
        </>
      )}
      {busy && (
        <p className="bp-cloud-progress" role="status">
          Working… Please wait.
        </p>
      )}
      {keyboard && active && (
        <VirtualKeyboard
          value={query}
          onChange={setFilter}
          onClose={() => setKeyboard(false)}
          onConfirm={() => setKeyboard(false)}
          suggestions={[]}
          layout={keyboardLayout}
          t={t}
          controllerType={controllerType}
        />
      )}
      {confirmation && (
        <CloudConfirmation
          navigation={navigation}
          active={active}
          confirmation={confirmation}
          busy={busy}
          cancel={() => setConfirmation(null)}
          confirm={confirmation.callback}
        />
      )}
    </BigPictureShell>
  );
}
