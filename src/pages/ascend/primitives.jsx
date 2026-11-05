import { Skeleton } from "@/components/ui/skeleton";

// Shared building blocks for Ascend pages. They use the same surface as the
// Ascend nav bar so every page reads as one system.

export function Panel({ as: Component = "div", className = "", children, ...props }) {
  return (
    <Component className={`rounded-2xl bg-card/60 shadow ${className}`} {...props}>
      {children}
    </Component>
  );
}

// stats: [{ icon, label, value, suffix?, footer?, loading? }]
export function StatStrip({ stats, className = "" }) {
  return (
    <dl
      className={`grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-border/50 shadow sm:grid-cols-4 ${className}`}
    >
      {stats.map(stat => (
        <div key={stat.label} className="flex min-w-0 flex-col bg-card/80 px-5 py-4">
          {/* Icon tile beside the label and figure; a footer spans the cell below */}
          <div className="flex min-w-0 items-center gap-3">
            {stat.icon && (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <stat.icon className="h-5 w-5" />
              </span>
            )}
            <div className="min-w-0">
              <dt className="truncate text-xs font-medium text-muted-foreground">
                {stat.label}
              </dt>
              <dd className="mt-0.5 flex items-baseline gap-1 text-2xl font-bold tabular-nums leading-tight">
                {stat.loading ? (
                  <Skeleton className="my-1 h-6 w-16" />
                ) : (
                  <span className="truncate">{stat.value}</span>
                )}
                {!stat.loading && stat.suffix && (
                  <span className="text-sm font-normal text-muted-foreground">
                    {stat.suffix}
                  </span>
                )}
              </dd>
            </div>
          </div>
          {stat.footer}
        </div>
      ))}
    </dl>
  );
}

export function EmptyState({ icon: Icon, title, description, action, className = "" }) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-2xl bg-card/30 px-6 py-16 text-center ${className}`}
    >
      {Icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground">
          <Icon className="h-6 w-6" />
        </div>
      )}
      {title && <h3 className="mt-4 font-semibold">{title}</h3>}
      {description && (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
