import { Coffee, Loader2, MoreHorizontal, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import DebridIcon from "@/components/DebridIcon";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";

// Shared pieces so every debrid service renders the same page layout.

export const formatBytes = bytes => {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${parseFloat((bytes / 1024 ** i).toFixed(i >= 3 ? 2 : 1))} ${units[i]}`;
};

const TONES = {
  ready: {
    pill: "bg-primary/10 text-primary",
    dot: "bg-primary",
    bar: "bg-primary",
  },
  active: {
    pill: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    dot: "bg-blue-500",
    bar: "bg-blue-500",
  },
  waiting: {
    pill: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/50",
    bar: "bg-muted-foreground/40",
  },
  done: {
    pill: "bg-green-500/10 text-green-600 dark:text-green-400",
    dot: "bg-green-500",
    bar: "bg-green-500",
  },
  error: {
    pill: "bg-destructive/10 text-destructive",
    dot: "bg-destructive",
    bar: "bg-destructive",
  },
};

export function DebridAccountBar({
  provider,
  account,
  detail,
  badge,
  stats = [],
  loading,
  error,
  onRefresh,
  refreshing,
}) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-4 border-y border-border/60 py-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <DebridIcon provider={provider} className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          {loading ? (
            <div className="space-y-1.5">
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              <div className="h-3 w-48 animate-pulse rounded bg-muted/70" />
            </div>
          ) : error ? (
            <>
              <p className="text-sm font-medium text-foreground">{provider.name}</p>
              <p className="text-destructive truncate text-xs">{error}</p>
            </>
          ) : (
            <>
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <span className="truncate">{account || provider.name}</span>
                {badge && (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-px text-[10px] font-semibold uppercase tracking-wide text-primary">
                    {badge}
                  </span>
                )}
              </p>
              {detail && (
                <p className="truncate text-xs text-muted-foreground">{detail}</p>
              )}
            </>
          )}
        </div>
      </div>
      {stats.length > 0 && (
        <dl className="flex items-center gap-6">
          {stats.map(([label, value]) => (
            <div key={label} className="text-right">
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {label}
              </dt>
              <dd className="text-sm font-semibold tabular-nums text-foreground">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={onRefresh}
        disabled={refreshing}
        aria-label={t("common.refresh")}
      >
        <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
      </Button>
    </div>
  );
}

export function DebridTabs({ value, onChange, tabs }) {
  return (
    <div
      role="tablist"
      className="inline-flex items-center gap-1 rounded-lg bg-muted/50 p-1"
    >
      {tabs.map(tab => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            <span
              className={cn(
                "min-w-[1.25rem] rounded-full px-1.5 text-center text-[11px] tabular-nums",
                active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              )}
            >
              {tab.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function DebridList({ children }) {
  return <ul className="divide-y divide-border/60">{children}</ul>;
}

// One cloud item: name, kind, status, progress, then a primary action and a menu
export function DebridItem({
  name,
  kind,
  status,
  tone = "waiting",
  progress,
  meta,
  note,
  action,
  menu = [],
  children,
}) {
  const colors = TONES[tone] || TONES.waiting;
  const showProgress = typeof progress === "number" && tone !== "done";
  return (
    <li className="group py-4">
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="truncate text-sm font-medium text-foreground" title={name}>
            {name}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium",
                colors.pill
              )}
            >
              {tone === "active" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <span className={cn("h-1.5 w-1.5 rounded-full", colors.dot)} />
              )}
              {status}
            </span>
            {kind && <span>{kind}</span>}
            {meta && <span className="tabular-nums">{meta}</span>}
          </div>
          {note}
        </div>
        {action}
        {menu.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground opacity-60 transition-opacity hover:text-foreground group-hover:opacity-100"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {menu.map(({ label, icon: Icon, onClick, destructive, disabled }) => (
                <DropdownMenuItem
                  key={label}
                  onClick={onClick}
                  disabled={disabled}
                  className={
                    destructive
                      ? "text-destructive focus:bg-destructive/10 focus:text-destructive"
                      : undefined
                  }
                >
                  {Icon && <Icon className="mr-2 h-4 w-4" />}
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {showProgress && (
        <div className="mt-3 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-all", colors.bar)}
              style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
            />
          </div>
          <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
            {Math.round(progress)}%
          </span>
        </div>
      )}
      {children}
    </li>
  );
}

export function DebridEmpty({ title, description }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Coffee className="h-10 w-10 text-primary/70" />
      <h3 className="mt-4 text-lg font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

export function DebridLoading({ label }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin text-primary" />
      {label}
    </div>
  );
}
