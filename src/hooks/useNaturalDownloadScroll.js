import { useEffect } from "react";

const PROGRAMMATIC_SCROLL_BLOCK_MS = 650;

function readScrollTop(args) {
  if (args.length === 1 && typeof args[0] === "object" && args[0] !== null) {
    return Number(args[0].top);
  }
  return Number(args[1]);
}

/**
 * Keep the legacy Download page scroll snap from taking over immediately after
 * a real user gesture. Scripted scrolling is intentionally not treated as user
 * input, otherwise the first scrollTo call can block the animation that follows it.
 */
export function useNaturalDownloadScroll(enabled) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return undefined;

    const originalScrollTo = window.scrollTo;
    let blockProgrammaticScrollUntil = 0;

    const markUserScroll = () => {
      blockProgrammaticScrollUntil = performance.now() + PROGRAMMATIC_SCROLL_BLOCK_MS;
    };

    const handleScrollKey = event => {
      if (
        ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(
          event.key
        )
      ) {
        markUserScroll();
      }
    };

    const guardedScrollTo = function (...args) {
      const requestedTop = readScrollTop(args);
      const userIsScrolling = performance.now() < blockProgrammaticScrollUntil;
      const isMeaningfulMove =
        Number.isFinite(requestedTop) && Math.abs(requestedTop - window.scrollY) > 2;

      if (userIsScrolling && isMeaningfulMove) {
        return undefined;
      }

      return originalScrollTo.apply(window, args);
    };

    // Listen to movement events rather than `scroll`: programmatic scrollTo calls also
    // emit `scroll`, while a plain touch without movement should not suppress scripts.
    window.addEventListener("wheel", markUserScroll, { capture: true, passive: true });
    window.addEventListener("touchmove", markUserScroll, { capture: true, passive: true });
    window.addEventListener("keydown", handleScrollKey, { capture: true });
    window.scrollTo = guardedScrollTo;

    return () => {
      window.removeEventListener("wheel", markUserScroll, true);
      window.removeEventListener("touchmove", markUserScroll, true);
      window.removeEventListener("keydown", handleScrollKey, true);
      if (window.scrollTo === guardedScrollTo) {
        window.scrollTo = originalScrollTo;
      }
    };
  }, [enabled]);
}
