import { forwardRef } from "react";
import { PageNavigation, PageFooter } from "./PageHeader";

// One safe-area and content layout for every collection/settings surface.
export const BigPictureShell = forwardRef(function BigPictureShell(
  {
    title,
    description,
    focus,
    className = "",
    cinematic = false,
    navigation,
    children,
  },
  ref,
) {
  return (
    <main
      ref={ref}
      className={`bp-surface ${cinematic ? "bp-home" : "bp-page"} ${className}`}
      aria-label={title}
    >
      <PageNavigation focus={focus} fallback={navigation} />
      {children}
      <PageFooter fallback={navigation} />
    </main>
  );
});

export function BigPictureToolbar({ children, label = "Page controls" }) {
  return (
    <div className="bp-toolbar" role="group" aria-label={label}>
      {children}
    </div>
  );
}

export function BigPictureEmptyState({ title, children }) {
  return (
    <section className="bp-empty" role="status">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function BigPicturePanel({ children, className = "" }) {
  return <div className={`bp-panel ${className}`}>{children}</div>;
}
