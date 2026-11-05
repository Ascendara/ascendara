import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  FlaskConical,
  Gamepad2,
  HardDrive,
  Infinity as InfinityIcon,
  Joystick,
  LayoutDashboard,
  ListOrdered,
  MessageCircle,
  Puzzle,
  RefreshCw,
  Rocket,
  Smartphone,
  Sparkles,
  Star,
  UserCog,
  Users,
  Zap,
} from "lucide-react";
import Tour from "@/components/Tour";
import DiscordIcon from "./DiscordIcon";
import { ASCEND_CROWN_URL } from "@/services/ascend/ascendCelebration";

const DiscordOutlineIcon = props => <DiscordIcon {...props} outline />;

// Perks that live outside the Ascend page, named with the sign in page's feature copy
const APP_WIDE_PERKS = [
  { name: "unlimitedDownloads", icon: InfinityIcon },
  { name: "downloadQueues", icon: ListOrdered },
  { name: "autoUpdate", icon: RefreshCw },
  { name: "trainers", icon: Zap },
  { name: "nexusMods", icon: Puzzle },
  { name: "emulatorPresets", icon: Joystick },
  { name: "highlightedReviews", icon: Star },
  { name: "experimentalBranch", icon: FlaskConical },
];

function PerkGrid({ t }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-2">
      {APP_WIDE_PERKS.map(({ name, icon: Icon }, index) => (
        <motion.div
          key={name}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 * index }}
          title={t(`account.features.${name}Desc`)}
          className="flex items-center gap-2 rounded-lg bg-card/60 px-2.5 py-2 text-left shadow"
        >
          <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate text-xs font-medium text-foreground">
            {t(`account.features.${name}`)}
          </span>
        </motion.div>
      ))}
    </div>
  );
}

// The Ascend logo the checkout celebration morphs into, filling the icon tile
const AscendLogo = () => (
  <img
    src={ASCEND_CROWN_URL}
    alt=""
    draggable={false}
    className="h-full w-full rounded-full object-cover shadow-lg"
  />
);

// Walks a new Ascend member (trial or checkout) through every Ascend section
export default function AscendWelcomeTour({ t, setActiveSection, onClose }) {
  const steps = useMemo(() => {
    const step = (key, icon, section, spotlight, extra = {}) => ({
      icon,
      title: t(`ascendTour.${key}.title`),
      content: t(`ascendTour.${key}.content`),
      spotlight,
      onEnter: () => setActiveSection(section),
      ...extra,
    });
    return [
      step("welcome", AscendLogo, "home", null, {
        iconBare: true,
        nextLabel: t("ascendTour.start"),
      }),
      step("overview", LayoutDashboard, "home", "[data-tour='ascend-home']"),
      step("cloudLibrary", Gamepad2, "cloudlibrary", "[data-tour='ascend-cloudlibrary']"),
      step(
        "cloudBackups",
        HardDrive,
        "cloudbackups",
        "[data-tour='ascend-cloudbackups']"
      ),
      step("companion", Smartphone, "companion", "[data-tour='ascend-companion']"),
      step("community", Users, "friends", "[data-tour='ascend-friends']"),
      step("discord", DiscordOutlineIcon, "discord", "[data-tour='ascend-discord']"),
      step("messages", MessageCircle, "messages", "[data-tour='ascend-messages']"),
      step("upcoming", Rocket, "upcoming", "[data-tour='ascend-upcoming']"),
      step("everywhere", Sparkles, "premium", null, { extra: <PerkGrid t={t} /> }),
      step("account", UserCog, "settings", "[data-tour='ascend-account']"),
      step("final", AscendLogo, "home", null, {
        iconBare: true,
        nextLabel: t("ascendTour.finish"),
      }),
    ];
  }, [t, setActiveSection]);

  return (
    <Tour
      steps={steps}
      sound={false}
      onClose={onClose}
      onFinish={() => setActiveSection("home")}
    />
  );
}
