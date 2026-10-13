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
  const busy = pending || !!m.downloadingIndex || m.isSyncingCustomSource;
  const buttons = getControllerButtons(controllerType);
  const run = async action => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    try {
      await action();
    } catch (error) {
      toast.error(error?.message || "Unable to update the index. Please try again.");
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
    Math.min(100, m.downloadingIndex ? downloadPercent || 0 : 0)
  );
  const status = m.downloadingIndex
    ? "Refreshing index"
    : m.isSyncingCustomSource
      ? "Syncing source"
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
                      m.customSourcesMode ? m.customSourceLastSynced : m.lastRefreshTime
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
                  <SurfaceButton
                    className="bp-index-action-card"
                    disabled={busy || !m.localIndexPath}
                    onClick={() =>
                      run(() => window.electron.downloadSharedIndex(m.localIndexPath))
                    }
                  >
                    <CloudDownload />
                    <strong>Refresh index</strong>
                    <span>Get the latest games from Ascendara.</span>
                  </SurfaceButton>
                )}
              </div>
              {m.customSourcesMode && !m.customSource?.url && (
                <p className="bp-index-note">
                  Choose a source or import a list in Sources & imports.
                </p>
              )}
              {busy && (
                <div className="bp-index-progress" aria-live="polite">
                  <div>
                    <strong>{status}</strong>
                    {m.downloadingIndex && percent > 0 && (
                      <span>{Math.round(percent)}%</span>
                    )}
                  </div>
                  <progress max="100" value={percent || undefined} />
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
                  onChange={value => run(() => m.handleToggleCustomSourcesMode(value))}
                />
              </Setting>
              {m.customSourcesMode && (
                <>
                  <label className="bp-index-field">
                    Source bucket URL
                    <input
                      value={m.sourceBucketUrlDraft}
                      disabled={busy}
                      onChange={e => m.setSourceBucketUrlDraft(e.target.value)}
                      placeholder="https://…"
                    />
                  </label>
                  <div className="bp-index-inline">
                    <SurfaceButton
                      disabled={busy || !m.sourceBucketUrlDraft.trim()}
                      onClick={() =>
                        run(() => m.handleSaveSourceBucketUrl(m.sourceBucketUrlDraft))
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
                  {m.customSourcesLibrary.map(source => (
                    <Setting
                      key={source.url}
                      title={source.name || source.url}
                      description={source.url}
                    >
                      <SurfaceButton
                        disabled={busy || source.url === m.customSource?.url}
                        onClick={() => run(() => m.handleSwitchToSavedSource(source))}
                      >
                        {source.url === m.customSource?.url ? "Active" : "Use source"}
                      </SurfaceButton>
                      <SurfaceButton
                        disabled={busy || source.url === m.customSource?.url}
                        onClick={() => run(() => m.removeLibraryEntry(source.url))}
                        aria-label={`Remove ${source.name || source.url}`}
                      >
                        Remove
                      </SurfaceButton>
                    </Setting>
                  ))}
                  {m.customLists.length > 0 && <h3>Imported lists</h3>}
                  {m.customLists.map(list => (
                    <Setting
                      key={list.id}
                      title={list.name}
                      description={`${list.gamesCount ?? list.gameCount ?? 0} games`}
                    >
                      <SurfaceButton
                        disabled={busy || list.id === m.activeCustomList?.id}
                        onClick={() => run(() => m.handleSwitchToList(list))}
                      >
                        {list.id === m.activeCustomList?.id ? "Active" : "Use list"}
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
                            onChange={e => setListName(e.target.value)}
                          />
                        </label>
                      ) : (
                        <p>This removes the imported list from Ascendara.</p>
                      )}
                      <div className="bp-index-inline">
                        <SurfaceButton
                          disabled={
                            busy || (listAction.type === "rename" && !listName.trim())
                          }
                          onClick={() =>
                            run(async () => {
                              if (listAction.type === "rename")
                                await m.handleRenameList(
                                  listAction.list,
                                  listName.trim()
                                );
                              else await m.handleDeleteList(listAction.list, true);
                              setListAction(null);
                            })
                          }
                        >
                          {listAction.type === "rename" ? "Save name" : "Delete list"}
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
                  Automatic updates apply to the Ascendara index. Turn off external
                  sources to configure them.
                </p>
              )}
              <Setting
                title="Keep index up to date"
                description="Check for new games in the background and update automatically."
              >
                <Toggle
                  label="Keep index up to date"
                  checked={m.settings?.backgroundIndexSync !== false}
                  disabled={busy || m.customSourcesMode}
                  onChange={value => save("backgroundIndexSync", value)}
                />
              </Setting>
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
              <h3>Excluded games</h3>
              <p>
                Hide these game IDs from your index. Applies the next time it updates.
              </p>
              <label className="bp-index-field">
                Game ID
                <input
                  disabled={busy}
                  value={m.newBlacklistId}
                  onChange={e => m.setNewBlacklistId(e.target.value.trim())}
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
              {(m.settings.blacklistIDs || []).map(id => (
                <Setting key={id} title={id}>
                  <SurfaceButton
                    aria-label={`Remove excluded game ${id}`}
                    disabled={busy}
                    onClick={() =>
                      save(
                        "blacklistIDs",
                        m.settings.blacklistIDs.filter(value => value !== id)
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
