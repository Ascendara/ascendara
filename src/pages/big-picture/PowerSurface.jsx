import { useRef, useState } from "react";
import { Power, Monitor, LogOut, ArrowLeft } from "lucide-react";
import { BigPictureShell, BigPicturePanel } from "./BigPictureShell";
import { SurfaceButton, useSurface } from "./Surface";
import { PageNavigationContext } from "./PageHeader";

function PowerConfirmation({ navigation, active, action, onBack, downloads }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const shutdown = action === "shutdown";
  const { root, focus } = useSurface(navigation, [["cancel", "confirm"]], () => !submitting.current && onBack(), active && !busy);
  const confirm = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      if (shutdown) {
        const result = await window.electron.shutdownSystem();
        if (!result?.success) throw new Error(result?.error || "Unable to shut down the computer.");
        setError("Shutdown requested. If the computer stays on, check open applications for a save prompt.");
      } else await window.electron.closeWindow(true);
    } catch (error) {
      setError(error.message || "The action could not be completed. Please try again.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return <BigPictureShell ref={root} className="bp-power" title="Confirm power action" focus={focus}>
    <BigPicturePanel>
      <Power className="bp-power-symbol" aria-hidden="true" />
      <h2>{shutdown ? "Shut down your computer?" : "Exit Ascendara?"}</h2>
      <p className="bp-muted">{shutdown ? "Your computer will turn off. Save your progress and close any running games before continuing." : "Ascendara will close. You can return to the desktop interface instead to keep it running."}</p>
      {downloads > 0 && <p className="bp-power-warning">{downloads} active download{downloads === 1 ? "" : "s"} or installation{downloads === 1 ? "" : "s"} may be interrupted.</p>}
      {error && <p role="status">{error}</p>}
      <div className="bp-actions">
        <SurfaceButton {...focus("cancel")} disabled={busy} onClick={onBack}>Cancel</SurfaceButton>
        <SurfaceButton {...focus("confirm")} disabled={busy} variant="danger" onClick={confirm}>{busy ? "Please wait?" : shutdown ? "Shut down computer" : "Exit Ascendara"}</SurfaceButton>
      </div>
    </BigPicturePanel>
  </BigPictureShell>;
}

export function PowerSurface({ navigation, active, onBack, onDesktop, downloads = 0 }) {
  const [action, setAction] = useState(null);
  const { root, focus } = useSurface(navigation, [["back"], ["desktop"], ["quit"], ["shutdown"]], onBack, active && !action);
  if (action) return <PageNavigationContext.Provider value={null}><PowerConfirmation navigation={navigation} active={active} action={action} downloads={downloads} onBack={() => setAction(null)} /></PageNavigationContext.Provider>;
  return <BigPictureShell ref={root} className="bp-power" title="Power" focus={focus}>
    <BigPicturePanel>
      <Power className="bp-power-symbol" aria-hidden="true" />
      <h2>Ready to call it a day?</h2>
      <p className="bp-muted">Return to Ascendara, close the app, or turn off your computer.</p>
      <div className="bp-power-options">
        {[
          ["back", ArrowLeft, "Back to Big Picture", "Keep browsing your games.", onBack],
          ["desktop", Monitor, "Return to Ascendara desktop", "Keep Ascendara and your downloads running.", onDesktop],
          ["quit", LogOut, "Exit Ascendara", "Close the app and stop active downloads.", () => setAction("quit")],
          ["shutdown", Power, "Shut down computer", "Save your progress before turning off.", () => setAction("shutdown")],
        ].map(([id, Icon, title, description, onClick]) => <SurfaceButton key={id} {...focus(id)} className="bp-power-option" onClick={onClick}><Icon aria-hidden="true" /><span><strong>{title}</strong><small>{description}</small></span></SurfaceButton>)}
      </div>
    </BigPicturePanel>
  </BigPictureShell>;
}
