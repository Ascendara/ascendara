// Slim page title row. The Ascend nav bar already says where you are, so pages
// get a plain heading instead of a boxed banner. The icon prop is accepted
// but not drawn: the matching nav tab already shows it.
export default function SectionHeader({
  title,
  description,
  actions,
  children,
}) {
  return (
    <header className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description && (
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}
