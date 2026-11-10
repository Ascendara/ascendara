import { cn } from "@/lib/utils";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Loader } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Stages a hosted (Magic Link) download moves through, in order. Each gets a
 * pip under the button; "countdown" only exists for hosts with a timer.
 * "busy" (the downloader taking over) comes after all of them.
 */
const STEP_ORDER = ["opening", "countdown", "resolving", "starting"];

// Shortest time a step stays on screen, so fast steps still read one by one
const MIN_STEP_MS = 550;
// How long a pip takes to fill once its step is done
const PIP_FILL_S = 0.35;

/**
 * The stage to show for `stage`. Moves forward one step at a time and holds
 * each for at least MIN_STEP_MS, so steps that finish together still play in
 * order. Going back to idle (cancelled, failed) shows right away.
 */
function usePacedStage(stage, steps) {
  const [shown, setShown] = useState(stage);
  const shownAt = useRef(Date.now());

  useEffect(() => {
    if (stage === shown) return;
    const order = [...steps, "busy"];
    const from = order.indexOf(shown);
    const to = order.indexOf(stage);

    // Leaving the flow, or entering it from idle: no catching up to do
    if (to < 0 || from < 0 || to < from) {
      shownAt.current = Date.now();
      setShown(stage);
      return;
    }
    const wait = Math.max(0, MIN_STEP_MS - (Date.now() - shownAt.current));
    const timer = setTimeout(() => {
      shownAt.current = Date.now();
      setShown(order[from + 1]);
    }, wait);
    return () => clearTimeout(timer);
  }, [stage, shown, steps]);

  return shown;
}

/**
 * Seconds left until `endsAt` and how far along the wait is (0-1), ticking a
 * few times a second; both null without a countdown.
 */
export function useCountdown(endsAt) {
  const startedAt = useRef(null);
  const read = () => {
    if (!endsAt) return { seconds: null, progress: null };
    const total = Math.max(1, endsAt - (startedAt.current ?? Date.now()));
    const left = Math.max(0, endsAt - Date.now());
    return { seconds: Math.ceil(left / 1000), progress: 1 - left / total };
  };
  const [state, setState] = useState(read);
  useEffect(() => {
    startedAt.current = endsAt ? Date.now() : null;
    setState(read());
    if (!endsAt) return;
    const timer = setInterval(() => setState(read()), 200);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt]);
  return state;
}

/** Ring that fills as a countdown runs, in place of the spinner. */
function CountdownRing({ progress }) {
  const radius = 7;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg viewBox="0 0 18 18" className="h-[18px] w-[18px] -rotate-90">
      <circle
        cx="9"
        cy="9"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeWidth="2.25"
      />
      <circle
        cx="9"
        cy="9"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - Math.min(1, progress ?? 0))}
        style={{ transition: "stroke-dashoffset 200ms linear" }}
      />
    </svg>
  );
}

