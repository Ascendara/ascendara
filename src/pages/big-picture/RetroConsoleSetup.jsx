import { ChevronLeft, ExternalLink, FolderOpen, Settings2, X } from "lucide-react";
import expanded from "../../../electron/modules/retro/expanded-catalogue.json";
import { SurfaceButton } from "./Surface";

const names = {
  duckstation: "DuckStation",
  pcsx2: "PCSX2",
  rpcs3: "RPCS3",
  ppsspp: "PPSSPP",
  dolphin: "Dolphin",
  retroarch: "RetroArch",
  custom: "Custom emulator",
};

export function getRetroAdapterChoices(platform, profile, allowed) {
  return [...new Set([
    platform.adapter,
    profile?.adapter,
    "retroarch",
    "custom",
    ...expanded.emulators
      .filter(item => item.args && item.platforms.includes(platform.id) && allowed)
      .map(item => item.id),
  ])].filter(Boolean).map(id => ({
    id,
    name: names[id] || expanded.emulators.find(item => item.id === id)?.name || id,
  }));
}

export function RetroConsoleSetup({
  platform,
  draft,
  choices,
  focus,
  busy,
  taskBusy,
  onChange,
  onPick,
  onWebsite,
  onSave,
  onBack,
}) {
  const set = (key, value) => onChange(previous => ({ ...previous, [key]: value }));
  return <>
    <div className="bp-retro-heading">
      <div>
        <p className="bp-section-label">CONSOLE SETUP</p>
        <h1>{platform.name}</h1>
        <p className="bp-muted">Choose the emulator used to launch this console’s games, then add your ROM folders.</p>
      </div>
      <SurfaceButton {...focus("setup-back")} onClick={onBack}><ChevronLeft /> Back</SurfaceButton>
    </div>
    <section className="bp-panel bp-retro-setup">
      <h2>Emulator</h2>
      <p className="bp-muted">Recommended: {platform.emulator}. Your selection is saved for this console.</p>
      <div className="bp-retro-adapters">
        {choices.map(item => <SurfaceButton key={item.id} {...focus(`adapter-${item.id}`)}
          aria-pressed={draft.adapter === item.id} onClick={() => set("adapter", item.id)}>{item.name}</SurfaceButton>)}
      </div>
      <div className="bp-retro-setting">
        <div><strong>Emulator executable</strong><small>{draft.executable || "Select the emulator application"}</small></div>
        <div className="bp-retro-setting-actions">
          <SurfaceButton {...focus("emulator-website")} onClick={onWebsite}><ExternalLink /> Get emulator</SurfaceButton>
          <SurfaceButton {...focus("pick-emulator")} onClick={() => onPick("executable", path => set("executable", path))}><FolderOpen /> Browse</SurfaceButton>
        </div>
      </div>
      {draft.adapter === "retroarch" && <div className="bp-retro-setting">
        <div><strong>RetroArch core</strong><small>{draft.core || platform.coreHint || "Select a core library"}</small></div>
        <SurfaceButton {...focus("pick-core")} onClick={() => onPick("core", path => set("core", path))}><FolderOpen /> Browse</SurfaceButton>
      </div>}
      {draft.adapter === "custom" && <label className="bp-retro-custom-args">
        <strong>Custom launch arguments</strong>
        <textarea {...focus("custom-args")} value={draft.arguments} onChange={event => set("arguments", event.target.value)} onKeyDown={event => event.stopPropagation()}
          placeholder="One argument per line; use {rom} for the game file" rows={3} />
        <small>Use a keyboard to edit arguments. The game file is added automatically if {"{rom}"} is absent.</small>
      </label>}
      <div className="bp-retro-setting">
        <div><strong>ROM folders</strong><small>{draft.romFolders.length ? `${draft.romFolders.length} folder${draft.romFolders.length === 1 ? "" : "s"} selected` : "Add a folder, then scan to import games"}</small></div>
        <SurfaceButton {...focus("add-folder")} onClick={() => onPick("romFolder", path => set("romFolders", [...new Set([...draft.romFolders, path])]))}><FolderOpen /> Add folder</SurfaceButton>
      </div>
      {draft.romFolders.map((folder, index) => <div className="bp-retro-folder" key={folder}>
        <span>{folder}</span>
        <SurfaceButton variant="icon" {...focus(`remove-folder-${index}`)} aria-label={`Remove ${folder}`}
          onClick={() => set("romFolders", draft.romFolders.filter(path => path !== folder))}><X /></SurfaceButton>
      </div>)}
      <div className="bp-retro-setting">
        <div><strong>Save folder</strong><small>{draft.saveFolder || "Optional: choose a location for save backups"}</small></div>
        <SurfaceButton {...focus("pick-save-folder")} onClick={() => onPick("saveFolder", path => set("saveFolder", path))}><FolderOpen /> Browse</SurfaceButton>
      </div>
      <SurfaceButton {...focus("fullscreen")} aria-pressed={draft.fullscreen} onClick={() => set("fullscreen", !draft.fullscreen)}>
        <Settings2 /> Fullscreen {draft.fullscreen ? "On" : "Off"}
      </SurfaceButton>
      <div className="bp-actions">
        <SurfaceButton {...focus("save-setup")} disabled={busy || taskBusy} onClick={() => onSave(false)}>Save setup</SurfaceButton>
        <SurfaceButton {...focus("save-scan")} variant="primary" disabled={busy || taskBusy || !draft.romFolders.length} onClick={() => onSave(true)}>Save and scan</SurfaceButton>
      </div>
    </section>
  </>;
}
