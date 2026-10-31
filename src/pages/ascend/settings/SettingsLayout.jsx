// Shared pieces for the Ascend settings pages. Most pages hold one setting, so
// each one leads with that setting: a big icon that reflects its state, what
// it is, and the control right there. Supporting detail sits underneath.

const TONES = {
  muted: {
    tile: "bg-muted text-muted-foreground",
    glow: "bg-muted-foreground/10",
  },
  primary: {
    tile: "bg-primary/15 text-primary",
    glow: "bg-primary/20",
  },
  success: {
    tile: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    glow: "bg-emerald-500/20",
  },
  danger: {
    tile: "bg-destructive/15 text-destructive",
    glow: "bg-destructive/20",
  },
};

export function FocusHero({
  icon: Icon,
  media,
  tone = "primary",
  eyebrow,
  title,
  status,
  description,
  children,
}) {
  const colors = TONES[tone] || TONES.primary;
  return (
    <section className="relative">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="relative shrink-0">
          <div
            className={`absolute -inset-4 rounded-full opacity-70 blur-2xl transition-colors duration-500 ${colors.glow}`}
          />
          {media || (
            <div
              className={`relative flex h-16 w-16 items-center justify-center rounded-2xl transition-colors duration-300 ${colors.tile}`}
            >
              <Icon className="h-8 w-8" />
            </div>
          )}
        </div>
        <div className="relative min-w-0 flex-1">
          {eyebrow && (
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
              {eyebrow}
            </p>
          )}
          {/* app.css gives every h2 a bottom margin, which knocks the pill off center */}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h2 className="!mb-0 text-2xl font-semibold leading-tight tracking-tight">
              {title}
            </h2>
            {status}
          </div>
          {description && (
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
          {children && <div className="mt-5">{children}</div>}
        </div>
      </div>
    </section>
  );
}

// The details under a hero: a few short points side by side
export function FocusPoints({ title, items }) {
  return (
    <section className="border-t border-border/50 pt-6">
      {title && (
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
          {title}
        </h3>
      )}
      <div className="grid gap-6 sm:grid-cols-3">
        {items.map((item, i) => (
          <div key={i} className="min-w-0">
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60 text-sm font-semibold text-muted-foreground">
              {item.icon ? <item.icon className="h-4 w-4" /> : i + 1}
            </div>
            <p className="text-sm font-medium">{item.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {item.text}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

// A secondary setting under the main one: one line with its control
export function FocusLine({ icon: Icon, label, description, htmlFor, danger, children }) {
  const Label = htmlFor ? "label" : "div";
  return (
    <section className="flex flex-col gap-4 border-t border-border/50 pt-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 gap-3">
        {Icon && (
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
              danger ? "bg-destructive/10 text-destructive" : "bg-muted/60 text-muted-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
          </div>
        )}
        <div className="min-w-0">
          <Label
            htmlFor={htmlFor}
            className={`block text-sm font-medium ${danger ? "text-destructive" : ""}`}
          >
            {label}
          </Label>
          {description && (
            <p className="mt-0.5 max-w-lg text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </section>
  );
}

export function StatusPill({ tone = "muted", icon: Icon, children }) {
  const tones = {
    muted: "bg-muted text-muted-foreground",
    primary: "bg-primary/15 text-primary",
    success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    warning: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-500",
    info: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </span>
  );
}
