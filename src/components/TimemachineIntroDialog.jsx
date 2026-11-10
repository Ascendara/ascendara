import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLanguage } from "@/context/LanguageContext";
import { cn, formatLatestUpdate } from "@/lib/utils";
import { ArrowDownCircle, Calendar, Check, Eye, History, Star } from "lucide-react";

const DEMO_RELEASES = [
  { version: "v1.4.2", date: "Oct 28, 2026", live: true },
  { version: "v1.3.0", date: "Aug 14, 2026" },
  { version: "v1.2.1", date: "Jun 2, 2026" },
];

// One pass of the demo; it loops while the dialog is open
const STEPS = [
  { name: "start", ms: 900 },
  { name: "toChip", ms: 1500 },
  { name: "clickChip", ms: 300 },
  { name: "open", ms: 1300 },
  { name: "toRow", ms: 1500 },
  { name: "clickRow", ms: 300 },
  { name: "selected", ms: 1800 },
  // The cursor hides before the picker closes so it can reset unseen
  { name: "hide", ms: 400 },
  { name: "close", ms: 900 },
];

const stepIndex = name => STEPS.findIndex(step => step.name === name);

// Position of an element's center inside the stage. Offsets ignore the
// dialog's zoom-in transform, unlike getBoundingClientRect.
function centerWithin(el, stage) {
  let x = el.offsetWidth / 2;
  let y = el.offsetHeight / 2;
  for (let node = el; node && node !== stage; node = node.offsetParent) {
    x += node.offsetLeft;
    y += node.offsetTop;
  }
  return { x, y };
}

