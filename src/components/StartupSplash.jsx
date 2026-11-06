import React, { useEffect, useLayoutEffect, useRef } from "react";
import { useSettings } from "@/context/SettingsContext";

const SPLASH_SIZE = 128;
const FLIGHT_MS = 900;
const FADE_MS = 750;
// Gentle ease-in-out with a long, soft landing
const FLIGHT_EASE = "cubic-bezier(0.65, 0, 0.25, 1)";

const PULSE_CSS = `
@keyframes startup-splash-pulse {
  0%, 100% { transform: scale(0.95); opacity: 0.8; }
  50% { transform: scale(1); opacity: 1; }
}
.startup-splash-pulse {
  animation: startup-splash-pulse 2s ease-in-out infinite;
}
`;

const waitFrame = () => new Promise(resolve => requestAnimationFrame(resolve));

/**
 * Boot splash. While `exiting` is false the logo pulses in the center; once it
 * flips to true the logo shrinks and flies into the menu bar logo slot
 * ([data-app-logo]) while the backdrop fades, then `onDone` unmounts it.
 *
 * The exit uses the Web Animations API on transform/opacity only, so it runs
 * on the compositor and stays smooth while the app mounts underneath.
 */
const StartupSplash = ({ iconData, exiting, onDone, fallback = null }) => {
  const { settings } = useSettings();
  // Same rule as page transitions (Layout): the Smooth Transitions setting,
  // and the system's reduced-motion preference
  const animate =
    settings?.smoothTransitions !== false &&
    !settings?.reduceEffects &&
    !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const backdropRef = useRef(null);
  const flyerRef = useRef(null);
  const logoRef = useRef(null);

  // Take over from the HTML boot loader (src/index.html) without a visible
  // seam: same logo, same backdrop, and the pulse continued at the exact
  // phase the loader's pulse had reached. Then remove the loader.
  useLayoutEffect(() => {
    const logo = logoRef.current;
    const loader = document.getElementById("initial-loader");
    if (!logo || !loader || loader.style.display === "none") return;
    const loaderPulse = loader.querySelector("img")?.getAnimations?.()[0];
    if (typeof loaderPulse?.currentTime === "number") {
      logo.style.animationDelay = `-${Math.round(loaderPulse.currentTime % 2000)}ms`;
    }
    let cancelled = false;
    const ready = logo.decode ? logo.decode().catch(() => {}) : Promise.resolve();
    ready.then(() => {
      if (cancelled) return;
      // Wait for the splash logo to be painted before uncovering it.
      requestAnimationFrame(() => {
        if (!cancelled) loader.style.display = "none";
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!exiting) return;
    let cancelled = false;
    const root = document.documentElement;

    // Without motion the splash just fades out over the app, which is already
    // in place: no logo flight, menu bar pop-in or dock slide.
    if (!animate) {
      const fade = [backdropRef.current, flyerRef.current].filter(Boolean).map(el =>
        el.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 200,
          easing: "ease-out",
          fill: "forwards",
        })
      );
      Promise.all(fade.map(a => a.finished.catch(() => {}))).then(() => {
        if (!cancelled) onDone?.();
      });
      return () => {
        cancelled = true;
      };
    }

    root.classList.add("splash-active");

    const findTarget = async () => {
      // The menu bar mounts in the same commit; wait up to ~1s for its logo to load (first launch has nothing cached).
      for (let i = 0; i < 60; i++) {
        await waitFrame();
        if (cancelled) return null;
        const rect = document.querySelector("[data-app-logo]")?.getBoundingClientRect();
        if (rect && rect.width > 0) return rect;
      }
      return null;
    };

    const run = async () => {
      const target = await findTarget();
      if (cancelled) return;

      const flyer = flyerRef.current;
      const logo = logoRef.current;
      const animations = [];
      let flight = null;
      const opts = { fill: "forwards" };

      if (logo) {
        // Hand off from the pulse at its current value instead of snapping
        const style = getComputedStyle(logo);
        const fromTransform = style.transform === "none" ? "scale(1)" : style.transform;
        const fromOpacity = style.opacity;
        logo.classList.remove("startup-splash-pulse");
        animations.push(
          logo.animate(
            [
              { transform: fromTransform, opacity: fromOpacity },
              { transform: "scale(1)", opacity: 1 },
            ],
            { ...opts, duration: 350, easing: "ease-out" }
          )
        );
      }

      if (flyer && target) {
        const from = flyer.getBoundingClientRect();
        const dx = target.left + target.width / 2 - (from.left + from.width / 2);
        const dy = target.top + target.height / 2 - (from.top + from.height / 2);
        const scale = target.width / from.width;
        flight = flyer.animate(
          [
            { transform: "translate(0px, 0px) scale(1)" },
            { transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
          ],
          { ...opts, duration: FLIGHT_MS, easing: FLIGHT_EASE }
        );
        animations.push(flight);
      } else if (flyer) {
        animations.push(
          flyer.animate([{ opacity: 1 }, { opacity: 0 }], {
            ...opts,
            duration: 400,
            easing: "ease-out",
          })
        );
      }

      if (backdropRef.current) {
        animations.push(
          backdropRef.current.animate([{ opacity: 1 }, { opacity: 0 }], {
            ...opts,
            duration: FADE_MS,
            delay: 100,
            easing: "ease-out",
          })
        );
      }

      // Once the logo has come to rest in its slot, the rest of the menu bar
      // pops in and the dock slides up (CSS in app.css). Wait a frame so those
      // animations exist, then let them finish too.
      await flight?.finished.catch(() => {});
      if (cancelled) return;
      root.classList.add("boot-reveal");
      await waitFrame();
      const popIns = document
        .getAnimations()
        .filter(
          a => a.animationName === "boot-pop-in" || a.animationName === "boot-dock-in"
        );
      await Promise.all([...animations, ...popIns].map(a => a.finished.catch(() => {})));
      if (cancelled) return;
      root.classList.remove("splash-active", "boot-reveal");
      onDone?.();
    };

    run();

    return () => {
      cancelled = true;
      root.classList.remove("splash-active", "boot-reveal");
    };
  }, [exiting]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        pointerEvents: exiting ? "none" : "auto",
      }}
    >
      <style>{PULSE_CSS}</style>
      <div
        ref={backdropRef}
        style={{
          position: "absolute",
          inset: 0,
          willChange: "opacity",
          // Defined in src/index.html so it matches the boot loader exactly
          background: "var(--boot-gradient)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {iconData ? (
          <div
            ref={flyerRef}
            style={{
              width: SPLASH_SIZE,
              height: SPLASH_SIZE,
              transformOrigin: "center center",
              willChange: "transform",
            }}
          >
            <img
              ref={logoRef}
              src={iconData}
              alt="Loading"
              className="startup-splash-pulse"
              draggable={false}
              style={{ width: "100%", height: "100%", display: "block" }}
            />
          </div>
        ) : (
          fallback
        )}
      </div>
    </div>
  );
};

export default StartupSplash;
