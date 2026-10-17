import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useTour } from "@/context/TourContext";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  AtSign,
  CircleArrowDown,
  Compass,
  Library,
  Maximize2,
  Rocket,
  Search,
  Settings2,
  Sparkles,
  User,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SafeHtml from "@/components/SafeHtml";
import soundService from "@/services/soundService";

const MUTE_KEY = "ascendara:tourMuted";
const SPOTLIGHT_PADDING = 12;
const CARD_GAP = 18;
const EDGE_MARGIN = 16;
// Keeps the card clear of the custom menu bar
const TOP_MARGIN = 52;
const CARD_WIDTH = 380;
const HERO_CARD_WIDTH = 460;

const getSteps = t => [
  {
    icon: Sparkles,
    title: t("tour.title"),
    content: t("tour.welcome"),
    spotlight: null,
  },
  {
    icon: Activity,
    title: t("tour.serverStatus.title"),
    content: t("tour.serverStatus.content"),
    spotlight: "[data-tour='server-status']",
  },
  {
    icon: Compass,
    title: t("tour.navigationBar.title"),
    content: t("tour.navigationBar.content"),
    spotlight: "[data-tour='navigation']",
  },
  {
    icon: Maximize2,
    title: t("tour.resizing.title"),
    content: t("tour.resizing.content"),
    spotlight: "[data-tour='navigation']",
    showResizeHint: true,
  },
  {
    icon: Search,
    title: t("tour.searchDownload.title"),
    content: t("tour.searchDownload.content"),
    spotlight: "a[href='/search']",
    navigateTo: "/search",
  },
  {
    icon: Library,
    title: t("tour.gameLibrary.title"),
    content: t("tour.gameLibrary.content"),
    spotlight: "a[href='/library']",
    navigateTo: "/library",
  },
  {
    icon: CircleArrowDown,
    title: t("tour.downloads.title"),
    content: t("tour.downloads.content"),
    spotlight: "a[href='/downloads']",
    navigateTo: "/downloads",
  },
  {
    icon: User,
    title: t("tour.profile.title"),
    content: t("tour.profile.content"),
    spotlight: "a[href='/profile']",
    navigateTo: "/profile",
  },
  {
    icon: AtSign,
    title: t("tour.ascend.title"),
    content: t("tour.ascend.content"),
    spotlight: "a[href='/ascend']",
    navigateTo: "/ascend",
  },
  {
    icon: Settings2,
    title: t("tour.settings.title"),
    content: t("tour.settings.content"),
    spotlight: "a[href='/settings']",
    navigateTo: "/settings",
  },
  {
    icon: Rocket,
    title: t("tour.final.title"),
    content: t("tour.final.content"),
    spotlight: null,
  },
];

const readMuted = () => {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
};

const sameRect = (a, b) =>
  a &&
  b &&
  Math.abs(a.x - b.x) < 0.5 &&
  Math.abs(a.y - b.y) < 0.5 &&
  Math.abs(a.width - b.width) < 0.5 &&
  Math.abs(a.height - b.height) < 0.5;

// Places the card beside the highlighted element on whichever side has room,
// or centers it when nothing is highlighted.
const getCardPosition = (rect, cardSize, viewport) => {
  const { width, height } = cardSize;
  const clampX = x =>
    Math.min(Math.max(x, EDGE_MARGIN), viewport.width - width - EDGE_MARGIN);
  const clampY = y =>
    Math.min(Math.max(y, TOP_MARGIN), viewport.height - height - EDGE_MARGIN);

  if (!rect) {
    return {
      left: clampX((viewport.width - width) / 2),
      top: clampY((viewport.height - height) / 2),
    };
  }

  const top = rect.y - SPOTLIGHT_PADDING;
  const bottom = rect.y + rect.height + SPOTLIGHT_PADDING;
  const centerX = rect.x + rect.width / 2;
  const spaceBelow = viewport.height - bottom;
  const spaceAbove = top - TOP_MARGIN;

  if (spaceBelow >= height + CARD_GAP + EDGE_MARGIN || spaceBelow > spaceAbove) {
    return { left: clampX(centerX - width / 2), top: clampY(bottom + CARD_GAP) };
  }
  return { left: clampX(centerX - width / 2), top: clampY(top - CARD_GAP - height) };
};

