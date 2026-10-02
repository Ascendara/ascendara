import { BigPictureShell } from "./BigPictureShell";
import { SurfaceButton, useSurface } from "./Surface";
import { libraryInstallKey } from "@/lib/libraryConflicts";
import { gameName } from "./surfaceNavigation";
import { useEffect, useRef } from "react";
import { useControllerInput } from "./useControllerInput";
import { toast } from "sonner";

export function LibraryConflictSurface({ conflict, resolve, onLater }) {
  const choose = choice => {
    if (resolve(conflict.key, choice)) toast.success(choice === "both"
      ? `Saved: keeping all entries for ${gameName(conflict.variants[0])}.`
      : `Saved: keeping the selected install for ${gameName(conflict.variants[0])} and hiding the others.`);
  };
  const navigation = useRef(null);
  const rows = [
    ...conflict.variants.map((_, index) => [`keep-${index}`]),
    ["both", "later"],
  ];
  const { root, focus } = useSurface(navigation, rows, onLater);
  useControllerInput(action => navigation.current?.(action), { priority: 100 });
  useEffect(() => {
    const handleKey = event => {
      const action = {
        ArrowUp: "UP",
        ArrowDown: "DOWN",
        ArrowLeft: "LEFT",
        ArrowRight: "RIGHT",
        Enter: "CONFIRM",
        " ": "CONFIRM",
        Escape: "BACK",
        Backspace: "BACK",
        Tab: event.shiftKey ? "UP" : "DOWN",
      }[event.key];
      event.stopImmediatePropagation();
      if (action) {
        event.preventDefault();
        navigation.current?.(action);
      }
    };
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, []);
  return (
    <div
      className="absolute inset-0 z-[9500] bg-background"
      role="dialog"
      aria-modal="true"
      aria-label="Duplicate library entries"
    >
      <BigPictureShell ref={root} title="Multiple installs found" focus={focus}>
        <h1>Multiple installs found</h1>
        <h2>{gameName(conflict.variants[0])}</h2>
        <p>
          Keep all entries, or choose one and permanently hide the others. This choice
          applies to your library and Big Picture. Your game files will stay on disk.
        </p>
        {conflict.variants.map((game, index) => (
          <div key={libraryInstallKey(game)} className="my-6 break-all">
            <p>
              {game.isCustom ? "Custom / imported" : "Installed"}
              {game.version ? ` · ${game.version}` : ""}
            </p>
            <p>{game.executable || "No executable selected"}</p>
            <p>{game._sourceDir}</p>
            <SurfaceButton
              {...focus(`keep-${index}`)}
              onClick={() => choose(libraryInstallKey(game))}
            >
              Keep this entry and hide the others
            </SurfaceButton>
          </div>
        ))}
        <div className="bp-actions">
          <SurfaceButton {...focus("both")} onClick={() => choose("both")}>
            Keep all entries
          </SurfaceButton>
          <SurfaceButton {...focus("later")} onClick={onLater}>
            Decide later
          </SurfaceButton>
        </div>
      </BigPictureShell>
    </div>
  );
}
