import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function FeatureCenterDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  maxWidth = "max-w-5xl",
  headerClassName,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex h-[calc(100vh-1rem)] w-[calc(100vw-1rem)] flex-col gap-0 overflow-hidden p-0 sm:h-[88vh] sm:max-h-[780px]",
          maxWidth
        )}
      >
        <DialogHeader
          className={cn(
            "shrink-0 border-b border-border px-4 py-4 pr-12 sm:px-6 sm:py-5",
            headerClassName
          )}
        >
          <DialogTitle className="flex items-center gap-2">
            <span className="truncate">{title}</span>
          </DialogTitle>
          {description && (
            <DialogDescription className="max-w-3xl">{description}</DialogDescription>
          )}
        </DialogHeader>
        <div className="min-h-0 flex-1">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

// A row of tabs under the dialog header, for a handful of sections
export function FeatureTabs({ items, activeId, onChange, children }) {
  const panelRef = useRef(null);
  const tabRefs = useRef({});

  // Each section starts at its top rather than where the last one was scrolled
  useEffect(() => {
    if (panelRef.current) panelRef.current.scrollTop = 0;
  }, [activeId]);

  const handleKeyDown = event => {
    const index = items.findIndex(item => item.id === activeId);
    let next = null;
    if (event.key === "ArrowRight") next = items[(index + 1) % items.length];
    if (event.key === "ArrowLeft")
      next = items[(index - 1 + items.length) % items.length];
    if (event.key === "Home") next = items[0];
    if (event.key === "End") next = items[items.length - 1];
    if (!next) return;
    event.preventDefault();
    onChange(next.id);
    tabRefs.current[next.id]?.focus();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-4 sm:px-6">
        <div
          role="tablist"
          aria-label="Feature center sections"
          className="-mb-px flex gap-1 overflow-x-auto"
          onKeyDown={handleKeyDown}
        >
          {items.map(item => {
            const Icon = item.icon;
            const active = activeId === item.id;
            return (
              <button
                key={item.id}
                ref={node => {
                  tabRefs.current[item.id] = node;
                }}
                type="button"
                role="tab"
                id={`feature-tab-${item.id}`}
                aria-selected={active}
                aria-controls="feature-tab-panel"
                tabIndex={active ? 0 : -1}
                onClick={() => onChange(item.id)}
                className={cn(
                  "relative flex shrink-0 items-center gap-2 rounded-t-md px-3 pb-3 pt-2 text-sm font-medium outline-none transition-colors focus-visible:bg-muted/60",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {Icon && (
                  <Icon
                    className={cn(
                      "h-4 w-4 transition-colors",
                      active ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                )}
                {item.label}
                {active && (
                  <motion.span
                    layoutId="feature-tab-indicator"
                    className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
      <section
        ref={panelRef}
        id="feature-tab-panel"
        role="tabpanel"
        aria-labelledby={`feature-tab-${activeId}`}
        className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"
      >
        {children}
      </section>
    </div>
  );
}

export function FeatureState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border text-center",
        compact ? "p-6" : "min-h-48 p-10"
      )}
      role="status"
    >
      {Icon && <Icon className="mb-3 h-8 w-8 text-muted-foreground/60" />}
      {title && <p className="font-medium text-foreground">{title}</p>}
      {description && (
        <p className="mt-1 max-w-lg text-sm text-muted-foreground">{description}</p>
      )}
      {action && (
        <Button className="mt-4" variant="outline" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

export function FeatureSection({ title, description, actions, children, className }) {
  return (
    <section className={cn("rounded-xl bg-card/70 p-4 shadow sm:p-5", className)}>
      {(title || description || actions) && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {title && <h3 className="font-medium text-foreground">{title}</h3>}
            {description && (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function FeatureStat({ label, value, hint }) {
  return (
    <div className="rounded-xl bg-card p-4 shadow">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 break-words text-xl font-semibold text-foreground sm:text-2xl">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
