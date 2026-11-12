import { forwardRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageNavigation, PageFooter } from "./PageHeader";
import { CrossfadeImage } from "./CrossfadeImage";
import { SurfaceButton } from "./Surface";

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

// Console-style page header: accent eyebrow, large title, a short meta line and
// an optional spotlight on the right. Pass `backdrop` (an image URL or null) to
// show that artwork faded behind the top of the page.
export function BigPictureHero({ eyebrow, title, meta, aside, backdrop }) {
  return (
    <>
      {backdrop !== undefined && (
        <div className="bp-page-backdrop" aria-hidden="true">
          <CrossfadeImage src={backdrop} />
        </div>
      )}
      <header className="bp-page-hero">
        <div className="bp-page-hero-title">
          {eyebrow && <span>{eyebrow}</span>}
          <h1>{title}</h1>
          {meta && <p>{meta}</p>}
        </div>
        {aside && <div className="bp-spotlight">{aside}</div>}
      </header>
    </>
  );
}

// Title plus icon chips, shown on the right of BigPictureHero.
export function BigPictureSpotlight({ title, chips = [] }) {
  const visible = chips.filter(chip => chip && chip.label);
  return (
    <>
      {title && <strong key={title}>{title}</strong>}
      {visible.length > 0 && (
        <div className="bp-spotlight-chips">
          {visible.map(({ icon: Icon, label }) => (
            <span key={label}>
              {Icon && <Icon aria-hidden="true" />}
              {label}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

// Previous / next pager with page dots. `focus` comes from useSurface.
export function BigPicturePager({ page, count, setPage, focus, label = "Pages" }) {
  if (count <= 1) return null;
  return (
    <nav className="bp-pager" aria-label={label}>
      <SurfaceButton
        {...focus("previous")}
        aria-disabled={page === 0}
        onClick={() => setPage(Math.max(0, page - 1))}
      >
        <ChevronLeft />
        Previous
      </SurfaceButton>
      {count <= 12 ? (
        <span className="bp-pager-dots" aria-label={`Page ${page + 1} of ${count}`}>
          {Array.from({ length: count }, (_, index) => (
            <i key={index} data-active={index === page} />
          ))}
        </span>
      ) : (
        <span className="bp-pager-count">
          Page {page + 1} of {count}
        </span>
      )}
      <SurfaceButton
        {...focus("next")}
        aria-disabled={page === count - 1}
        onClick={() => setPage(Math.min(count - 1, page + 1))}
      >
        Next
        <ChevronRight />
      </SurfaceButton>
    </nav>
  );
}

