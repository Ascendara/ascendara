import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  BookOpen,
  Download,
  FolderOpen,
  FolderPlus,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import PluginDetailsDialog from "@/components/PluginDetailsDialog";
import { pluginFailure, reloadPlugins } from "@/lib/plugins";

const DOCS_URL = "https://ascendara.app/docs/plugins/overview";

const cleanError = error =>
  String(error?.message || error).replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    ""
  );

function PluginCard({ plugin, children, footer }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
      <div className="min-w-0 space-y-1">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {plugin.name}
          {plugin.version && (
            <span className="text-xs font-normal text-muted-foreground">
              v{plugin.version}
            </span>
          )}
          {plugin.source === "registry" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-normal text-primary">
              <ShieldCheck className="h-3 w-3" />
              {t("settings.plugins.official")}
            </span>
          )}
          {plugin.source === "local" && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
              {t("settings.plugins.sideloaded")}
            </span>
          )}
        </p>
        {plugin.author && (
          <p className="text-xs text-muted-foreground">
            {t("settings.plugins.by", { author: plugin.author })}
          </p>
        )}
        {plugin.description && (
          <p className="text-sm text-muted-foreground">{plugin.description}</p>
        )}
        {plugin.permissions?.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {t("settings.plugins.permissionsLabel")}{" "}
            {plugin.permissions
              .map(permission => t(`settings.plugins.permissions.${permission}`))
              .join(", ")}
          </p>
        )}
        {footer}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

