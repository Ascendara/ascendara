import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import SectionHeader from "./SectionHeader";
import { useLibraryBackupStore } from "@/services/library/libraryBackupStore";
import {
  User,
  Users,
  Sparkles,
  Cloud,
  CloudUpload,
  Zap,
  MessageCircle,
  Gamepad2,
  Trophy,
  RefreshCw,
  Crown,
  ListOrdered,
  Puzzle,
  Infinity as InfinityIcon,
  Smartphone,
  FlaskConical,
  Joystick,
  HardDriveDownload,
  ChevronRight,
} from "lucide-react";

function FeatureCard({ feature, t, delay, featured }) {
  const Icon = feature.icon;
  const Wrapper = feature.onOpen ? motion.button : motion.div;
  return (
    <Wrapper
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      onClick={feature.onOpen}
      className={`group relative flex h-full w-full flex-col rounded-2xl text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary ${
        featured ? "bg-card/70 p-5 shadow hover:bg-card" : "bg-card/40 p-4"
      } ${feature.onOpen && !featured ? "hover:bg-card" : ""}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex shrink-0 items-center justify-center rounded-xl ${
            featured
              ? "h-10 w-10 bg-primary/15 text-primary"
              : "h-9 w-9 bg-muted/60 text-foreground/80"
          }`}
        >
          <Icon className={featured ? "h-5 w-5" : "h-4 w-4"} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-tight">{t(`${feature.key}.title`)}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {t(`${feature.key}.description`)}
          </p>
        </div>
      </div>
      {feature.onOpen && (
        <span className="mt-auto flex items-center gap-1 self-end pt-3 text-xs font-medium text-primary">
          {t("ascend.premium.open")}
          <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      )}
    </Wrapper>
  );
}

export default function PremiumSection({ t, setActiveSection }) {
  const navigate = useNavigate();
  const openLibraryBackups = useLibraryBackupStore(state => state.setOpen);

  const groups = [
    {
      id: "cloud",
      icon: Cloud,
      featured: true,
      features: [
        {
          key: "ascend.premium.cloudSync",
          icon: Cloud,
          onOpen: () => setActiveSection("cloudlibrary"),
        },
        {
          key: "ascend.premium.cloudBackups",
          icon: CloudUpload,
          onOpen: () => setActiveSection("cloudbackups"),
        },
        {
          key: "ascend.premium.retroCloudSaves",
          icon: Joystick,
          onOpen: () => navigate("/retro"),
        },
        {
          key: "ascend.premium.libraryBackups",
          icon: HardDriveDownload,
          onOpen: () => {
            openLibraryBackups(true);
            navigate("/library");
          },
        },
        {
          key: "ascend.premium.webView",
          icon: Smartphone,
          onOpen: () => setActiveSection("companion"),
        },
      ],
    },
    {
      id: "games",
      icon: Gamepad2,
      features: [
        { key: "ascend.premium.unlimitedDownloads", icon: InfinityIcon },
        { key: "ascend.premium.downloadQueue", icon: ListOrdered },
        { key: "ascend.premium.autoUpdate", icon: RefreshCw },
        { key: "ascend.premium.flingTrainer", icon: Zap },
        { key: "ascend.premium.nexusMods", icon: Puzzle },
        { key: "ascend.premium.emulatorPresets", icon: Joystick },
      ],
    },
    {
      id: "social",
      icon: Users,
      features: [
        {
          key: "ascend.premium.friends",
          icon: Users,
          onOpen: () => setActiveSection("friends"),
        },
        {
          key: "ascend.premium.chat",
          icon: MessageCircle,
          onOpen: () => setActiveSection("messages"),
        },
        {
          key: "ascend.premium.profile",
          icon: User,
          onOpen: () => setActiveSection("settings"),
        },
        {
          key: "ascend.premium.leaderboard",
          icon: Trophy,
          onOpen: () => setActiveSection("leaderboard"),
        },
      ],
    },
    {
      id: "early",
      icon: Sparkles,
      features: [
        {
          key: "ascend.premium.upcoming",
          icon: Sparkles,
          onOpen: () => setActiveSection("upcoming"),
        },
        { key: "ascend.premium.experimentalBranch", icon: FlaskConical },
        { key: "ascend.premium.moreComing", icon: Sparkles },
      ],
    },
  ];

  let delay = 0;
  return (
    <div className="mb-24 space-y-8">
      <SectionHeader
        icon={Crown}
        title={t("ascend.premium.title")}
        description={t("ascend.premium.subtitle")}
      />

      {groups.map(group => (
        <section
          key={group.id}
          className={
            group.featured
              ? "relative overflow-hidden rounded-2xl bg-card/60 p-5 shadow sm:p-6"
              : ""
          }
        >
          <div className="relative mb-4 flex items-center gap-3">
            <group.icon
              className={`h-5 w-5 ${group.featured ? "text-primary" : "text-muted-foreground"}`}
            />
            <div>
              <h2
                className={group.featured ? "text-xl font-bold" : "text-lg font-semibold"}
              >
                {t(`ascend.premium.groups.${group.id}.title`)}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t(`ascend.premium.groups.${group.id}.description`)}
              </p>
            </div>
          </div>
          <div
            className={`relative grid gap-3 ${
              group.featured ? "md:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3"
            }`}
          >
            {group.features.map((feature, index) => (
              <div
                key={feature.key}
                className={
                  group.featured &&
                  index === group.features.length - 1 &&
                  group.features.length % 2 === 1
                    ? "md:col-span-2"
                    : ""
                }
              >
                <FeatureCard
                  feature={feature}
                  t={t}
                  featured={group.featured}
                  delay={(delay += 0.03)}
                />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
