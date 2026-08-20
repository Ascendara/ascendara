import React from "react";
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
  icon: Icon,
  children,
  maxWidth = "max-w-5xl",
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex h-[calc(100vh-1rem)] w-[calc(100vw-1rem)] flex-col gap-0 overflow-hidden p-0 sm:h-[88vh] sm:max-h-[780px]",
          maxWidth
        )}
      >
        <DialogHeader className="shrink-0 border-b border-border px-4 py-4 pr-12 sm:px-6 sm:py-5">
          <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
            {Icon && <Icon className="h-5 w-5 shrink-0 text-primary sm:h-6 sm:w-6" />}
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

export function FeatureTabs({ items, activeId, onChange, children }) {
  return (
    <div className="flex h-full min-h-0 flex-col md:grid md:grid-cols-[190px_minmax(0,1fr)]">
      <nav
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-muted/20 p-2 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r md:p-3"
        aria-label="Feature center sections"
      >
        {items.map(item => {
          const Icon = item.icon;
          const active = activeId === item.id;
          return (
            <Button
              key={item.id}
              type="button"
              variant={active ? "secondary" : "ghost"}
              className="shrink-0 justify-start gap-2 md:w-full"
              aria-pressed={active}
              onClick={() => onChange(item.id)}
            >
              {Icon && <Icon className="h-4 w-4" />}
              {item.label}
            </Button>
          );
        })}
      </nav>
      <section className="min-h-0 overflow-y-auto p-4 sm:p-6">{children}</section>
    </div>
  );
}

export function FeatureState({ icon: Icon, title, description, action, compact = false }) {
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
    <section className={cn("rounded-xl border border-border bg-card/70 p-4 sm:p-5", className)}>
      {(title || description || actions) && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {title && <h3 className="font-medium text-foreground">{title}</h3>}
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
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
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 break-words text-xl font-semibold text-foreground sm:text-2xl">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
