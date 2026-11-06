import { useEffect } from "react";
import { MotionConfig } from "framer-motion";
import { useSettings } from "@/context/SettingsContext";

// Applies the Reduce Effects setting: CSS drops blur and looping animations
// (see html[data-effects="reduced"] in app.css) and framer-motion skips
// transform and layout animations, so the app costs less CPU and GPU.
export default function EffectsPreference({ children }) {
  const { settings } = useSettings();
  const reduced = settings?.reduceEffects === true;

  useEffect(() => {
    document.documentElement.dataset.effects = reduced ? "reduced" : "full";
  }, [reduced]);

  return (
    <MotionConfig reducedMotion={reduced ? "always" : "never"}>{children}</MotionConfig>
  );
}