function Cursor() {
  return (
    <svg width="18" height="22" viewBox="0 0 18 22" className="drop-shadow-md">
      <path
        d="M1 1 L1 17 L5.5 13 L8.5 20.5 L11.5 19.2 L8.6 12 L14.5 12 Z"
        fill="white"
        stroke="black"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MockStat({ label, value }) {
  return (
    <div className="min-w-0 px-2.5 py-2">
      <div className="truncate text-[8px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 truncate text-[11px] font-semibold text-foreground">
        {value}
      </div>
    </div>
  );
}

function DemoStage() {
  const { t } = useLanguage();
  const stageRef = useRef(null);
  const chipRef = useRef(null);
  const rowRef = useRef(null);
  const [step, setStep] = useState(0);
  const [cursor, setCursor] = useState(null);

  const at = name => step >= stepIndex(name);
  const popupOpen = at("open") && !at("close");
  const rowSelected = at("clickRow");
  const clicking = STEPS[step].name === "clickChip" || STEPS[step].name === "clickRow";
  const cursorHidden = at("hide");
  const cursorDuration = STEPS[step].name === "close" ? 0 : 1.2;

  useEffect(() => {
    const timer = setTimeout(() => setStep(s => (s + 1) % STEPS.length), STEPS[step].ms);
    return () => clearTimeout(timer);
  }, [step]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const name = STEPS[step].name;
    const home = { x: stage.offsetWidth * 0.82, y: stage.offsetHeight * 0.8 };
    if (name === "close") {
      setCursor(home);
    } else if (name === "start") {
      setCursor(current => current || home);
    } else if (name === "toChip" && chipRef.current) {
      setCursor(centerWithin(chipRef.current, stage));
    } else if (name === "toRow" && rowRef.current) {
      setCursor(centerWithin(rowRef.current, stage));
    }
  }, [step]);

  return (
    <div
      ref={stageRef}
      aria-hidden="true"
      className="pointer-events-none relative mx-auto w-full max-w-[500px] select-none overflow-hidden rounded-lg border border-border bg-background p-2.5"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_130px] items-start gap-2.5">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-lg bg-card shadow">
          <div className="relative h-16 w-full bg-gradient-to-br from-primary/40 via-primary/10 to-muted">
            <div className="absolute inset-0 bg-gradient-to-t from-card via-card/60 to-transparent" />
          </div>
          <div className="relative -mt-9 flex items-end gap-2.5 px-2.5 pb-2.5">
            <div className="h-[4.5rem] w-12 shrink-0 rounded-md bg-gradient-to-br from-primary/60 to-primary/20 shadow-lg ring-1 ring-white/10" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold leading-tight text-foreground">
                Starfall Odyssey
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span
                  ref={chipRef}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-primary transition-colors",
                    at("clickChip") && !at("close") ? "bg-primary/30" : "bg-primary/15"
                  )}
                >
                  {DEMO_RELEASES[0].version}
                  <History className="h-3 w-3" />
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-yellow-400/15 px-2 py-0.5 text-[10px] font-medium text-yellow-600 dark:text-yellow-400">
                  <Star className="h-2.5 w-2.5 fill-current" />
                  4.6
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  <Eye className="h-2.5 w-2.5" />
                  {t("gameCard.views", { views: "12K" })}
                </span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-border/40 border-t border-border/40 bg-background/30">
            <MockStat label={t("download.gameSize")} value="24.3 GB" />
            <MockStat label={t("download.installSize")} value="41.7 GB" />
            <MockStat
              label={t("download.latestUpdate")}
              value={formatLatestUpdate(Date.now() - 2 * 86400000)}
            />
          </div>
        </section>

        {/* Download panel */}
        <section className="overflow-hidden rounded-lg bg-card shadow">
          <div className="h-1 bg-primary/30" />
          <div className="flex items-start gap-2 p-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ArrowDownCircle className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1 space-y-1.5 pt-0.5">
              <div className="h-2 w-3/4 rounded bg-muted" />
              <div className="h-1.5 w-full rounded bg-muted/60" />
              <div className="h-1.5 w-2/3 rounded bg-muted/60" />
            </div>
          </div>
          <div className="space-y-1.5 px-3 pb-3">
            <div className="h-6 rounded-md border border-border" />
            <div className="h-6 rounded-md border border-border" />
            <div className="h-7 rounded-md bg-primary" />
          </div>
        </section>
      </div>

      {/* Timemachine picker */}
      <AnimatePresence>
        {popupOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 flex items-center justify-center bg-black/50"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="w-[46%] space-y-2 rounded-lg border border-border bg-background p-2.5 shadow-lg"
            >
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                  <History className="h-3 w-3" />
                </div>
                <div className="text-xs font-bold text-foreground">
                  {t("download.timemachine.title")}
                </div>
              </div>
              <div className="space-y-1">
                {DEMO_RELEASES.map((entry, index) => {
                  const active = rowSelected && index === 1;
                  return (
                    <div
                      key={entry.version}
                      ref={index === 1 ? rowRef : undefined}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md border px-1.5 py-1 transition-colors",
                        active ? "border-primary bg-primary/10" : "border-border",
                        entry.live && "opacity-60"
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded",
                          active
                            ? "bg-primary text-secondary"
                            : "bg-accent/30 text-foreground"
                        )}
                      >
                        {active ? (
                          <Check className="h-2.5 w-2.5" />
                        ) : (
                          <History className="h-2.5 w-2.5" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-medium text-foreground">
                            {entry.version}
                          </span>
                          {entry.live && (
                            <span className="rounded-full bg-green-500/15 px-1.5 text-[8px] font-semibold uppercase tracking-wide text-green-500">
                              {t("download.timemachine.latest")}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-[8px] text-muted-foreground">
                          <Calendar className="h-2 w-2" />
                          {entry.date}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cursor */}
      {cursor && (
        <motion.div
          className="absolute left-0 top-0 z-10"
          initial={false}
          animate={{
            x: cursor.x - 2,
            y: cursor.y - 2,
            scale: clicking ? 0.85 : 1,
            opacity: cursorHidden ? 0 : 1,
          }}
          transition={{
            x: { duration: cursorDuration, ease: "easeInOut" },
            y: { duration: cursorDuration, ease: "easeInOut" },
            scale: { duration: 0.12 },
            opacity: { duration: 0.3 },
          }}
          style={{ transformOrigin: "2px 2px" }}
        >
          {clicking && (
            <motion.span
              className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-primary/40"
              initial={{ scale: 0.3, opacity: 0.9 }}
              animate={{ scale: 1.6, opacity: 0 }}
              transition={{ duration: 0.5 }}
            />
          )}
          <Cursor />
        </motion.div>
      )}
    </div>
  );
}

export default function TimemachineIntroDialog({ open, onOpenChange }) {
  const { t } = useLanguage();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <History className="h-5 w-5" />
            </div>
            <div className="min-w-0 text-left">
              <DialogTitle className="text-foreground">
                {t("download.timemachine.intro.title")}
              </DialogTitle>
              <DialogDescription>
                {t("download.timemachine.intro.description")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {open && <DemoStage />}

        <p className="text-xs text-muted-foreground">
          {t("download.timemachine.oldLinksNotice")}
        </p>

        <DialogFooter>
          <Button className="text-secondary" onClick={() => onOpenChange(false)}>
            {t("common.gotIt")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
