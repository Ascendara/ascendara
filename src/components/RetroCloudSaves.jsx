import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Cloud, Loader2, RefreshCw, Upload, Download, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import {
  getRetroCloudAccess,
  listRetroBackups,
  uploadRetroBackup,
  restoreRetroCloudBackup,
} from "@/services/retroService";
import { toast } from "sonner";

export default function RetroCloudSaves({
  platform,
  profile,
  onSetup,
  running = false,
  onBusyChange,
}) {
  const { user, userData } = useAuth();
  const [access, setAccess] = useState(null);
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [operation, setOperation] = useState(null);
  const [error, setError] = useState(null);
  const [revision, setRevision] = useState(0);
  const account = useRef(user?.uid);
  account.current = user?.uid;
  const inFlight = useRef(false);
  useEffect(() => {
    let cancelled = false;
    setAccess(null);
    setBackups([]);
    setError(null);
    setLoading(true);
    (async () => {
      try {
        const allowed = user ? await getRetroCloudAccess() : false;
        if (cancelled) return;
        setAccess(allowed);
        if (allowed) {
          const entries = await listRetroBackups(platform.id);
          if (!cancelled) setBackups(entries);
        }
      } catch (failure) {
        if (!cancelled) setError(failure.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    user?.uid,
    userData?.ascendSubscription?.active,
    userData?.verified,
    platform.id,
    revision,
  ]);

  const perform = async (key, action) => {
    if (inFlight.current) return;
    const uid = user?.uid;
    inFlight.current = true;
    setOperation(key);
    setError(null);
    onBusyChange?.(true);
    try {
      await action();
      if (account.current === uid) setRevision(value => value + 1);
    } catch (failure) {
      if (account.current === uid) setError(failure.message);
    } finally {
      inFlight.current = false;
      setOperation(null);
      onBusyChange?.(false);
    }
  };
  const busy = !!operation;
  return (
    <section className="space-y-4 text-foreground" aria-label="Ascend Retro cloud saves">
      <div className="flex items-start gap-3 rounded-xl border border-border bg-primary/5 p-4">
        <Cloud className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
        <div className="space-y-1">
          <h3 className="font-semibold">Ascend cloud saves</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Keep your {platform.name} progress backed up and restore it on another device.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Each backup contains the entire console save folder. Shared memory cards may
            contain saves for several games.
          </p>
        </div>
      </div>
      {loading && (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading cloud saves…
        </p>
      )}
      {!loading && access === false && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {user
              ? "Retro cloud saves are included with an active Ascend subscription."
              : "Sign in and get Ascend to back up your Retro saves to the cloud."}
          </p>
          <Link
            className="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-secondary"
            to="/ascend"
          >
            {user ? "Explore Ascend" : "Sign in to Ascend"}
          </Link>
        </div>
      )}
      {access && (
        <>
          {!profile?.saveFolder && (
            <div className="space-y-2 rounded-lg border border-border p-4">
              <p className="text-sm">
                Select the save or memory card folder used by your emulator on this device
                before uploading or restoring.
              </p>
              {onSetup && (
                <Button variant="outline" disabled={busy} onClick={onSetup}>
                  <Settings2 className="mr-2 h-4 w-4" />
                  Choose save folder
                </Button>
              )}
            </div>
          )}
          {profile?.saveFolder && (
            <p className="break-all text-sm text-muted-foreground">
              Local save folder:{" "}
              <span className="text-foreground">{profile.saveFolder}</span>
            </p>
          )}
          {running && (
            <p className="text-sm text-muted-foreground">
              Close the emulator before uploading or restoring saves.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              className="text-secondary"
              disabled={busy || loading || running || !profile?.saveFolder}
              onClick={() =>
                perform("upload", async () => {
                  await uploadRetroBackup(platform.id);
                  toast.success(`${platform.name} saves uploaded to Ascend`);
                })
              }
            >
              {operation === "upload" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Back up to cloud
            </Button>
            <Button
              variant="outline"
              disabled={busy || loading}
              onClick={() => setRevision(value => value + 1)}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
          {!loading && !error && !backups.length && (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No cloud backups yet. Back up your saves to keep a copy in Ascend.
            </p>
          )}
          <div className="space-y-2">
            {backups.map((backup, index) => {
              const id = backup.backupId || backup.id;
              const date = new Date(backup.createdAt);
              return (
                <div
                  key={id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 p-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="break-all text-sm font-medium">
                      {backup.backupName || backup.name}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {index === 0 ? "Latest · " : ""}
                      {Number.isNaN(date.getTime())
                        ? "Saved backup"
                        : date.toLocaleString()}
                      {backup.size
                        ? ` · ${(backup.size / 1024 / 1024).toFixed(2)} MB`
                        : ""}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    disabled={busy || running || !profile?.saveFolder}
                    onClick={() =>
                      perform(id, async () => {
                        const restored = await restoreRetroCloudBackup(platform.id, id);
                        if (restored)
                          toast.success(
                            `Restored ${restored.restored} save files. Your previous saves are in Recovery copies.`
                          );
                      })
                    }
                  >
                    {operation === id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-4 w-4" />
                    )}
                    Restore
                  </Button>
                </div>
              );
            })}
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Restore asks before replacing local saves and keeps a recovery copy. These
            backups also appear in Ascend → Cloud Backups.
          </p>
        </>
      )}
      {error && (
        <div
          role="alert"
          className="border-destructive/30 space-y-2 rounded-lg border p-3"
        >
          <p className="text-destructive text-sm">{error}</p>
          <Button
            variant="outline"
            disabled={busy || loading}
            onClick={() => setRevision(value => value + 1)}
          >
            Try again
          </Button>
        </div>
      )}
    </section>
  );
}
