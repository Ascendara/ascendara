import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/context/SettingsContext";
import gameService from "@/services/gameService";

// Keep recovery available across pages, including when background sync is off.
export default function IndexRecoveryNotice() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [health, setHealth] = useState(null);
  const [repairing, setRepairing] = useState(false);
  const [error, setError] = useState(null);
  const busy = useRef(false);

  useEffect(() => {
    let disposed = false;
    let request = 0;
    const check = async () => {
      if (busy.current) return;
      const id = ++request;
      try {
        const result = await window.electron.getLocalIndexHealth();
        if (!disposed && id === request) setHealth(result);
      } catch {
        if (!disposed && id === request) setHealth({ status: "unreadable" });
      }
    };
    check();
    window.addEventListener("index-refreshed", check);
    window.addEventListener("focus", check);
    // Detect a removed drive/file even if the renderer still has games cached.
    const interval = setInterval(check, 60000);
    return () => {
      disposed = true;
      clearInterval(interval);
      window.removeEventListener("index-refreshed", check);
      window.removeEventListener("focus", check);
    };
  }, [settings?.localIndex, settings?.customSourcesMode]);

  const repair = async () => {
    if (busy.current) return;
    busy.current = true;
    setRepairing(true);
    setError(null);
    try {
      const result = await window.electron.repairLocalIndex();
      if (!result?.success)
        throw new Error(result?.error || "Could not download the game index.");
      setHealth(result);
      gameService.notifySourceChanged();
    } catch (failure) {
      setError(failure.message);
    } finally {
      busy.current = false;
      setRepairing(false);
    }
  };

  if (
    settings?.customSourcesMode ||
    !health ||
    ["ready", "custom"].includes(health.status)
  ) {
    return null;
  }

  return (
    <section
      role="alert"
      aria-busy={repairing}
      className="border-destructive/40 fixed bottom-6 left-1/2 z-50 w-[min(36rem,calc(100%-2rem))] -translate-x-1/2 rounded-xl border bg-card p-5 text-card-foreground shadow-2xl"
    >
      <div className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="text-destructive h-5 w-5 shrink-0" aria-hidden="true" />
        {t("indexRecovery.title", { defaultValue: "Your game index needs attention" })}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("indexRecovery.description", {
          defaultValue:
            "Ascendara cannot find or read your game index. Browsing and search need this file. Set it up again to download a fresh copy, or choose your existing index folder in Settings.",
        })}
      </p>
      {error && (
        <div className="text-destructive mt-3 text-sm">
          <p>
            {t("indexRecovery.failed", {
              defaultValue:
                "Setup failed. Check your connection and make sure the index folder is available and writable, then try again.",
            })}
          </p>
          <p className="mt-1 break-words">{error}</p>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={repair} disabled={repairing}>
          {repairing && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          {repairing
            ? t("indexRecovery.repairing", { defaultValue: "Setting up game index…" })
            : t("indexRecovery.repair", { defaultValue: "Set up game index again" })}
        </Button>
        <Button
          variant="outline"
          disabled={repairing}
          onClick={() => navigate("/settings", { state: { scrollTo: "game-index" } })}
        >
          {t("indexRecovery.settings", { defaultValue: "Game Index settings" })}
        </Button>
      </div>
    </section>
  );
}
