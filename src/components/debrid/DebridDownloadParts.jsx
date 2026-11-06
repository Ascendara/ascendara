import { forwardRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  CloudDownload,
  Coffee,
  HardDriveDownload,
  Loader2,
  MoreHorizontal,
  RefreshCw,
} from "lucide-react";
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
    tile: "bg-primary/10 text-primary",
    icon: CheckCircle2,
  },
  active: {
    pill: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    dot: "bg-blue-500",
    bar: "bg-blue-500",
    tile: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    icon: CloudDownload,
  },
  waiting: {
    pill: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/50",
    bar: "bg-muted-foreground/40",
    tile: "bg-muted text-muted-foreground",
    icon: Clock,
  },
  done: {
    pill: "bg-green-500/10 text-green-600 dark:text-green-400",
    dot: "bg-green-500",
    bar: "bg-green-500",
    tile: "bg-green-500/10 text-green-600 dark:text-green-400",
    icon: HardDriveDownload,
  },
  error: {
    pill: "bg-destructive/10 text-destructive",
    dot: "bg-destructive",
    bar: "bg-destructive",
    tile: "bg-destructive/10 text-destructive",
    icon: AlertCircle,
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
    <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-primary/10 via-card/60 to-card/30 p-5 shadow-sm">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex flex-wrap items-center gap-x-6 gap-y-4">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-background/80 shadow-sm">
            <DebridIcon provider={provider} className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0">
            {loading ? (
              <div className="space-y-1.5">
                <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                <div className="h-3 w-48 animate-pulse rounded bg-muted/70" />
              </div>
            ) : error ? (
              <>
                <p className="text-base font-semibold text-foreground">{provider.name}</p>
                <p className="text-destructive truncate text-xs">{error}</p>
              </>
            ) : (
              <>
                <p className="flex items-center gap-2 text-base font-semibold text-foreground">
                  <span className="truncate">{account || provider.name}</span>
                  {badge && (
                    <span className="shrink-0 rounded-full bg-primary px-2 py-px text-[10px] font-semibold uppercase tracking-wide text-secondary">
                      {badge}
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {detail || provider.name}
                </p>
              </>
            )}
          </div>
        </div>
        {stats.length > 0 && (
          <dl className="flex items-stretch gap-2">
            {stats.map(([label, value]) => (
              <div
                key={label}
                className="min-w-[5.5rem] rounded-xl border border-border/50 bg-background/60 px-3 py-2"
              >
                <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
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
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0 bg-background/60"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label={t("common.refresh")}
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
        </Button>
      </div>
    </div>
  );
}

export function DebridTabs({ value, onChange, tabs }) {
  return (
    <div
      role="tablist"
      className="inline-flex items-center gap-1 rounded-xl border border-border/60 bg-muted/40 p-1"
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
              "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-primary text-secondary shadow-sm"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
          >
            {tab.label}
            <span
              className={cn(
                "min-w-[1.25rem] rounded-full px-1.5 text-center text-[11px] tabular-nums",
                active
                  ? "bg-secondary/20 text-secondary"
                  : "bg-muted text-muted-foreground"
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

const EASE = [0.22, 1, 0.36, 1];

export function DebridList({ children }) {
  return (
    <motion.ul
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: EASE }}
      className="flex flex-col gap-2"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {children}
      </AnimatePresence>
    </motion.ul>
  );
}

// The main action on an item: shows a spinner while working and a check once done
export function DebridAction({
  state = "idle",
  icon: Icon,
  label,
  workingLabel,
  doneLabel,
  variant = "default",
  disabled,
  onClick,
  className,
}) {
  const view = {
    idle: { key: "idle", icon: Icon, text: label },
    working: { key: "working", icon: Loader2, text: workingLabel || label, spin: true },
    done: { key: "done", icon: Check, text: doneLabel || label },
  }[state];
  const ViewIcon = view.icon;
  return (
    <Button
      size="sm"
      variant={variant}
      disabled={disabled || state !== "idle"}
      onClick={onClick}
      className={cn(
        "relative min-w-[8.5rem] overflow-hidden transition-[background-color,color,opacity] duration-300 disabled:opacity-100",
        variant === "default" && "text-secondary",
        state === "working" && "bg-primary/80",
        state === "done" && "bg-green-600 text-white hover:bg-green-600",
        className
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={view.key}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: EASE }}
          className="flex items-center"
        >
          {ViewIcon && (
            <ViewIcon className={cn("mr-2 h-4 w-4", view.spin && "animate-spin")} />
          )}
          {view.text}
        </motion.span>
      </AnimatePresence>
    </Button>
  );
}

// One cloud item: status icon, name, kind, status, progress, then a primary action and a menu
export const DebridItem = forwardRef(function DebridItem(
  { name, kind, status, tone = "waiting", progress, meta, action, menu = [], children },
  ref
) {
  const colors = TONES[tone] || TONES.waiting;
  const StatusIcon = colors.icon;
  const showProgress = typeof progress === "number" && tone !== "done";
  return (
    <motion.li
      ref={ref}
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 32, scale: 0.98 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="group rounded-xl border border-border/60 bg-card/40 p-4 transition-colors hover:border-primary/30 hover:bg-card/70"
    >
      <div className="flex items-center gap-4">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            colors.tile
          )}
        >
          <StatusIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="truncate text-sm font-semibold text-foreground" title={name}>
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
        <div className="mt-3 flex items-center gap-3 pl-14">
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
    </motion.li>
  );
});

export function DebridEmpty({ title, description }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card/20 px-6 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
        <Coffee className="h-7 w-7 text-primary" />
      </div>
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