function SoundMeter({ level, playing }) {
  return (
    <div className="flex h-4 items-end gap-[3px]" aria-hidden="true">
      {[0, 1, 2, 3].map(index => (
        <motion.span
          key={index}
          className={`w-[3px] rounded-full ${index < level ? "bg-primary" : "bg-primary/20"}`}
          animate={
            playing && index < level
              ? { height: ["30%", "100%", "45%", "85%", "30%"] }
              : { height: "30%" }
          }
          transition={
            playing && index < level
              ? { duration: 0.9 + index * 0.15, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.2 }
          }
        />
      ))}
    </div>
  );
}

function Tour({ onClose }) {
  const { setTourActive } = useTour();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const steps = useMemo(() => getSteps(t), [t]);

  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [targetRect, setTargetRect] = useState(null);
  const [cardSize, setCardSize] = useState({ width: HERO_CARD_WIDTH, height: 260 });
  const [viewport, setViewport] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [isMuted, setIsMuted] = useState(readMuted);
  const [navScale, setNavScale] = useState(
    parseFloat(localStorage.getItem("navSize") || "100") / 100
  );

  const cardRef = useRef(null);
  const resizeIntervalRef = useRef(null);
  const originalSize = useRef(null);
  const finishedRef = useRef(false);

  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  const isHero = !step.spotlight || !targetRect;

  // Sound build-up over the last 4 steps: three looping layers, then the drop
  const soundStepIndex = steps.length - 4;
  const soundLevel = currentStep >= soundStepIndex ? currentStep - soundStepIndex + 1 : 0;

  const soundMessage = [
    t("tour.sound.almostThere"),
    t("tour.sound.gettingCloser"),
    t("tour.sound.soClose"),
    t("tour.sound.readyForLiftoff"),
  ][soundLevel - 1];

  useEffect(() => {
    setTourActive(true);
    return () => {
      setTourActive(false);
      // Let the final drop ring out after finishing; otherwise fade the build-up away
      if (!finishedRef.current) soundService.fadeOut(400);
    };
  }, [setTourActive]);

  useEffect(() => {
    if (isMuted || soundLevel === 0) {
      soundService.stop();
      return;
    }
    const sound = `ascend${soundLevel}`;
    // The final step plays the drop once; earlier layers loop
    const loop = soundLevel < 4;
    soundService.crossfadeTo(sound, loop ? 0.25 : 0.4, loop);
  }, [soundLevel, isMuted]);

  const toggleMute = () => {
    setIsMuted(muted => {
      try {
        localStorage.setItem(MUTE_KEY, muted ? "0" : "1");
      } catch {
        // Storage may be unavailable; the choice just won't persist
      }
      return !muted;
    });
  };

  // Follow the highlighted element every frame, so page transitions, the nav
  // resize demo and window resizes never leave the spotlight behind.
  useEffect(() => {
    let frame;
    const track = () => {
      const element = step.spotlight ? document.querySelector(step.spotlight) : null;
      const rect = element?.getBoundingClientRect();
      const next =
        rect && rect.width > 0 && rect.height > 0
          ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
          : null;
      setTargetRect(previous =>
        next === previous || sameRect(next, previous) ? previous : next
      );
      setViewport(previous =>
        previous.width === window.innerWidth && previous.height === window.innerHeight
          ? previous
          : { width: window.innerWidth, height: window.innerHeight }
      );
      frame = requestAnimationFrame(track);
    };
    track();
    return () => cancelAnimationFrame(frame);
  }, [step.spotlight]);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.target.getBoundingClientRect();
      setCardSize(previous =>
        Math.abs(previous.width - width) < 0.5 && Math.abs(previous.height - height) < 0.5
          ? previous
          : { width, height }
      );
    });
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (step.navigateTo) navigate(step.navigateTo);
  }, [step.navigateTo, navigate]);

  // Gently pulses the nav bar size to show it can be resized, then restores it
  useEffect(() => {
    if (!step.showResizeHint) return;
    originalSize.current = localStorage.getItem("navSize") || "100";
    let increasing = true;

    resizeIntervalRef.current = setInterval(() => {
      const currentSize = parseFloat(localStorage.getItem("navSize") || "100");
      let newSize;
      if (increasing) {
        newSize = currentSize + 0.2;
        if (newSize >= 100) increasing = false;
      } else {
        newSize = currentSize - 0.2;
        if (newSize <= 95) increasing = true;
      }
      localStorage.setItem("navSize", newSize.toString());
      window.dispatchEvent(new CustomEvent("navResize"));
    }, 25);

    return () => {
      clearInterval(resizeIntervalRef.current);
      localStorage.setItem("navSize", originalSize.current);
      window.dispatchEvent(new CustomEvent("navResize"));
    };
  }, [step.showResizeHint]);

  useEffect(() => {
    const handleNavResize = () => {
      setNavScale(parseFloat(localStorage.getItem("navSize") || "100") / 100);
    };
    window.addEventListener("navResize", handleNavResize);
    return () => window.removeEventListener("navResize", handleNavResize);
  }, []);

  const nextStep = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setDirection(1);
      setCurrentStep(currentStep + 1);
      return;
    }
    finishedRef.current = true;
    onClose();
    setTimeout(() => navigate("/"), 100);
  }, [currentStep, steps.length, onClose, navigate]);

  const prevStep = useCallback(() => {
    if (currentStep === 0) return;
    setDirection(-1);
    setCurrentStep(currentStep - 1);
  }, [currentStep]);

  useEffect(() => {
    const handleKeyDown = event => {
      if (event.key === "Escape") {
        onClose();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        nextStep();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        prevStep();
      } else if (event.key === "Enter" && event.target?.tagName !== "BUTTON") {
        event.preventDefault();
        nextStep();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, nextStep, prevStep]);

  const cardPosition = getCardPosition(isHero ? null : targetRect, cardSize, viewport);
  const spotlightRect = targetRect && {
    left: targetRect.x - SPOTLIGHT_PADDING,
    top: targetRect.y - SPOTLIGHT_PADDING,
    width: targetRect.width + SPOTLIGHT_PADDING * 2,
    height: targetRect.height + SPOTLIGHT_PADDING * 2,
  };
  // The glow builds with the music; CSS variables can't be tweened by Framer, so
  // it eases via a CSS transition instead.
  const glow =
    soundLevel > 0
      ? `0 0 ${12 + soundLevel * 6}px rgb(var(--color-primary) / ${0.06 + soundLevel * 0.05})`
      : "0 0 0 0 transparent";
  const Icon = step.icon;
  const spring = { type: "spring", stiffness: 260, damping: 30 };

  return (
    <MotionConfig reducedMotion="user">
      <div
        className="fixed inset-0 z-[200]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
      >
        {/* Full dim for intro/outro steps; the spotlight cutout handles the rest */}
        <motion.div
          className="absolute inset-0 z-[201] bg-black/60 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: isHero ? 1 : 0 }}
          transition={{ duration: 0.35 }}
        />
        {/* Blocks clicks on the app underneath while the spotlight is shown */}
        <div className="absolute inset-0 z-[201]" />

        {spotlightRect && (
          <motion.div
            className="pointer-events-none absolute z-[202] rounded-2xl"
            initial={{ opacity: 0, ...spotlightRect }}
            animate={{ opacity: isHero ? 0 : 1, ...spotlightRect }}
            transition={{ ...spring, opacity: { duration: 0.3 } }}
            style={{
              boxShadow:
                "0 0 0 9999px rgba(0, 0, 0, 0.6), 0 0 0 1.5px rgb(var(--color-primary) / 0.55)",
            }}
          >
            <motion.div
              className="absolute inset-0 rounded-2xl border border-primary/50"
              animate={{ opacity: [0.5, 0], scale: [1, 1.08] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
            />
            {step.showResizeHint &&
              [
                "-left-1.5 -top-1.5 cursor-nw-resize",
                "-right-1.5 -top-1.5 cursor-ne-resize",
              ].map(corner => (
                <motion.div
                  key={corner}
                  className={`absolute h-4 w-4 rounded-md border-2 border-primary bg-background ${corner}`}
                  style={{ scale: navScale }}
                  animate={{ opacity: [1, 0.45, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                />
              ))}
          </motion.div>
        )}

        {/* Liftoff rings behind the final card when the drop hits */}
        <AnimatePresence>
          {isLastStep && !isMuted && (
            <motion.div
              key="liftoff"
              className="pointer-events-none absolute z-[202]"
              style={{
                left: cardPosition.left + cardSize.width / 2,
                top: cardPosition.top + cardSize.height / 2,
              }}
              exit={{ opacity: 0 }}
            >
              {[0, 1].map(ring => (
                <motion.div
                  key={ring}
                  className="absolute rounded-full border border-primary/25"
                  style={{
                    width: cardSize.width,
                    height: cardSize.width,
                    x: "-50%",
                    y: "-50%",
                  }}
                  initial={{ scale: 0.6, opacity: 0.5 }}
                  animate={{ scale: 1.8, opacity: 0 }}
                  transition={{
                    duration: 2.4,
                    delay: ring * 0.45,
                    repeat: Infinity,
                    ease: "easeOut",
                  }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          ref={cardRef}
          className="absolute z-[203] overflow-hidden rounded-2xl border border-border bg-background/95 backdrop-blur-xl"
          style={{
            width: `min(${isHero ? HERO_CARD_WIDTH : CARD_WIDTH}px, calc(100vw - 32px))`,
            boxShadow: `0 25px 50px -12px rgb(0 0 0 / 0.35), ${glow}`,
            transition: "box-shadow 600ms ease",
          }}
          initial={{ opacity: 0, scale: 0.96, ...cardPosition }}
          animate={{ opacity: 1, scale: 1, ...cardPosition }}
          transition={spring}
        >
          {/* Progress */}
          <div className="h-1 w-full bg-primary/10">
            <motion.div
              className="h-full bg-primary"
              animate={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>

          <div className={isHero ? "p-7" : "p-5"}>
            <AnimatePresence mode="wait" initial={false} custom={direction}>
              <motion.div
                key={currentStep}
                custom={direction}
                variants={{
                  enter: dir => ({ opacity: 0, x: dir * 16 }),
                  center: { opacity: 1, x: 0 },
                  exit: dir => ({ opacity: 0, x: dir * -16 }),
                }}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <div
                  className={`mb-3 flex items-center gap-3 ${isHero ? "flex-col text-center" : ""}`}
                >
                  <div
                    className={`flex shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary ${
                      isHero ? "h-14 w-14" : "h-10 w-10"
                    }`}
                  >
                    <Icon className={isHero ? "h-7 w-7" : "h-5 w-5"} />
                  </div>
                  <div className={isHero ? "" : "min-w-0"}>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {t("tour.stepOf", {
                        current: currentStep + 1,
                        total: steps.length,
                      })}
                    </p>
                    <h2
                      id="tour-title"
                      className={`font-bold text-foreground ${isHero ? "text-2xl" : "text-lg"}`}
                      style={{ marginBottom: 0 }}
                    >
                      {step.title}
                    </h2>
                  </div>
                </div>
                <SafeHtml
                  className={`pointer-events-auto text-sm leading-relaxed text-muted-foreground ${isHero ? "text-center" : ""}`}
                  html={step.content}
                />
              </motion.div>
            </AnimatePresence>

            {/* Sound build-up */}
            <AnimatePresence initial={false}>
              {soundLevel > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0, marginTop: 0 }}
                  animate={{ opacity: 1, height: "auto", marginTop: 16 }}
                  exit={{ opacity: 0, height: 0, marginTop: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2">
                    <SoundMeter level={soundLevel} playing={!isMuted} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-primary">
                        {soundMessage}
                      </p>
                      <p className="text-[11px] text-muted-foreground/70">
                        {t("tour.sound.musicBy")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={toggleMute}
                      className="rounded-full p-1.5 text-primary transition-colors hover:bg-primary/15"
                      title={isMuted ? t("tour.sound.unmute") : t("tour.sound.mute")}
                      aria-label={isMuted ? t("tour.sound.unmute") : t("tour.sound.mute")}
                    >
                      {isMuted ? (
                        <VolumeX className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Volume2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-5 flex items-center gap-2">
              {!isLastStep && (
                <button
                  type="button"
                  onClick={onClose}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t("tour.skip")}
                </button>
              )}
              <div className="ml-auto flex items-center gap-2">
                {currentStep > 0 && (
                  <button
                    type="button"
                    onClick={prevStep}
                    className="flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    {t("tour.back")}
                  </button>
                )}
                <motion.button
                  type="button"
                  onClick={nextStep}
                  autoFocus
                  whileTap={{ scale: 0.97 }}
                  className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-secondary shadow-sm transition-colors hover:bg-primary/90"
                >
                  {currentStep === 0
                    ? t("tour.start")
                    : isLastStep
                      ? t("tour.letsGo")
                      : t("tour.next")}
                  {isLastStep ? (
                    <Rocket className="h-4 w-4" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                </motion.button>
              </div>
            </div>

            {currentStep === 0 && (
              <p className="mt-4 text-center text-xs text-muted-foreground/70">
                {t("tour.keyboardHint")}
              </p>
            )}
          </div>
        </motion.div>
      </div>
    </MotionConfig>
  );
}

export default Tour;
