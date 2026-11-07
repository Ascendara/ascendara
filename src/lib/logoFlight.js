// Flies the menu bar logo into a slot inside a dialog: the reverse of the
// startup splash, which lands the logo in the menu bar. The logo drops down
// along its own side of the window first, then sweeps in to the slot.

const FLIGHT_MS = 720;
const FLIGHT_EASE = "cubic-bezier(0.65, 0, 0.35, 1)";
const LIFT_SCALE = 1.35;
const SAMPLES = 24;

const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));

const center = rect => ({
  x: rect.left + rect.width / 2,
  y: rect.top + rect.height / 2,
});

// The dialog zooms and slides in; measuring before that settles would aim at
// the wrong spot
const waitForSettle = async (element, timeout = 450) => {
  const host = element.closest('[role="dialog"]') || element;
  const animations = host.getAnimations?.({ subtree: true }) || [];
  if (animations.length === 0) return;
  await Promise.race([
    Promise.all(animations.map(animation => animation.finished.catch(() => {}))),
    new Promise(resolve => setTimeout(resolve, timeout)),
  ]);
};

/**
 * @param {HTMLImageElement} origin  the logo the flight starts from
 * @param {() => HTMLElement | null} getTarget  the slot to land in; it may mount a frame later
 * @param {() => void} onLand  called once the logo has arrived (show the real slot logo)
 * @returns {() => void} cancels the flight and shows the slot logo. The menu bar
 *   logo stays hidden until `returnLogo` is called for it.
 */
export function flyLogo(origin, getTarget, onLand) {
  let cancelled = false;
  let landed = false;
  const start = origin.getBoundingClientRect();

  const land = () => {
    if (landed) return;
    landed = true;
    onLand?.();
  };

  if (!start.width) {
    land();
    return () => {};
  }

  const clone = document.createElement("img");
  clone.src = origin.currentSrc || origin.src;
  clone.alt = "";
  clone.setAttribute("aria-hidden", "true");
  Object.assign(clone.style, {
    position: "fixed",
    left: `${start.left}px`,
    top: `${start.top}px`,
    width: `${start.width}px`,
    height: `${start.height}px`,
    margin: "0",
    zIndex: "1000",
    pointerEvents: "none",
    transformOrigin: "50% 50%",
    willChange: "transform",
  });
  document.body.appendChild(clone);

  // The menu bar's own logo leaves with the flight; it is away while the
  // dialog is open and comes back through returnLogo
  origin.style.visibility = "hidden";

  const cleanup = () => clone.remove();

  // A small lift while the dialog opens, so the logo never sits still
  clone.animate(
    [
      { transform: "none", filter: "drop-shadow(0 0 0 transparent)" },
      {
        transform: `scale(${LIFT_SCALE})`,
        filter: "drop-shadow(0 8px 16px rgb(0 0 0 / 0.35))",
      },
    ],
    { duration: 180, easing: "ease-out", fill: "forwards" }
  );

  (async () => {
    let target = null;
    for (let i = 0; i < 20 && !target; i++) {
      await nextFrame();
      if (cancelled) return;
      target = getTarget();
    }
    if (!target) {
      cleanup();
      land();
      return;
    }

    await waitForSettle(target);
    if (cancelled) return;

    const end = target.getBoundingClientRect();
    const from = center(start);
    const to = center(end);
    // Bend the path so it falls along the logo's side before curving inwards
    const control = {
      x: from.x + (to.x - from.x) * 0.1,
      y: from.y + (to.y - from.y) * 0.9,
    };
    const endScale = end.width / start.width;
    const tilt = Math.sign(to.x - from.x) * 14;

    const keyframes = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      const u = 1 - t;
      const x = u * u * from.x + 2 * u * t * control.x + t * t * to.x;
      const y = u * u * from.y + 2 * u * t * control.y + t * t * to.y;
      const scale = LIFT_SCALE + (endScale - LIFT_SCALE) * t;
      const rotate = tilt * Math.sin(Math.PI * t);
      keyframes.push({
        offset: t,
        transform: `translate(${x - from.x}px, ${y - from.y}px) rotate(${rotate}deg) scale(${scale})`,
        filter: `drop-shadow(0 ${8 * u}px ${16 * u}px rgb(0 0 0 / ${0.35 * u}))`,
      });
    }

    const flight = clone.animate(keyframes, {
      duration: FLIGHT_MS,
      easing: FLIGHT_EASE,
      fill: "forwards",
    });
    await flight.finished.catch(() => {});
    if (cancelled) return;

    // Swap the copy for the real logo in one go, so both never show (or both
    // vanish) for a frame. React catches up to the same opacity right after.
    target.style.opacity = "1";
    cleanup();
    land();
    // A soft settle that starts from the size it landed at, so nothing jumps
    target.animate?.(
      [
        { transform: "scale(1)" },
        { transform: "scale(1.05)", offset: 0.35 },
        { transform: "scale(1)" },
      ],
      { duration: 300, easing: "ease-out" }
    );
  })();

  return () => {
    if (cancelled) return;
    cancelled = true;
    cleanup();
    land();
  };
}

export const prefersReducedMotion = () =>
  document.documentElement.dataset.motion === "reduced" ||
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Brings a logo that flew away back into the menu bar, popping in as the
 * dialog it went to fades out.
 * @param {HTMLElement | null} origin
 */
export function returnLogo(origin) {
  if (!origin || origin.style.visibility !== "hidden") return;
  origin.style.visibility = "";
  if (prefersReducedMotion()) return;
  origin.animate?.(
    [
      { opacity: 0, transform: "scale(0.4)" },
      { opacity: 1, transform: "scale(1.15)", offset: 0.6 },
      { opacity: 1, transform: "scale(1)" },
    ],
    {
      duration: 420,
      delay: 160,
      easing: "cubic-bezier(0.34, 1.4, 0.64, 1)",
      fill: "backwards",
    }
  );
}
