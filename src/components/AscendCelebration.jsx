import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useSettings } from "@/context/SettingsContext";
import { useAppIcon } from "@/hooks/useAppIcon";
import {
  ASCEND_CROWN_URL,
  preloadAscendCelebration,
  releaseAscendCelebration,
} from "@/services/ascend/ascendCelebration";

export const CELEBRATION_SIZE = 224;
// Pixel size the GIF frames are decoded at for the current display
export const celebrationPixelSize = () =>
  Math.min(512, Math.round(CELEBRATION_SIZE * (window.devicePixelRatio || 1)));

const FLIGHT_MS = 1050;
// Same curve as the boot splash flight, so this reads as its reverse
const FLIGHT_EASE = "cubic-bezier(0.65, 0, 0.25, 1)";
// The vertical leg eases out sooner than the horizontal one, bending the
// straight line into a soft arc as the logo comes down from the menu bar
const DROP_EASE = "cubic-bezier(0.45, 0, 0.15, 1)";
const SPRING = "cubic-bezier(0.34, 1.45, 0.64, 1)";
const ASSET_TIMEOUT_MS = 8000;
// The GIF's own duration minus the hold on its last frame, for the <img> fallback
const FALLBACK_MORPH_MS = 3320;
const GLOW = "167, 139, 250";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const settle = animation => animation?.finished.catch(() => {});

// The checkout ends in the browser; play once the user is back in the window
const waitForWindow = async isCancelled => {
  while (document.visibilityState !== "visible") {
    await new Promise(resolve =>
      document.addEventListener("visibilitychange", resolve, { once: true })
    );
    if (isCancelled()) return;
  }
  if (!document.hasFocus()) {
    await Promise.race([
      new Promise(resolve => window.addEventListener("focus", resolve, { once: true })),
      sleep(1500),
    ]);
  }
  // A beat for the window to finish repainting after coming to the front
  await sleep(250);
};

/**
 * Post-checkout celebration. The background dims while the menu bar logo
 * ([data-app-logo]) flies down to the center, morphs into the Ascend crown,
 * and then everything clears for the welcome tour. The reverse of the boot
 * splash (StartupSplash), built the same way: Web Animations on transform and
 * opacity, with the GIF drawn frame by frame onto a canvas so it plays once
 * from the start and hands off to the crown on its exact last frame.
 */
