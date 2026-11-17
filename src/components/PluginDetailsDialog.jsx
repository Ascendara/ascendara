import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  AppWindow,
  Check,
  ChevronDown,
  ExternalLink,
  FileCode,
  Globe,
  Info,
  Puzzle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
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
import { cn } from "@/lib/utils";

const formatSize = bytes => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
};

function Section({ title, children }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-muted/30">
        {children}
      </div>
    </section>
  );
}

function Row({ icon: Icon, iconClassName = "text-muted-foreground", children }) {
  return (
    <div className="flex items-start gap-3 px-3 py-2.5 text-sm text-foreground">
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", iconClassName)} />
      <div className="min-w-0 flex-1 leading-relaxed">{children}</div>
    </div>
  );
}

function Chip({ children, className }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground",
        className
      )}
    >
      {children}
    </span>
  );
}

// Everything known about a plugin, shown before it's installed, updated or
// turned on. `kind` is "install", "update" or "enable".
export default function PluginDetailsDialog({ request, onCancel, onConfirm }) {
  const { t } = useTranslation();
  const plugin = request?.plugin;
  const kind = request?.kind;
  const official = plugin?.source === "registry";
  const files = plugin?.files || [];
  const totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0);
  // Permissions an update adds on top of what the installed version had
  const previous = kind === "update" ? plugin?.installedPermissions || [] : null;
  const isNew = permission => previous && !previous.includes(permission);

  return (
    <AlertDialog open={!!request} onOpenChange={open => !open && onCancel()}>
      <AlertDialogContent className="max-w-xl gap-0 p-0">
        {plugin && (
          <>
            <AlertDialogHeader className="flex-row items-start gap-4 space-y-0 border-b border-border p-6 text-left">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Puzzle className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <AlertDialogTitle className="text-xl leading-tight">
                  {t(`settings.plugins.${kind}Title`, {
                    name: plugin.name,
                    version: plugin.version,
                  })}
                </AlertDialogTitle>
                <AlertDialogDescription
                  asChild
                  className="flex flex-wrap items-center gap-1.5 space-y-0"
                >
                  <div>
                    {official ? (
                      <Chip className="bg-primary/10 text-primary">
                        <ShieldCheck className="h-3 w-3" />
                        {t("settings.plugins.official")}
                      </Chip>
                    ) : (
                      <Chip className="bg-yellow-500/15 text-yellow-700 dark:text-yellow-400">
                        <AlertTriangle className="h-3 w-3" />
                        {t("settings.plugins.sideloaded")}
                      </Chip>
                    )}
                    {plugin.version && <Chip>v{plugin.version}</Chip>}
                    {plugin.author && (
                      <Chip>{t("settings.plugins.by", { author: plugin.author })}</Chip>
                    )}
                    {plugin.license && <Chip>{plugin.license}</Chip>}
                  </div>
                </AlertDialogDescription>
              </div>
            </AlertDialogHeader>

            <div className="min-w-0 space-y-6 p-6">
              {(plugin.description || plugin.details) && (
                <div className="space-y-2 text-sm leading-relaxed">
                  {plugin.description && (
                    <p className="text-foreground">{plugin.description}</p>
                  )}
                  {plugin.details && (
                    <p className="whitespace-pre-line text-muted-foreground">
                      {plugin.details}
                    </p>
                  )}
                </div>
              )}

              {kind === "update" && plugin.changelog && (
                <Section
                  title={t("settings.plugins.details.whatsNew", {
                    version: plugin.version,
                  })}
                >
                  <Row icon={Sparkles} iconClassName="text-primary">
                    <p className="whitespace-pre-line">{plugin.changelog}</p>
                  </Row>
                </Section>
              )}

              <Section title={t("settings.plugins.details.affects")}>
                {plugin.affects?.length ? (
                  plugin.affects.map(line => (
                    <Row key={line} icon={Check} iconClassName="text-primary">
                      {line}
                    </Row>
                  ))
                ) : (
                  <Row icon={Info}>
                    <span className="text-muted-foreground">
                      {t("settings.plugins.details.affectsMissing")}
                    </span>
                  </Row>
                )}
              </Section>

              <Section title={t("settings.plugins.details.access")}>
                <Row icon={AppWindow}>{t("settings.plugins.details.accessAlways")}</Row>
                {plugin.permissions?.map(permission => (
                  <Row
                    key={permission}
                    icon={AlertTriangle}
                    iconClassName="text-yellow-500"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      {t(`settings.plugins.permissions.${permission}`)}
                      {isNew(permission) && (
                        <Chip className="bg-yellow-500/15 text-yellow-700 dark:text-yellow-400">
                          {t("settings.plugins.details.newPermission")}
                        </Chip>
                      )}
                    </span>
                  </Row>
                ))}
              </Section>

              {(files.length > 0 || plugin.minAppVersion || plugin.homepage) && (
                <Section title={t("settings.plugins.details.info")}>
                  {files.length > 0 && (
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
                        <FileCode className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="flex-1">
                          {t("settings.plugins.details.filesSummary", {
                            count: files.length,
                            size: formatSize(totalSize),
                          })}
                        </span>
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                      </summary>
                      <ul className="space-y-1.5 border-t border-border bg-background/50 px-3 py-2.5">
                        {files.map(file => (
                          <li
                            key={file.path}
                            className="flex items-center gap-3 pl-7 text-xs text-muted-foreground"
                          >
                            <span className="min-w-0 flex-1 truncate font-mono">
                              {file.path}
                            </span>
                            <span className="shrink-0 tabular-nums">
                              {formatSize(file.size)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {plugin.minAppVersion && (
                    <Row icon={Info}>
                      {t("settings.plugins.details.requiresVersion", {
                        version: plugin.minAppVersion,
                      })}
                    </Row>
                  )}
                  {plugin.homepage && (
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-primary transition-colors hover:bg-muted/50"
                      onClick={() => window.electron.openURL(plugin.homepage)}
                    >
                      <Globe className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{plugin.homepage}</span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    </button>
                  )}
                </Section>
              )}

              {plugin.incompatible && (
                <p className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-3 rounded-lg border p-3 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {plugin.incompatible}
                </p>
              )}

              <p
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3 text-xs leading-relaxed text-muted-foreground",
                  official
                    ? "border-primary/20 bg-primary/5"
                    : "border-yellow-500/30 bg-yellow-500/10"
                )}
              >
                {official ? (
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
                )}
                {t(
                  official
                    ? "settings.plugins.trustOfficial"
                    : "settings.plugins.trustSideloaded"
                )}
              </p>
            </div>

            <AlertDialogFooter className="border-t border-border bg-muted/20 px-6 py-4">
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                className="text-secondary"
                disabled={!!plugin.incompatible}
                onClick={onConfirm}
              >
                {t(`settings.plugins.${kind}Confirm`)}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
