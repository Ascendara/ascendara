import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Download,
  Loader,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  TRANSFER_CATEGORIES,
  countStorage,
  exportLibrary,
  getExportInfo,
  importBackup,
  inspectBackup,
} from "@/services/library/libraryTransferService";

const formatBytes = bytes => {
  if (!bytes) return "0 MB";
  const mb = bytes / 1024 ** 2;
  return mb >= 1024
    ? `${(mb / 1024).toFixed(1)} GB`
    : `${Math.max(mb, 0.1).toFixed(1)} MB`;
};

const defaults = () =>
  TRANSFER_CATEGORIES.filter(category => category.defaultOn).map(category => category.id);

export default function LibraryTransferSettings() {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState(null);
  const [selected, setSelected] = useState(defaults);
  const [info, setInfo] = useState(null);
  const [backup, setBackup] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const key = id => `settings.libraryTransfer.categories.${id}`;

  useEffect(() => {
    if (mode !== "export") return;
    let active = true;
    setInfo(null);
    getExportInfo()
      .then(response => {
        if (active && response?.success) setInfo(response.info);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [mode]);

  const close = () => {
    if (busy) return;
    setMode(null);
    setBackup(null);
    setResult(null);
  };

  const openExport = () => {
    setSelected(defaults());
    setResult(null);
    setMode("export");
  };

  const openImport = async () => {
    setBusy(true);
    try {
      const response = await inspectBackup();
      if (response?.canceled) return;
      if (!response?.success) throw new Error(response?.error);
      setBackup(response);
      setSelected(response.categories);
      setResult(null);
      setMode("import");
    } catch (error) {
      toast.error(t("settings.libraryTransfer.importFailed"), {
        description: error?.message,
      });
    } finally {
      setBusy(false);
    }
  };

  const toggle = id =>
    setSelected(current =>
      current.includes(id) ? current.filter(item => item !== id) : [...current, id]
    );

  const runExport = async () => {
    setBusy(true);
    try {
      const response = await exportLibrary(selected);
      if (response?.canceled) return;
      if (!response?.success) throw new Error(response?.error);
      toast.success(t("settings.libraryTransfer.exportSuccess"), {
        description: t("settings.libraryTransfer.exportSuccessDescription", {
          size: formatBytes(response.bytes),
        }),
      });
      setMode(null);
    } catch (error) {
      toast.error(t("settings.libraryTransfer.exportFailed"), {
        description: error?.message,
      });
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    setBusy(true);
    try {
      const response = await importBackup(backup.token, selected);
      if (!response?.success) throw new Error(response?.error);
      setResult(response);
    } catch (error) {
      toast.error(t("settings.libraryTransfer.importFailed"), {
        description: error?.message,
      });
    } finally {
      setBusy(false);
    }
  };

  const exportMeta = id => {
    if (!info) return null;
    switch (id) {
      case "library":
        return t("settings.libraryTransfer.meta.games", { count: info.customGames });
      case "stats":
        return t("settings.libraryTransfer.meta.games", { count: info.installedGames });
      case "organization":
      case "appearance":
      case "caches":
        return t("settings.libraryTransfer.meta.items", { count: countStorage(id) });
      case "retro":
        return t("settings.libraryTransfer.meta.games", { count: info.retroGames });
      case "gameIndex":
        return formatBytes(info.indexBytes);
      default:
        return null;
    }
  };

  const importMeta = id => {
    const count = backup?.counts?.[id];
    if (count === undefined) return null;
    if (["library", "stats", "retro"].includes(id)) {
      return t("settings.libraryTransfer.meta.games", { count });
    }
    if (id === "gameIndex") return t("settings.libraryTransfer.meta.files", { count });
    return t("settings.libraryTransfer.meta.items", { count });
  };

  const resultLines = () => {
    const s = result?.summary || {};
    const lines = [];
    if (s.library) {
      lines.push(
        t("settings.libraryTransfer.result.library", { count: s.library.added })
      );
    }
    if (s.stats) {
      lines.push(t("settings.libraryTransfer.result.stats", { count: s.stats.restored }));
      if (s.stats.missing) {
        lines.push(
          t("settings.libraryTransfer.result.statsMissing", { count: s.stats.missing })
        );
      }
    }
    if (s.settings) {
      lines.push(
        t("settings.libraryTransfer.result.settings", { count: s.settings.applied })
      );
    }
    if (s.paths) {
      lines.push(t("settings.libraryTransfer.result.paths", { count: s.paths.applied }));
      if (s.paths.missing) {
        lines.push(
          t("settings.libraryTransfer.result.pathsMissing", { count: s.paths.missing })
        );
      }
    }
    if (s.retro) {
      lines.push(t("settings.libraryTransfer.result.retro", { count: s.retro.added }));
    }
    if (s.gameIndex) {
      lines.push(
        s.gameIndex.restored
          ? t("settings.libraryTransfer.result.gameIndex")
          : t("settings.libraryTransfer.result.gameIndexSkipped")
      );
    }
    for (const id of ["organization", "appearance", "profile", "caches"]) {
      if (result.categories.includes(id)) {
        lines.push(
          t("settings.libraryTransfer.result.restored", { name: t(`${key(id)}.title`) })
        );
      }
    }
    return lines;
  };

  const categories =
    mode === "import"
      ? TRANSFER_CATEGORIES.filter(category => backup?.categories.includes(category.id))
      : TRANSFER_CATEGORIES;
  const exportedAt = backup?.exportedAt ? new Date(backup.exportedAt) : null;

  const explainers = [
    { id: "included", icon: PackageCheck },
    { id: "excluded", icon: ShieldCheck },
    { id: "restore", icon: RefreshCw },
  ];

  return (
    <>
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {explainers.map(({ id, icon: Icon }) => (
          <div key={id} className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="mb-1.5 flex items-center gap-2">
              <Icon className="h-4 w-4 shrink-0 text-primary" />
              <span className="text-sm font-medium">
                {t(`settings.libraryTransfer.explain.${id}Title`)}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t(`settings.libraryTransfer.explain.${id}`)}
            </p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button className="text-secondary" onClick={openExport} disabled={busy}>
          <Upload className="mr-2 h-4 w-4" />
          {t("settings.libraryTransfer.export")}
        </Button>
        <Button variant="outline" onClick={openImport} disabled={busy}>
          {busy && !mode ? (
            <Loader className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          {t("settings.libraryTransfer.import")}
        </Button>
      </div>

      <Dialog open={mode !== null} onOpenChange={open => !open && close()}>
        <DialogContent className="flex max-h-[85vh] w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden border-border bg-background p-0 text-foreground sm:max-w-xl">
          <DialogHeader className="shrink-0 border-b border-border px-6 py-5 text-left">
            <DialogTitle className="pr-6">
              {result
                ? t("settings.libraryTransfer.importSuccess")
                : mode === "import"
                  ? t("settings.libraryTransfer.importTitle")
                  : t("settings.libraryTransfer.exportTitle")}
            </DialogTitle>
            <DialogDescription>
              {result
                ? t("settings.libraryTransfer.restartHint")
                : mode === "import"
                  ? t("settings.libraryTransfer.importDescription", {
                      file: backup?.fileName,
                      date: exportedAt
                        ? exportedAt.toLocaleString(
                            i18n.resolvedLanguage || i18n.language
                          )
                        : "-",
                    })
                  : t("settings.libraryTransfer.exportDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {result ? (
              <ul className="space-y-2 text-sm">
                {resultLines().map(line => (
                  <li key={line} className="text-foreground">
                    {line}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="space-y-1">
                {categories.map(category => {
                  const meta =
                    mode === "import" ? importMeta(category.id) : exportMeta(category.id);
                  const checked = selected.includes(category.id);
                  return (
                    <div
                      key={category.id}
                      role="checkbox"
                      aria-checked={checked}
                      aria-disabled={busy}
                      tabIndex={busy ? -1 : 0}
                      onClick={() => !busy && toggle(category.id)}
                      onKeyDown={event => {
                        if (busy || (event.key !== " " && event.key !== "Enter")) return;
                        event.preventDefault();
                        toggle(category.id);
                      }}
                      className={`flex select-none items-start gap-3 rounded-lg px-3 py-2.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
                        busy
                          ? "cursor-not-allowed opacity-60"
                          : "cursor-pointer hover:bg-muted/50"
                      }`}
                    >
                      {/* The row is the control; the box only shows its state */}
                      <Checkbox
                        className="pointer-events-none mt-0.5"
                        checked={checked}
                        tabIndex={-1}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-sm font-medium">
                            {t(`${key(category.id)}.title`)}
                          </span>
                          {meta && (
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {meta}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t(`${key(category.id)}.description`)}
                        </p>
                        {mode === "import" &&
                          category.policy === "replace" &&
                          checked && (
                            <p className="mt-1 text-xs text-amber-500">
                              {t("settings.libraryTransfer.replaceWarning")}
                            </p>
                          )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0 border-t border-border px-6 py-4">
            {result ? (
              <>
                <Button variant="outline" onClick={close}>
                  {t("settings.libraryTransfer.later")}
                </Button>
                <Button
                  className="text-secondary"
                  onClick={() => window.electron.reload()}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  {t("settings.libraryTransfer.restart")}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={close} disabled={busy}>
                  {t("common.cancel")}
                </Button>
                <Button
                  className="text-secondary"
                  onClick={mode === "import" ? runImport : runExport}
                  disabled={busy || selected.length === 0}
                >
                  {busy && <Loader className="mr-2 h-4 w-4 animate-spin" />}
                  {mode === "import"
                    ? t("settings.libraryTransfer.importSelected")
                    : t("settings.libraryTransfer.exportSelected")}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