export default function PluginSettings() {
  const { t } = useTranslation();
  const [state, setState] = useState({ safeMode: false, plugins: [] });
  const [registry, setRegistry] = useState({
    loading: false,
    error: null,
    plugins: null,
  });
  const [busy, setBusy] = useState(null);
  // { kind: "install" | "update" | "enable" | "uninstall", plugin }
  const [confirming, setConfirming] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setState(await window.electron.plugins.list());
    } catch (error) {
      toast.error(cleanError(error));
    }
  }, []);

  const loadRegistry = useCallback(async force => {
    setRegistry(previous => ({ ...previous, loading: true, error: null }));
    try {
      const plugins = await window.electron.plugins.registry(force);
      setRegistry({ loading: false, error: null, plugins });
    } catch (error) {
      setRegistry({ loading: false, error: cleanError(error), plugins: null });
    }
  }, []);

  useEffect(() => {
    refresh();
    loadRegistry(false);
  }, [refresh, loadRegistry]);

  const updates = new Map(
    (registry.plugins || [])
      .filter(plugin => plugin.update)
      .map(plugin => [plugin.id, plugin])
  );

  const perform = async (id, action, success) => {
    setBusy(id);
    try {
      await action();
      await reloadPlugins();
      await refresh();
      if (registry.plugins) await loadRegistry(false);
      if (success) toast.success(success);
    } catch (error) {
      toast.error(cleanError(error));
    } finally {
      setBusy(null);
    }
  };

  const install = plugin =>
    perform(
      plugin.id,
      () => window.electron.plugins.install(plugin.id),
      t(
        plugin.installedVersion
          ? "settings.plugins.updated"
          : "settings.plugins.installed",
        {
          name: plugin.name,
          version: plugin.version,
        }
      )
    );

  const confirm = () => {
    const { kind, plugin } = confirming;
    setConfirming(null);
    if (kind === "install" && plugin.token)
      perform(
        plugin.id,
        () => window.electron.plugins.installFolder(plugin.token),
        t("settings.plugins.installed", { name: plugin.name })
      );
    else if (kind === "install" || kind === "update") install(plugin);
    if (kind === "enable")
      perform(plugin.id, () => window.electron.plugins.setEnabled(plugin.id, true));
    if (kind === "uninstall")
      perform(
        plugin.id,
        () => window.electron.plugins.uninstall(plugin.id),
        t("settings.plugins.uninstalled", { name: plugin.name })
      );
  };

  // Only offered when running from source
  const setRegistrySource = async source => {
    try {
      await window.electron.plugins.setRegistrySource(source);
      setState(previous => ({ ...previous, registrySource: source }));
      await loadRegistry(true);
    } catch (error) {
      toast.error(cleanError(error));
    }
  };

  const installFolder = async () => {
    try {
      // Nothing is copied until the user confirms in the details dialog.
      const plugin = await window.electron.plugins.pickFolder();
      if (plugin)
        setConfirming({ kind: "install", plugin: { ...plugin, source: "local" } });
    } catch (error) {
      toast.error(cleanError(error));
    }
  };

  return (
    <div className="space-y-4">
      {state.safeMode && (
        <p className="flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
          {t("settings.plugins.safeMode")}
        </p>
      )}
      <Tabs defaultValue="installed">
        <TabsList>
          <TabsTrigger value="installed">
            {t("settings.plugins.installedTab")}
            {updates.size > 0 && (
              <span className="ml-2 rounded-full bg-primary px-1.5 text-xs text-secondary">
                {updates.size}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="browse">{t("settings.plugins.browseTab")}</TabsTrigger>
        </TabsList>

        <TabsContent value="installed" className="space-y-4 pt-2">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={installFolder}>
              <FolderPlus className="mr-2 h-4 w-4" />
              {t("settings.plugins.installFolder")}
            </Button>
            <Button
              variant="outline"
              onClick={() => window.electron.plugins.openFolder()}
            >
              <FolderOpen className="mr-2 h-4 w-4" />
              {t("settings.plugins.openFolder")}
            </Button>
            <Button variant="outline" onClick={refresh}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {t("settings.plugins.refresh")}
            </Button>
          </div>
          {registry.error &&
            state.plugins.some(plugin => plugin.source === "registry") && (
              <p className="text-sm text-muted-foreground">
                {t("settings.plugins.updateCheckFailed", { error: registry.error })}
              </p>
            )}
          {!state.plugins.length && (
            <p className="text-sm text-muted-foreground">{t("settings.plugins.empty")}</p>
          )}
          {state.plugins.map(plugin => {
            const error =
              plugin.error ||
              plugin.incompatible ||
              (plugin.enabled && pluginFailure(plugin.id));
            const update = updates.get(plugin.id);
            return (
              <PluginCard
                key={plugin.id}
                plugin={plugin}
                footer={
                  error && (
                    <p className="text-destructive text-sm">
                      {t("settings.plugins.failed", { error })}
                    </p>
                  )
                }
              >
                {update && !update.incompatible && (
                  <Button
                    size="sm"
                    className="text-secondary"
                    disabled={busy === plugin.id}
                    onClick={() =>
                      setConfirming({
                        kind: "update",
                        plugin: { ...update, source: "registry" },
                      })
                    }
                  >
                    {busy === plugin.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-4 w-4" />
                    )}
                    {t("settings.plugins.update", { version: update.version })}
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={busy === plugin.id}
                  aria-label={t("settings.plugins.uninstall", { name: plugin.name })}
                  title={t("settings.plugins.uninstall", { name: plugin.name })}
                  onClick={() => setConfirming({ kind: "uninstall", plugin })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Switch
                  checked={plugin.enabled}
                  disabled={!!plugin.error || !!plugin.incompatible || busy === plugin.id}
                  aria-label={t("settings.plugins.toggle", { name: plugin.name })}
                  onCheckedChange={checked =>
                    checked
                      ? setConfirming({ kind: "enable", plugin })
                      : perform(plugin.id, () =>
                          window.electron.plugins.setEnabled(plugin.id, false)
                        )
                  }
                />
              </PluginCard>
            );
          })}
        </TabsContent>

        <TabsContent value="browse" className="space-y-4 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              disabled={registry.loading}
              onClick={() => loadRegistry(true)}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${registry.loading ? "animate-spin" : ""}`}
              />
              {t("settings.plugins.refresh")}
            </Button>
            <Button variant="ghost" onClick={() => window.electron.openURL(DOCS_URL)}>
              <BookOpen className="mr-2 h-4 w-4" />
              {t("settings.plugins.learn")}
            </Button>
            {state.registrySource && (
              <Tabs value={state.registrySource} onValueChange={setRegistrySource}>
                <TabsList>
                  <TabsTrigger value="local">
                    {t("settings.plugins.sourceLocal")}
                  </TabsTrigger>
                  <TabsTrigger value="github">
                    {t("settings.plugins.sourceGithub")}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {t("settings.plugins.browseDescription")}
          </p>
          {registry.error && (
            <p className="text-destructive text-sm">
              {t("settings.plugins.registryFailed", { error: registry.error })}
            </p>
          )}
          {registry.plugins && !registry.plugins.length && (
            <p className="text-sm text-muted-foreground">
              {t("settings.plugins.registryEmpty")}
            </p>
          )}
          {registry.plugins?.map(plugin => (
            <PluginCard
              key={plugin.id}
              plugin={{ ...plugin, source: "registry" }}
              footer={
                plugin.incompatible && (
                  <p className="text-destructive text-sm">{plugin.incompatible}</p>
                )
              }
            >
              {plugin.installedVersion && !plugin.update ? (
                <span className="text-sm text-muted-foreground">
                  {t("settings.plugins.installedLabel")}
                </span>
              ) : (
                <Button
                  size="sm"
                  className="text-secondary"
                  disabled={!!plugin.incompatible || busy === plugin.id}
                  onClick={() =>
                    setConfirming({
                      kind: plugin.update ? "update" : "install",
                      plugin: { ...plugin, source: "registry" },
                    })
                  }
                >
                  {busy === plugin.id ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  {plugin.update
                    ? t("settings.plugins.update", { version: plugin.version })
                    : t("settings.plugins.install")}
                </Button>
              )}
            </PluginCard>
          ))}
        </TabsContent>
      </Tabs>

      <PluginDetailsDialog
        request={confirming?.kind === "uninstall" ? null : confirming}
        onCancel={() => setConfirming(null)}
        onConfirm={confirm}
      />

      <AlertDialog
        open={confirming?.kind === "uninstall"}
        onOpenChange={open => !open && setConfirming(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming &&
                t("settings.plugins.uninstallTitle", { name: confirming.plugin.name })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.plugins.uninstallDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirm}
            >
              {t("settings.plugins.uninstallConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