/** A number that flips to its next value. */
function FlipNumber({ value, reduceMotion }) {
  return (
    <span className="relative inline-flex h-5 min-w-[1.5ch] items-center justify-center overflow-hidden tabular-nums">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={reduceMotion ? { opacity: 0 } : { y: "-100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { y: "100%", opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/**
 * One pip under the button. Done pips are full, the current one creeps
 * forward (or follows the countdown), later ones are empty. A pip only
 * starts once the one before it has finished filling.
 */
function Pip({ state, progress, reduceMotion }) {
  const width =
    state === "done"
      ? "100%"
      : state === "active"
        ? progress != null
          ? `${Math.min(100, progress * 100)}%`
          : "60%"
        : "0%";
  const transition =
    state === "active" && progress != null
      ? { duration: 0.2, ease: "linear" }
      : state === "active"
        ? { duration: 1.6, ease: [0.16, 1, 0.3, 1], delay: PIP_FILL_S }
        : { duration: PIP_FILL_S, ease: "easeOut" };

  return (
    <span className="relative h-1 flex-1 overflow-hidden rounded-full bg-primary/15">
      <motion.span
        className="absolute inset-y-0 left-0 rounded-full bg-primary"
        initial={false}
        animate={{ width }}
        transition={reduceMotion ? { duration: 0 } : transition}
      />
      {state === "active" && progress == null && !reduceMotion && (
        <motion.span
          className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-primary/60 to-transparent"
          initial={{ left: "-35%" }}
          animate={{ left: "110%" }}
          transition={{
            duration: 1.2,
            ease: "easeInOut",
            repeat: Infinity,
            delay: PIP_FILL_S,
          }}
        />
      )}
    </span>
  );
}

/**
 * The download card's main button. Moves through its stages one at a time
 * with a short slide, fills during a countdown and sweeps a highlight while
 * it waits on the network.
 *
 * `stage`: "idle" | "busy" | one of STEP_ORDER. `stepLabels` holds the text
 * for each step; `label` is used for idle and busy.
 */
export default function DownloadButton({
  stage,
  label,
  stepLabels,
  icon: Icon,
  onClick,
  disabled,
  countdown,
  showSteps,
  hasCountdownStep,
}) {
  const reduceMotion = useReducedMotion();
  const [steps] = useState(() => STEP_ORDER);
  const activeSteps = steps.filter(step => step !== "countdown" || hasCountdownStep);
  const shown = usePacedStage(stage, activeSteps);

  const isCountdown = shown === "countdown";
  const waiting = shown !== "idle" && !isCountdown;
  const shownLabel = stepLabels?.[shown] ?? label;
  // Countdown values only mean something while it's the real stage; once it
  // has moved on but is still on screen, show it as finished
  const liveCountdown =
    stage === "countdown"
      ? countdown
      : shown === "countdown"
        ? { seconds: 0, progress: 1 }
        : null;
  const countdownProgress = isCountdown ? (liveCountdown?.progress ?? 0) : null;

  const stepIndex = shown === "busy" ? activeSteps.length : activeSteps.indexOf(shown);
  const pipsVisible = showSteps && stepIndex >= 0;

  const enter = reduceMotion
    ? { opacity: 0 }
    : { opacity: 0, y: 14, filter: "blur(4px)" };
  // The old label leaves a little faster than the new one arrives, so the two
  // never sit on top of each other
  const exit = reduceMotion
    ? { opacity: 0, transition: { duration: 0.12 } }
    : {
        opacity: 0,
        y: -12,
        filter: "blur(4px)",
        transition: { duration: 0.14, ease: [0.4, 0, 1, 1] },
      };

  return (
    <div className="space-y-2">
      <motion.button
        type="button"
        onClick={onClick}
        disabled={disabled}
        whileTap={disabled || reduceMotion ? undefined : { scale: 0.98 }}
        className={cn(
          "group relative flex h-12 w-full items-center justify-center overflow-hidden rounded-lg bg-primary px-4 text-base font-semibold text-secondary shadow-sm transition-[background-color,box-shadow,opacity] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          shown === "idle" && !disabled && "hover:bg-primary/90 hover:shadow-md",
          // Dim only when it really can't be pressed, not for the moment
          // between a click and its first step showing
          disabled && stage === "idle" && "cursor-not-allowed opacity-50",
          shown !== "idle" && "cursor-default"
        )}
      >
        {/* Countdown fill */}
        <AnimatePresence>
          {isCountdown && (
            <motion.span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 bg-white/20"
              initial={{ opacity: 0, width: 0 }}
              animate={{
                opacity: 1,
                width: `${Math.min(100, countdownProgress * 100)}%`,
              }}
              // Finish the fill before fading, so the wait reads as complete
              exit={{
                width: "100%",
                opacity: 0,
                transition: {
                  width: { duration: 0.18, ease: "easeOut" },
                  opacity: { duration: 0.25, delay: 0.15 },
                },
              }}
              transition={{
                width: { duration: 0.2, ease: "linear" },
                opacity: { duration: 0.2 },
              }}
            />
          )}
        </AnimatePresence>

        {/* Highlight sweep while waiting on the network */}
        <AnimatePresence>
          {waiting && !reduceMotion && (
            <motion.span
              key="sweep"
              aria-hidden="true"
              className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent"
              initial={{ left: "-35%", opacity: 0 }}
              animate={{ left: "110%", opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{
                left: { duration: 1.4, ease: "easeInOut", repeat: Infinity },
                opacity: { duration: 0.2 },
              }}
            />
          )}
        </AnimatePresence>

        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={shown}
            className="relative flex items-center gap-2"
            initial={enter}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={exit}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1], delay: 0.06 }}
          >
            {isCountdown ? (
              <CountdownRing progress={countdownProgress} />
            ) : waiting ? (
              <Loader className="h-4 w-4 animate-spin" />
            ) : (
              Icon && (
                <Icon
                  className="h-4 w-4 transition-transform duration-200 group-hover:translate-y-0.5"
                  strokeWidth={2.5}
                />
              )
            )}
            <span>{shownLabel}</span>
            {isCountdown && liveCountdown?.seconds != null && (
              <span className="inline-flex items-center rounded-md bg-black/10 px-1.5 text-sm">
                <FlipNumber value={liveCountdown.seconds} reduceMotion={reduceMotion} />
                <span>s</span>
              </span>
            )}
          </motion.span>
        </AnimatePresence>
      </motion.button>

      {/* Step pips */}
      <AnimatePresence initial={false}>
        {pipsVisible && (
          <motion.div
            aria-hidden="true"
            className="flex gap-1.5 px-1"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            {activeSteps.map((step, index) => (
              <Pip
                key={step}
                reduceMotion={reduceMotion}
                state={
                  index < stepIndex ? "done" : index === stepIndex ? "active" : "todo"
                }
                progress={step === "countdown" ? countdownProgress : null}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
