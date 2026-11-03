import React, { useEffect, useRef } from "react";

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
  const backdropRef = useRef(null);
  const flyerRef = useRef(null);
  const logoRef = useRef(null);

  useEffect(() => {
    if (!exiting) return;
    let cancelled = false;
    const root = document.documentElement;
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
        animations.push(
          flyer.animate(
            [
              { transform: "translate(0px, 0px) scale(1)" },
              { transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
            ],
            { ...opts, duration: FLIGHT_MS, easing: FLIGHT_EASE }
          )
        );
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

      await Promise.all(animations.map(a => a.finished.catch(() => {})));
      if (cancelled) return;
      root.classList.remove("splash-active");
      onDone?.();
    };

    run();

    return () => {
      cancelled = true;
      root.classList.remove("splash-active");
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
          background:
            "linear-gradient(135deg, rgb(var(--color-startup-accent, var(--color-primary)) / 0.1) 0%, rgb(var(--color-startup-background, var(--color-background))) 100%)",
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
