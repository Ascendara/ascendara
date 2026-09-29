import { useRef, useState } from "react";
import {
  ArrowLeft,
  CloudDownload,
  Database,
  Globe,
  CalendarClock,
  SlidersHorizontal,
  ChevronRight,
  Check,
  Square,
  FolderOpen,
  FileJson,
  Plus,
  Minus,
} from "lucide-react";
import { toast } from "sonner";
import { SurfaceButton } from "./Surface";
import { getControllerButtons } from "./controller";

const sections = [
  ["refresh", "Refresh", Database],
  ["sources", "Sources & imports", Globe],
  ["automatic", "Automatic updates", CalendarClock],
  ["advanced", "Advanced", SlidersHorizontal],
];

function Setting({ title, description, children }) {
  return (
    <div className="bp-index-setting">
      <div>
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
      <div className="bp-index-setting-controls">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, disabled, label }) {
  return (
    <SurfaceButton
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      {checked ? <Check /> : <Square />}
      {checked ? "On" : "Off"}
    </SurfaceButton>
  );
}

export function IndexManager({ model: m, onBack, controllerType }) {
  const [section, setSection] = useState("refresh");
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [listAction, setListAction] = useState(null);
  const [listName, setListName] = useState("");
  const busy =
    pending ||
    m.isRefreshing ||
    !!m.downloadingIndex ||
    m.isUploading ||
    m.isSyncingCustomSource;
  const buttons = getControllerButtons(controllerType);
  const run = async (action) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    try {
      await action();
    } catch (error) {
      toast.error(
        error?.message || "Unable to update the index. Please try again.",
      );
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };
  const save = (key, value, setter) =>
    run(async () => {
      await m.updateSetting(key, value);
      setter?.(value);
    });
  const sourceName = m.customSourcesMode
    ? m.activeCustomList?.name || m.customSource?.name || "No source selected"
    : "Ascendara index";
  const gameCount = m.customSourcesMode
    ? (m.customSourceGameCount ??
      m.activeCustomList?.gamesCount ??
      m.customSource?.gamesCount)
    : m.indexInfo?.gameCount;
  const downloadPercent = m.indexDownloadProgress?.progress;
  const percent = Math.max(
    0,
    Math.min(100, m.downloadingIndex ? downloadPercent || 0 : m.progress || 0),
  );
  const status = m.downloadingIndex
    ? "Downloading cloud index"
    : m.isRefreshing
      ? "Building local index"
      : m.isUploading
        ? "Sharing index"
        : m.isSyncingCustomSource
          ? "Syncing source"
          : m.refreshStatus === "error"
            ? "Refresh failed"
            : m.hasIndexBefore || m.customSource
              ? "Ready"
              : "No index yet";

  return (
    <main className="bp-index-manager" aria-label="Game indexes">
      <header className="bp-index-heading">
        <SurfaceButton onClick={onBack}>
          <ArrowLeft /> Browse
        </SurfaceButton>
        <div>
          <span className="bp-index-eyebrow">BROWSE / GAME INDEXES</span>
          <h1>Manage indexes</h1>
          <p>Keep your catalogue up to date.</p>
        </div>
        <span className="bp-index-status" role="status">
          {status}
        </span>
      </header>
      <div className="bp-index-layout">
        <nav className="bp-index-sections" aria-label="Index settings">
          {sections.map(([id, label, Icon]) => (
            <SurfaceButton
              key={id}
              aria-current={section === id ? "page" : undefined}
              onClick={() => setSection(id)}
            >
              <Icon />
              <span>{label}</span>
              <ChevronRight />
            </SurfaceButton>
          ))}
        </nav>
        <section
          className="bp-index-content"
          aria-label={sections.find(([id]) => id === section)[1]}
        >
          {section === "refresh" && (
            <>
              <div className="bp-index-summary">
                <Database />
                <div>
                  <span>ACTIVE CATALOGUE</span>
                  <h2>{sourceName}</h2>
                  <p>
                    {gameCount != null
                      ? `${Number(gameCount).toLocaleString()} games · `
                      : ""}
                    Last updated{" "}
                    {m.formatLastRefreshTime(
                      m.customSourcesMode
                        ? m.customSourceLastSynced
                        : m.lastRefreshTime,
                    )}
                  </p>
                </div>
              </div>
              <div className="bp-index-actions">
                {m.customSourcesMode ? (
                  <SurfaceButton
                    className="bp-index-action-card"
                    disabled={busy || !m.customSource?.url}
                    onClick={() => run(() => m.handleSyncCustomSource())}
                  >
                    <Globe />
                    <strong>Sync source</strong>
                    <span>
                      Get the latest games from{" "}
                      {m.customSource?.name || "your selected source"}.
                    </span>
                  </SurfaceButton>
                ) : (
                  <>
                    <SurfaceButton
                      className="bp-index-action-card"
                      disabled={busy || !m.apiAvailable || !m.localIndexPath}
                      onClick={() =>
                        run(() =>
                          window.electron.downloadSharedIndex(m.localIndexPath),
                        )
                      }
                    >
                      <CloudDownload />
                      <strong>Refresh cloud index</strong>
                      <span>
                        {m.checkingApi
                          ? "Checking availability…"
                          : m.apiAvailable
                            ? "Download the latest community index."
                            : "Cloud index is currently unavailable."}
                      </span>
                    </SurfaceButton>
                    <SurfaceButton
                      className="bp-index-action-card"
                      disabled={busy || !m.localIndexPath}
                      onClick={m.handleOpenRefreshDialog}
                    >
                      <Database />
                      <strong>Build local index</strong>
                      <span>Refresh the index directly from the source.</span>
                    </SurfaceButton>
                  </>
                )}
              </div>
              {m.customSourcesMode && !m.customSource?.url && (
                <p className="bp-index-note">
                  Choose a source or import a list in Sources & imports.
                </p>
              )}
              {(busy || m.currentStep || m.refreshStatus === "completed") && (
                <div className="bp-index-progress" aria-live="polite">
                  <div>
                    <strong>{status}</strong>
                    <span>{Math.round(percent)}%</span>
                  </div>
                  <progress max="100" value={percent} />
                  <p>
                    {m.indexDownloadProgress?.currentGame ||
                      m.currentStep ||
                      "Preparing index…"}
                  </p>
                  {m.totalGames > 0 && (
                    <p>
                      {m.processedGames.toLocaleString()} /{" "}
                      {m.totalGames.toLocaleString()} games
                    </p>
                  )}
                  {m.isRefreshing && (
                    <SurfaceButton onClick={() => m.setShowStopDialog(true)}>
                      <Square /> Stop refresh
                    </SurfaceButton>
                  )}
                </div>
              )}
              {(m.uploadError || m.errors.length > 0) && (
                <div className="bp-index-errors" role="alert">
                  <h3>Refresh messages</h3>
                  {m.uploadError && <p>{m.uploadError}</p>}
                  {m.errors.map((error, i) => (
                    <p key={i}>{error.message}</p>
                  ))}
                </div>
              )}
            </>
          )}
          {section === "sources" && (
            <>
              <h2>Sources & imports</h2>
              <Setting
                title="External sources"
                description="Use another catalogue or an imported list instead of the Ascendara index."
              >
                <Toggle
                  label="External sources"
                  checked={m.customSourcesMode}
                  disabled={busy}
                  onChange={(value) =>
                    run(() => m.handleToggleCustomSourcesMode(value))
                  }
                />
              </Setting>
              {m.customSourcesMode && (
                <>
                  <label className="bp-index-field">
                    Source bucket URL
                    <input
                      value={m.sourceBucketUrlDraft}
                      disabled={busy}
                      onChange={(e) =>
                        m.setSourceBucketUrlDraft(e.target.value)
                      }
                      placeholder="https://…"
                    />
                  </label>
                  <div className="bp-index-inline">
                    <SurfaceButton
                      disabled={busy || !m.sourceBucketUrlDraft.trim()}
                      onClick={() =>
                        run(() =>
                          m.handleSaveSourceBucketUrl(m.sourceBucketUrlDraft),
                        )
                      }
                    >
                      Save URL
                    </SurfaceButton>
                    <SurfaceButton
                      disabled={busy || !m.sourceBucketUrl}
                      onClick={m.handleOpenSourceBrowser}
                    >
                      <Globe /> Browse sources
                    </SurfaceButton>
                    <SurfaceButton
                      disabled={busy || !m.sourceBucketUrl}
                      onClick={() => run(() => m.handleSaveSourceBucketUrl(""))}
                    >
                      Clear URL
                    </SurfaceButton>
                    <SurfaceButton
                      disabled={busy}
                      onClick={() => m.setShowJsonImportDialog(true)}
                    >
                      <FileJson /> Import JSON
                    </SurfaceButton>
                  </div>
                  {m.customSourcesLibrary.length > 0 && <h3>Saved sources</h3>}
                  {m.customSourcesLibrary.map((source) => (
                    <Setting
                      key={source.url}
                      title={source.name || source.url}
                      description={source.url}
                    >
                      <SurfaceButton
                        disabled={busy || source.url === m.customSource?.url}
                        onClick={() =>
                          run(() => m.handleSwitchToSavedSource(source))
                        }
                      >
                        {source.url === m.customSource?.url
                          ? "Active"
                          : "Use source"}
                      </SurfaceButton>
                      <SurfaceButton
                        disabled={busy || source.url === m.customSource?.url}
                        onClick={() =>
                          run(() => m.removeLibraryEntry(source.url))
                        }
                        aria-label={`Remove ${source.name || source.url}`}
                      >
                        Remove
                      </SurfaceButton>
                    </Setting>
                  ))}
                  {m.customLists.length > 0 && <h3>Imported lists</h3>}
                  {m.customLists.map((list) => (
                    <Setting
                      key={list.id}
                      title={list.name}
                      description={`${list.gamesCount ?? list.gameCount ?? 0} games`}
                    >
                      <SurfaceButton
                        disabled={busy || list.id === m.activeCustomList?.id}
                        onClick={() => run(() => m.handleSwitchToList(list))}
                      >
                        {list.id === m.activeCustomList?.id
                          ? "Active"
                          : "Use list"}
                      </SurfaceButton>
                      <SurfaceButton
                        disabled={busy}
                        onClick={() => {
                          setListName(list.name);
                          setListAction({ type: "rename", list });
                        }}
                      >
                        Rename
                      </SurfaceButton>
                      <SurfaceButton
                        disabled={busy}
                        onClick={() => setListAction({ type: "delete", list })}
                      >
                        Delete
                      </SurfaceButton>
                    </Setting>
                  ))}
                  {listAction && (
                    <div className="bp-index-edit">
                      <h3>
                        {listAction.type === "rename"
                          ? "Rename list"
                          : `Delete ${listAction.list.name}?`}
                      </h3>
                      {listAction.type === "rename" ? (
                        <label className="bp-index-field">
                          List name
                          <input
                            value={listName}
                            onChange={(e) => setListName(e.target.value)}
                          />
                        </label>
                      ) : (
                        <p>This removes the imported list from Ascendara.</p>
                      )}
                      <div className="bp-index-inline">
                        <SurfaceButton
                          disabled={
                            busy ||
                            (listAction.type === "rename" && !listName.trim())
                          }
                          onClick={() =>
                            run(async () => {
                              if (listAction.type === "rename")
                                await m.handleRenameList(
                                  listAction.list,
                                  listName.trim(),
                                );
                              else
                                await m.handleDeleteList(listAction.list, true);
                              setListAction(null);
                            })
                          }
                        >
                          {listAction.type === "rename"
                            ? "Save name"
                            : "Delete list"}
                        </SurfaceButton>
                        <SurfaceButton
                          data-index-dismiss
                          onClick={() => setListAction(null)}
                        >
                          Cancel
                        </SurfaceButton>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
          {section === "automatic" && (
            <>
              <h2>Automatic updates</h2>
              {!m.isAuthenticated && (
                <p className="bp-index-note">
                  Sign in to Ascend to enable automatic index updates.
                </p>
              )}
              {m.customSourcesMode && (
                <p className="bp-index-note">
                  Automatic updates apply to the Ascendara index. Turn off
                  external sources to configure them.
                </p>
              )}
              <Setting
                title="Automatic refresh"
                description="Keep your game catalogue up to date on a schedule."
              >
                <Toggle
                  label="Automatic refresh"
                  checked={m.autoRefreshEnabled && m.isAuthenticated}
                  disabled={busy || !m.isAuthenticated || m.customSourcesMode}
                  onChange={(value) =>
                    save("autoRefreshEnabled", value, m.setAutoRefreshEnabled)
                  }
                />
              </Setting>
              <Setting
                title="Refresh method"
                description="Choose a cloud download or build the index locally."
              >
                <SurfaceButton
                  disabled={
                    busy ||
                    !m.autoRefreshEnabled ||
                    !m.isAuthenticated ||
                    m.customSourcesMode
                  }
                  onClick={() =>
                    save(
                      "autoRefreshMethod",
                      m.autoRefreshMethod === "shared" ? "manual" : "shared",
                      m.setAutoRefreshMethod,
                    )
                  }
                >
                  {m.autoRefreshMethod === "shared"
                    ? "Cloud index"
                    : "Local build"}
                  <ChevronRight />
                </SurfaceButton>
              </Setting>
              <Setting
                title="Refresh every"
                description="Select how often to update the index."
              >
                <SurfaceButton
                  disabled={
                    busy ||
                    !m.autoRefreshEnabled ||
                    !m.isAuthenticated ||
                    m.customSourcesMode
                  }
                  onClick={() => {
                    const days = ["2", "3", "5", "7", "10", "14"];
                    save(
                      "autoRefreshInterval",
                      days[
                        (days.indexOf(String(m.autoRefreshInterval)) + 1) %
                          days.length
                      ],
                      m.setAutoRefreshInterval,
                    );
                  }}
                >
                  {m.autoRefreshInterval} days
                  <ChevronRight />
                </SurfaceButton>
              </Setting>
              <Setting
                title="Share after building"
                description="Upload your completed local index for the community."
              >
                <Toggle
                  label="Share after building"
                  checked={!!m.settings.shareLocalIndex}
                  disabled={busy || m.customSourcesMode}
                  onChange={(value) => save("shareLocalIndex", value)}
                />
              </Setting>
              {m.settings.shareLocalIndex &&
                m.settings.blacklistIDs?.some(
                  (id) => !["ABSXUc", "AWBgqf", "ATaHuq"].includes(id),
                ) && (
                  <p className="bp-index-note">
                    Custom excluded games prevent your index from being shared.
                    Remove them in Advanced to enable sharing.
                  </p>
                )}
            </>
          )}
          {section === "advanced" && (
            <>
              <h2>Advanced</h2>
              <Setting
                title="Index storage"
                description={m.localIndexPath || "Loading location…"}
              >
                <SurfaceButton
                  disabled={busy}
                  onClick={() => run(m.handleChangeLocation)}
                >
                  <FolderOpen /> Change folder
                </SurfaceButton>
              </Setting>
              {[
                [
                  "Workers",
                  "Parallel workers used for local builds.",
                  "localRefreshWorkers",
                  m.workerCount,
                  m.setWorkerCount,
                  1,
                  16,
                  1,
                ],
                [
                  "Games per page",
                  "Games requested at a time when building locally.",
                  "fetchPageCount",
                  m.fetchPageCount,
                  m.setFetchPageCount,
                  10,
                  100,
                  10,
                ],
              ].map(
                ([title, description, key, value, setter, min, max, step]) => (
                  <Setting key={key} title={title} description={description}>
                    <SurfaceButton
                      aria-label={`Decrease ${title}`}
                      disabled={busy || value <= min}
                      onClick={() =>
                        save(key, Math.max(min, value - step), setter)
                      }
                    >
                      <Minus />
                    </SurfaceButton>
                    <output>{value}</output>
                    <SurfaceButton
                      aria-label={`Increase ${title}`}
                      disabled={busy || value >= max}
                      onClick={() =>
                        save(key, Math.min(max, value + step), setter)
                      }
                    >
                      <Plus />
                    </SurfaceButton>
                  </Setting>
                ),
              )}
              <h3>Excluded games</h3>
              <p>Skip these game IDs when building your local index.</p>
              <label className="bp-index-field">
                Game ID
                <input
                  disabled={busy}
                  value={m.newBlacklistId}
                  onChange={(e) => m.setNewBlacklistId(e.target.value.trim())}
                />
              </label>
              <SurfaceButton
                disabled={busy || !m.newBlacklistId.trim()}
                onClick={() =>
                  run(async () => {
                    const id = m.newBlacklistId.trim();
                    if (!m.settings.blacklistIDs?.includes(id))
                      await m.updateSetting("blacklistIDs", [
                        ...(m.settings.blacklistIDs || []),
                        id,
                      ]);
                    m.setNewBlacklistId("");
                  })
                }
              >
                <Plus /> Exclude game
              </SurfaceButton>
              {(m.settings.blacklistIDs || []).map((id) => (
                <Setting key={id} title={id}>
                  <SurfaceButton
                    aria-label={`Remove excluded game ${id}`}
                    disabled={busy}
                    onClick={() =>
                      save(
                        "blacklistIDs",
                        m.settings.blacklistIDs.filter((value) => value !== id),
                      )
                    }
                  >
                    Remove
                  </SurfaceButton>
                </Setting>
              ))}
            </>
          )}
        </section>
      </div>
      <footer className="bp-index-footer">
        <span>
          <kbd>{buttons.confirm}</kbd> Select / edit
        </span>
        <span>
          <kbd>{buttons.cancel}</kbd> Back
        </span>
        <span>Directional controls to navigate</span>
      </footer>
    </main>
  );
}
