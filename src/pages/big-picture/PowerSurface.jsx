import { BigPictureShell, BigPicturePanel } from "./BigPictureShell";
import { SurfaceButton, useSurface } from "./Surface";

export function PowerSurface({ navigation, active, onBack, onDesktop }) {
  const { root, focus } = useSurface(
    navigation,
    [["cancel", "desktop", "quit"]],
    onBack,
    active,
  );
  return (
    <BigPictureShell
      ref={root}
      className="bp-power"
      title="Power"
      focus={focus}
    >
      <BigPicturePanel>
        <h2>Leave Big Picture?</h2>
        <p className="bp-muted">
          Return to desktop to keep Ascendara running. Exiting Ascendara closes
          the application and may interrupt downloads.
        </p>
        <div className="bp-actions">
          <SurfaceButton {...focus("cancel")} onClick={onBack}>
            Cancel
          </SurfaceButton>
          <SurfaceButton {...focus("desktop")} onClick={onDesktop}>
            Return to Ascendara desktop
          </SurfaceButton>
          <SurfaceButton
            variant="danger"
            {...focus("quit")}
            onClick={() => window.electron?.closeWindow(true)}
          >
            Exit Ascendara
          </SurfaceButton>
        </div>
      </BigPicturePanel>
    </BigPictureShell>
  );
}