const AscendCelebration = ({ onDone }) => {
  const { settings } = useSettings();
  const iconData = useAppIcon();
  const animate =
    settings?.smoothTransitions !== false &&
    !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const refs = {
    backdrop: useRef(null),
    stage: useRef(null),
    glow: useRef(null),
    ring: useRef(null),
    flyX: useRef(null),
    flyY: useRef(null),
    logo: useRef(null),
    icon: useRef(null),
    canvas: useRef(null),
    gif: useRef(null),
    crown: useRef(null),
  };
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    const isCancelled = () => cancelled;
    const root = document.documentElement;
    const el = Object.fromEntries(Object.entries(refs).map(([k, r]) => [k, r.current]));
    const fill = { fill: "forwards" };
    const fadeIn = (node, duration, easing = "ease-out", delay = 0) =>
      node?.animate([{ opacity: 0 }, { opacity: 1 }], { ...fill, duration, easing, delay });
    const fadeOut = (node, duration, easing = "ease-out", delay = 0) =>
      node?.animate([{ opacity: 1 }, { opacity: 0 }], { ...fill, duration, easing, delay });

    const assets = preloadAscendCelebration(celebrationPixelSize());
    const loaded = Promise.race([assets, sleep(ASSET_TIMEOUT_MS).then(() => null)]);

    const finish = () => {
      if (cancelled) return;
      cancelled = true;
      releaseAscendCelebration();
      onDoneRef.current?.();
    };

    const playFrames = frames =>
      new Promise(resolve => {
        const ctx = el.canvas.getContext("2d");
        const last = frames.length - 1;
        let index = 0;
        let due = performance.now() + frames[0].ms;
        const draw = i => {
          ctx.clearRect(0, 0, el.canvas.width, el.canvas.height);
          ctx.drawImage(frames[i].bitmap, 0, 0);
        };
        draw(0);
        const tick = now => {
          if (cancelled) return resolve();
          let advanced = false;
          // Catch up by time, not by frame count, so a slow frame never
          // stretches the morph
          while (index < last && now >= due) {
            index++;
            due += frames[index].ms;
            advanced = true;
          }
          if (advanced) draw(index);
          if (index >= last) return resolve();
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      });

    const exit = async () => {
      // The menu bar logo pops back into its slot as the dim lifts
      root.classList.remove("ascend-celebrate");
      root.classList.add("ascend-celebrate-return");
      el.stage.animate(
        [
          { opacity: 1, transform: "scale(1)" },
          { opacity: 0, transform: "scale(1.08)" },
        ],
        { ...fill, duration: 520, easing: "cubic-bezier(0.4, 0, 1, 1)" }
      );
      await settle(fadeOut(el.backdrop, 650, "ease-in-out", 120));
      root.classList.remove("ascend-celebrate-return");
      finish();
    };

    const runReduced = async () => {
      const crown = await loaded;
      if (cancelled) return;
      if (crown?.crown) el.crown.style.opacity = "1";
      else if (el.icon) el.icon.style.opacity = "1";
      fadeIn(el.backdrop, 250);
      await settle(fadeIn(el.stage, 250));
      await sleep(1600);
      if (cancelled) return;
      fadeOut(el.stage, 250);
      await settle(fadeOut(el.backdrop, 250));
      finish();
    };

    const run = async () => {
      const target = document.querySelector("[data-app-logo]")?.getBoundingClientRect();
      root.classList.add("ascend-celebrate");
      if (el.icon) el.icon.style.opacity = "1";
      el.stage.style.opacity = "1";
      fadeIn(el.backdrop, 750, "cubic-bezier(0.33, 1, 0.68, 1)");

      let flight;
      if (target?.width) {
        const from = el.logo.getBoundingClientRect();
        const dx = target.left + target.width / 2 - (from.left + from.width / 2);
        const dy = target.top + target.height / 2 - (from.top + from.height / 2);
        const scale = target.width / from.width;
        const opts = { ...fill, duration: FLIGHT_MS };
        el.flyX.animate(
          [{ transform: `translateX(${dx}px)` }, { transform: "translateX(0)" }],
          { ...opts, easing: FLIGHT_EASE }
        );
        el.flyY.animate(
          [{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }],
          { ...opts, easing: DROP_EASE }
        );
        flight = el.logo.animate(
          [{ transform: `scale(${scale})` }, { transform: "scale(1)" }],
          { ...opts, easing: FLIGHT_EASE }
        );
        // The shadow grows in as the logo lifts off the bar
        el.logo.animate(
          [
            { boxShadow: "0 0 0 0 rgba(0,0,0,0)" },
            { boxShadow: "0 24px 60px -12px rgba(0,0,0,0.55)" },
          ],
          { ...opts, easing: "ease-out" }
        );
      } else {
        // No menu bar logo to fly from: grow in place instead
        flight = el.logo.animate(
          [
            { transform: "scale(0.6)", opacity: 0 },
            { transform: "scale(1)", opacity: 1 },
          ],
          { ...fill, duration: 600, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
        );
      }
      el.glow.animate(
        [
          { opacity: 0, transform: "scale(0.6)" },
          { opacity: 0.45, transform: "scale(1)" },
        ],
        { ...fill, duration: 900, delay: FLIGHT_MS * 0.55, easing: "ease-out" }
      );

      await settle(flight);
      if (cancelled) return;
      // A small settle on landing
      el.logo.animate(
        [{ scale: "1" }, { scale: "1.035" }, { scale: "1" }],
        { duration: 340, easing: "ease-in-out" }
      );

      let pulse;
      const ready = await Promise.race([loaded, sleep(400).then(() => undefined)]);
      let morph = ready;
      if (ready === undefined) {
        // Still downloading: breathe gently until it arrives
        pulse = el.logo.animate(
          [{ scale: "1" }, { scale: "0.965" }, { scale: "1" }],
          { duration: 1800, iterations: Infinity, easing: "ease-in-out" }
        );
        morph = await loaded;
        pulse.cancel();
      }
      if (cancelled) return;

      if (!morph) {
        // Offline or blocked: skip the morph, keep the moment
        await sleep(900);
        if (!cancelled) await exit();
        return;
      }

      const morphMs = morph.frames
        ? morph.frames.slice(0, -1).reduce((sum, f) => sum + f.ms, 0)
        : FALLBACK_MORPH_MS;
      let layer;
      if (morph.frames) {
        layer = el.canvas;
        layer.width = morph.frames[0].bitmap.width;
        layer.height = morph.frames[0].bitmap.height;
        layer.getContext("2d").drawImage(morph.frames[0].bitmap, 0, 0);
      } else {
        layer = el.gif;
        layer.src = morph.blobUrl;
        await layer.decode?.().catch(() => {});
      }
      if (cancelled) return;

      // The GIF's first frame is the same logo drawn a touch smaller; a slow
      // fade over the opaque icon hides the difference. Fading both at once
      // would let the dim show through mid-way.
      await settle(fadeIn(layer, 380, "ease-in-out"));
      if (cancelled) return;
      el.icon?.getAnimations().forEach(a => a.cancel());
      if (el.icon) el.icon.style.opacity = "0";

      el.glow.animate(
        [
          { opacity: 0.45, transform: "scale(1)" },
          { opacity: 0.75, transform: "scale(1.18)" },
        ],
        { ...fill, duration: morphMs, easing: "ease-in" }
      );
      if (morph.frames) await playFrames(morph.frames);
      else await sleep(FALLBACK_MORPH_MS);
      if (cancelled) return;

      // Crown lands: swap to the crisp PNG and celebrate it
      await sleep(60);
      fadeIn(el.crown, 240, "ease-in-out")
        ?.finished.then(() => {
          layer.getAnimations().forEach(a => a.cancel());
          layer.style.opacity = "0";
        })
        .catch(() => {});
      el.logo.animate(
        [{ scale: "1" }, { scale: "1.08" }, { scale: "1" }],
        { duration: 620, easing: SPRING }
      );
      el.ring.animate(
        [
          { opacity: 0.9, transform: "scale(0.95)" },
          { opacity: 0, transform: "scale(1.9)" },
        ],
        { ...fill, duration: 900, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
      );
      el.glow.animate(
        [
          { opacity: 0.75, transform: "scale(1.18)" },
          { opacity: 1, transform: "scale(1.35)", offset: 0.25 },
          { opacity: 0.55, transform: "scale(1.1)" },
        ],
        { ...fill, duration: 1300, easing: "ease-out" }
      );

      await sleep(1400);
      if (!cancelled) await exit();
    };

    waitForWindow(isCancelled).then(() => {
      if (cancelled) return;
      (animate ? run() : runReduced()).catch(error => {
        console.error("Ascend celebration failed:", error);
        root.classList.remove("ascend-celebrate", "ascend-celebrate-return");
        finish();
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      root.classList.remove("ascend-celebrate", "ascend-celebrate-return");
    };
  }, []);

  const layerStyle = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    opacity: 0,
    borderRadius: "50%",
    display: "block",
  };

  return createPortal(
    <div
      aria-hidden="true"
      style={{ position: "fixed", inset: 0, zIndex: 9998, pointerEvents: "auto" }}
    >
      <div
        ref={refs.backdrop}
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0,
          willChange: "opacity",
          background:
            "radial-gradient(circle at 50% 50%, rgba(28, 18, 48, 0.62) 0%, rgba(6, 4, 12, 0.82) 70%)",
          backdropFilter: "blur(6px)",
        }}
      />
      <div
        ref={refs.stage}
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: 0,
        }}
      >
        <div
          ref={refs.glow}
          style={{
            position: "absolute",
            width: CELEBRATION_SIZE * 2.6,
            height: CELEBRATION_SIZE * 2.6,
            borderRadius: "50%",
            opacity: 0,
            background: `radial-gradient(circle, rgba(${GLOW}, 0.55) 0%, rgba(${GLOW}, 0.18) 38%, rgba(${GLOW}, 0) 68%)`,
            willChange: "transform, opacity",
          }}
        />
        <div
          ref={refs.ring}
          style={{
            position: "absolute",
            width: CELEBRATION_SIZE,
            height: CELEBRATION_SIZE,
            borderRadius: "50%",
            opacity: 0,
            border: `2px solid rgba(${GLOW}, 0.9)`,
            boxShadow: `0 0 24px rgba(${GLOW}, 0.6), inset 0 0 24px rgba(${GLOW}, 0.35)`,
            willChange: "transform, opacity",
          }}
        />
        <div ref={refs.flyX} style={{ willChange: "transform" }}>
          <div ref={refs.flyY} style={{ willChange: "transform" }}>
            <div
              ref={refs.logo}
              style={{
                position: "relative",
                width: CELEBRATION_SIZE,
                height: CELEBRATION_SIZE,
                borderRadius: "50%",
                willChange: "transform",
              }}
            >
              {iconData && (
                <img ref={refs.icon} src={iconData} alt="" draggable={false} style={layerStyle} />
              )}
              <canvas ref={refs.canvas} style={layerStyle} />
              <img ref={refs.gif} alt="" draggable={false} style={layerStyle} />
              <img
                ref={refs.crown}
                src={ASCEND_CROWN_URL}
                crossOrigin="anonymous"
                alt=""
                draggable={false}
                style={layerStyle}
              />
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AscendCelebration;
