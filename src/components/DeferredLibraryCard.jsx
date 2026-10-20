import { useEffect, useRef, useState } from "react";

const waiting = new Map();
let observer;

// Share one observer across the library; offscreen cards must not mount their
// artwork, IPC, drag/drop and event subscriptions until they are needed.
export default function DeferredLibraryCard({ children, viewMode, name }) {
  const element = useRef(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (ready) return;
    if (typeof IntersectionObserver === "undefined") {
      setReady(true);
      return;
    }
    observer ||= new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        waiting.get(entry.target)?.();
        waiting.delete(entry.target);
        observer.unobserve(entry.target);
      }
    }, { rootMargin: "400px" });
    const node = element.current;
    waiting.set(node, () => setReady(true));
    observer.observe(node);
    return () => {
      waiting.delete(node);
      observer.unobserve(node);
    };
  }, [ready]);

  return (
    <div ref={element} className="min-w-0">
      {ready ? children : (
        <div
          tabIndex={0}
          aria-label={name}
          onFocus={() => setReady(true)}
          className="overflow-hidden rounded-xl border border-border bg-card"
        >
          {viewMode === "list" ? <div className="h-[88px]" /> : (
            <><div className="aspect-[2/3] bg-muted" /><div className="h-16" /></>
          )}
        </div>
      )}
    </div>
  );
}
