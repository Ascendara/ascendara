import { useLayoutEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useAppIcon } from "@/hooks/useAppIcon";
import { useSettings } from "@/context/SettingsContext";

// Theme colors, with the startup colors custom themes can set taking priority
const BACKGROUND = "var(--color-startup-background, var(--color-background))";
const ACCENT = "var(--color-startup-accent, var(--color-primary))";

// Same flight as the boot splash (StartupSplash), played in reverse
const FLIGHT_MS = 900;
const FLIGHT_EASE = "cubic-bezier(0.65, 0, 0.25, 1)";

const OVERLAY_CSS = `
@keyframes update-overlay-bar {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(300%); }
}
.update-overlay-bar { animation: update-overlay-bar 1.8s ease-in-out infinite; }
`;

/**
 * Shown while Ascendara installs itself; repairs reuse it with their own text.
 * `flyFrom` is the menu bar logo's rect (or "left" when it was not on screen):
 * the logo then flies from there into its place, the reverse of the boot splash.
 */
const UpdateOverlay = ({ title, description, detail, progress, flyFrom }) => {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const iconData = useAppIcon();
  const logoRef = useRef(null);
  const hasProgress = typeof progress === "number" && progress >= 0 && progress < 100;
  // Same rule as the boot splash: Smooth Transitions, and reduced motion
  const fly =
    !!flyFrom &&
    settings?.smoothTransitions !== false &&
    !settings?.reduceEffects &&
    !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // Before paint, so the logo never shows in its final spot first
  useLayoutEffect(() => {
    const logo = logoRef.current;
    if (!fly || !logo) return;
    const to = logo.getBoundingClientRect();
    let from;
    if (flyFrom === "left") {
      from = `translate(${-(to.left + to.width)}px, 0px) scale(1)`;
    } else {
      const dx = flyFrom.left + flyFrom.width / 2 - (to.left + to.width / 2);
      const dy = flyFrom.top + flyFrom.height / 2 - (to.top + to.height / 2);
      from = `translate(${dx}px, ${dy}px) scale(${flyFrom.width / to.width})`;
    }
    const flight = logo.animate(
      [{ transform: from }, { transform: "translate(0px, 0px) scale(1)" }],
      { duration: FLIGHT_MS, easing: FLIGHT_EASE, fill: "backwards" }
    );
    return () => flight.cancel();
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] flex select-none items-center justify-center">
      <style>{OVERLAY_CSS}</style>

      {/* Only the backdrop fades, so a flying logo is solid from its first frame */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        style={{ background: `rgb(${BACKGROUND})` }}
      />

      <motion.div
        className="relative flex w-full max-w-xs flex-col items-center px-6 text-center"
        initial={fly ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        {iconData && (
          <img
            ref={logoRef}
            src={iconData}
            alt=""
            draggable={false}
            className="relative z-10 mb-6 h-14 w-14"
            style={{ transformOrigin: "center center", willChange: "transform" }}
          />
        )}

        {/* Once the logo has landed */}
        <motion.div
          className="flex w-full flex-col items-center"
          initial={fly ? { opacity: 0, y: 6 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: fly ? FLIGHT_MS / 1000 - 0.2 : 0, duration: 0.3 }}
        >
          <h2 className="text-xl font-semibold text-foreground">
            {title ?? t("app.loading.installingUpdate")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {description ?? t("app.loading.ascendaraWillRestart")}
          </p>

          <div
            className="relative mt-6 h-1 w-full overflow-hidden rounded-full"
            style={{ background: `rgb(${ACCENT} / 0.15)` }}
          >
            {hasProgress ? (
              <div
                className="h-full rounded-full transition-[width] duration-300 ease-out"
                style={{ width: `${progress}%`, background: `rgb(${ACCENT})` }}
              />
            ) : (
              <div
                className="update-overlay-bar absolute inset-y-0 left-0 w-1/3 rounded-full"
                style={{ background: `rgb(${ACCENT})` }}
              />
            )}
          </div>

          {detail && <p className="mt-3 text-xs text-muted-foreground">{detail}</p>}
        </motion.div>
      </motion.div>
    </div>
  );
};

export default UpdateOverlay;
