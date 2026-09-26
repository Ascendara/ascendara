import { PageNavigationContext } from "./PageHeader";
import { SurfaceButton, useSurface } from "./Surface";

function Confirmation({
  navigation,
  active,
  confirmation,
  cancel,
  confirm,
  busy,
}) {
  const { root, focus } = useSurface(
    navigation,
    busy ? [] : [["cancel", "confirm"]],
    () => !busy && cancel(),
    active
  );
  return (
    <div
      className="bp-cloud-modal"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="cloud-confirm-title"
      aria-describedby="cloud-confirm-description"
      ref={root}
    >
      <div className="bp-panel">
        <h2 id="cloud-confirm-title">{confirmation.title}</h2>
        <p id="cloud-confirm-description">{confirmation.description}</p>
        <div className="bp-actions">
          <SurfaceButton {...focus("cancel")} disabled={busy} onClick={cancel}>
            Cancel
          </SurfaceButton>
          <SurfaceButton
            {...focus("confirm")}
            disabled={busy}
            onClick={confirm}
          >
            {busy ? "Please wait…" : confirmation.label || "Confirm"}
          </SurfaceButton>
        </div>
      </div>
    </div>
  );
}

export function CloudConfirmation(props) {
  // Confirmation owns focus; page navigation cannot be reached behind it.
  return (
    <PageNavigationContext.Provider value={null}>
      <Confirmation {...props} />
    </PageNavigationContext.Provider>
  );
}
