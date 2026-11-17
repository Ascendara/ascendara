import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen, Gamepad2, Loader2, LockKeyhole, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { retroCall } from "@/services/library/retroService";
import expanded from "../../electron/modules/retro/expanded-catalogue.json";

const basename = file => file.split(/[\\/]/).pop();
const union = (...lists) => [...new Set(lists.flat().filter(Boolean))];
const isPreset = adapter => expanded.emulators.some(entry => entry.id === adapter);

// Add games without opening each console first: pick folders, Retro works out
// the consoles from the files, then pick an emulator for each.
export default function RetroQuickAdd({ platforms, profiles, access, onClose }) {
  const { t } = useTranslation();
  const [folders, setFolders] = useState([]);
  const [detection, setDetection] = useState(null);
  const [detecting, setDetecting] = useState(false);
  // Group index -> console id, or "skip"
  const [targets, setTargets] = useState({});
  // Console id -> { executable, adapter, core } chosen here
  const [emulators, setEmulators] = useState({});
  const [consoleName, setConsoleName] = useState(profiles.other?.consoleName || "");
  const [busy, setBusy] = useState(false);

  const platformFor = id => platforms.find(platform => platform.id === id);
  const locked = id => platformFor(id)?.ascend && !access.allowed;

  useEffect(() => {
    if (!folders.length) {
      setDetection(null);
      return;
    }
    let cancelled = false;
    setDetecting(true);
    retroCall("detect", folders)
      .then(result => {
        if (cancelled) return;
        setDetection(result);
        // Detected console, else the first one that could read the files.
        setTargets(
          Object.fromEntries(
            result.groups.map((group, index) => [
              index,
              group.platform ||
                group.candidates.find(id => !locked(id)) ||
                group.candidates[0] ||
                "skip",
            ])
          )
        );
      })
      .catch(error => !cancelled && toast.error(error.message))
      .finally(() => !cancelled && setDetecting(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `locked` only reads access
  }, [folders, access.allowed]);

  // One row per console the files are going to.
  const rows = useMemo(() => {
    const byConsole = new Map();
    for (const [index, group] of (detection?.groups || []).entries()) {
      const id = targets[index];
      if (!id || id === "skip") continue;
      const row = byConsole.get(id) || { id, count: 0, extensions: [] };
      row.count += group.count;
      row.extensions = union(row.extensions, group.extensions);
      byConsole.set(id, row);
    }
    return [...byConsole.values()].sort((a, b) => b.count - a.count);
  }, [detection, targets]);

  const emulatorFor = id =>
    emulators[id] ||
    (profiles[id]?.executable
      ? {
          executable: profiles[id].executable,
          adapter: profiles[id].adapter || platformFor(id)?.adapter,
          core: profiles[id].core,
          existing: true,
        }
      : null);

  const emulatorName = emulator =>
    emulator.adapter === "custom"
      ? t("retro.quickAdd.customEmulator", { name: basename(emulator.executable) })
      : t(`retro.emulators.${emulator.adapter}.name`);

  const addFolder = async () => {
    try {
      const folder = await retroCall("pick", "romFolder");
      if (folder) setFolders(previous => union(previous, [folder]));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const chooseEmulator = async id => {
    try {
      const executable = await retroCall("pick", "executable");
      if (!executable) return;
      const info = await retroCall("identifyEmulator", executable);
      setEmulators(previous => {
        const next = { ...previous };
        // The chosen console, plus any other found console this emulator runs
        // that doesn't have one yet.
        for (const row of rows) {
          const supported = info.platforms.includes(row.id);
          if (row.id !== id && (!supported || emulatorFor(row.id))) continue;
          let adapter = supported ? info.adapter : "custom";
          // Ascend presets fall back to launching the emulator as a custom one.
          if (isPreset(adapter) && !access.allowed) adapter = "custom";
          next[row.id] = {
            executable,
            adapter,
            core: adapter === "retroarch" ? info.cores[row.id] || "" : "",
          };
        }
        return next;
      });
    } catch (error) {
      toast.error(error.message);
    }
  };

  const chooseCore = async id => {
    try {
      const core = await retroCall("pick", "core");
      if (core)
        setEmulators(previous => ({ ...previous, [id]: { ...emulatorFor(id), core } }));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const ready = rows.filter(row => !locked(row.id));

  const save = async () => {
    setBusy(true);
    try {
      for (const row of ready) {
        const existing = profiles[row.id] || {};
        const platform = platformFor(row.id);
        const chosen = emulators[row.id];
        await retroCall("saveProfile", row.id, {
          adapter: chosen?.adapter || existing.adapter || platform.adapter,
          executable: chosen ? chosen.executable : existing.executable || "",
          core: chosen ? chosen.core : existing.core || "",
          arguments: existing.arguments || "",
          romFolders: union(existing.romFolders || [], folders),
          // File types this console doesn't scan on its own
          extensions: union(
            existing.extensions || [],
            row.extensions.filter(
              ext => ext !== "EBOOT.BIN" && !platform.extensions.includes(ext)
            )
          ),
          saveFolder: existing.saveFolder || "",
          fullscreen: existing.fullscreen !== false,
          consoleName: row.id === "other" ? consoleName : existing.consoleName,
        });
      }
      await retroCall(
        "scan",
        ready.map(row => row.id)
      );
      onClose();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const groupLabel = group =>
    t("retro.quickAdd.files", {
      count: group.count,
      types: group.extensions
        .map(ext => (ext === "EBOOT.BIN" ? ext : `.${ext}`))
        .join(", "),
    });

  return (
    <Dialog open onOpenChange={open => !open && !busy && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto border-border bg-background text-sm leading-relaxed text-foreground">
        <DialogHeader className="space-y-2 border-b border-border pb-4 pr-6 text-left">
          <DialogTitle>{t("retro.quickAdd.title")}</DialogTitle>
          <DialogDescription>{t("retro.quickAdd.description")}</DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <h3 className="font-medium">{t("retro.quickAdd.folders")}</h3>
          {folders.map(folder => (
            <div key={folder} className="flex items-center gap-2 rounded-lg border p-2">
              <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 break-all">{folder}</span>
              <Button
                variant="ghost"
                size="sm"
                aria-label={t("retro.setup.removeFolder", { folder })}
                onClick={() => setFolders(previous => previous.filter(f => f !== folder))}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" onClick={addFolder} disabled={busy}>
            <Plus className="mr-2 h-4 w-4" />
            {t("retro.setup.addRomFolder")}
          </Button>
        </section>

        {detecting && (
          <p role="status" className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("retro.quickAdd.detecting")}
          </p>
        )}

        {detection && !detecting && (
          <>
            <section className="space-y-2">
              <h3 className="font-medium">{t("retro.quickAdd.found")}</h3>
              {!detection.groups.length && (
                <p className="text-muted-foreground">{t("retro.quickAdd.nothing")}</p>
              )}
              {detection.truncated && (
                <p className="text-muted-foreground">{t("retro.quickAdd.truncated")}</p>
              )}
              {detection.groups.map((group, index) => (
                <div
                  key={group.extensions.join() + index}
                  className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
                >
                  <span className="min-w-0 flex-1">{groupLabel(group)}</span>
                  <Select
                    value={targets[index]}
                    onValueChange={value =>
                      setTargets(previous => ({ ...previous, [index]: value }))
                    }
                  >
                    <SelectTrigger
                      className="w-full sm:w-56"
                      aria-label={t("retro.quickAdd.consoleFor", {
                        files: groupLabel(group),
                      })}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {union(group.candidates, ["other"]).map(id => (
                        <SelectItem key={id} value={id}>
                          {platformFor(id)?.name}
                        </SelectItem>
                      ))}
                      <SelectItem value="skip">{t("retro.quickAdd.skip")}</SelectItem>
                      <SelectSeparator />
                      {platforms
                        .filter(
                          platform =>
                            !group.candidates.includes(platform.id) &&
                            platform.id !== "other"
                        )
                        .map(platform => (
                          <SelectItem key={platform.id} value={platform.id}>
                            {platform.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </section>

            {rows.length > 0 && (
              <section className="space-y-2">
                <h3 className="font-medium">{t("retro.quickAdd.emulators")}</h3>
                <p className="text-muted-foreground">
                  {t("retro.quickAdd.emulatorsHint")}
                </p>
                {rows.map(row => {
                  const emulator = emulatorFor(row.id);
                  const needsCore = emulator?.adapter === "retroarch" && !emulator.core;
                  return (
                    <div key={row.id} className="space-y-2 rounded-lg border p-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <Gamepad2 className="h-4 w-4 shrink-0 text-primary" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">
                            {row.id === "other" && consoleName
                              ? consoleName
                              : platformFor(row.id)?.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {locked(row.id)
                              ? t("retro.quickAdd.locked")
                              : emulator
                                ? emulator.existing
                                  ? t("retro.quickAdd.alreadySetUp", {
                                      emulator: emulatorName(emulator),
                                    })
                                  : emulatorName(emulator)
                                : t("retro.quickAdd.noEmulator")}
                          </p>
                        </div>
                        {locked(row.id) ? (
                          <LockKeyhole className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {needsCore && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => chooseCore(row.id)}
                              >
                                {t("retro.quickAdd.chooseCore")}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => chooseEmulator(row.id)}
                            >
                              {emulator
                                ? t("retro.quickAdd.change")
                                : t("retro.quickAdd.chooseEmulator")}
                            </Button>
                          </div>
                        )}
                      </div>
                      {row.id === "other" && (
                        <Input
                          maxLength={40}
                          value={consoleName}
                          onChange={event => setConsoleName(event.target.value)}
                          placeholder={t("retro.setup.consoleNamePlaceholder")}
                          aria-label={t("retro.setup.consoleName")}
                        />
                      )}
                    </div>
                  );
                })}
              </section>
            )}
          </>
        )}

        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            className="text-secondary"
            disabled={busy || detecting || !ready.length}
            onClick={save}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("retro.quickAdd.addAndScan", { count: ready.length })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
