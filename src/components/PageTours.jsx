import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowDownUp,
  Bookmark,
  CircleArrowDown,
  Compass,
  FolderPlus,
  Gamepad2,
  GripVertical,
  HardDrive,
  Home,
  Info,
  LayoutGrid,
  Library,
  ListOrdered,
  MessageSquare,
  MousePointerClick,
  NotebookPen,
  PanelLeft,
  Pin,
  Play,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trophy,
  User,
  Wrench,
} from "lucide-react";
import { useTour } from "@/context/TourContext";
import Tour from "@/components/Tour";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Only users who went through the welcome flow get page tours; existing users
// already know their way around.
const ENABLED_KEY = "ascendara:pageToursEnabled";
const seenKey = id => `ascendara:pageTourSeen:${id}`;
// Waits for the page to settle so the prompt doesn't land on a loading skeleton
const PROMPT_DELAY = 900;
const ANCHOR_POLL = 400;

const tag = id => `[data-tour='${id}']`;

// Each tour is offered once its `anchor` is on screen, so pages that load data
// (or have nothing to show yet, like an empty Downloads page) wait until they do.
// Steps are [copy key, icon, spotlight]; any whose spotlight isn't on screen
// when the tour starts are skipped.
const TOURS = {
  "/": {
    id: "home",
    icon: Home,
    anchor: "[data-tour^='home-']",
    steps: [
      ["featured", Star, tag("home-featured")],
      ["recent", Play, tag("home-recent")],
      ["search", Search, tag("home-search")],
      ["links", MessageSquare, tag("home-links")],
      ["quickAccess", Pin, tag("home-quick-access")],
      ["rows", MousePointerClick, tag("home-rows")],
    ],
  },
  "/search": {
    id: "search",
    icon: Search,
    anchor: tag("search-input"),
    steps: [
      ["indexed", Info, tag("search-indexed")],
      ["input", Search, tag("search-input")],
      ["filters", SlidersHorizontal, tag("search-filters")],
      ["results", MousePointerClick, `${tag("search-results")} > :first-child`],
    ],
  },
  "/library": {
    id: "library",
    icon: Library,
    anchor: tag("library-add"),
    steps: [
      ["add", FolderPlus, tag("library-add")],
      ["tabs", PanelLeft, tag("library-tabs")],
      ["tools", Wrench, tag("library-tools")],
      ["storage", HardDrive, tag("library-storage")],
      ["search", Search, tag("library-search")],
      ["view", LayoutGrid, tag("library-view")],
      ["filters", ArrowDownUp, tag("library-filters")],
      ["games", MousePointerClick, tag("library-game")],
    ],
  },
  "/gamescreen": {
    id: "gameScreen",
    icon: Gamepad2,
    anchor: tag("game-play"),
    steps: [
      ["play", Play, tag("game-play")],
      ["quick", Bookmark, tag("game-quick")],
      ["manage", Settings2, tag("game-manage")],
      ["sections", Compass, tag("game-sections")],
    ],
  },
  "/downloads": {
    id: "downloads",
    icon: CircleArrowDown,
    anchor: tag("downloads-speed"),
    steps: [
      ["speed", CircleArrowDown, tag("downloads-speed")],
      ["card", Settings2, tag("downloads-card")],
      ["queue", GripVertical, tag("downloads-queue")],
    ],
  },
  "/profile": {
    id: "profile",
    icon: User,
    anchor: tag("profile-header"),
    steps: [
      ["header", User, tag("profile-header")],
      // The stat strip sits right after the header
      ["stats", Sparkles, `${tag("profile-header")} + dl`],
      ["games", Gamepad2, tag("profile-games")],
      ["history", ListOrdered, tag("profile-history")],
      ["achievements", Trophy, tag("profile-achievements")],
      ["notes", NotebookPen, tag("profile-notes")],
    ],
  },
};

const readStorage = key => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorage = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage may be unavailable; the tour may just be offered again
  }
};

export const enablePageTours = () => writeStorage(ENABLED_KEY, "1");

// Developer settings use this to offer every page tour again
export const resetPageTours = () => {
  try {
    Object.values(TOURS).forEach(tour => localStorage.removeItem(seenKey(tour.id)));
  } catch {
    // Storage may be unavailable; nothing was saved to clear
  }
};

// Hidden elements (responsive layouts, the persistent Search page) have no size
const isShown = selector => {
  const rect = document.querySelector(selector)?.getBoundingClientRect();
  return !!rect && rect.width > 0 && rect.height > 0;
};

const buildSteps = (tour, t) => {
  const key = `pageTours.${tour.id}`;
  const shown = tour.steps
    .filter(([, , spotlight]) => isShown(spotlight))
    .map(([name, icon, spotlight]) => ({
      icon,
      title: t(`${key}.${name}.title`),
      content: t(`${key}.${name}.content`),
      spotlight,
    }));
  return [
    {
      icon: tour.icon,
      title: t(`${key}.intro.title`),
      content: t(`${key}.intro.content`),
      spotlight: null,
      nextLabel: t("pageTours.start"),
    },
    ...shown,
    {
      icon: Sparkles,
      title: t("pageTours.final.title"),
      content: t(`${key}.final`),
      spotlight: null,
      nextLabel: t("pageTours.finish"),
    },
  ];
};

// Offers a short walkthrough the first time a new user opens each main page
export default function PageTours({ suppressed }) {
  const { pathname } = useLocation();
  const { isTourActive } = useTour();
  const { t } = useTranslation();
  // Kept after the prompt closes so its title doesn't blank out mid-animation
  const [offered, setOffered] = useState(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const [running, setRunning] = useState(null);

  const tour = TOURS[pathname];
  const busy = suppressed || isTourActive || !!running;

  // A page shortcut can leave mid-tour; its spotlights belong to the old page
  useEffect(() => setRunning(null), [pathname]);

  useEffect(() => {
    setPromptOpen(false);
    if (!tour || busy || readStorage(ENABLED_KEY) !== "1") return;
    if (readStorage(seenKey(tour.id))) return;

    let delay;
    const poll = setInterval(() => {
      if (delay || !isShown(tour.anchor)) return;
      delay = setTimeout(() => {
        if (isShown(tour.anchor)) {
          setOffered(tour);
          setPromptOpen(true);
        } else {
          delay = null;
        }
      }, PROMPT_DELAY);
    }, ANCHOR_POLL);
    return () => {
      clearInterval(poll);
      clearTimeout(delay);
    };
  }, [tour, busy]);

  const answer = accepted => {
    if (!promptOpen) return;
    writeStorage(seenKey(offered.id), "1");
    setPromptOpen(false);
    if (accepted) setRunning(offered);
  };

  const steps = useMemo(() => running && buildSteps(running, t), [running, t]);

  return (
    <>
      <AlertDialog open={promptOpen} onOpenChange={open => !open && answer(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {offered && t(`pageTours.${offered.id}.prompt`)}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("pageTours.promptContent")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => answer(false)}>
              {t("pageTours.decline")}
            </AlertDialogCancel>
            <AlertDialogAction className="text-secondary" onClick={() => answer(true)}>
              {t("pageTours.accept")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {steps && (
        <Tour
          steps={steps}
          sound={false}
          onClose={() => setRunning(null)}
          onFinish={() => {}}
        />
      )}
    </>
  );
}
